/**
 * ProspectingEngine.ts
 * Motor ② — busca y cualifica al ICP (sección 05 del PDF).
 * Fuente automática: Apify (si hay token configurado). Fallback manual: pegar un export de
 * Sales Navigator/LinkedIn en la pestaña "Prospectos_Import" (fase 1 del roadmap, sección 09).
 * Siempre puntúa (sección 5.2) y deduplica contra el CRM (sección 5.3) antes de escribir.
 */

const PROSPECTOS_HEADERS = [
  'Fecha extracción',
  'Nombre',
  'URL perfil',
  'Cargo',
  'Score',
  'Dato personalizado',
  'Texto del mensaje',
  'Link del audio',
  'Estado',
];

interface ResultadoProspeccion {
  nuevos: number;
  fuente: string;
  descartadosPorValidacion: number;
}

/** Función que dispara el menú "Buscar Prospectos de Hoy" (ejecución manual, muestra un alert). */
function buscarProspectosDeHoy(): void {
  const resultado = buscarProspectosDeHoyCore();
  if (resultado.nuevos === 0 && resultado.fuente === 'ninguna') {
    SpreadsheetApp.getUi().alert(
      'No hay prospectos nuevos que procesar. Configura Apify (menú "⚙️ Configurar claves API") o pega un export de Sales Navigator en la pestaña "Prospectos_Import".'
    );
    return;
  }
  SpreadsheetApp.getUi().alert(
    `${resultado.nuevos} prospectos nuevos añadidos a "Prospectos" (fuente: ${resultado.fuente}). ` +
      `${resultado.descartadosPorValidacion} descartados por no tener una URL de LinkedIn válida o datos incompletos. ` +
      `Revísalos y luego pulsa "Personalizar Mensajes y Audios".`
  );
}

/**
 * Lógica real del motor de prospección, sin llamadas a SpreadsheetApp.getUi(): la usan tanto
 * el menú manual como el autopiloto diario (Autopilot.ts).
 */
function buscarProspectosDeHoyCore(): ResultadoProspeccion {
  let candidatos = buscarProspectosConApify();
  let fuente = 'Apify';

  if (candidatos.length === 0) {
    candidatos = leerProspectosImportados();
    fuente = 'Prospectos_Import';
  }

  if (candidatos.length === 0) {
    return { nuevos: 0, fuente: 'ninguna', descartadosPorValidacion: 0 };
  }

  const totalCandidatos = candidatos.length;
  const validos = candidatos.filter(esProspectoValido);
  const descartadosPorValidacion = totalCandidatos - validos.length;

  const urlsConocidas = getUrlsConocidas();
  const nuevos = validos
    .filter((p) => !urlsConocidas.has(normalizeLinkedInUrl(p.url)))
    .map((p) => ({ prospecto: p, score: calcularScore(p, urlsConocidas) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, PROSPECTOS_POR_DIA);

  for (const { prospecto, score } of nuevos) {
    appendRowObject(SHEETS.PROSPECTOS, PROSPECTOS_HEADERS, {
      'Fecha extracción': todayISO(),
      Nombre: sanitizeForSheet(prospecto.nombre),
      'URL perfil': sanitizeForSheet(prospecto.url),
      Cargo: sanitizeForSheet(prospecto.cargo),
      Score: score,
      'Dato personalizado': sanitizeForSheet(prospecto.ultimoPostTema || prospecto.bio),
      'Texto del mensaje': '',
      'Link del audio': '',
      Estado: 'Pendiente',
    });
  }

  if (fuente === 'Prospectos_Import') {
    limpiarProspectosImportados();
  }

  return { nuevos: nuevos.length, fuente, descartadosPorValidacion };
}

/** Lee filas pegadas manualmente (export de Sales Navigator/LinkedIn) desde Prospectos_Import. */
function leerProspectosImportados(): ProspectoCrudo[] {
  const sheet = getSpreadsheet().getSheetByName(SHEETS.PROSPECTOS_IMPORT);
  if (!sheet) return [];
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  const headers = values[0].map((h) => String(h).trim().toLowerCase());

  const col = (nombre: string) => headers.indexOf(nombre);
  const idxNombre = col('nombre');
  const idxUrl = col('url perfil');
  const idxCargo = col('cargo');
  const idxEmpresa = col('empresa');
  const idxBio = col('bio');
  const idxUltimoPost = col('último post') !== -1 ? col('último post') : col('ultimo post');
  const idxSeguidores = col('seguidores');

  return values
    .slice(1)
    .filter((row) => idxUrl !== -1 && row[idxUrl])
    .map((row) => ({
      nombre: idxNombre !== -1 ? String(row[idxNombre]) : '',
      url: idxUrl !== -1 ? String(row[idxUrl]) : '',
      cargo: idxCargo !== -1 ? String(row[idxCargo]) : '',
      empresa: idxEmpresa !== -1 ? String(row[idxEmpresa]) : '',
      bio: idxBio !== -1 ? String(row[idxBio]) : '',
      ultimoPostTema: idxUltimoPost !== -1 ? String(row[idxUltimoPost]) : '',
      ultimoPostFecha: null,
      seguidores: idxSeguidores !== -1 && row[idxSeguidores] ? Number(row[idxSeguidores]) : null,
    }));
}

function limpiarProspectosImportados(): void {
  const sheet = getSpreadsheet().getSheetByName(SHEETS.PROSPECTOS_IMPORT);
  if (!sheet) return;
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).clearContent();
  }
}

/**
 * Mueve al histórico "CRM" las filas de "Prospectos" marcadas como Enviado/Descartado,
 * y las quita de la cola activa (sección 5.3 y 7.2 — "regla de oro del CRM").
 */
function moverEnviadosACRM(): void {
  const sheet = getSheetOrThrow(SHEETS.PROSPECTOS);
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return;
  const headers = values[0].map((h) => String(h).trim());
  const idxEstado = findColumnIndex(headers, 'Estado');

  const filasAMover: number[] = [];
  for (let i = 1; i < values.length; i++) {
    const estado = String(values[i][idxEstado]).trim().toLowerCase();
    if (estado === 'enviado' || estado === 'descartado') {
      const row = values[i];
      const obj: Record<string, any> = {};
      headers.forEach((h, idx) => (obj[h] = row[idx]));

      appendRowObject(SHEETS.CRM, CRM_HEADERS, {
        Nombre: obj['Nombre'],
        'URL perfil': obj['URL perfil'],
        Cargo: obj['Cargo'],
        Score: obj['Score'],
        'Fecha de envío': estado === 'enviado' ? todayISO() : '',
        'Aceptó conexión': '',
        Respondió: '',
        'Se agendó llamada': '',
        'Se convirtió en cliente': '',
      });
      filasAMover.push(i + 1); // 1-indexed
    }
  }

  // Borra de abajo hacia arriba para no desajustar los índices de fila.
  filasAMover
    .sort((a, b) => b - a)
    .forEach((fila) => sheet.deleteRow(fila));

  SpreadsheetApp.getUi().alert(`${filasAMover.length} prospecto(s) movidos al CRM histórico.`);
}

const CRM_HEADERS = [
  'Nombre',
  'URL perfil',
  'Cargo',
  'Score',
  'Fecha de envío',
  'Aceptó conexión',
  'Respondió',
  'Se agendó llamada',
  'Se convirtió en cliente',
];

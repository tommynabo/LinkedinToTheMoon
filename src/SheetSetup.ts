/**
 * SheetSetup.ts
 * Crea/normaliza las pestañas descritas en la sección 7.2 del PDF. Es idempotente: se puede
 * ejecutar varias veces sin duplicar ni borrar datos existentes.
 */

const IDEAS_HEADERS = ['Idea suelta', 'Pilar sugerido', 'Usado'];
const PROSPECTOS_IMPORT_HEADERS = ['Nombre', 'URL perfil', 'Cargo', 'Empresa', 'Bio', 'Último post', 'Seguidores'];

/** Función que dispara el menú "🛠 Inicializar sistema". Ejecutar una sola vez al empezar. */
function inicializarSistema(): void {
  asegurarHoja(SHEETS.POSTS, POSTS_HEADERS);
  asegurarHoja(SHEETS.PROSPECTOS, PROSPECTOS_HEADERS);
  asegurarHoja(SHEETS.PROSPECTOS_IMPORT, PROSPECTOS_IMPORT_HEADERS);
  asegurarHoja(SHEETS.CRM, CRM_HEADERS);
  asegurarHoja(SHEETS.IDEAS, IDEAS_HEADERS);
  construirPanel();

  SpreadsheetApp.getUi().alert(
    'Sistema inicializado: pestañas "Posts", "Prospectos", "Prospectos_Import", "CRM", "Ideas" y "Panel" listas.\n' +
      'Siguiente paso: menú "⚙️ Configurar claves API" para guardar tus credenciales.'
  );
}

function asegurarHoja(nombre: string, headers: string[]): GoogleAppsScript.Spreadsheet.Sheet {
  const ss = getSpreadsheet();
  let sheet = ss.getSheetByName(nombre);
  if (!sheet) {
    sheet = ss.insertSheet(nombre);
  }
  const primeraFila = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  const yaTieneHeaders = headers.every((h, i) => primeraFila[i] === h);
  if (!yaTieneHeaders) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
  }
  return sheet;
}

/** Panel resumen (sección 7.2 y 10): KPIs básicos calculados desde CRM y Posts. */
function construirPanel(): void {
  const ss = getSpreadsheet();
  let panel = ss.getSheetByName(SHEETS.PANEL);
  if (!panel) {
    panel = ss.insertSheet(SHEETS.PANEL, 0);
  }
  panel.getRange('A1').setValue('LinkedIn to the Moon — Panel de control').setFontWeight('bold').setFontSize(14);
  panel.getRange('A3').setValue('Menú "🚀 LinkedIn to the Moon" → "🤖 Activar autopiloto diario (8:00)" para que todo se genere solo.');
  panel.getRange('A4').setValue('También puedes ejecutar cada motor a mano desde "Ejecutar ahora (manual)".');
  panel.getRange('A6').setValue('Resumen (actualizar con "📊 Actualizar resumen")').setFontWeight('bold');
  panel.getRange('A7').setValue('Posts publicados este mes:');
  panel.getRange('A8').setValue('Contactos enviados esta semana:');
  panel.getRange('A9').setValue('Tasa de aceptación de conexión:');
  panel.getRange('A10').setValue('Tasa de respuesta tras aceptar:');
  panel.setColumnWidth(1, 320);
}

/** Función que dispara el menú "📊 Actualizar resumen" (sección 10 — KPIs semanales). */
function actualizarResumenPanel(): void {
  const panel = getSheetOrThrow(SHEETS.PANEL);
  const posts = readSheetAsObjects(SHEETS.POSTS);
  const crm = readSheetAsObjects(SHEETS.CRM);

  const inicioMes = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const publicadosEsteMes = posts.filter(
    (p) => p['Estado'] === 'Publicado' && new Date(p['Fecha']) >= inicioMes
  ).length;

  const unaSemanaAtras = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const enviadosEstaSemana = crm.filter((c) => c['Fecha de envío'] && new Date(c['Fecha de envío']) >= unaSemanaAtras)
    .length;

  const conRespuestaSobreAceptacion = calcularTasa(crm, 'Aceptó conexión');
  const conRespuesta = calcularTasa(crm, 'Respondió');

  panel.getRange('B7').setValue(publicadosEsteMes);
  panel.getRange('B8').setValue(enviadosEstaSemana);
  panel.getRange('B9').setValue(conRespuestaSobreAceptacion);
  panel.getRange('B10').setValue(conRespuesta);
}

function calcularTasa(filas: Record<string, any>[], columna: string): string {
  const total = filas.filter((f) => f['Fecha de envío']).length;
  if (total === 0) return 'N/D';
  const positivos = filas.filter((f) => String(f[columna]).trim().toLowerCase() === 'sí' || String(f[columna]).trim().toLowerCase() === 'si').length;
  return `${Math.round((positivos / total) * 100)}%`;
}

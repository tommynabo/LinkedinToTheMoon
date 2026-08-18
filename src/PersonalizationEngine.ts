/**
 * PersonalizationEngine.ts
 * Motor ③ — mensaje personalizado + audio con tu voz clonada (sección 06 del PDF).
 * Procesa en lote los prospectos "Pendiente" sin mensaje todavía, hasta PROSPECTOS_POR_DIA.
 */

interface ResultadoPersonalizacion {
  generados: number;
  audioDisponible: boolean;
}

/** Función que dispara el menú "Personalizar Mensajes y Audios" (ejecución manual, muestra un alert). */
function personalizarMensajesYAudios(): void {
  const resultado = personalizarMensajesYAudiosCore();
  SpreadsheetApp.getUi().alert(
    `${resultado.generados} mensaje(s)${resultado.audioDisponible ? ' + audio(s)' : ' (sin audio: falta configurar ElevenLabs)'} generados. Revisa la pestaña "Prospectos" antes de enviar.`
  );
}

/**
 * Lógica real del motor de personalización, sin llamadas a SpreadsheetApp.getUi(): la usan
 * tanto el menú manual como el autopiloto diario (Autopilot.ts).
 */
function personalizarMensajesYAudiosCore(): ResultadoPersonalizacion {
  const sheet = getSheetOrThrow(SHEETS.PROSPECTOS);
  const values = sheet.getDataRange().getValues();
  const audioDisponible = Boolean(
    PropertiesService.getScriptProperties().getProperty(PROPERTY_KEYS.ELEVENLABS_API_KEY)
  );

  if (values.length < 2) {
    return { generados: 0, audioDisponible };
  }

  const headers = values[0].map((h) => String(h).trim());
  const idxNombre = findColumnIndex(headers, 'Nombre');
  const idxCargo = findColumnIndex(headers, 'Cargo');
  const idxDato = findColumnIndex(headers, 'Dato personalizado');
  const idxEstado = findColumnIndex(headers, 'Estado');
  const idxMensaje = findColumnIndex(headers, 'Texto del mensaje');
  const idxAudio = findColumnIndex(headers, 'Link del audio');

  let generados = 0;

  for (let i = 1; i < values.length && generados < PROSPECTOS_POR_DIA; i++) {
    const estado = String(values[i][idxEstado]).trim().toLowerCase();
    const yaTieneMensaje = Boolean(values[i][idxMensaje]);
    if (estado !== 'pendiente' || yaTieneMensaje) continue;

    const nombre = String(values[i][idxNombre]);
    const cargo = String(values[i][idxCargo]);
    const dato = String(values[i][idxDato]);
    const fila = i + 1;

    try {
      const mensaje = generarMensajePersonalizado(nombre, cargo, dato);
      sheet.getRange(fila, idxMensaje + 1).setValue(sanitizeForSheet(mensaje));

      if (audioDisponible) {
        const nombreArchivo = `${todayISO()}_${nombre}`.replace(/[^\w\-]+/g, '_');
        const linkAudio = generarAudioPersonalizado(mensaje, nombreArchivo);
        sheet.getRange(fila, idxAudio + 1).setValue(linkAudio);
      }

      generados++;
    } catch (err) {
      sheet.getRange(fila, idxMensaje + 1).setValue(`ERROR: ${(err as Error).message}`);
    }
  }

  return { generados, audioDisponible };
}

function generarMensajePersonalizado(nombre: string, cargo: string, datoPersonalizado: string): string {
  const prompt = `
Genera un mensaje de prospección por LinkedIn para ${nombre}, que es ${cargo}.
Dato personalizado para usar como gancho: "${datoPersonalizado}".

Debes seguir esta fórmula exacta (máximo 3-4 frases):
1. Lectura fría del dolor: Entra directo mencionando el dato personalizado o un problema típico de su cargo (ej. volumen manual, bases de datos sucias, límites de LinkedIn).
2. Autoridad seca: Menciona que construyes arquitecturas de datos / refinerías / motores de prospección automatizados. CERO condicionales.
3. Calidez / CTA: Pregunta abierta y breve que genere curiosidad sobre cómo aplica a su negocio. No vendas el servicio.

Tono: directo, humano, como si un ingeniero/arquitecto de datos le hablara a un consultor o dueño de agencia. Cero "espero que estés muy bien".

Responde ÚNICAMENTE con el texto del mensaje, sin comillas ni explicaciones adicionales.
`.trim();

  return callClaude(prompt, 300).trim();
}

/**
 * Borra los mensajes y audios generados previamente para prospectos
 * que siguen en estado 'Pendiente', y los vuelve a generar con la nueva lógica.
 */
function reprocesarMensajesExistentes(): void {
  const sheet = getSheetOrThrow(SHEETS.PROSPECTOS);
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) {
    SpreadsheetApp.getUi().alert('No hay prospectos en la hoja.');
    return;
  }

  const headers = values[0].map((h) => String(h).trim());
  const idxEstado = findColumnIndex(headers, 'Estado');
  const idxMensaje = findColumnIndex(headers, 'Texto del mensaje');
  const idxAudio = findColumnIndex(headers, 'Link del audio');

  let limpiados = 0;

  for (let i = 1; i < values.length; i++) {
    const estado = String(values[i][idxEstado]).trim().toLowerCase();
    if (estado === 'pendiente') {
      const fila = i + 1;
      sheet.getRange(fila, idxMensaje + 1).setValue('');
      sheet.getRange(fila, idxAudio + 1).setValue('');
      limpiados++;
    }
  }

  if (limpiados > 0) {
    const resultado = personalizarMensajesYAudiosCore();
    SpreadsheetApp.getUi().alert(
      `${limpiados} prospecto(s) pendiente(s) han sido limpiados y ${resultado.generados} han sido reprocesados con la nueva lógica de lectura fría + autoridad.`
    );
  } else {
    SpreadsheetApp.getUi().alert('No se encontraron prospectos en estado Pendiente para reprocesar.');
  }
}

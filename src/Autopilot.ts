/**
 * Autopilot.ts
 * Convierte el sistema en "full autopiloto": un trigger diario (por defecto 8:00) ejecuta
 * los 3 motores en orden y te deja todo listo en el Sheet. Envía un correo-resumen al
 * terminar (o si algo falla) porque en un trigger por tiempo NO existe SpreadsheetApp.getUi().
 */

const NOMBRE_FUNCION_AUTOPILOTO = 'ejecutarRutinaDiariaAutomatica';

/**
 * Función que ejecuta el trigger diario. Nunca debe llamar a SpreadsheetApp.getUi():
 * en un trigger por tiempo esa llamada lanza una excepción y aborta la ejecución.
 */
function ejecutarRutinaDiariaAutomatica(): void {
  const lineas: string[] = [];
  let huboError = false;

  try {
    const post = generarPostDelDiaCore();
    lineas.push(`✅ Post del día generado (pilar: ${post.pilar})${post.conImagen ? ' con imagen de portada' : ''}.`);
  } catch (err) {
    huboError = true;
    lineas.push(`❌ Motor de contenido falló: ${(err as Error).message}`);
  }

  try {
    const prospeccion = buscarProspectosDeHoyCore();
    if (prospeccion.fuente === 'ninguna') {
      lineas.push(
        '⚠️ No se encontraron prospectos nuevos (configura Apify o pega un export en "Prospectos_Import").'
      );
    } else {
      lineas.push(
        `✅ ${prospeccion.nuevos} prospectos nuevos (fuente: ${prospeccion.fuente}, ${prospeccion.descartadosPorValidacion} descartados por validación).`
      );
    }
  } catch (err) {
    huboError = true;
    lineas.push(`❌ Motor de prospección falló: ${(err as Error).message}`);
  }

  try {
    const personalizacion = personalizarMensajesYAudiosCore();
    lineas.push(
      `✅ ${personalizacion.generados} mensaje(s)${personalizacion.audioDisponible ? ' + audio(s)' : ' (sin audio: falta ElevenLabs)'} personalizados.`
    );
  } catch (err) {
    huboError = true;
    lineas.push(`❌ Motor de personalización falló: ${(err as Error).message}`);
  }

  enviarResumenPorCorreo(lineas, huboError);
}

function enviarResumenPorCorreo(lineas: string[], huboError: boolean): void {
  const destinatario = obtenerEmailNotificacion();
  if (!destinatario) return; // sin email configurado, el resumen queda solo en el Sheet

  const asunto = huboError
    ? '⚠️ LinkedIn to the Moon: autopiloto de hoy con errores'
    : '🚀 LinkedIn to the Moon: tu día está listo';

  const cuerpo = [
    `Rutina diaria ejecutada a las ${AUTOPILOT_HORA}:00.`,
    '',
    ...lineas,
    '',
    `Abre el Sheet: ${getSpreadsheet().getUrl()}`,
  ].join('\n');

  MailApp.sendEmail(destinatario, asunto, cuerpo);
}

function obtenerEmailNotificacion(): string {
  const configurado = PropertiesService.getScriptProperties().getProperty(PROPERTY_KEYS.NOTIFICATION_EMAIL);
  if (configurado) return configurado;
  try {
    return Session.getEffectiveUser().getEmail();
  } catch (e) {
    return '';
  }
}

/** Función que dispara el menú "🤖 Activar autopiloto diario". Idempotente. */
function activarAutopilotoDiario(): void {
  eliminarTriggersAutopiloto();
  ScriptApp.newTrigger(NOMBRE_FUNCION_AUTOPILOTO).timeBased().atHour(AUTOPILOT_HORA).everyDays(1).create();

  SpreadsheetApp.getUi().alert(
    `Autopiloto activado: cada día sobre las ${AUTOPILOT_HORA}:00 se generará el post, se buscarán prospectos y se personalizarán los mensajes/audios automáticamente. Recibirás un correo-resumen al terminar.`
  );
}

/** Función que dispara el menú "⏸ Desactivar autopiloto diario". */
function desactivarAutopilotoDiario(): void {
  const eliminados = eliminarTriggersAutopiloto();
  SpreadsheetApp.getUi().alert(
    eliminados > 0 ? 'Autopiloto desactivado. Los motores ya solo se ejecutan desde el menú manual.' : 'El autopiloto no estaba activo.'
  );
}

/** Función que dispara el menú "🔍 Estado del autopiloto". */
function estadoAutopiloto(): void {
  const activo = ScriptApp.getProjectTriggers().some(
    (t) => t.getHandlerFunction() === NOMBRE_FUNCION_AUTOPILOTO
  );
  const email = obtenerEmailNotificacion() || '(sin correo de notificación configurado)';
  SpreadsheetApp.getUi().alert(
    `Autopiloto: ${activo ? `ACTIVO (todos los días ~${AUTOPILOT_HORA}:00)` : 'INACTIVO'}\nCorreo de resumen: ${email}`
  );
}

function eliminarTriggersAutopiloto(): number {
  const triggers = ScriptApp.getProjectTriggers().filter((t) => t.getHandlerFunction() === NOMBRE_FUNCION_AUTOPILOTO);
  triggers.forEach((t) => ScriptApp.deleteTrigger(t));
  return triggers.length;
}

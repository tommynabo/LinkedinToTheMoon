/**
 * SheetUtils.ts
 * Helpers compartidos para leer/escribir en el spreadsheet.
 */

function getSpreadsheet(): GoogleAppsScript.Spreadsheet.Spreadsheet {
  return SpreadsheetApp.getActiveSpreadsheet();
}

function getSheetOrThrow(nombre: string): GoogleAppsScript.Spreadsheet.Sheet {
  const sheet = getSpreadsheet().getSheetByName(nombre);
  if (!sheet) {
    throw new Error(
      `No existe la pestaña "${nombre}". Ejecuta "Inicializar sistema" desde el menú antes de usar los motores.`
    );
  }
  return sheet;
}

/** Lee todas las filas de una hoja como objetos {cabecera: valor}, saltando la fila de headers. */
function readSheetAsObjects(nombre: string): Record<string, any>[] {
  const sheet = getSheetOrThrow(nombre);
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  const headers = values[0].map((h) => String(h).trim());
  return values.slice(1).map((row) => {
    const obj: Record<string, any> = {};
    headers.forEach((h, i) => (obj[h] = row[i]));
    return obj;
  });
}

function appendRowObject(nombre: string, headers: string[], row: Record<string, any>): void {
  const sheet = getSheetOrThrow(nombre);
  const values = headers.map((h) => (row[h] !== undefined ? row[h] : ''));
  sheet.appendRow(values);
}

/**
 * Neutraliza formula/CSV injection: si un texto que viene de fuentes externas (scraping,
 * CSV importado, respuesta de IA) empieza por = + - @ Sheets lo interpretaría como fórmula.
 * Anteponemos un apóstrofo invisible (carácter de texto) para forzarlo a texto plano.
 */
function sanitizeForSheet(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@]/.test(text)) {
    return `'${text}`;
  }
  return text;
}

function todayISO(): string {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

function findColumnIndex(headers: string[], nombre: string): number {
  const idx = headers.indexOf(nombre);
  if (idx === -1) {
    throw new Error(`Columna "${nombre}" no encontrada. Revisa la cabecera de la pestaña.`);
  }
  return idx;
}

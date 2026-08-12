/**
 * DriveUtils.ts
 * Helper compartido para obtener (o crear una sola vez) una carpeta de Drive, cacheando su
 * ID en Script Properties para no crear carpetas duplicadas en cada ejecución.
 */

function getOrCreateNamedFolder(nombreCarpeta: string, propertyKey: string): GoogleAppsScript.Drive.Folder {
  const props = PropertiesService.getScriptProperties();
  const folderId = props.getProperty(propertyKey);
  if (folderId) {
    try {
      return DriveApp.getFolderById(folderId);
    } catch (e) {
      // Si el ID guardado ya no es válido, seguimos y creamos/buscamos una carpeta nueva.
    }
  }
  const existentes = DriveApp.getFoldersByName(nombreCarpeta);
  const folder = existentes.hasNext() ? existentes.next() : DriveApp.createFolder(nombreCarpeta);
  props.setProperty(propertyKey, folder.getId());
  return folder;
}

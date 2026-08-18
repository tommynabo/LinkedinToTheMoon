/**
 * Menu.ts
 * Punto de entrada del spreadsheet: crea el menú custom que reemplaza a los "3 botones"
 * del diagrama de la sección 03 del PDF.
 */

function onOpen(): void {
  SpreadsheetApp.getUi()
    .createMenu('🚀 LinkedIn to the Moon')
    .addItem('🤖 Activar autopiloto diario (8:00)', 'activarAutopilotoDiario')
    .addItem('⏸ Desactivar autopiloto diario', 'desactivarAutopilotoDiario')
    .addItem('🔍 Estado del autopiloto', 'estadoAutopiloto')
    .addSeparator()
    .addSubMenu(
      SpreadsheetApp.getUi()
        .createMenu('Ejecutar ahora (manual)')
        .addItem('1) Reprocesar mensajes (Pendientes)', 'reprocesarMensajesExistentes')
        .addItem('2) Generar Post del Día', 'generarPostDelDia')
        .addItem('3) Buscar Prospectos de Hoy', 'buscarProspectosDeHoy')
        .addItem('4) Personalizar Mensajes y Audios', 'personalizarMensajesYAudios')
        .addItem('5) Ordenar Prospectos (Antiguos Primero)', 'ordenarProspectosCronologicamente')
    )
    .addItem('Mover Enviados/Descartados al CRM', 'moverEnviadosACRM')
    .addItem('📊 Actualizar resumen', 'actualizarResumenPanel')
    .addSeparator()
    .addItem('🛠 Inicializar sistema', 'inicializarSistema')
    .addItem('⚙️ Configurar claves API', 'configurarClaves')
    .addItem('🔍 Ver qué claves están configuradas', 'verificarConfiguracion')
    .addToUi();
}

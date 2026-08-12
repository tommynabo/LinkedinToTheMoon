/**
 * Settings.ts
 * Guarda claves de API en Script Properties (nunca en el código ni en el spreadsheet).
 */

/** Función que dispara el menú "⚙️ Configurar claves API". Pide cada clave con un prompt. */
function configurarClaves(): void {
  const ui = SpreadsheetApp.getUi();
  const props = PropertiesService.getScriptProperties();

  const campos: { key: string; label: string; opcional?: boolean }[] = [
    { key: PROPERTY_KEYS.CLAUDE_API_KEY, label: 'Clave de API de Claude (Anthropic)' },
    { key: PROPERTY_KEYS.ELEVENLABS_API_KEY, label: 'Clave de API de ElevenLabs', opcional: true },
    { key: PROPERTY_KEYS.ELEVENLABS_VOICE_ID, label: 'Voice ID de ElevenLabs (tu voz clonada)', opcional: true },
    { key: PROPERTY_KEYS.APIFY_API_TOKEN, label: 'Token de API de Apify', opcional: true },
    { key: PROPERTY_KEYS.APIFY_ACTOR_ID, label: 'ID del actor de Apify a usar', opcional: true },
    { key: PROPERTY_KEYS.OPENAI_API_KEY, label: 'Clave de API de OpenAI (imagen de portada del post)', opcional: true },
    {
      key: PROPERTY_KEYS.NOTIFICATION_EMAIL,
      label: 'Email para el correo-resumen del autopiloto (vacío = tu email de Google)',
      opcional: true,
    },
  ];

  for (const campo of campos) {
    const actual = props.getProperty(campo.key);
    const estadoActual = actual ? '(ya configurada, deja en blanco para no cambiarla)' : '(no configurada)';
    const resp = ui.prompt(
      `Configurar claves API`,
      `${campo.label} ${estadoActual}${campo.opcional ? ' — opcional' : ''}:`,
      ui.ButtonSet.OK_CANCEL
    );

    if (resp.getSelectedButton() !== ui.Button.OK) {
      ui.alert('Configuración cancelada.');
      return;
    }

    const valor = resp.getResponseText().trim();
    if (valor) {
      props.setProperty(campo.key, valor);
    }
  }

  ui.alert('Claves guardadas en Script Properties. Ya puedes usar los motores del sistema.');
}

/** Función que dispara el menú "🔍 Ver qué claves están configuradas" (no muestra los valores). */
function verificarConfiguracion(): void {
  const props = PropertiesService.getScriptProperties();
  const lineas = Object.values(PROPERTY_KEYS).map((key) => {
    const configurada = Boolean(props.getProperty(key));
    return `${configurada ? '✅' : '⬜️'} ${key}`;
  });
  SpreadsheetApp.getUi().alert(`Estado de configuración:\n\n${lineas.join('\n')}`);
}

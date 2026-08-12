/**
 * email.ts
 * Correo-resumen diario vía Resend (opcional). Si no hay RESEND_API_KEY + NOTIFICATION_EMAIL
 * configurados, se omite silenciosamente: el resumen sigue disponible en el dashboard.
 */

export async function enviarResumenPorCorreo(lineas: string[], huboError: boolean, urlDashboard: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const destinatario = process.env.NOTIFICATION_EMAIL;
  if (!apiKey || !destinatario) return;

  const asunto = huboError
    ? '⚠️ LinkedIn to the Moon: autopiloto de hoy con errores'
    : '🚀 LinkedIn to the Moon: tu día está listo';

  const textoPlano = [...lineas, '', `Abre el dashboard: ${urlDashboard}`].join('\n');

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      from: 'LinkedIn to the Moon <onboarding@resend.dev>',
      to: [destinatario],
      subject: asunto,
      text: textoPlano,
    }),
  });

  if (!response.ok) {
    // No relanzamos el error: un fallo de email no debe tumbar la rutina diaria completa.
    console.error(`Error enviando correo-resumen (HTTP ${response.status}): ${await response.text()}`);
  }
}

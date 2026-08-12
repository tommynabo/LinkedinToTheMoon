export const dynamic = 'force-dynamic';

interface EnvCheck {
  nombre: string;
  descripcion: string;
  obligatoria: boolean;
  configurada: boolean;
}

function construirChecks(): EnvCheck[] {
  return [
    { nombre: 'POSTGRES_URL', descripcion: 'Base de datos (la crea Vercel Postgres automáticamente)', obligatoria: true, configurada: !!process.env.POSTGRES_URL },
    { nombre: 'BLOB_READ_WRITE_TOKEN', descripcion: 'Almacenamiento de audios/imágenes (Vercel Blob)', obligatoria: true, configurada: !!process.env.BLOB_READ_WRITE_TOKEN },
    { nombre: 'ANTHROPIC_API_KEY', descripcion: 'Genera posts y mensajes con Claude', obligatoria: true, configurada: !!process.env.ANTHROPIC_API_KEY },
    { nombre: 'CRON_SECRET', descripcion: 'Protege el endpoint /api/cron/daily', obligatoria: true, configurada: !!process.env.CRON_SECRET },
    { nombre: 'DASHBOARD_USER / DASHBOARD_PASSWORD', descripcion: 'Basic Auth de todo el dashboard', obligatoria: true, configurada: !!(process.env.DASHBOARD_USER && process.env.DASHBOARD_PASSWORD) },
    { nombre: 'OPENAI_API_KEY', descripcion: 'Genera la imagen de portada del post (opcional)', obligatoria: false, configurada: !!process.env.OPENAI_API_KEY },
    { nombre: 'ELEVENLABS_API_KEY / ELEVENLABS_VOICE_ID', descripcion: 'Genera el audio con tu voz clonada (opcional)', obligatoria: false, configurada: !!(process.env.ELEVENLABS_API_KEY && process.env.ELEVENLABS_VOICE_ID) },
    { nombre: 'APIFY_API_TOKEN / APIFY_ACTOR_ID', descripcion: 'Búsqueda automática de prospectos (opcional, si no: usa /import)', obligatoria: false, configurada: !!(process.env.APIFY_API_TOKEN && process.env.APIFY_ACTOR_ID) },
    { nombre: 'RESEND_API_KEY / NOTIFICATION_EMAIL', descripcion: 'Correo-resumen diario (opcional)', obligatoria: false, configurada: !!(process.env.RESEND_API_KEY && process.env.NOTIFICATION_EMAIL) },
  ];
}

export default function AjustesPage() {
  const checks = construirChecks();
  const faltanObligatorias = checks.filter((c) => c.obligatoria && !c.configurada);

  return (
    <>
      <h1>Ajustes</h1>
      <p className="subtitle">
        Estado de la configuración (solo se comprueba si cada variable está definida, nunca se
        muestran los valores reales).
      </p>

      {faltanObligatorias.length > 0 && (
        <div className="card" style={{ borderColor: '#c0392b' }}>
          <strong className="error-text">
            Faltan {faltanObligatorias.length} variable(s) obligatoria(s) por configurar en Vercel → Settings → Environment
            Variables.
          </strong>
        </div>
      )}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Variable</th>
              <th>Para qué sirve</th>
              <th>Obligatoria</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {checks.map((c) => (
              <tr key={c.nombre}>
                <td>
                  <code>{c.nombre}</code>
                </td>
                <td>{c.descripcion}</td>
                <td>{c.obligatoria ? 'Sí' : 'Opcional'}</td>
                <td className={c.configurada ? 'ok-text' : c.obligatoria ? 'error-text' : 'muted'}>
                  {c.configurada ? '✅ Configurada' : c.obligatoria ? '❌ Falta' : '— No configurada'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2>Programación del autopiloto</h2>
        <p>
          El cron está definido en <code>vercel.json</code> como <code>0 6 * * *</code> (06:00 UTC),
          pensado para caer sobre las 8:00 en Madrid en horario de verano (CEST). Vercel Cron
          funciona siempre en UTC y no tiene en cuenta cambios de hora, así que en horario de
          invierno (CET) se ejecutará hacia las 7:00 hora local. Si quieres ajustarlo, cambia el
          valor en <code>vercel.json</code> y vuelve a desplegar.
        </p>
      </div>
    </>
  );
}

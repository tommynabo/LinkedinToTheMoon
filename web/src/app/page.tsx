import { getResumenKpis, getUltimasEjecuciones } from '@/lib/queries';
import { runNowAction } from '@/lib/actions';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const [kpis, ejecuciones] = await Promise.all([getResumenKpis(), getUltimasEjecuciones()]);

  return (
    <>
      <h1>Panel de control</h1>
      <p className="subtitle">
        A las 8:00 (hora de Madrid en verano) el cron diario de Vercel genera el post del día, busca
        prospectos nuevos y personaliza sus mensajes automáticamente. Aquí puedes revisar todo y
        forzar una ejecución manual si lo necesitas.
      </p>

      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="value">{kpis.publicadosEsteMes}</div>
          <div className="label">Posts publicados este mes</div>
        </div>
        <div className="kpi-card">
          <div className="value">{kpis.enviadosEstaSemana}</div>
          <div className="label">Conexiones enviadas (7 días)</div>
        </div>
        <div className="kpi-card">
          <div className="value">{kpis.tasaAceptacion}</div>
          <div className="label">Tasa de aceptación</div>
        </div>
        <div className="kpi-card">
          <div className="value">{kpis.tasaRespuesta}</div>
          <div className="label">Tasa de respuesta</div>
        </div>
      </div>

      <div className="card">
        <form action={runNowAction}>
          <button type="submit">▶️ Ejecutar rutina ahora</button>
        </form>
        <p className="muted">
          Útil para probar el sistema o para lanzar el día manualmente si el cron automático
          todavía no está activo.
        </p>
      </div>

      <h2>Últimas ejecuciones</h2>
      {ejecuciones.length === 0 ? (
        <p className="muted">Todavía no se ha ejecutado la rutina diaria ninguna vez.</p>
      ) : (
        <ul className="status-list">
          {ejecuciones.map((run) => (
            <li key={run.id}>
              <strong className={run.hubo_error ? 'error-text' : 'ok-text'}>
                {new Date(run.ejecutado_en).toLocaleString('es-ES')} {run.hubo_error ? '⚠️' : '✅'}
              </strong>
              <pre style={{ whiteSpace: 'pre-wrap', margin: '4px 0 0', fontSize: 13 }}>{run.resumen}</pre>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

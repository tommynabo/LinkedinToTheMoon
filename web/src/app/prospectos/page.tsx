import { getProspectos } from '@/lib/queries';
import { archivarEnviadosAction, updateProspectoEstado } from '@/lib/actions';

export const dynamic = 'force-dynamic';

function pillClass(estado: string): string {
  const key = estado.toLowerCase();
  if (key === 'enviado') return 'pill enviado';
  if (key === 'descartado') return 'pill descartado';
  if (key === 'comentado') return 'pill comentado';
  return 'pill pendiente';
}

export default async function ProspectosPage() {
  const prospectos = await getProspectos();

  return (
    <>
      <h1>Prospectos</h1>
      <p className="subtitle">
        El autopiloto trae hasta 25 prospectos nuevos al día, ya puntuados y con mensaje +
        audio personalizados. Envía la conexión desde LinkedIn con el mensaje de aquí, luego
        marca el estado. Cuando termines el día, pulsa "Mover al CRM".
      </p>

      <form action={archivarEnviadosAction} style={{ marginBottom: 16 }}>
        <button type="submit">📤 Mover Enviados/Descartados al CRM</button>
      </form>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Nombre</th>
              <th>Perfil</th>
              <th>Cargo</th>
              <th>Score</th>
              <th>Dato personalizado</th>
              <th>Mensaje</th>
              <th>Comentario para su post</th>
              <th>Audio</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {prospectos.map((p) => (
              <tr key={p.id}>
                <td>{new Date(p.fecha_extraccion).toLocaleDateString('es-ES')}</td>
                <td>{p.nombre}</td>
                <td>
                  <a href={p.url_perfil} target="_blank" rel="noreferrer">
                    Ver perfil
                  </a>
                </td>
                <td>{p.cargo}</td>
                <td>{p.score}</td>
                <td style={{ minWidth: 200 }}>{p.dato_personalizado}</td>
                <td style={{ whiteSpace: 'pre-wrap', minWidth: 260 }}>{p.texto_mensaje}</td>
                <td style={{ whiteSpace: 'pre-wrap', minWidth: 220 }}>
                  {p.comentario_post || <span className="muted">—</span>}
                </td>
                <td>
                  {p.link_audio ? (
                    <audio controls src={p.link_audio} style={{ maxWidth: 180 }} />
                  ) : (
                    <span className="muted">—</span>
                  )}
                </td>
                <td>
                  <form action={updateProspectoEstado} className="inline" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
                    <input type="hidden" name="id" value={p.id} />
                    <span className={pillClass(p.estado)}>{p.estado}</span>
                    <select name="estado" defaultValue={p.estado}>
                      <option value="Pendiente">Pendiente</option>
                      <option value="Comentado">Comentado</option>
                      <option value="Enviado">Enviado</option>
                      <option value="Descartado">Descartado</option>
                    </select>
                    <button type="submit">Guardar</button>
                  </form>
                </td>
              </tr>
            ))}
            {prospectos.length === 0 && (
              <tr>
                <td colSpan={10} className="muted">
                  Todavía no hay prospectos. Configura Apify o pega un export en /import.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

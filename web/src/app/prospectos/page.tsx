import { getProspectos } from '@/lib/queries';
import { archivarEnviadosAction, deleteProspectoAction, updateProspectoEstado } from '@/lib/actions';
import { CopyButton } from './CopyButton';
import { DeleteButton } from './DeleteButton';

export const dynamic = 'force-dynamic';

const ESTADOS = ['Pendiente', 'Comentado', 'Enviado', 'Descartado'] as const;

function pillClass(estado: string): string {
  const key = estado.toLowerCase();
  if (key === 'enviado') return 'pill enviado';
  if (key === 'descartado') return 'pill descartado';
  if (key === 'comentado') return 'pill comentado';
  return 'pill pendiente';
}

export default async function ProspectosPage({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string }>;
}) {
  const { estado: filtro } = await searchParams;
  const todos = await getProspectos();
  const prospectos = filtro ? todos.filter((p) => p.estado === filtro) : todos;

  return (
    <>
      <h1>Prospectos</h1>
      <p className="subtitle">
        El autopiloto trae hasta 25 prospectos nuevos al día (mínimo 75% hispanohablantes), ya
        puntuados y con mensaje + comentario de post + audio personalizados. Deja el comentario
        en su post, envía la conexión desde LinkedIn con el mensaje de aquí, luego marca el
        estado. Cuando termines el día, pulsa "Mover al CRM".
      </p>

      <form action={archivarEnviadosAction} style={{ marginBottom: 16 }}>
        <button type="submit">📤 Mover Enviados/Descartados al CRM</button>
      </form>

      <div className="filtros-estado">
        <a href="/prospectos" className={!filtro ? 'activo' : ''}>
          Todos ({todos.length})
        </a>
        {ESTADOS.map((e) => (
          <a key={e} href={`/prospectos?estado=${e}`} className={filtro === e ? 'activo' : ''}>
            {e} ({todos.filter((p) => p.estado === e).length})
          </a>
        ))}
      </div>

      {prospectos.length === 0 && (
        <p className="muted">
          {todos.length === 0
            ? 'Todavía no hay prospectos. Configura Apify o pega un export en /import.'
            : 'No hay prospectos con ese estado.'}
        </p>
      )}

      <div className="prospecto-grid">
        {prospectos.map((p) => (
          <div className="prospecto-card" key={p.id}>
            <div className="prospecto-header">
              <div>
                <h3>{p.nombre}</h3>
                <span className={pillClass(p.estado)}>{p.estado}</span>
              </div>
              <strong>Score {p.score}</strong>
            </div>

            <p className="prospecto-cargo">{p.cargo}</p>

            <div className="prospecto-links">
              <a href={p.url_perfil} target="_blank" rel="noreferrer">
                🔗 Ver perfil
              </a>
              {p.ultimo_post_url && (
                <a href={p.ultimo_post_url} target="_blank" rel="noreferrer">
                  📝 Ver post
                </a>
              )}
            </div>

            <div>
              <div className="prospecto-section-header">
                <span>Mensaje de conexión</span>
                {p.texto_mensaje && <CopyButton text={p.texto_mensaje} label="📋 Copiar" />}
              </div>
              <p className="prospecto-text">{p.texto_mensaje || '—'}</p>
            </div>

            {p.comentario_post && (
              <div>
                <div className="prospecto-section-header">
                  <span>Comentario para su post</span>
                  <CopyButton text={p.comentario_post} label="📋 Copiar" />
                </div>
                <p className="prospecto-text">{p.comentario_post}</p>
              </div>
            )}

            {p.link_audio && <audio controls src={p.link_audio} style={{ width: '100%' }} />}

            {p.dato_personalizado && (
              <details>
                <summary>Bio / dato personalizado</summary>
                <p className="prospecto-text">{p.dato_personalizado}</p>
              </details>
            )}

            <div className="prospecto-actions">
              <form action={updateProspectoEstado} className="inline">
                <input type="hidden" name="id" value={p.id} />
                <select name="estado" defaultValue={p.estado}>
                  {ESTADOS.map((e) => (
                    <option key={e} value={e}>
                      {e}
                    </option>
                  ))}
                </select>
                <button type="submit">Guardar</button>
              </form>
              <form action={deleteProspectoAction}>
                <input type="hidden" name="id" value={p.id} />
                <DeleteButton />
              </form>
            </div>

            <div className="prospecto-fecha">{new Date(p.fecha_extraccion).toLocaleDateString('es-ES')}</div>
          </div>
        ))}
      </div>
    </>
  );
}


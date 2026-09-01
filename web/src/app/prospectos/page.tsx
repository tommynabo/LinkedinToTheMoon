import { getProspectos, getCrm } from '@/lib/queries';
import type { ProspectoRow } from '@/lib/types';
import { archivarEnviadosAction, deleteProspectoAction, updateProspectoEstado, regenerarMensajesPendientesAction } from '@/lib/actions';
import { CopyButton } from './CopyButton';
import { DeleteButton } from './DeleteButton';
import { EstadoSelect } from './EstadoSelect';

export const dynamic = 'force-dynamic';

const ESTADOS = ['Pendiente', 'Comentado', 'Enviado', 'Descartado'] as const;

export default async function ProspectosPage({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string }>;
}) {
  const { estado: filtro } = await searchParams;
  const [prospectosActivos, crmRows] = await Promise.all([getProspectos(), getCrm()]);
  
  const prospectosCrm: ProspectoRow[] = crmRows.map((c) => ({
    id: c.id + 10000000,
    fecha_extraccion: c.fecha_envio || c.created_at,
    nombre: c.nombre || '',
    url_perfil: c.url_perfil,
    cargo: c.cargo || '',
    score: c.score || 0,
    dato_personalizado: null,
    ultimo_post_texto: null,
    ultimo_post_url: null,
    comentario_post: null,
    texto_mensaje: null,
    link_audio: null,
    estado: 'Enviado',
    created_at: c.created_at,
  }));

  const todos = [...prospectosActivos, ...prospectosCrm];
  const prospectos = filtro ? todos.filter((p) => p.estado === filtro) : todos;

  return (
    <>
      <h1>Prospectos</h1>
      <p className="subtitle">
        El autopiloto trae hasta 25 prospectos nuevos al día (mínimo 15 de España, el resto de
        cualquier otro sitio), ya puntuados y con mensaje + comentario de post + audio
        personalizados. Deja el comentario en su post, envía la conexión desde LinkedIn con el
        mensaje de aquí, luego marca el estado. Cuando termines el día, pulsa "Mover al CRM".
      </p>

      <form action={archivarEnviadosAction} style={{ marginBottom: 16 }}>
        <button type="submit">📤 Mover Enviados/Descartados al CRM</button>
      </form>

      <form action={regenerarMensajesPendientesAction} style={{ marginBottom: 16 }}>
        <button type="submit" style={{ background: 'var(--accent, #6366f1)', color: '#fff' }}>
          🔄 Regenerar mensajes (Pendiente + Comentado)
        </button>
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
                {p.id >= 10000000 ? (
                  <div className="inline">
                    <EstadoSelect defaultValue={p.estado} disabled />
                  </div>
                ) : (
                  <form action={updateProspectoEstado} className="inline">
                    <input type="hidden" name="id" value={p.id} />
                    <EstadoSelect defaultValue={p.estado} />
                  </form>
                )}
              </div>
              <strong>Score {p.score}</strong>
            </div>

            <p className="prospecto-cargo">{p.cargo}</p>

            <div className="prospecto-links">
              <a href={p.url_perfil} target="_blank" rel="noreferrer">
                🔗 Ver perfil
              </a>
            </div>

            <div className="prospecto-post-action">
              <div className="prospecto-section-header">
                <span>💬 Comenta su último post</span>
                {p.comentario_post && <CopyButton text={p.comentario_post} label="📋 Copiar comentario" />}
              </div>
              {p.ultimo_post_url && (
                <a href={p.ultimo_post_url} target="_blank" rel="noreferrer" className="prospecto-post-link">
                  📝 Abrir el post →
                </a>
              )}
              {p.comentario_post ? (
                <p className="prospecto-text">{p.comentario_post}</p>
              ) : (
                <p className="muted">Sin post reciente — nada que comentar.</p>
              )}
            </div>

            <div>
              <div className="prospecto-section-header">
                <span>Mensaje de conexión</span>
                {p.texto_mensaje && <CopyButton text={p.texto_mensaje} label="📋 Copiar" />}
              </div>
              <p className="prospecto-text">{p.texto_mensaje || '—'}</p>
            </div>

            {p.link_audio && <audio controls src={p.link_audio} style={{ width: '100%' }} />}

            {p.dato_personalizado && (
              <details>
                <summary>Bio / dato personalizado</summary>
                <p className="prospecto-text">{p.dato_personalizado}</p>
              </details>
            )}

            <div className="prospecto-actions">
              {p.id < 10000000 && (
                <form action={deleteProspectoAction}>
                  <input type="hidden" name="id" value={p.id} />
                  <DeleteButton />
                </form>
              )}
            </div>

            <div className="prospecto-fecha">{new Date(p.fecha_extraccion).toLocaleDateString('es-ES')}</div>
          </div>
        ))}
      </div>
    </>
  );
}


import { getPosts } from '@/lib/queries';
import { deletePostAction, updatePostRow } from '@/lib/actions';
import { DeleteButton } from './DeleteButton';
import { CopyButton } from './CopyButton';

export const dynamic = 'force-dynamic';

function pillClass(estado: string): string {
  const key = estado.toLowerCase();
  if (key === 'publicado') return 'pill publicado';
  if (key === 'borrador') return 'pill borrador';
  return 'pill';
}

export default async function PostsPage() {
  const posts = await getPosts();

  return (
    <>
      <h1>Posts</h1>
      <p className="subtitle">
        Cada mañana el autopiloto deja aquí un borrador listo para copiar y pegar en LinkedIn.
        Revísalo, cópialo con el botón y márcalo como publicado cuando lo subas.
      </p>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Pilar</th>
              <th>Post completo</th>
              <th>Imagen</th>
              <th>Estado / Link / Métricas</th>
            </tr>
          </thead>
          <tbody>
            {posts.map((post) => (
              <tr key={post.id}>
                <td>{new Date(post.fecha).toLocaleDateString('es-ES')}</td>
                <td>{post.pilar}</td>
                <td style={{ minWidth: 380 }}>
                  <pre style={{
                    whiteSpace: 'pre-wrap',
                    fontFamily: 'inherit',
                    fontSize: 14,
                    lineHeight: 1.6,
                    margin: 0,
                  }}>
                    {post.desarrollo}
                  </pre>
                  <CopyButton text={post.desarrollo ?? ''} />
                </td>
                <td>
                  {post.imagen_url ? (
                    <a href={post.imagen_url} target="_blank" rel="noreferrer">
                      Ver imagen
                    </a>
                  ) : (
                    <span className="muted">—</span>
                  )}
                </td>
                <td>
                  <form action={updatePostRow} className="inline" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
                    <input type="hidden" name="id" value={post.id} />
                    <span className={pillClass(post.estado)}>{post.estado}</span>
                    <select name="estado" defaultValue={post.estado}>
                      <option value="Borrador">Borrador</option>
                      <option value="Publicado">Publicado</option>
                    </select>
                    <input type="url" name="link_publicado" placeholder="Link publicado" defaultValue={post.link_publicado || ''} />
                    <input
                      type="number"
                      name="likes_comentarios"
                      placeholder="Likes + comentarios"
                      defaultValue={post.likes_comentarios ?? ''}
                    />
                    <button type="submit">Guardar</button>
                  </form>
                  <form action={deletePostAction} style={{ marginTop: 6 }}>
                    <input type="hidden" name="id" value={post.id} />
                    <DeleteButton />
                  </form>
                </td>
              </tr>
            ))}
            {posts.length === 0 && (
              <tr>
                <td colSpan={5} className="muted">
                  Todavía no hay posts generados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

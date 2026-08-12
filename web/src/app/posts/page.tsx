import { getPosts } from '@/lib/queries';
import { updatePostRow } from '@/lib/actions';

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
        Cada mañana el autopiloto deja aquí un borrador (3 hooks + desarrollo + imagen opcional).
        Elige el hook que más te convenza, publícalo tú mismo en LinkedIn y marca el estado.
      </p>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Pilar</th>
              <th>Hook A</th>
              <th>Hook B</th>
              <th>Hook C</th>
              <th>Desarrollo</th>
              <th>Imagen</th>
              <th>Estado / Link / Métricas</th>
            </tr>
          </thead>
          <tbody>
            {posts.map((post) => (
              <tr key={post.id}>
                <td>{new Date(post.fecha).toLocaleDateString('es-ES')}</td>
                <td>{post.pilar}</td>
                <td>{post.hook_a}</td>
                <td>{post.hook_b}</td>
                <td>{post.hook_c}</td>
                <td style={{ whiteSpace: 'pre-wrap', minWidth: 280 }}>{post.desarrollo}</td>
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
                </td>
              </tr>
            ))}
            {posts.length === 0 && (
              <tr>
                <td colSpan={8} className="muted">
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

import { getIdeas } from '@/lib/queries';
import { addIdeaAction } from '@/lib/actions';
import { CONTENT_PILLARS } from '@/lib/config';

export const dynamic = 'force-dynamic';

export default async function IdeasPage() {
  const ideas = await getIdeas();

  return (
    <>
      <h1>Banco de ideas</h1>
      <p className="subtitle">
        El motor de contenido usa la idea sin usar más antigua como semilla de cada post. Añade
        aquí cualquier idea que se te ocurra durante la semana.
      </p>

      <div className="card">
        <form action={addIdeaAction} className="inline">
          <input type="text" name="idea" placeholder="Idea para un post" required style={{ flex: 2, padding: '6px 10px' }} />
          <select name="tipo_contenido" defaultValue="tecnico">
            <option value="tecnico">Técnico</option>
            <option value="actualidad">Actualidad</option>
          </select>
          <select name="pilar_sugerido" defaultValue="">
            <option value="">Pilar automático</option>
            {CONTENT_PILLARS.map((pilar) => <option key={pilar.nombre} value={pilar.nombre}>{pilar.nombre}</option>)}
          </select>
          <input type="url" name="fuente_url" placeholder="Fuente (opcional)" style={{ flex: 1, padding: '6px 10px' }} />
          <button type="submit">Añadir idea</button>
        </form>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Idea</th>
              <th>Pilar sugerido</th>
              <th>Tipo</th>
              <th>Fuente</th>
              <th>Usado</th>
            </tr>
          </thead>
          <tbody>
            {ideas.map((idea) => (
              <tr key={idea.id}>
                <td>{idea.idea}</td>
                <td>{idea.pilar_sugerido || '—'}</td>
                <td>{idea.tipo_contenido}</td>
                <td>{idea.fuente_url ? <a href={idea.fuente_url} target="_blank" rel="noreferrer">Abrir</a> : '—'}</td>
                <td>{idea.usado ? '✅' : '⏳'}</td>
              </tr>
            ))}
            {ideas.length === 0 && (
              <tr>
                <td colSpan={5} className="muted">
                  Todavía no hay ideas guardadas.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

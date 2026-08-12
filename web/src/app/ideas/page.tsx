import { getIdeas } from '@/lib/queries';
import { addIdeaAction } from '@/lib/actions';

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
          <input
            type="text"
            name="pilar_sugerido"
            placeholder="Pilar sugerido (opcional)"
            style={{ flex: 1, padding: '6px 10px' }}
          />
          <button type="submit">Añadir idea</button>
        </form>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Idea</th>
              <th>Pilar sugerido</th>
              <th>Usado</th>
            </tr>
          </thead>
          <tbody>
            {ideas.map((idea) => (
              <tr key={idea.id}>
                <td>{idea.idea}</td>
                <td>{idea.pilar_sugerido || '—'}</td>
                <td>{idea.usado ? '✅' : '⏳'}</td>
              </tr>
            ))}
            {ideas.length === 0 && (
              <tr>
                <td colSpan={3} className="muted">
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

import { importarProspectosAction } from '@/lib/actions';

export const dynamic = 'force-dynamic';

export default function ImportPage() {
  return (
    <>
      <h1>Importar prospectos manualmente</h1>
      <p className="subtitle">
        Solo hace falta si no tienes Apify configurado. Pega aquí filas exportadas (separadas
        por tabulador o coma) con las columnas: <strong>Nombre, URL perfil, Cargo, Empresa, Bio,
        Último post, Seguidores</strong>. El autopiloto de mañana las validará, puntuará y
        deduplicará automáticamente contra el histórico.
      </p>

      <form action={importarProspectosAction} className="card">
        <textarea
          name="csv"
          placeholder={'Nombre\tURL perfil\tCargo\tEmpresa\tBio\tÚltimo post\tSeguidores\nAna Pérez\thttps://www.linkedin.com/in/anaperez\tCoach de negocio\t...'}
        />
        <div style={{ marginTop: 10 }}>
          <button type="submit">Guardar filas</button>
        </div>
      </form>
    </>
  );
}

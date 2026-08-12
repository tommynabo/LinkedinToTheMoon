import { getCrm } from '@/lib/queries';
import { updateCrmRow } from '@/lib/actions';

export const dynamic = 'force-dynamic';

export default async function CrmPage() {
  const filas = await getCrm();

  return (
    <>
      <h1>CRM / Histórico</h1>
      <p className="subtitle">
        Aquí acaban los prospectos ya procesados. Marca las casillas a medida que avance la
        conversación en LinkedIn, para poder ver la tasa de aceptación y respuesta en el panel.
      </p>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Fecha envío</th>
              <th>Nombre</th>
              <th>Perfil</th>
              <th>Cargo</th>
              <th>Score</th>
              <th>Aceptó</th>
              <th>Respondió</th>
              <th>Llamada agendada</th>
              <th>Cliente</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.id}>
                <td>{f.fecha_envio ? new Date(f.fecha_envio).toLocaleDateString('es-ES') : '—'}</td>
                <td>{f.nombre}</td>
                <td>
                  <a href={f.url_perfil} target="_blank" rel="noreferrer">
                    Ver perfil
                  </a>
                </td>
                <td>{f.cargo}</td>
                <td>{f.score}</td>
                <td colSpan={4} style={{ padding: 0 }}>
                  <form action={updateCrmRow} className="inline" style={{ padding: '8px 10px', gap: 16 }}>
                    <input type="hidden" name="id" value={f.id} />
                    <label>
                      <input type="checkbox" name="acepto_conexion" defaultChecked={!!f.acepto_conexion} /> Aceptó
                    </label>
                    <label>
                      <input type="checkbox" name="respondio" defaultChecked={!!f.respondio} /> Respondió
                    </label>
                    <label>
                      <input type="checkbox" name="se_agendo_llamada" defaultChecked={!!f.se_agendo_llamada} /> Llamada
                    </label>
                    <label>
                      <input type="checkbox" name="se_convirtio_cliente" defaultChecked={!!f.se_convirtio_cliente} /> Cliente
                    </label>
                    <button type="submit">Guardar</button>
                  </form>
                </td>
              </tr>
            ))}
            {filas.length === 0 && (
              <tr>
                <td colSpan={9} className="muted">
                  Todavía no hay histórico en el CRM.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

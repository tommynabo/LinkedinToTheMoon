'use client';

const ESTADOS = ['Pendiente', 'Comentado', 'Enviado', 'Descartado'] as const;

function pillClass(estado: string): string {
  const key = estado.toLowerCase();
  if (key === 'enviado') return 'pill-select enviado';
  if (key === 'descartado') return 'pill-select descartado';
  if (key === 'comentado') return 'pill-select comentado';
  return 'pill-select pendiente';
}

export function EstadoSelect({ defaultValue }: { defaultValue: string }) {
  return (
    <select
      name="estado"
      defaultValue={defaultValue}
      className={pillClass(defaultValue)}
      onChange={(e) => e.currentTarget.form?.requestSubmit()}
    >
      {ESTADOS.map((e) => (
        <option key={e} value={e}>
          {e}
        </option>
      ))}
    </select>
  );
}

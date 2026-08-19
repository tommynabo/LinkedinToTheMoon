'use client';

const ESTADOS = ['Pendiente', 'Comentado', 'Enviado', 'Descartado'] as const;

function pillClass(estado: string): string {
  const key = estado.toLowerCase();
  if (key === 'enviado') return 'pill-select enviado';
  if (key === 'descartado') return 'pill-select descartado';
  if (key === 'comentado') return 'pill-select comentado';
  return 'pill-select pendiente';
}

export function EstadoSelect({ defaultValue, disabled }: { defaultValue: string; disabled?: boolean }) {
  return (
    <select
      name="estado"
      defaultValue={defaultValue}
      disabled={disabled}
      className={pillClass(defaultValue)}
      onChange={(e) => {
        const select = e.currentTarget;
        
        // Actualización optimista de color
        select.className = pillClass(select.value);

        // Si estamos en una pestaña filtrada (ej. Comentado) y cambia, se oculta instantáneamente
        const urlParams = new URLSearchParams(window.location.search);
        const currentFiltro = urlParams.get('estado');
        if (currentFiltro && select.value !== currentFiltro) {
          const card = select.closest('.prospecto-card');
          if (card) {
            (card as HTMLElement).style.opacity = '0.5';
            (card as HTMLElement).style.pointerEvents = 'none';
            setTimeout(() => {
              (card as HTMLElement).style.display = 'none';
            }, 300);
          }
        }

        select.form?.requestSubmit();
      }}
    >
      {ESTADOS.map((e) => (
        <option key={e} value={e}>
          {e}
        </option>
      ))}
    </select>
  );
}

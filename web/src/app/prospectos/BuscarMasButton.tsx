'use client';

import { useTransition, useState } from 'react';
import { buscarMasProspectosAction } from '@/lib/actions';

export function BuscarMasButton() {
  const [pending, startTransition] = useTransition();
  const [mensaje, setMensaje] = useState<string | null>(null);

  function handleClick() {
    setMensaje(null);
    startTransition(async () => {
      const result = await buscarMasProspectosAction();
      setMensaje(result);
    });
  }

  return (
    <div style={{ marginBottom: 16 }}>
      <button
        onClick={handleClick}
        disabled={pending}
        style={{ background: 'var(--success, #22c55e)', color: '#fff', opacity: pending ? 0.7 : 1 }}
      >
        {pending ? '🔍 Buscando prospectos… (puede tardar 2-3 min)' : '🔍 Buscar más prospectos (hasta 25)'}
      </button>
      {mensaje && (
        <p style={{ marginTop: 8, color: 'var(--success, #22c55e)', fontWeight: 500 }}>
          ✅ {mensaje}
        </p>
      )}
    </div>
  );
}

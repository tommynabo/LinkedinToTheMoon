'use client';

import { useState } from 'react';

export function CopyButton({ text, label }: { text: string; label: string }) {
  const [copiado, setCopiado] = useState(false);

  return (
    <button
      type="button"
      className="secondary"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopiado(true);
        setTimeout(() => setCopiado(false), 1500);
      }}
    >
      {copiado ? '✅ Copiado' : label}
    </button>
  );
}

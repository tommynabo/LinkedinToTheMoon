'use client';

import { useState } from 'react';

export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      style={{
        marginTop: 8,
        padding: '4px 10px',
        fontSize: 12,
        cursor: 'pointer',
        background: copied ? '#16a34a' : '#2563eb',
        color: '#fff',
        border: 'none',
        borderRadius: 6,
        fontWeight: 600,
        transition: 'background 0.2s',
      }}
    >
      {copied ? '✓ Copiado' : '📋 Copiar post'}
    </button>
  );
}

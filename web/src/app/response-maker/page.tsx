'use client';

import { useState } from 'react';
import styles from './response-maker.module.css';

export default function ResponseMakerPage() {
  const [profile, setProfile] = useState('');
  const [conversation, setConversation] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const handleGenerate = async () => {
    if (!profile.trim() || !conversation.trim()) {
      setError('Por favor completa tanto la información del perfil como la conversación.');
      return;
    }

    setLoading(true);
    setError('');
    setResult('');
    setCopied(false);

    try {
      const response = await fetch('/api/response-maker', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile, conversation }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Ocurrió un error al generar la respuesta');
      }

      const data = await response.json();
      setResult(data.response);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    if (result) {
      navigator.clipboard.writeText(result);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>Response Maker 🚀</h1>
        <p className={styles.subtitle}>
          Claude AI entrenado como Jefe de Ventas para cerrar prospectos.
        </p>
      </div>

      <div className={styles.glassCard}>
        <div className={styles.inputGroup}>
          <label className={styles.label}>1. Información del Perfil (LinkedIn)</label>
          <textarea
            className={styles.textarea}
            placeholder="Pega aquí el acerca de, experiencia, titular, o cualquier contexto relevante del prospecto..."
            value={profile}
            onChange={(e) => setProfile(e.target.value)}
          />
        </div>

        <div className={styles.inputGroup}>
          <label className={styles.label}>2. Conversación Actual</label>
          <textarea
            className={styles.textarea}
            placeholder="Pega aquí el historial de mensajes o el último mensaje recibido..."
            value={conversation}
            onChange={(e) => setConversation(e.target.value)}
          />
        </div>

        {error && <div className={styles.error}>{error}</div>}

        <button 
          className={styles.generateBtn} 
          onClick={handleGenerate} 
          disabled={loading}
        >
          {loading ? (
            <>
              <div className={styles.spinner}></div>
              Generando respuesta maestra...
            </>
          ) : (
            '⚡ Generar Respuesta Estratégica'
          )}
        </button>
      </div>

      {result && (
        <div className={`${styles.glassCard} ${styles.resultSection}`}>
          <div className={styles.resultHeader}>
            <h3>Respuesta Generada</h3>
            <button className={styles.copyBtn} onClick={handleCopy}>
              {copied ? '¡Copiado!' : 'Copiar al portapapeles'}
            </button>
          </div>
          <div className={styles.resultContent}>
            {result}
          </div>
        </div>
      )}
    </div>
  );
}

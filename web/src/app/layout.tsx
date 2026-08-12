import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'LinkedIn to the Moon',
  description: 'Autopiloto de contenido y prospección en LinkedIn',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body>
        <header className="topbar">
          <div className="topbar-title">🚀 LinkedIn to the Moon</div>
          <nav className="topbar-nav">
            <a href="/">Panel</a>
            <a href="/posts">Posts</a>
            <a href="/prospectos">Prospectos</a>
            <a href="/crm">CRM</a>
            <a href="/ideas">Ideas</a>
            <a href="/import">Importar</a>
            <a href="/ajustes">Ajustes</a>
          </nav>
        </header>
        <main className="container">{children}</main>
      </body>
    </html>
  );
}

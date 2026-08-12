/**
 * auth.ts
 * Comprobación de Basic Auth para proteger el dashboard (usado desde middleware.ts, que
 * corre en el runtime "edge" — por eso usamos atob() en vez de Buffer).
 */

export function credencialesConfiguradas(): boolean {
  return Boolean(process.env.DASHBOARD_USER && process.env.DASHBOARD_PASSWORD);
}

export function esBasicAuthValido(authHeader: string | null): boolean {
  const user = process.env.DASHBOARD_USER;
  const pass = process.env.DASHBOARD_PASSWORD;
  if (!user || !pass || !authHeader?.startsWith('Basic ')) return false;

  try {
    const decoded = atob(authHeader.slice('Basic '.length));
    const separatorIndex = decoded.indexOf(':');
    if (separatorIndex === -1) return false;
    const u = decoded.slice(0, separatorIndex);
    const p = decoded.slice(separatorIndex + 1);
    return u === user && p === pass;
  } catch {
    return false;
  }
}

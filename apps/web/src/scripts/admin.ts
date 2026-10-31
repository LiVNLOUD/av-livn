// Admin token kept on this device (localStorage) until "Çıkış"; every admin page uses the same key.
const KEY = 'av-livn-admin';

export function getToken(): string {
  try {
    return localStorage.getItem(KEY) ?? sessionStorage.getItem(KEY) ?? '';
  } catch {
    return '';
  }
}

export function setToken(t: string): void {
  try {
    localStorage.setItem(KEY, t);
  } catch {}
}

export function logout(): void {
  try {
    localStorage.removeItem(KEY);
    sessionStorage.removeItem(KEY);
  } catch {}
}

/** GET an admin endpoint with the stored token; null without a token or on 401/503. */
export async function adminGet<T>(path: string): Promise<T | null> {
  const t = getToken();
  if (!t) return null;
  const r = await fetch(path, { headers: { authorization: `Bearer ${t}` }, cache: 'no-cache' }).catch(() => null);
  return r && r.ok ? ((await r.json()) as T) : null;
}

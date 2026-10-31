// Admin token kept on this device (localStorage) until "Çıkış"; every admin page uses the same key.
const KEY = 'av-livn-admin';

export function getToken(): string {
  try {
    return localStorage.getItem(KEY) ?? sessionStorage.getItem(KEY) ?? '';
  } catch {
    return '';
  }
}

/** Pasted keys often carry spaces, line breaks or zero-width characters at either end. */
export function cleanToken(t: string): string {
  return t.replace(/^[\s\u200b\u200c\u200d\ufeff]+|[\s\u200b\u200c\u200d\ufeff]+$/g, '');
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

export type LoginResult = 'ok' | 'wrong' | 'disabled' | 'offline' | 'error';

/** Check a key against /api/admin/ping: 200 ok, 401 wrong key, 503 key not configured on the server. */
export async function checkToken(t: string, f: typeof fetch = fetch): Promise<LoginResult> {
  try {
    const r = await f('/api/admin/ping', { headers: { authorization: `Bearer ${t}` }, cache: 'no-store' });
    if (r.ok) return 'ok';
    if (r.status === 401) return 'wrong';
    if (r.status === 503) return 'disabled';
    return 'error';
  } catch {
    return 'offline';
  }
}

export const LOGIN_TEXT: Record<LoginResult, string> = {
  ok: 'Giriş yapıldı.',
  wrong: 'Anahtar hatalı. Kontrol edip tekrar deneyin.',
  disabled: 'Sunucuda yönetici anahtarı yapılandırılmamış. Repo secret ADMIN_TOKEN ekleyip yeniden deploy edin.',
  offline: 'Bağlantı yok, tekrar deneyin.',
  error: 'Sunucu yanıt vermedi, birazdan tekrar deneyin.',
};

/**
 * Wire the shared <AdminLogin /> form: trims the key, shows a message for every outcome, disables the button
 * while checking (no double submit), stores the key and calls onSuccess. Shows the form only without a key.
 */
export function mountLogin(form: HTMLFormElement, onSuccess: () => void | Promise<void>): void {
  const input = form.querySelector<HTMLInputElement>('input[name="token"]')!;
  const btn = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  const msg = form.querySelector<HTMLElement>('.login-msg')!;
  const show = (kind: 'ok' | 'err' | '', text: string) => {
    msg.dataset.kind = kind;
    msg.textContent = text;
  };
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (btn.disabled) return;
    const t = cleanToken(input.value);
    input.value = t;
    if (!t) return show('err', 'Anahtarı girin.');
    btn.disabled = true;
    const label = btn.textContent;
    btn.textContent = 'Kontrol ediliyor…';
    show('', '');
    const res = await checkToken(t);
    btn.disabled = false;
    btn.textContent = label;
    if (res !== 'ok') return show('err', LOGIN_TEXT[res]);
    setToken(t);
    show('ok', LOGIN_TEXT.ok);
    form.hidden = true;
    document.querySelectorAll<HTMLElement>('.admin-only').forEach((el) => (el.hidden = false));
    await onSuccess();
  });
  const stored = getToken();
  if (!stored) {
    form.hidden = false;
    return;
  }
  // A stored key may have been rotated on the server: verify it before opening the page.
  form.hidden = true;
  checkToken(stored).then(async (res) => {
    if (res === 'wrong') {
      logout();
      form.hidden = false;
      return show('err', 'Kayıtlı anahtar artık geçerli değil (değişmiş olabilir). Yeni anahtarı girin.');
    }
    if (res === 'disabled') {
      form.hidden = false;
      return show('err', LOGIN_TEXT.disabled);
    }
    // ok, or offline: the pages keep working from their offline queues
    await onSuccess();
  });
}

/** Show the shared login form with a message (e.g. a request came back 401 later). */
export function showLogin(text: string): void {
  logout();
  const form = document.getElementById('login') as HTMLFormElement | null;
  if (!form) return;
  form.hidden = false;
  const msg = form.querySelector<HTMLElement>('.login-msg');
  if (msg) {
    msg.dataset.kind = 'err';
    msg.textContent = text;
  }
}

// Faz R: NASA Earthdata user token (EARTHDATA_TOKEN, repo secret, Actions only). The token is a JWT; its `exp`
// claim is read without verifying the signature (only the date is needed; the value is never printed).

/** Expiry (UTC) of a JWT, or null when it is not a readable JWT with a numeric `exp`. */
export function tokenExpiry(jwt: string | undefined | null): Date | null {
  const part = jwt?.split('.')[1];
  if (!part) return null;
  try {
    const json = JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '=')));
    return typeof json.exp === 'number' ? new Date(json.exp * 1000) : null;
  } catch {
    return null;
  }
}

export const WARN_DAYS = 10;
/** Istanbul local time in Turkish, e.g. "6 Ocak 2027 Çarşamba 23:41". */
export const trDate = (d: Date) =>
  new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', day: 'numeric', month: 'long', year: 'numeric', weekday: 'long', hour: '2-digit', minute: '2-digit' }).format(d);

/** What to tell the owner: null while more than WARN_DAYS remain. */
export function expiryNotice(exp: Date, now: Date): { level: 'soon' | 'expired'; title: string; body: string } | null {
  const days = (exp.getTime() - now.getTime()) / 86_400_000;
  if (days > WARN_DAYS) return null;
  if (days <= 0) return { level: 'expired', title: 'av.livn: Earthdata token süresi doldu', body: `Earthdata token ${trDate(exp)} tarihinde bitti: yenile ve EARTHDATA_TOKEN secret'ını güncelle. Uydu derinliği (ICESat-2) güncellenemiyor.` };
  return { level: 'soon', title: 'av.livn: Earthdata token bitiyor', body: `Earthdata token ${trDate(exp)} içinde bitiyor (${Math.ceil(days)} gün): yenile ve EARTHDATA_TOKEN secret'ını güncelle.` };
}

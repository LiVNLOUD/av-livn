// V2.9: the bitmap drawings (species, tackle, bait) on screen. One helper: fixed width/height from the asset's own
// aspect (no layout shift), lazy by default, alt text from apps/web/src/data/assets.json (each answers the question in
// docs/design/assets-needed.md). In the red night mode CSS turns them into dim red monochrome.
import manifest from '../data/assets.json';

export interface AssetDef { name: string; group: string; target: string; width: number; height: number; alt?: string }
const ASSETS: AssetDef[] = (manifest as { assets: AssetDef[] }).assets;
export const CONTENT_GROUPS = ['species', 'tackle', 'bait'];
export const contentAssets = () => ASSETS.filter((a) => CONTENT_GROUPS.includes(a.group));
export const assetSrc = (a: AssetDef) => a.target.replace(/^apps\/web\/public/, '');
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/** <img> for a named asset; size is the CSS width in px, the height follows the asset's aspect. */
export function assetImg(name: string, o: { size?: number; lazy?: boolean; cls?: string; alt?: string } = {}): string {
  const a = ASSETS.find((x) => x.name === name);
  if (!a) return '';
  const w = o.size ?? 48;
  const h = Math.round((w * a.height) / a.width);
  return `<img src="${assetSrc(a)}" width="${w}" height="${h}" alt="${esc(o.alt ?? a.alt ?? '')}" loading="${o.lazy === false ? 'eager' : 'lazy'}" decoding="async" class="asset-img${o.cls ? ' ' + o.cls : ''}" data-asset="${a.name}">`;
}

/** Species name as recorded → asset name. */
export const SPECIES_ASSET: Record<string, string> = { istavrit: 'istavrit', izmarit: 'izmarit', levrek: 'levrek', 'lüfer': 'lufer', 'mırmır': 'mirmir', kolyoz: 'kolyoz' };
/** Bait → asset name. */
export const BAIT_ASSET: Record<string, string> = { hamsi: 'hamsi-parcasi', karides: 'karides', midye: 'midye' };
/** Method → the drawing of its main part (no float drawing: the float method shows its bait only). */
export function methodAsset(id: string, tail: 'kurek' | 'igne' = 'kurek'): string | null {
  if (id === 'lrf') return tail === 'igne' ? 'silikon-igne-kuyruk' : 'silikon-kurek-kuyruk';
  if (id === 'mikro_jig') return 'mikro-jig';
  if (id === 'dropshot_yem' || id === 'dip') return 'dropshot-kursun';
  if (id === 'capari_tuylu' || id === 'capari_yemli') return 'capari';
  return null;
}
/** Rig part id (rigscene.ts) → asset, for the part info box. */
export function partAsset(partId: string, ctx: { tail?: 'kurek' | 'igne'; bait?: string | null }): string | null {
  if (partId === 'jighead') return 'jighead';
  if (partId === 'silikon') return ctx.tail === 'igne' ? 'silikon-igne-kuyruk' : 'silikon-kurek-kuyruk';
  if (partId === 'mikrojig') return 'mikro-jig';
  if (partId === 'kursun') return 'dropshot-kursun';
  if (partId === 'capari') return 'capari';
  if (partId === 'yem' && ctx.bait) return BAIT_ASSET[ctx.bait] ?? null;
  return null;
}

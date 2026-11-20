// V2.2: method-independent tackle for istavrit (docs/TACKLE.md "Yöntem havuzu"). Pure.
// Artificial and natural bait are presented side by side with their reasons; every reason carries its evidence kind
// (D6). The rules are C-level field heuristics; no single source decides (R19 Boğaz CPUE is one literature line,
// 8 Kasım Tirilye one field observation, the autumn anchovy run a hypothesis). Model coefficients are not touched:
// this ranks methods for a given hour, it does not change the spot score.
import type { LightCase } from './tackle';

export type MethodId = 'lrf' | 'mikro_jig' | 'capari_tuylu' | 'dropshot_yem' | 'dip' | 'samandira' | 'capari_yemli';
export type Bait = 'hamsi' | 'karides' | 'midye';
export type MethodCategory = 'suni' | 'dogal';
export type Mode = 'suni' | 'dogal' | 'hepsi';
/** Evidence kind of a reason line (D6): what the claim rests on. */
export type ReasonKind = 'kosul' | 'literatur' | 'saha' | 'hipotez' | 'varsayim' | 'envanter';

export interface MethodDef { id: MethodId; name: string; category: MethodCategory; bait: boolean; needs: Gear[] }
/** Gear the on-device inventory can say yes/no to (null = not stated). */
export type Gear = 'jighead' | 'silikon' | 'mikro_jig' | 'dropshot_kursun' | 'dip_kursun' | 'samandira' | 'capari' | 'igne';

export const METHODS: Readonly<Record<MethodId, MethodDef>> = {
  lrf: { id: 'lrf', name: 'LRF jighead + silikon', category: 'suni', bait: false, needs: ['jighead', 'silikon'] },
  mikro_jig: { id: 'mikro_jig', name: 'Mikro jig', category: 'suni', bait: false, needs: ['mikro_jig'] },
  capari_tuylu: { id: 'capari_tuylu', name: 'Çapari (tüylü)', category: 'suni', bait: false, needs: ['capari'] },
  dropshot_yem: { id: 'dropshot_yem', name: 'Dropshot + yem', category: 'dogal', bait: true, needs: ['dropshot_kursun', 'igne'] },
  dip: { id: 'dip', name: 'Dip takımı + yem', category: 'dogal', bait: true, needs: ['dip_kursun', 'igne'] },
  samandira: { id: 'samandira', name: 'Şamandıralı takım + yem', category: 'dogal', bait: true, needs: ['samandira', 'igne'] },
  capari_yemli: { id: 'capari_yemli', name: 'Çapari (yemli)', category: 'dogal', bait: true, needs: ['capari'] },
};
export const BAIT_TR: Readonly<Record<Bait, string>> = { hamsi: 'hamsi parçası', karides: 'karides', midye: 'midye' };

export interface MethodContext {
  /** Month 1–12 (Türkiye time). */
  month: number;
  light: LightCase;
  depthM: number;
  currentMs: number | null;
  gustKmh: number | null;
  waveM: number | null;
  /** Spot kind (iskele, mendirek, kayalik, kumsal, kordon, …). */
  kind: string;
  mode?: Mode;
  /** On-device inventory: true = owned, false = not owned, missing = not stated. */
  owned?: Partial<Record<Gear, boolean>>;
  /** Baits the angler can get; empty/missing = no preference. */
  baits?: Bait[];
}

export interface Reason { text: string; kind: ReasonKind }
export interface MethodPick {
  id: MethodId; name: string; category: MethodCategory;
  bait: Bait | null;
  /** Ranking weight for this hour (heuristic, not a probability). */
  weight: number;
  reasons: Reason[];
  /** false when the inventory says some needed gear is missing; null when the inventory does not say. */
  owned: boolean | null;
}
export interface LadderStep { step: number; change: string; detail: string }
export interface MethodAdvice { primary: MethodPick; secondary: MethodPick; ranked: MethodPick[]; ladder: LadderStep[]; ladderMinutes: number; note: string }

const NIGHT: LightCase[] = ['aydınlık gece', 'karanlık gece', 'bilinmeyen gece'];
/** Autumn anchovy run in the Marmara (Oct–Dec): a HYPOTHESIS for natural bait, never a fact about this spot (D6). */
export const AUTUMN_MONTHS = [10, 11, 12];
/** Default minutes before the next change — a field guide the user can set, not a scientific threshold (D6). */
export const LADDER_MINUTES = 15;

/** Bait for a natural method: the angler's own list first, else hamsi in its season, karides otherwise; midye on rock. */
export function pickBait(ctx: Pick<MethodContext, 'month' | 'kind' | 'baits'>): Bait {
  const own = ctx.baits ?? [];
  const seasonal: Bait = ctx.kind === 'kayalik' ? 'midye' : [10, 11, 12, 1, 2].includes(ctx.month) ? 'hamsi' : 'karides';
  if (own.length === 0 || own.includes(seasonal)) return seasonal;
  return own[0]!;
}

function score(id: MethodId, c: MethodContext): { w: number; reasons: Reason[] } {
  const r: Reason[] = [];
  let w = 1;
  const night = NIGHT.includes(c.light);
  const lit = c.light === 'aydınlık gece';
  const gust = c.gustKmh ?? 0;
  const cur = c.currentMs ?? 0;
  const wave = c.waveM ?? 0;
  const deep = c.depthM >= 4;
  const rough = gust >= 30 || wave >= 0.5;
  switch (id) {
    case 'lrf':
      if (lit) { w += 1; r.push({ text: 'aydınlık gecede yüzeye yakın silikon çalışır', kind: 'kosul' }); }
      else if (night || c.light === 'alacakaranlık') { w += 0.5; r.push({ text: 'gece/alacakaranlıkta hafif silikon yüzeye yakın çalışır', kind: 'kosul' }); }
      if (rough || cur >= 0.4) { w -= 1; r.push({ text: 'rüzgar/dalga ya da akıntı hafif jighead\'i taşır', kind: 'kosul' }); }
      r.push({ text: 'Boğaz\'da LRF birim çaba avı çapariden yüksek ölçüldü (R19, komşu bölge)', kind: 'literatur' });
      w += 0.3;
      break;
    case 'mikro_jig':
      if (!night && deep) { w += 1; r.push({ text: 'gündüz derin suda dibe hızlı iner', kind: 'kosul' }); }
      if (rough) { w += 0.3; r.push({ text: 'ağır yem rüzgarda kontrol edilir', kind: 'kosul' }); }
      if (!deep) { w -= 0.7; r.push({ text: 'sığ suda dibe takılır', kind: 'kosul' }); }
      break;
    case 'capari_tuylu':
      if (!night) { w += 0.6; r.push({ text: 'gündüz sürüde çoklu iğne', kind: 'kosul' }); }
      r.push({ text: 'Boğaz\'da çapari birim çaba avı LRF\'den düşük ölçüldü (R19)', kind: 'literatur' });
      w -= 0.2;
      break;
    case 'dropshot_yem':
      if (deep || !night) { w += 0.8; r.push({ text: 'yem dipten belli yükseklikte durur; derinlik ve gündüz için uygun', kind: 'kosul' }); }
      if (cur >= 0.4 || rough) { w += 0.3; r.push({ text: 'kurşun yemi akıntıda yerinde tutar', kind: 'kosul' }); }
      if (c.kind === 'iskele' || c.kind === 'mendirek') { w += 0.2; r.push({ text: 'yapı dibine dik indirilebilir', kind: 'kosul' }); }
      break;
    case 'dip':
      if (!night && deep) { w += 0.6; r.push({ text: 'gündüz dipte beslenen balık için', kind: 'kosul' }); }
      if (c.kind === 'kumsal') { w += 0.4; r.push({ text: 'kumsalda uzak atış, düz dip', kind: 'kosul' }); }
      if (c.kind === 'kayalik') { w -= 0.6; r.push({ text: 'kayalıkta dip takımı takılır', kind: 'kosul' }); }
      break;
    case 'samandira':
      if (rough || cur >= 0.3) { w -= 1; r.push({ text: 'dalga/akıntıda şamandıra sürüklenir', kind: 'kosul' }); }
      else { w += 0.4; r.push({ text: 'sakin suda yem istenen derinlikte asılı durur', kind: 'kosul' }); }
      if (lit) { w += 0.4; r.push({ text: 'ışık altında yüzeye yakın sürüye', kind: 'kosul' }); }
      break;
    case 'capari_yemli':
      if (!night) { w += 0.5; r.push({ text: 'gündüz sürüde, iğnelerde yem', kind: 'kosul' }); }
      break;
  }
  const def = METHODS[id];
  if (def.category === 'dogal' && AUTUMN_MONTHS.includes(c.month)) {
    w += 0.3;
    r.push({ text: 'sonbahar hamsi göçü: istavrit yem balığıyla beslenir, doğal yem işe yarayabilir — göçün varlığı bu merada bu saatte doğal yemin üstün olduğunu göstermez', kind: 'hipotez' });
  }
  if (id === 'dropshot_yem' && c.month === 11) r.push({ text: '8 Kas Tirilye: LRF 0 vuruş, dropshot + hamsi her atışta vuruş (tek gece, sıra ve süre bilinmiyor; kontrollü karşılaştırma değil)', kind: 'saha' });
  return { w, reasons: r };
}

function owned(def: MethodDef, inv: MethodContext['owned']): boolean | null {
  if (!inv) return null;
  const vals = def.needs.map((g) => inv[g]);
  if (vals.some((v) => v === false)) return false;
  return vals.every((v) => v === true) ? true : null;
}

/** Primary and secondary method for the hour, inside the angler's mode; owned gear first (V2 madde 3). */
export function recommendMethods(ctx: MethodContext): MethodAdvice {
  const mode = ctx.mode ?? 'hepsi';
  const ids = (Object.keys(METHODS) as MethodId[]).filter((id) => mode === 'hepsi' || METHODS[id].category === mode);
  const ranked = ids.map((id): MethodPick => {
    const def = METHODS[id];
    const s = score(id, ctx);
    const own = owned(def, ctx.owned);
    if (own === false) { s.w -= 2; s.reasons.push({ text: 'envanterinde gereken parça yok', kind: 'envanter' }); }
    if (own === true) { s.w += 0.5; s.reasons.push({ text: 'envanterinde var', kind: 'envanter' }); }
    return { id, name: def.name, category: def.category, bait: def.bait ? pickBait(ctx) : null, weight: Math.round(s.w * 100) / 100, reasons: s.reasons, owned: own };
  }).sort((a, b) => b.weight - a.weight || ids.indexOf(a.id) - ids.indexOf(b.id));
  const primary = ranked[0]!;
  // secondary from the other category when the mode allows it, so artificial and natural are both offered (D6)
  // (every mode holds at least two methods; 'hepsi' always holds both categories)
  const secondary = mode === 'hepsi' ? ranked.find((m) => m.category !== primary.category)! : ranked[1]!;
  return { primary, secondary, ranked, ladder: ladder(primary, secondary), ladderMinutes: LADDER_MINUTES, note: 'Sıralama doğrulanmamış bir saha kuralıdır; yöntemin üstün olduğunu göstermez.' };
}

/** Controlled change ladder: one variable per step (layer → weight/sink → size/profile → colour → method). */
export function ladder(primary: MethodPick, secondary: MethodPick | null): LadderStep[] {
  const steps: [string, string][] = [
    ['katman', 'aynı takımla bir katman aşağı ya da yukarı çalış (sayımı değiştir)'],
    ['ağırlık / saydırma', primary.category === 'suni' ? 'bir kademe ağır/hafif kafa ya da yavaş saydırma' : 'kurşunu bir kademe değiştir ya da yemi dipten 20–30 cm kaldır'],
    ['boy / profil', primary.category === 'suni' ? 'silikonu bir boy küçült ya da kuyruk tipini değiştir' : 'yemi küçült (iğneyi kapatacak kadar)'],
    ['renk', primary.category === 'suni' ? 'şeffaf-simli ↔ koyu siluet' : 'yem değiştir (hamsi ↔ karides)'],
    ['yöntem', secondary ? `${secondary.name}${secondary.bait ? ` (${BAIT_TR[secondary.bait]})` : ''} dene` : 'başka yönteme geç'],
  ];
  return steps.map(([change, detail], i) => ({ step: i + 1, change, detail }));
}

/** Sink seconds are an estimate from weight, never a measured depth (V2 madde 6). */
export const SINK_NOTE = 'Batış süresi ağırlıktan tahmindir; ölçülmüş derinlik değildir.';

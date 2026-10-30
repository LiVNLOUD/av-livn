import { describe, expect, it } from 'vitest';
import { pressureLabel } from '../src/components/pressure';
import { bandOf, conditionsAt, gustValue } from '../src/suitability';
import type { HourlyPoint, SpeciesProfile } from '../src/types';
import { hours, ISTAVRIT, MUDANYA } from './helpers';

const NIGHT = new Date('2026-11-05T19:00:00Z'); // 22:00 local, full night
const NOON = new Date('2026-11-05T10:00:00Z');

function view(now: Partial<HourlyPoint>, opts: { at?: Date; past?: (b: number) => Partial<HourlyPoint>; spot?: typeof MUDANYA; profile?: SpeciesProfile } = {}) {
  const at = opts.at ?? NIGHT;
  const pts = hours(at, 80, (b) => (b === 0 ? now : (opts.past?.(b) ?? {})));
  const list = conditionsAt({ spot: opts.spot ?? MUDANYA, at, profile: opts.profile ?? ISTAVRIT, points: pts });
  return Object.fromEntries(list.map((c) => [c.key, c]));
}

describe('bandOf thresholds (single source for UI colours)', () => {
  it.each([
    [1, 'good'], [0.75, 'good'], [0.7499, 'warn'], [0.4, 'warn'], [0.3999, 'bad'], [0, 'bad'], [null, 'neutral'],
  ] as const)('%s → %s', (s, band) => expect(bandOf(s)).toBe(band));
});

describe('wind (shore normal 0°: wind from 0° is onshore, from 180° is offshore)', () => {
  it.each([
    [10, 180, 'good'], [30, 180, 'good'], [45, 180, 'warn'],
    [10, 0, 'good'], [16, 0, 'good'], [20, 0, 'warn'], [25, 0, 'warn'], [30, 0, 'bad'],
    [35, 90, 'warn'],
  ])('%i km/h from %i° → %s', (speed, dir, band) => {
    const c = view({ windSpeed: speed, windDir: dir }).ruzgar!;
    expect(c.band).toBe(band);
    expect(c.display).toContain('km/sa');
  });

  it('labels direction relative to the shore and states the target', () => {
    expect(view({ windSpeed: 10, windDir: 180 }).ruzgar!.display).toBe('10 km/sa, karadan');
    expect(view({ windSpeed: 10, windDir: 0 }).ruzgar!.display).toBe('10 km/sa, kıyıya vuruyor');
    expect(view({ windSpeed: 10, windDir: 0 }).ruzgar!.target).toBe('Karadan veya yandan ≤ 20 km/sa; kıyıya vuran ≤ 10 km/sa');
  });
});

describe('gust (comfort 25, safety limit 40 from the species yaml)', () => {
  it.each([
    [24.9, 'good'], [25, 'warn'], [39.9, 'warn'], [40, 'bad'], [55, 'bad'],
  ])('%f km/h → %s', (g, band) => expect(view({ windGust: g }).hamle!.band).toBe(band));

  it('gustValue reads the limits it is given', () => {
    expect(gustValue(30, 35, 50)).toBe(1);
    expect(gustValue(45, 35, 50)).toBe(0.5);
  });
});

describe('wave', () => {
  it.each([
    [0.3, 'good'], [0.45, 'good'], [0.55, 'good'], [0.56, 'warn'], [0.6, 'warn'], [0.8, 'warn'], [0.9, 'bad'], [1.2, 'bad'],
  ])('%f m → %s', (h, band) => expect(view({ waveH: h }).dalga!.band).toBe(band));
});

describe('sea temperature (level + 3 day trend)', () => {
  it.each([
    [17, 17, 'good'], [17, 18, 'good'], [17, 19, 'warn'], [12, 12, 'warn'], [11, 11, 'warn'], [10, 10, 'bad'], [24, 24, 'bad'],
  ])('now %f °C, 3 days ago %f °C → %s', (now, before, band) => {
    expect(view({ sst: now }, { past: (b) => (b === 72 ? { sst: before } : {}) }).su!.band).toBe(band);
  });

  it('shows the trend arrow', () => {
    expect(view({ sst: 17 }, { past: (b) => (b === 72 ? { sst: 18 } : {}) }).su!.display).toBe('17.0 °C ↓ −1.0 (3 gün)');
    expect(view({ sst: 17 }, { past: (b) => (b === 72 ? { sst: 16.5 } : {}) }).su!.display).toBe('17.0 °C ↑ +0.5 (3 gün)');
    expect(view({ sst: 17 }, { past: (b) => (b === 72 ? { sst: 17.1 } : {}) }).su!.display).toBe('17.0 °C → −0.1 (3 gün)');
    expect(view({ sst: 17 }).su!.display).toBe('17.0 °C');
  });
});

describe('pressure tendency', () => {
  it.each([
    [0, 'good', '→'], [-0.4, 'good', '↓'], [0.3, 'good', '→'], [0.6, 'good', '↑'], [0.9, 'warn', '↑'], [1.2, 'bad', '↑'], [-2, 'bad', '↓'], [-1.25, 'warn', '↓'],
  ])('%f hPa/h → %s %s', (rate, band, arrow) => {
    const c = view({ pressure: 1010 + rate * 3 }, { past: (b) => (b === 3 ? { pressure: 1010 } : {}) }).basinc!;
    expect(c.band).toBe(band);
    expect(c.display).toContain(arrow);
  });

  it('without history shows the value but no colour', () => {
    const c = view({ pressure: 1012 }).basinc!;
    expect(c.display).toBe('1012 hPa');
    expect(c.band).toBe('neutral');
    expect(pressureLabel(0)).toBe('stabil');
  });
});

describe('current', () => {
  it.each([
    [0.01, 'warn'], [0.04, 'good'], [0.05, 'good'], [0.25, 'good'], [0.33, 'good'], [0.4, 'warn'], [0.5, 'bad'], [0.7, 'bad'],
  ])('%f m/s → %s', (v, band) => expect(view({ curVel: v }).akinti!.band).toBe(band));
});

describe('moon and night multiplier', () => {
  it('moon colours only at lit spots; neutral grey elsewhere', () => {
    const lit = view({}, { at: new Date('2026-11-09T19:00:00Z') }).ay!;
    expect(lit.band).toBe('good');
    expect(lit.affects).toBe(true);
    const full = view({}, { at: new Date('2026-11-24T21:00:00Z') }).ay!;
    expect(full.band).toBe('bad');
    const dark = view({}, { spot: { ...MUDANYA, hasLight: null } }).ay!;
    expect(dark).toMatchObject({ band: 'neutral', affects: false });
    expect(dark.target).toContain('nötr');
  });

  it.each([
    [NIGHT, true, 'good', '×1.00, tam gece'],
    [NIGHT, false, 'good', '×0.75, tam gece'],
    [new Date('2026-11-05T15:20:00Z'), true, 'warn', '×0.70, alacakaranlık'],
    [new Date('2026-11-05T15:20:00Z'), false, 'warn', '×0.53, alacakaranlık'],
    [NOON, true, 'bad', '×0.25, gündüz'],
  ] as const)('%s lamp=%s → %s', (at, light, band, display) => {
    const c = view({}, { at, spot: { ...MUDANYA, hasLight: light } }).gece_carpani!;
    expect(c.band).toBe(band);
    expect(c.display).toBe(display);
  });

  it('mentions the no-lamp factor only where relevant', () => {
    expect(view({}).gece_carpani!.target).not.toContain('lambasız');
    expect(view({}, { spot: { ...MUDANYA, hasLight: null } }).gece_carpani!.target).toContain('lambasız ×0.75');
  });
});

describe('values that do not affect the score', () => {
  it('air temperature and cloud are grey with a note', () => {
    const v = view({ temp: 16.4, cloud: 80 });
    expect(v.hava).toMatchObject({ display: '16 °C', band: 'neutral', affects: false, target: 'Puanı etkilemez' });
    expect(v.bulut).toMatchObject({ display: '%80', band: 'neutral', affects: false });
  });

  it('missing data is neutral with null display', () => {
    const v = view({});
    for (const k of ['ruzgar', 'hamle', 'dalga', 'su', 'basinc', 'akinti', 'hava', 'bulut']) {
      expect(v[k]).toMatchObject({ display: null, band: 'neutral' });
    }
  });

  it('accepts a prebuilt index', async () => {
    const { indexSeries } = await import('../src/engine');
    const list = conditionsAt({ spot: MUDANYA, at: NIGHT, profile: ISTAVRIT, index: indexSeries([]) });
    expect(list.map((c) => c.key)).toEqual(['gece_carpani', 'ruzgar', 'hamle', 'dalga', 'su', 'basinc', 'akinti', 'ay', 'hava', 'bulut']);
  });
});

describe('species-driven colours', () => {
  it('a profile with stricter wind limits changes the band without UI changes', () => {
    const strict: SpeciesProfile = { ...ISTAVRIT, params: { ...ISTAVRIT.params, wind: { onshore_start_kmh: 5, onshore_span_kmh: 10, offshore_ok_kmh: 10, offshore_span_kmh: 10 } } };
    expect(view({ windSpeed: 12, windDir: 0 }).ruzgar!.band).toBe('good');
    expect(view({ windSpeed: 12, windDir: 0 }, { profile: strict }).ruzgar!.band).toBe('bad');
    expect(view({ windSpeed: 12, windDir: 0 }, { profile: strict }).ruzgar!.target).toContain('≤ 10 km/sa; kıyıya vuran ≤ 5 km/sa');
  });
});

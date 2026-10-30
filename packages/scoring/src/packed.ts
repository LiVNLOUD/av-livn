// Compact storage/transport form of a spot's precomputed hours. Keys, weights and condition labels are stored
// once; per-hour data is arrays with rounded numbers (~125 KB → ~45 KB for 75 h). The Worker returns it as a
// raw string (no parse), clients unpack only the hours they show.

export interface DetailHour {
  ts: string;
  total: number | null;
  raw: number | null;
  gated: boolean;
  warnings: string[];
  missing: string[];
  components: { key: string; weight: number; value: number | null; contribution: number | null; reason: string }[];
  multipliers: { key: string; value: number; phase: string; reason: string }[];
  conditions: { key: string; display: string | null; suitability: number | null; band: string }[];
}

export interface Detail {
  meta: {
    computed_at: string;
    weather_fetched_at: string | null;
    sea_fetched_at: string | null;
    sea_grid: { lat: number; lon: number; distance_km: number } | null;
    conditions: { key: string; label: string; target: string; affects: boolean }[];
  };
  hours: DetailHour[];
}

/**
 * Compact storage form of Detail: keys/weights/labels once in meta, per-hour data as arrays, numbers rounded.
 * Keeps each row well under D1's 100 KB statement limit (~125 KB → ~45 KB for 75 h).
 */
type PackedHour = [string, number | null, number | null, 0 | 1, string[], [number | null, number | null, string][], [number, string, string] | null, [string | null, number | null, string][]];
export interface PackedDetail {
  v: 1;
  meta: Detail['meta'] & { comps: [string, number][]; mult: string | null };
  h: PackedHour[];
}

const r3 = (x: number | null) => (x === null ? null : Math.round(x * 1000) / 1000);

export function packDetail(d: Detail): PackedDetail {
  const first = d.hours[0];
  return {
    v: 1,
    meta: { ...d.meta, comps: (first?.components ?? []).map((c) => [c.key, c.weight]), mult: first?.multipliers[0]?.key ?? null },
    h: d.hours.map((h) => [
      h.ts,
      h.total,
      h.raw,
      h.gated ? 1 : 0,
      h.warnings,
      h.components.map((c) => [r3(c.value), r3(c.contribution), c.reason]),
      h.multipliers[0] ? [h.multipliers[0].value, h.multipliers[0].phase, h.multipliers[0].reason] : null,
      h.conditions.map((c) => [c.display, r3(c.suitability), c.band]),
    ]),
  };
}

/** Inverse of packDetail for the hours [from, from + count). */
export function unpackDetail(p: PackedDetail, from = 0, count = p.h.length): Detail {
  const { comps, mult, ...meta } = p.meta;
  return {
    meta,
    hours: p.h.slice(from, from + count).map(([ts, total, raw, gated, warnings, cs, m, conds]) => {
      const components = cs.map(([value, contribution, reason], i) => ({ key: comps[i]![0], weight: comps[i]![1], value, contribution, reason }));
      return {
        ts,
        total,
        raw,
        gated: gated === 1,
        warnings,
        missing: components.filter((c) => c.value === null).map((c) => c.key),
        components,
        multipliers: m && mult ? [{ key: mult, value: m[0], phase: m[1], reason: m[2] }] : [],
        conditions: conds.map(([display, suitability, band], i) => ({ key: meta.conditions[i]!.key, display, suitability, band })),
      };
    }),
  };
}


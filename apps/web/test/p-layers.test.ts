import { describe, expect, it } from 'vitest';
import { frameIndex, glyphFeatures, glyphId, nearest, rampColor, RAMPS, sample, type Grid } from '../src/scripts/layers';
import { sliderLayout } from '../src/scripts/timeslider';
import { forecastColumns, renderForecast, windClass } from '../src/scripts/forecast';

const H0 = Math.floor(Date.parse('2026-11-07T15:00Z') / 3_600_000); // 18:00 Istanbul
const grid = (vars: Grid['vars'], over: Partial<Grid> = {}): Grid => ({ from_hour: H0, hours: 2, lat0: 40, lon0: 29, dlat: 0.1, dlon: 0.1, nlat: 2, nlon: 2, source: 't', vars, ...over });

describe('P5 grid sampling and ramps', () => {
  it('bilinear inside, nearest known next to land, null outside', () => {
    const g = grid({});
    expect(sample(g, [0, 10, 20, 30], 29.05, 40.05)).toBeCloseTo(15);
    expect(sample(g, [0, 10, 20, 30], 29, 40)).toBe(0);
    expect(sample(g, [null, 10, 20, 30], 29.05, 40.05)).toBe(10);
    expect(sample(g, [null, null, null, null], 29.05, 40.05)).toBeNull();
    expect(sample(g, [0, 10, 20, 30], 28.9, 40.05)).toBeNull();
    expect(nearest(g, [null, 10, 20, null], 29.0, 40.0)).toBe(10);
    expect(nearest(g, [null, null, null, null], 29, 40)).toBeNull();
    expect([frameIndex(g, H0), frameIndex(g, H0 + 1), frameIndex(g, H0 + 2), frameIndex(g, H0 - 1)]).toEqual([0, 1, null, null]);
  });
  it('ramps interpolate and clamp; rain and cloud start transparent', () => {
    const st = RAMPS.ruzgar.stops;
    expect(rampColor(st, -5)).toEqual(st[0]![1]);
    expect(rampColor(st, 999)).toEqual(st[st.length - 1]![1]);
    expect(rampColor([[0, [0, 0, 0, 0]], [10, [100, 100, 100, 1]]], 5)).toEqual([50, 50, 50, 0.5]);
    expect(rampColor(RAMPS.yagis.stops, 0)[3]).toBe(0);
    expect(rampColor(RAMPS.bulut.stops, 0)[3]).toBe(0);
    expect(RAMPS.yagis.legend).toMatch(/tahmin, radar değil/);
    expect(RAMPS.bulut.legend).toMatch(/ay ışığını ve dolayısıyla ortam karanlığını etkiler/);
  });
  it('spot glyphs: arrow towards (from + 180°), speed, rain ≥ 0.1 mm/h, safety flag', () => {
    const g = grid({ ws: [[12, 12, 12, 12]], wd: [[350, 350, 350, 350]], pr: [[0, 0, 0, 3]] }, { hours: 1 });
    const fc = glyphFeatures(g, H0, [{ id: 'a', lat: 40, lon: 29, gated: false }, { id: 'b', lat: 40.1, lon: 29.1, gated: true }]);
    // 170° → sector 8 of 16 (22.5° each)
    expect(fc.features.map((f) => f.properties)).toEqual([{ id: 'a', img: 'gl:8:12:0:0' }, { id: 'b', img: 'gl:8:12:1:1' }]);
    // hour outside the grid or no grid: no wind, no speed, safety still shown
    expect(glyphFeatures(g, H0 + 5, [{ id: 'a', lat: 40, lon: 29, gated: true }]).features[0]!.properties).toEqual({ id: 'a', img: 'gl:x::0:1' });
    expect(glyphFeatures(null, H0, [{ id: 'a', lat: 40, lon: 29, gated: false }]).features[0]!.properties).toEqual({ id: 'a', img: 'gl:x::0:0' });
    expect(glyphId(355, '3', false, false)).toBe('gl:0:3:0:0');
  });
});

describe('P3 time slider layout', () => {
  it('days start at local midnight, nights where the sun is below −6°, now mark', () => {
    const from = Math.floor(Date.parse('2026-11-07T09:00Z') / 3_600_000); // 12:00 local
    const L = sliderLayout(from, 72, Date.parse('2026-11-07T09:30Z'));
    expect(L.days.map((d) => d.col)).toEqual([0, 12, 36, 60]);
    expect(L.nowFrac).toBeCloseTo(0.5 / 72);
    expect(L.night.length).toBe(3);
    for (const [a, b] of L.night) { expect(b - a).toBeGreaterThanOrEqual(11); expect(b - a).toBeLessThanOrEqual(14); }
    // the first night begins in the evening (17–19 local)
    expect(L.night[0]![0]).toBeGreaterThanOrEqual(5);
    expect(L.night[0]![0]).toBeLessThanOrEqual(7);
  });
});

describe('P4 point forecast table', () => {
  const hrs = Array.from({ length: 6 }, (_, k) => [new Date((H0 + k) * 3_600_000).toISOString(), 60 + k, null, 50, 70, k === 3 ? 1 : 0] as [string, number, ...unknown[]]);
  const tk = hrs.map((_, k) => [3, 0.12, 10 + k * 8, 20 + k * 8, null, -20, null, null, null, 0.4]);
  it('3-hourly local columns with model range, grid extras and moon', () => {
    const wx = grid({ wd: [[45, 45, 45, 45], [45, 45, 45, 45], [45, 45, 45, 45], [90, 90, 90, 90]], pr: [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [5, 5, 5, 5]], cc: [[80, 80, 80, 80], [0, 0, 0, 0], [0, 0, 0, 0], [20, 20, 20, 20]] }, { hours: 4 });
    const sea = grid({ sst: [[164, 164, 164, 164]], wh: [[40, 40, 40, 40]] }, { hours: 1 });
    const cur = grid({ u: [[0, 0, 0, 0]], v: [[10, 10, 10, 10]] }, { hours: 1 });
    const spread = { from_hour: H0, cells: [{ lat: 40, lon: 29, w: [[8, 14, 2], null, null, [30, 44, 6]] as ([number, number, number] | null)[] }] };
    const cols = forecastColumns({ lat: 40, lon: 29, hours: hrs, tk, wx, sea, cur, spread });
    expect(cols.map((c) => c.time)).toEqual(['18', '21']);
    expect(cols[0]).toMatchObject({ score: 60, gated: false, wind: 10, gust: 20, range: [8, 14], dir: 45, rain: 0, cloud: 80, sst: 16.4, wave: 0.4, current: 12, curDir: 0 });
    expect(cols[1]).toMatchObject({ score: 63, gated: true, wind: 34, range: [30, 44], dir: 90, rain: 0.5, cloud: 20, sst: null, current: 12, curDir: null });
    expect(cols[0]!.moon).toBeGreaterThanOrEqual(0);
    // no grids at all: still a table from the packed data
    const bare = forecastColumns({ lat: 40, lon: 29, hours: hrs, tk: [], step: 1 });
    expect(bare).toHaveLength(6);
    expect(bare[0]).toMatchObject({ wind: null, dir: null, range: null, current: null, wave: null });
    const html = renderForecast(cols);
    expect(html).toMatch(/<th scope="row">Rüzgar <small>km\/sa<\/small><\/th>/);
    expect(html).toMatch(/class="fc-rng"/);
    expect(html).toMatch(/class="sg">!<\/td>|class="nt sg">!<\/td>/);
    expect(html).toMatch(/⚠/);
    expect(renderForecast(bare)).not.toMatch(/fc-rng/);
    expect(renderForecast([])).toMatch(/veri yok/);
  });
  it('wind colour classes', () => {
    expect([null, 5, 15, 25, 35, 45].map(windClass)).toEqual(['na', 'w0', 'w1', 'w2', 'w3', 'w4']);
  });
});

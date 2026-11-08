"""R2/R3 outputs per spot: ATL24 points within 150 m and cast-band depths (ATL24; SDB only if accepted) → D1,
coverage report docs/audit/atl24-coverage.md, SDB report docs/audit/sdb-validation.md, map overlay (if accepted).
Usage: python -m av_pipeline.satbathy.spots data/satbathy [--no-d1]
"""

from __future__ import annotations

import datetime as dt
import json
import sys
from pathlib import Path

import numpy as np

from av_pipeline.satbathy.core import ACCEPT_N, ACCEPT_R2, ACCEPT_RMSE, haversine_m, spot_bands

SEGMENTS = [  # coast sections for the coverage table (lon ranges, south/north of the bay)
    ("Armutlu – Fıstıklı (kuzey kıyı batı)", 28.70, 28.95, 40.42, 40.62),
    ("Kapaklı – Narlı – Gemlik kuzeyi", 28.95, 29.15, 40.42, 40.62),
    ("Gemlik – Umurbey – Kurşunlu (doğu)", 29.05, 29.25, 40.24, 40.45),
    ("Mudanya – Güzelyalı – Kumyaka (güney kıyı)", 28.70, 29.05, 40.24, 40.42),
]


def load_points(out: Path):
    gj = json.loads((out / "atl24.geojson").read_text())
    f = gj["features"]
    lon = np.array([p["geometry"]["coordinates"][0] for p in f])
    lat = np.array([p["geometry"]["coordinates"][1] for p in f])
    depth = np.array([p["properties"]["depth"] for p in f], float)
    sigma = np.array([np.nan if p["properties"]["sigma"] is None else p["properties"]["sigma"] for p in f], float)
    passes = [p["properties"]["pass"] for p in f]
    dates = [p["properties"]["date"] for p in f]
    return gj, lon, lat, depth, sigma, passes, dates


def coverage_md(gj, lon, lat, depth, passes, dates, spots, near) -> str:
    L = ["# ICESat-2 ATL24 kapsamı (Gemlik–Mudanya kıyısı)", ""]
    L.append(f"Kaynak: {gj.get('source')}; çekim yolu: {gj.get('fetched_via')}; güncelleme {gj.get('updated')}. Yalnız batimetri sınıfı (40), güven ≥ 0,6, kalite bayrağı yok; 10 m'de bir nokta.")
    L.append("")
    diag = gj.get("diagnostics") or {}
    st = diag.get("stages") or {}
    if st:
        tr = {"photons": "Granüllerdeki toplam foton", "in_bbox": "Gemlik–Mudanya kutusu içinde", "class_40": "Batimetri sınıfı (40)", "conf_ge_0_6": "Güven ≥ 0,6", "flags_clean": "Kalite bayrağı yok", "depth_ok": "Derinlik 0–40 m"}
        L.append(f"Aşama sayaçları ({diag.get('granules_read', '?')} granül okundu; her satır bir öncekinden kalan foton):")
        L.append("")
        L.append("| Aşama | Foton |")
        L.append("|---|---|")
        L += [f"| {tr.get(k, k)} | {f'{v:,}'.replace(',', '.')} |" for k, v in st.items()]
        if diag.get("nearest_photon"):
            n0, ext = diag["nearest_photon"], diag.get("photon_extent_lat_lat_lon_lon")
            tr_n = lambda x, k=2: f"{x:.{k}f}".replace(".", ",")  # noqa: E731
            L.append("")
            L.append(f"Kutu merkezine en yakın foton {tr_n(n0['km'], 1)} km uzakta ({tr_n(n0['lat'], 4)} K, {tr_n(n0['lon'], 4)} D; sınıf {n0['class_ph']}). 50 km içinde {diag.get('within_50km', 0)} foton, bunların {diag.get('within_50km_class_40', 0)} tanesi batimetri sınıfında."
                     + (f" Tüm fotonlar enlem {tr_n(ext[0])}–{tr_n(ext[1])}, boylam {tr_n(ext[2])}–{tr_n(ext[3])} aralığında." if ext else ""))
        if diag.get("first_beam_in_bbox"):
            f = diag["first_beam_in_bbox"]
            L.append("")
            L.append(f"Kutudaki ilk ışında sınıf dağılımı: {f.get('class_ph_values')}; güven aralığı {f.get('confidence_range')}.")
        L.append("")
    if len(depth) == 0:
        why = ("Kutu içinde batimetri sınıfı (40) foton yok: ürün bu kıyıda dip algılamamış (bulanık suda lazer dibe ulaşamıyor)." if st and st.get("in_bbox") and not st.get("class_40")
               else "Kutu içinde hiç foton yok: ICESat-2 geçişleri bu kıyıda ATL24 ürünü üretmemiş." if st and not st.get("in_bbox")
               else "Batimetri fotonları var ama güven/kalite eşiğini geçen yok." if st and st.get("class_40")
               else "Aşama sayaçları yok (eski çalışma); sonuç doğrulanmadı.")
        L.append(f"**Bölgede kullanılabilir ATL24 batimetri ölçümü yok.** {why} Uydu lidarından meralara derinlik gelmedi.")
        return "\n".join(L) + "\n"
    yrs = sorted({d[:4] for d in dates})
    L.append(f"- Toplam {len(depth)} nokta, {len(set(passes))} geçiş (ışın), yıllar {yrs[0]}–{yrs[-1]}.")
    L.append(f"- Derinlik aralığı {depth.min():.1f}–{depth.max():.1f} m (medyan {np.median(depth):.1f} m).")
    L.append("")
    L.append("| Kıyı kesimi | Nokta | Geçiş | Derinlik aralığı |")
    L.append("|---|---|---|---|")
    for name, w, e, s, n in SEGMENTS:
        m = (lon >= w) & (lon < e) & (lat >= s) & (lat < n)
        k = int(m.sum())
        L.append(f"| {name} | {k} | {len(set(np.asarray(passes)[m])) if k else 0} | {f'{depth[m].min():.1f}–{depth[m].max():.1f} m' if k else '—'} |")
    L.append("")
    have = [(s, c) for s, c in zip(spots, near) if c > 0]
    L.append(f"## Meraların 0–150 m çevresi\n\n{len(have)} / {len(spots)} meranın 150 m çevresine en az bir ölçüm düşüyor.\n")
    if have:
        L.append("| Mera | 0–150 m ölçüm sayısı |")
        L.append("|---|---|")
        for s, c in sorted(have, key=lambda x: -x[1]):
            L.append(f"| {s['name']} | {c} |")
    return "\n".join(L) + "\n"


def sdb_md(rep: dict) -> str:
    L = ["# Sentinel-2 uydu türevli batimetri (SDB) doğrulaması", ""]
    L.append("Yöntem: Stumpf vd. (2003) log-oran (mavi/yeşil), ICESat-2 ATL24 ile kalibrasyon; doğrulama ATL24 geçişlerine göre gruplu 5 kat (aynı geçişin noktaları aynı katta). Copernicus Sentinel-2 L2A (Earth Search STAC).")
    L.append(f"Kabul eşiği: 0–8 m'de RMSE ≤ {str(ACCEPT_RMSE).replace('.', ',')} m, R² ≥ {str(ACCEPT_R2).replace('.', ',')}, en az {ACCEPT_N} bağımsız nokta (piksel × geçiş).")
    L.append("")
    L.append(f"- Kullanılan berrak sahne: {rep.get('scenes_used', 0)}; kıyı şeridi pikseli {rep.get('strip_pixels')}; şeritte 0–10 m ATL24 noktası {rep.get('atl24_in_strip_0_10m', 0)}.")
    L.append(f"- Kalibrasyon: {rep.get('calibration_points', 0)} bağımsız nokta, {rep.get('calibration_passes', 0)} geçiş.")
    v = rep.get("validation")
    if v:
        r = v["range_0_8"]
        L.append(f"- 0–8 m: RMSE {r['rmse']} m, bias {r['bias']} m, R² {r['r2']}, n {r['n']}; tüm aralık: RMSE {v['all']['rmse']} m, R² {v['all']['r2']}.")
        L.append("")
        L.append("| Derinlik bandı | n | RMSE (m) | bias (m) |")
        L.append("|---|---|---|---|")
        for k, m in v["by_band"].items():
            L.append(f"| {k} m | {m['n']} | {m['rmse'] if m['rmse'] is not None else '—'} | {m['bias'] if m['bias'] is not None else '—'} |")
    d = rep.get("decision", {})
    L.append("")
    L.append(f"**Karar: {'KABUL — modele girer' if d.get('accepted') else 'RET — modele girmez, yalnız rapor'}.**" + ("" if d.get("accepted") else f" Neden: {'; '.join(d.get('why', []))}."))
    return "\n".join(L) + "\n"


def main(argv: list[str]) -> None:
    out = Path(argv[0])
    use_d1 = "--no-d1" not in argv
    gj, lon, lat, depth, sigma, passes, dates = load_points(out)
    rep = json.loads((out / "sdb_report.json").read_text()) if (out / "sdb_report.json").exists() else {}
    accepted = bool(rep.get("decision", {}).get("accepted"))
    if use_d1:
        from av_pipeline.ocean.marmara import D1, spots_from_d1  # noqa: PLC0415

        d1 = D1()
        spots = d1.query("SELECT id, name, lat, lon FROM spots WHERE status NOT IN ('rejected', 'proposed') AND hidden_reason IS NULL ORDER BY id")
    else:
        spots = [{"id": f["properties"]["id"], "name": f["properties"]["name"], "lat": f["geometry"]["coordinates"][1], "lon": f["geometry"]["coordinates"][0]} for f in json.loads(Path("data/spots.geojson").read_text())["features"]]
    now = dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")
    pts_rows, band_rows, near = [], [], []
    sdb = np.load(out / "sdb_grid.npz") if accepted and (out / "sdb_grid.npz").exists() else None
    for s in spots:
        dist = haversine_m(s["lat"], s["lon"], lat, lon) if len(lat) else np.array([])
        m = dist <= 150
        near.append(int(m.sum()))
        for i in np.where(m)[0]:
            pts_rows.append([s["id"], round(float(dist[i]), 1), float(depth[i]), None if not np.isfinite(sigma[i]) else float(sigma[i]), passes[i], dates[i]])
        if m.any():
            for b, v in enumerate(spot_bands(s["lat"], s["lon"], lat[m], lon[m], depth[m], np.where(np.isfinite(sigma[m]), sigma[m], 0.5), groups=list(np.asarray(passes)[m]))):
                if v:
                    band_rows.append([s["id"], b, "atl24", v["depth_m"], v["sigma_m"], v["n"], now])
        if sdb is not None:
            band_rows += sdb_bands(s, sdb, now)
    Path("docs/audit/atl24-coverage.md").write_text(coverage_md(gj, lon, lat, depth, passes, dates, spots, near))
    Path("docs/audit/sdb-validation.md").write_text(sdb_md(rep))
    print(f"spots: {sum(1 for c in near if c)} with ATL24 within 150 m; band rows {len(band_rows)} (atl24 {sum(r[2] == 'atl24' for r in band_rows)}, sdb {sum(r[2] == 'sdb' for r in band_rows)})")
    if use_d1:
        d1.query("DELETE FROM sat_depth_points")
        d1.query("DELETE FROM sat_depth_band")
        for r in pts_rows:
            d1.query("INSERT INTO sat_depth_points (spot_id, dist_m, depth_m, sigma_m, pass_id, obs_date) VALUES (?1, ?2, ?3, ?4, ?5, ?6)", r)
        for r in band_rows:
            d1.query("INSERT INTO sat_depth_band (spot_id, band, kind, depth_m, sigma_m, n, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)", r)
        d1.query("INSERT INTO meta (key, value) VALUES ('sat_depth', ?1) ON CONFLICT(key) DO UPDATE SET value = excluded.value", [json.dumps({"updated": now, "atl24_points": int(len(depth)), "spots_with_atl24": sum(1 for c in near if c), "sdb_accepted": accepted, "sdb_rmse": (rep.get("validation") or {}).get("range_0_8", {}).get("rmse")})])


def sdb_bands(s: dict, sdb, now: str) -> list[list]:
    from pyproj import Transformer  # noqa: PLC0415

    from av_pipeline.satbathy.sdb import CRS, RES  # noqa: PLC0415

    t = sdb["transform"]
    depth, sigma = sdb["depth"], sdb["sigma"]
    x, y = Transformer.from_crs("EPSG:4326", CRS, always_xy=True).transform(s["lon"], s["lat"])
    c0, r0 = int((x - t[2]) // RES), int((t[5] - y) // RES)
    k = 16  # 160 m window
    rows = []
    sub = (slice(max(r0 - k, 0), r0 + k + 1), slice(max(c0 - k, 0), c0 + k + 1))
    d, sg = depth[sub], sigma[sub]
    rr, cc = np.mgrid[sub[0], sub[1]]
    dist = np.hypot((cc - c0) * RES, (rr - r0) * RES)
    for b, (a, e) in enumerate(((0, 50), (50, 150))):
        m = (dist >= a) & (dist < e) & np.isfinite(d)
        if m.sum() >= 3:
            rows.append([s["id"], b, "sdb", round(float(np.median(d[m])), 2), round(float(np.median(sg[m])), 2), int(m.sum()), now])
    return rows


if __name__ == "__main__":
    main(sys.argv[1:])

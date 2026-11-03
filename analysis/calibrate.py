"""F4 calibration (docs/MODEL.md §8a, Hoyle et al. 2024 = RESEARCH R21).

Catch per session is modelled with a log link and a log(effort) offset, effort = active hours × rods:
  count ~ Poisson / NegBin( exp(log effort + b0 + b1·log(score/100) + b2·moon + b3·cloud + b4·turbidity) )
plus a simple GAM (B-spline in the score). Zero catches stay in the data. Below MIN_SESSIONS nothing is
fitted and the report says "yetersiz veri". The report holds coefficients and n only, never session rows.

Usage (GitHub Actions, calibrate.yml):  python analysis/calibrate.py --d1 [--write]
Local / tests:                           python analysis/calibrate.py --fake 120
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import math
import sys
from dataclasses import dataclass

import numpy as np

MIN_SESSIONS = 30
THRESHOLDS = (30, 100, 300)
OVERDISPERSION = 1.5
STAGE = {
    30: "puan eğimi (β) ve taban (λ₀)",
    100: "gece/gündüz ve lamba kolları",
    300: "mera statik terimleri ve mevsim genlikleri",
}
# I6: what the code actually fits at every stage. The 100/300 stages are a plan (docs/MODEL.md §8a), not code:
# reaching them changes this label only, never the model, until the matching fit is implemented.
FITTED = "β ve λ₀ (+ ay, bulut, bulanıklık eş değişkenleri); 100/300 aşamaları henüz kodda yok"
TEST_SHARE = 0.3


@dataclass
class Session:
    count: int
    effort_h: float  # active hours × rods
    score: float  # frozen model score, mean over session hours (0–100)
    moon: float  # moon illumination when above horizon, 0..1
    cloud: float  # 0..1
    turbidity: float  # model term, 1 = clear
    # I6: only prospective (forecast captured before the start), non-retrospective sessions measure success
    prospective: bool = True
    retro: bool = False
    start_at: str = ""
    spot_id: str = ""


def next_threshold(n: int) -> int | None:
    return next((t for t in THRESHOLDS if n < t), None)


def _mean(xs: list[float]) -> float | None:
    xs = [x for x in xs if x is not None and not (isinstance(x, float) and math.isnan(x))]
    return sum(xs) / len(xs) if xs else None


def session_from_row(row: dict, species: str = "istavrit") -> Session | None:
    """D1 row {active_min, rods, count, model_json} → Session; None when the frozen model is missing.
    H3: istavrit's frozen hours are at the top level, other species under model_json.species[<name>]."""
    try:
        model = json.loads(row.get("model_json") or "null") or {}
    except json.JSONDecodeError:
        return None
    start_fc = model.get("start_forecast") if row.get("forecast_kind") == "dondurulmus" else None
    if species != "istavrit":
        model = (model.get("species") or {}).get(species) or {}
    hours = model.get("hours") or []
    # I6: a prospective session is scored with the forecast the angler saw at the start, not the stored hours
    if start_fc and start_fc.get("species") == species:
        score = _mean([h.get("total") for h in start_fc.get("hours") or [] if isinstance(h.get("total"), (int, float))])
    else:
        start_fc = None
        score = _mean([h.get("total") for h in hours if isinstance(h.get("total"), (int, float))])
    if score is None or not row.get("active_min"):
        return None
    moon, cloud, turb = [], [], []
    for h in hours:
        w = h.get("inputs") or {}
        if w.get("moonFrac") is not None:
            moon.append(w["moonFrac"] if (w.get("moonAlt") or 0) > 0 else 0.0)
        if w.get("cloud") is not None:
            cloud.append(w["cloud"] / 100)
        for c in h.get("components") or []:
            if c[0] == "bulaniklik" and c[1] is not None:
                turb.append(c[1])
    return Session(
        count=int(row.get("count") or 0),
        effort_h=row["active_min"] / 60 * max(1, int(row.get("rods") or 1)),
        score=max(1.0, score),
        moon=_mean(moon) or 0.0,
        cloud=_mean(cloud) if cloud else 0.5,
        turbidity=_mean(turb) if turb else 1.0,
        prospective=start_fc is not None,
        retro=bool(row.get("retro")),
        start_at=str(row.get("start_at") or ""),
        spot_id=str(row.get("spot_id") or ""),
    )


def _design(s: list[Session]) -> tuple[np.ndarray, np.ndarray, np.ndarray, list[str]]:
    y = np.array([x.count for x in s], float)
    off = np.log(np.array([x.effort_h for x in s], float))
    X = np.column_stack([
        np.ones(len(s)),
        np.log(np.array([x.score for x in s]) / 100),
        [x.moon for x in s],
        [x.cloud for x in s],
        [x.turbidity for x in s],
    ])
    names = ["taban_log_lambda0", "beta_log_puan", "ay", "bulut", "bulaniklik"]
    # drop covariates without variation (e.g. all sessions on clear water)
    keep = [0] + [j for j in range(1, X.shape[1]) if np.ptp(X[:, j]) > 1e-9]
    return y, off, X[:, keep], [names[j] for j in keep]


def _coefs(res, names: list[str]) -> dict:
    ci = np.asarray(res.conf_int())
    return {n: {"est": round(float(b), 4), "se": round(float(se), 4), "ci95": [round(float(lo), 4), round(float(hi), 4)], "p": round(float(p), 4)}
            for n, b, se, (lo, hi), p in zip(names, np.asarray(res.params), np.asarray(res.bse), ci, np.asarray(res.pvalues))}


def _loglik(y: np.ndarray, mu: np.ndarray) -> float:
    from math import lgamma

    mu = np.maximum(mu, 1e-9)
    return float(np.mean(y * np.log(mu) - mu - np.array([lgamma(v + 1) for v in y])))


def temporal_check(sessions: list[Session]) -> dict:
    """I6: train on the earlier sessions, test on the later TEST_SHARE: does log(score) beat simple baselines
    (one overall rate; rate by local hour band; rate by spot)? Mean Poisson log-likelihood per test session."""
    s = sorted(sessions, key=lambda x: x.start_at)
    k = int(round(len(s) * (1 - TEST_SHARE)))
    tr, te = s[:k], s[k:]
    if len(tr) < 10 or len(te) < 5:
        return {"status": "yetersiz veri", "train": len(tr), "test": len(te)}
    y = np.array([x.count for x in te], float)
    eff = np.array([x.effort_h for x in te], float)
    rate = lambda xs: sum(x.count for x in xs) / max(1e-9, sum(x.effort_h for x in xs))  # noqa: E731
    overall = rate(tr)
    band = lambda x: "gece" if x.start_at[11:13] and (int(x.start_at[11:13]) + 3) % 24 not in range(7, 17) else "gündüz"  # noqa: E731
    by = lambda key: {g: rate([x for x in tr if key(x) == g]) for g in {key(x) for x in tr}}  # noqa: E731
    bands, spots = by(band), by(lambda x: x.spot_id)
    yt = np.array([x.count for x in tr], float)
    Xt = np.column_stack([np.ones(len(tr)), np.log(np.array([x.score for x in tr]) / 100)])
    import statsmodels.api as sm

    m = sm.GLM(yt, Xt, family=sm.families.Poisson(), offset=np.log([x.effort_h for x in tr])).fit()
    Xe = np.column_stack([np.ones(len(te)), np.log(np.array([x.score for x in te]) / 100)])
    out = {
        "model_log_puan": _loglik(y, eff * np.exp(Xe @ m.params)),
        "taban_tek_oran": _loglik(y, eff * overall),
        "taban_saat_bandi": _loglik(y, eff * np.array([bands.get(band(x), overall) for x in te])),
        "taban_mera": _loglik(y, eff * np.array([spots.get(x.spot_id, overall) for x in te])),
    }
    best_base = max(v for k2, v in out.items() if k2.startswith("taban"))
    return {"status": "tamam", "train": len(tr), "test": len(te), "loglik": {k2: round(v, 4) for k2, v in out.items()},
            "model_beats_baselines": out["model_log_puan"] > best_base,
            "note": "Ayrı zaman dönemi: eğitim önceki seanslar, test sonraki %30. Aynı veriye uyum tahmin başarısı sayılmaz."}


def fit(sessions: list[Session], now: dt.datetime | None = None) -> dict:
    now = now or dt.datetime.now(dt.timezone.utc)
    total = len(sessions)
    # I6: only prospective, non-retrospective sessions measure the model; the rest are counted and reported
    used = [x for x in sessions if x.prospective and not x.retro]
    n = len(used)
    base = {"computed_at": now.isoformat(timespec="seconds"), "n": n, "n_total": total, "n_retro": sum(x.retro for x in sessions),
            "n_recomputed": sum(not x.prospective for x in sessions), "min_sessions": MIN_SESSIONS, "next_threshold": next_threshold(n),
            "zero_share": round(sum(1 for s in used if s.count == 0) / n, 3) if n else None, "fitted": FITTED}
    if n < MIN_SESSIONS:
        why = f"{n} ileriye dönük seans (toplam {total}; geriye dönük ya da tahmini sonradan hesaplanmış olanlar başarı ölçümüne girmez)"
        return {**base, "status": "yetersiz veri", "message": f"{why}; model {MIN_SESSIONS} ileriye dönük seansta kurulur. Katsayılar değiştirilmedi."}
    sessions = used

    import statsmodels.api as sm
    from statsmodels.gam.api import BSplines, GLMGam

    y, off, X, names = _design(sessions)
    pois = sm.GLM(y, X, family=sm.families.Poisson(), offset=off).fit()
    dispersion = float(pois.pearson_chi2 / pois.df_resid) if pois.df_resid > 0 else float("nan")
    family = "poisson"
    res = pois
    alpha = None
    if dispersion > OVERDISPERSION:
        # NB2 with alpha from the moment estimator (Cameron & Trivedi), then the GLM at that alpha
        mu = pois.mu
        alpha = max(1e-4, float(np.sum(((y - mu) ** 2 - y) / mu**2) / pois.df_resid))
        res = sm.GLM(y, X, family=sm.families.NegativeBinomial(alpha=alpha), offset=off).fit()
        family = "negatif binom"

    # GAM: smooth in log score, other covariates linear
    gam_out: dict = {}
    try:
        xs = X[:, [1]]
        bs = BSplines(xs, df=[4], degree=[3])
        other = np.delete(X, 1, axis=1)
        fam = sm.families.Poisson() if alpha is None else sm.families.NegativeBinomial(alpha=alpha)
        g = GLMGam(y, exog=other, smoother=bs, alpha=1.0, family=fam, offset=off).fit()
        grid = np.linspace(xs.min(), xs.max(), 7)
        ex = np.column_stack([np.ones(7)] + [np.full(7, other[:, j].mean()) for j in range(1, other.shape[1])])
        pred = g.predict(exog=ex, exog_smooth=grid[:, None], offset=np.zeros(7))
        gam_out = {"aic": round(float(g.aic), 2), "curve": [{"puan": round(float(100 * math.exp(v)), 1), "adet_saat_kamis": round(float(p), 3)} for v, p in zip(grid, pred)]}
    except Exception as e:  # noqa: BLE001 — GAM is a diagnostic; the GLM result stands without it
        gam_out = {"error": type(e).__name__}

    beta = res.params[names.index("beta_log_puan")] if "beta_log_puan" in names else float("nan")
    return {
        **base,
        "status": "tamam",
        "family": family,
        "dispersion": round(dispersion, 3),
        "nb_alpha": None if alpha is None else round(alpha, 4),
        "aic": round(float(res.aic), 2),
        "coefficients": _coefs(res, names),
        "gam": gam_out,
        "stage": STAGE[max(t for t in THRESHOLDS if n >= t)],
        "stage_note": FITTED,
        "temporal": temporal_check(sessions),
        "summary": (f"β = {beta:.2f}: puan 2 katına çıkınca beklenen av {2 ** beta:.2f} kat" if not math.isnan(beta) else "puan değişkeni sabit"),
    }


def fake_sessions(n: int, beta: float = 1.2, lam0: float = 3.0, seed: int = 7, nb_alpha: float | None = None) -> list[Session]:
    """Synthetic sessions with a known beta (tests and the --fake mode)."""
    r = np.random.default_rng(seed)
    out = []
    for _ in range(n):
        eff = float(r.uniform(0.5, 4.0) * r.integers(1, 3))
        score = float(r.uniform(15, 95))
        moon, cloud, turb = float(r.uniform(0, 1)), float(r.uniform(0, 1)), float(r.uniform(0.6, 1))
        mu = eff * lam0 * (score / 100) ** beta
        if nb_alpha:
            mu = r.gamma(1 / nb_alpha, mu * nb_alpha)
        out.append(Session(int(r.poisson(mu)), eff, score, moon, cloud, turb))
    return out


# I6: only sessions that targeted this species (another species' session is not a zero for it; NULL = unknown target)
SQL = """SELECT s.spot_id, s.start_at, s.active_min, s.rods, s.model_json, s.retro, s.forecast_kind,
  COALESCE((SELECT SUM(i.count) FROM catch_item i WHERE i.session_id = s.id AND i.species = ?1), 0) AS count
FROM catch_session s WHERE s.target_species = ?1 ORDER BY s.start_at"""
SPECIES = ("istavrit", "levrek")


def report_key(species: str) -> str:
    """meta key of the stored report: istavrit keeps the original key."""
    return "calibration_report" if species == "istavrit" else f"calibration_report:{species}"


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--fake", type=int, help="fit synthetic sessions instead of D1")
    ap.add_argument("--d1", action="store_true", help="read sessions from D1 (CLOUDFLARE_* env)")
    ap.add_argument("--write", action="store_true", help="store the report in D1 meta.calibration_report[:species]")
    ap.add_argument("--species", choices=SPECIES + ("all",), default="all", help="species to fit (default: all)")
    a = ap.parse_args(argv)
    if a.fake:
        report = fit(fake_sessions(a.fake))
    elif a.d1:
        sys.path.insert(0, str(__import__("pathlib").Path(__file__).resolve().parents[1] / "pipeline"))
        from av_pipeline.ocean.marmara import D1

        d1 = D1()
        report = {}
        for sp in SPECIES if a.species == "all" else (a.species,):
            sessions = [x for x in (session_from_row(r, sp) for r in d1.query(SQL, [sp])) if x]
            report[sp] = {**fit(sessions), "species": sp}
            if a.write:
                d1.query("INSERT INTO meta (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value", [report_key(sp), json.dumps(report[sp], ensure_ascii=False)])
    else:
        ap.error("--fake N or --d1")
    # coefficients and n only: safe for the Actions log
    print(json.dumps(report, ensure_ascii=False, indent=1))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

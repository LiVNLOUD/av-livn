import numpy as np

from av_pipeline.satbathy.core import (
    ACCEPT_N, Fit, accept, depth_of, filter_photons, fit_linear, grouped_cv, metrics, spot_bands, stumpf_ratio,
)


def test_filter_keeps_only_confident_bathymetry_with_positive_depth():
    p = {
        "class_ph": np.array([40, 40, 41, 40, 40, 40]),
        "confidence": np.array([0.9, 0.5, 0.9, 0.9, 0.9, np.nan]),
        "surface_h": np.array([0.3, 0.3, 0.3, 0.3, 0.3, 0.3]),
        "ortho_h": np.array([-2.7, -2.0, -1.0, 0.5, -2.0, -2.0]),
        "low_confidence_flag": np.array([0, 0, 0, 0, 1, 0]),
    }
    assert list(filter_photons(p)) == [True, False, False, False, False, False]
    assert depth_of(p)[0] == 3.0


def test_stumpf_ratio_and_linear_fit_recover_a_known_model():
    blue = np.array([0.05, 0.04, 0.03, 0.025, 0.0])
    green = np.array([0.04, 0.035, 0.03, 0.028, 0.03])
    r = stumpf_ratio(blue, green)
    assert np.isnan(r[-1]) and np.all(np.isfinite(r[:-1]))
    rr = np.linspace(1.0, 1.1, 20)
    z = 40 * rr - 38
    f = fit_linear(rr, z)
    assert abs(f.m1 - 40) < 1e-6 and abs(f.m0 - 38) < 1e-6
    assert np.allclose(Fit(40, 38).predict(rr), z)


def test_metrics_and_grouped_cv_keep_a_pass_in_one_fold():
    assert metrics(np.array([]), np.array([]))["rmse"] is None
    rng = np.random.default_rng(1)
    r = rng.uniform(1.0, 1.1, 120)
    z = 60 * r - 59 + rng.normal(0, 0.3, 120)
    groups = [f"pass{i % 12}" for i in range(120)]
    cv = grouped_cv(r, z, groups, k=4)
    assert cv["passes"] == 12 and cv["folds"] == 4
    assert cv["range_0_8"]["rmse"] < 0.6 and cv["range_0_8"]["r2"] > 0.9
    ok, why = accept(cv, independent_n=120)
    assert ok and why == []


def test_acceptance_fails_loudly_on_noise_or_too_few_points():
    rng = np.random.default_rng(2)
    r = rng.uniform(1.0, 1.1, 40)
    z = rng.uniform(0, 8, 40)  # no relation
    cv = grouped_cv(r, z, [f"p{i % 5}" for i in range(40)])
    ok, why = accept(cv, independent_n=ACCEPT_N - 1)
    assert not ok
    assert any("bağımsız" in w for w in why) and any("RMSE" in w or "R²" in w for w in why)
    empty = {"range_0_8": {"rmse": None, "r2": None}}
    assert accept(empty, 50)[1] == ["0–8 m'de doğrulama noktası yok", "R² hesaplanamadı"]


def test_spot_bands_median_uncertainty_and_unknown():
    lat, lon = 40.4, 29.0
    # 5 points ~20–40 m north (band 0–50), 2 points ~100 m (too few for band 50–150)
    dlat = np.array([20, 25, 30, 35, 40, 100, 110]) / 111_320
    depth = np.array([2.0, 2.2, 2.4, 2.6, 2.8, 5.0, 5.2])
    sigma = np.full(7, 0.4)
    b = spot_bands(lat, lon, lat + dlat, np.full(7, lon), depth, sigma, groups=["a", "a", "b", "b", "c", "a", "b"])
    assert b[0]["depth_m"] == 2.4 and b[0]["n"] == 5 and b[0]["groups"] == 3 and b[0]["sigma_m"] >= 0.1
    assert b[1] is None


def test_atl24_features_filter_bbox_thin_and_date():
    from av_pipeline.satbathy.atl24 import features, granule_date, thin

    assert granule_date("ATL24_20210305123456_1102_006") == "2021-03-05"
    n = 50
    lat = 40.40 + np.arange(n) * 2e-5  # ~2.2 m apart: 110 m of track
    p = {"class_ph": np.full(n, 40), "confidence": np.full(n, 0.9), "lat_ph": lat, "lon_ph": np.full(n, 29.0),
         "surface_h": np.full(n, 0.2), "ortho_h": np.linspace(-1.0, -5.0, n), "sigma_tvu": np.full(n, 0.3)}
    p["lon_ph"][-5:] = 30.0  # outside the bbox
    f = features("ATL24_20210305123456_x", "gt1l", p)
    assert 8 <= len(f) <= 12  # one per 10 m
    assert all(1.2 <= x["properties"]["depth"] <= 5.2 and x["properties"]["date"] == "2021-03-05" for x in f)
    assert thin(np.array([]), np.array([]), np.array([]), np.array([])) == []


def test_stage_counts_show_where_photons_drop_out():
    from av_pipeline.satbathy.atl24 import stage_counts

    p = {
        "class_ph": np.array([40, 40, 40, 41, 40, 40]),
        "confidence": np.array([0.9, 0.9, 0.3, 0.9, 0.9, 0.9]),
        "lat_ph": np.array([40.4, 40.4, 40.4, 40.4, 40.4, 50.0]),
        "lon_ph": np.array([29.0, 29.0, 29.0, 29.0, 29.0, 29.0]),
        "surface_h": np.full(6, 0.2),
        "ortho_h": np.array([-3.0, 1.0, -3.0, -3.0, -3.0, -3.0]),
        "invalid_kd": np.array([0, 0, 0, 0, 1, 0]),
    }
    assert stage_counts(p) == {"photons": 6, "in_bbox": 5, "class_40": 4, "conf_ge_0_6": 3, "flags_clean": 2, "depth_ok": 1}


def test_reports_say_unknown_when_there_is_no_data_and_show_the_decision():
    from av_pipeline.satbathy.spots import coverage_md, sdb_md

    md = coverage_md({"source": "x", "fetched_via": "nsidc", "updated": "2026-11-07"}, np.array([]), np.array([]), np.array([]), [], [], [], [])
    assert "kullanılabilir ATL24 batimetri ölçümü yok" in md and "doğrulanmadı" in md  # no stage counters → not proven
    # with stage counters the reason is stated from the evidence
    st = {"photons": 120000, "in_bbox": 3400, "class_40": 0, "conf_ge_0_6": 0, "flags_clean": 0, "depth_ok": 0}
    md2 = coverage_md({"source": "x", "fetched_via": "nsidc", "updated": "d", "diagnostics": {"stages": st, "granules_read": 129, "first_beam_in_bbox": {"class_ph_values": {"0": 3000, "41": 400}, "confidence_range": [0.0, 0.2]}}},
                      np.array([]), np.array([]), np.array([]), [], [], [], [])
    assert "| Gemlik–Mudanya kutusu içinde | 3.400 |" in md2 and "batimetri sınıfı (40) foton yok" in md2 and "129 granül" in md2
    st_none = {**st, "in_bbox": 0}
    assert "hiç foton yok" in coverage_md({"diagnostics": {"stages": st_none}}, np.array([]), np.array([]), np.array([]), [], [], [], [])
    st_thr = {**st, "class_40": 50}
    assert "eşiğini geçen yok" in coverage_md({"diagnostics": {"stages": st_thr}}, np.array([]), np.array([]), np.array([]), [], [], [], [])
    rep = {"scenes_used": 12, "calibration_points": 10, "calibration_passes": 3, "decision": {"accepted": False, "why": ["bağımsız kalibrasyon noktası 10 < 30"]}}
    assert "RET — modele girmez" in sdb_md(rep) and "10 < 30" in sdb_md(rep)
    rep2 = {**rep, "validation": {"range_0_8": {"rmse": 1.1, "bias": 0.1, "r2": 0.7, "n": 40}, "all": {"rmse": 1.3, "r2": 0.65}, "by_band": {"0-2": {"n": 5, "rmse": 0.8, "bias": 0.2}}}, "decision": {"accepted": True, "why": []}}
    assert "KABUL" in sdb_md(rep2) and "| 0-2 m | 5 | 0.8 | 0.2 |" in sdb_md(rep2)

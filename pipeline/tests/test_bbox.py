from av_pipeline import BATHY_BBOX, BBOX, MAP_EXTENT
from av_pipeline.bathy.fetch_dtm import url


def test_bbox_is_ordered():
    assert BBOX["south"] < BBOX["north"]
    assert BBOX["west"] < BBOX["east"]


def test_bathy_bbox_covers_the_map_requirement_and_the_spots():
    # B3: bathymetry at least lon 28.55–29.25, lat 40.28–40.62, inside the map extent
    assert BATHY_BBOX["west"] <= 28.55 and BATHY_BBOX["east"] >= 29.25
    assert BATHY_BBOX["south"] <= 40.28 and BATHY_BBOX["north"] >= 40.62
    for k, inner, outer in (("south", BBOX, BATHY_BBOX), ("west", BBOX, BATHY_BBOX), ("south", BATHY_BBOX, MAP_EXTENT), ("west", BATHY_BBOX, MAP_EXTENT)):
        assert outer[k] < inner[k]
    for k, inner, outer in (("north", BBOX, BATHY_BBOX), ("east", BBOX, BATHY_BBOX), ("north", BATHY_BBOX, MAP_EXTENT), ("east", BATHY_BBOX, MAP_EXTENT)):
        assert outer[k] > inner[k]


def test_dtm_url_requests_elevation_and_interpolation_flag():
    u = url()
    assert "elevation" in u and "interpolation_flag" in u and "(40.25)" in u and "(29.3)" in u

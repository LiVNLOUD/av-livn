from av_pipeline import BBOX


def test_bbox_is_ordered():
    assert BBOX["south"] < BBOX["north"]
    assert BBOX["west"] < BBOX["east"]

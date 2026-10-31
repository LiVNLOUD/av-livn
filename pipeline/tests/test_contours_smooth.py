import numpy as np

from av_pipeline.bathy.contours import smooth


def test_smooth_softens_a_step_and_keeps_land():
    a = np.array([[10.0] * 5 + [30.0] * 5] * 6)
    a[0, 0] = np.nan
    s = smooth(a, 1.0)
    assert np.isnan(s[0, 0])
    assert 10 < s[3, 4] < 20 and 20 < s[3, 5] < 30
    assert abs(s[3, 0] - 10) < 0.5 and abs(s[3, 9] - 30) < 0.5
    assert smooth(a, 0) is a

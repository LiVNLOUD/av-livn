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


def test_split_depth_measured_and_interpolated_meet_without_gap():
    from av_pipeline.bathy.contours import split_depth

    depth = np.arange(30.0).reshape(5, 6)
    mask = np.zeros((5, 6))
    mask[:, 3:] = 1.0  # right half interpolated
    mask[0, 0] = np.nan  # land counts as interpolated
    meas, interp = split_depth(depth, mask)
    assert np.isnan(meas[2, 5]) and meas[2, 0] == depth[2, 0]
    assert np.isnan(interp[2, 0]) and interp[2, 5] == depth[2, 5]
    # one cell of overlap at the boundary: columns 2 and 3 are in both sets
    assert not np.isnan(meas[2, 3]) and not np.isnan(interp[2, 2])


def test_tile_check_helpers():
    from av_pipeline.bathy.check_tiles import edge_distance, tile_xy

    x, y, fx, fy = tile_xy(28.9, 40.40, 11)
    assert (x, y) == (1188, 772) and 0 <= fx < 1 and 0 <= fy < 1
    m = np.zeros((9, 9), bool)
    m[:, 5:] = True
    d = edge_distance(m)
    assert d[4, 0] == 5 and d[4, 4] == 1 and d[4, 5] == 1 and d[4, 8] == 4

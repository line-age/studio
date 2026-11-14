"""Drawn touching, on lines made for each edge case: end to end, a T, a near miss, a
crossing, and the tolerance itself."""

import pytest

from geometry import TOUCH_METRES, bbox_around, lines_of, metres, touching

LAT = 38.0
# About one metre east, at this latitude, in degrees of longitude.
EAST_1M = 1 / (111_320 * 0.7880107536)


def line(*points):
    return lines_of({"type": "LineString", "coordinates": [list(p) for p in points]})


def test_ends_that_meet_touch_end_to_end():
    a = line((-106.0, LAT), (-105.6, LAT))
    b = line((-105.6, LAT), (-105.2, LAT))
    assert touching(a, b) == ("end_to_end", 0.0)


def test_an_end_on_the_middle_is_a_t_both_ways():
    middle = line((-106.0, LAT), (-105.0, LAT))
    t = line((-105.5, LAT), (-105.5, LAT + 0.3))
    assert touching(t, middle)[0] == "end_to_middle"
    assert touching(middle, t)[0] == "middle_to_end"


@pytest.mark.parametrize(("gap", "touches"), [(TOUCH_METRES - 1, True), (TOUCH_METRES + 1, False)])
def test_the_tolerance_is_fifty_metres(gap, touches):
    a = line((-106.0, LAT), (-105.6, LAT))
    start = -105.6 + gap * EAST_1M
    b = line((start, LAT), (-105.2, LAT))
    assert metres(a[0][-1], b[0][0]) == pytest.approx(gap, abs=0.5)
    assert (touching(a, b) is not None) is touches


def test_a_near_miss_of_350_metres_does_not_touch():
    a = line((-106.0, LAT), (-105.6, LAT))
    b = line((-107.0, LAT), (-106.0 - 350 * EAST_1M, LAT))
    assert touching(a, b) is None


def test_a_crossing_is_not_touching():
    a = line((-106.0, LAT), (-105.0, LAT))
    b = line((-105.5, LAT - 0.2), (-105.5, LAT + 0.2))
    assert touching(a, b) is None


def test_the_search_box_reaches_a_line_fifty_metres_off():
    a = line((-106.0, LAT), (-105.6, LAT))
    _, _, maxx, _ = bbox_around(a)
    assert -105.6 + (TOUCH_METRES - 1) * EAST_1M < maxx

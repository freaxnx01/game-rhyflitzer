"""#166: the frame -- snapping, size limits, the Switzerland check, lon/lat boxes, the world id."""
import pytest

import frame as F

EHR = (2667000.0, 1259750.0, 2669000.0, 1261750.0)   # 2 x 2 km around Ehrendingen, LV95


@pytest.mark.parametrize("raw,snapped", [((2667010, 1259760, 2668990, 1261740), EHR),
                                         ((2667000, 1259750, 2667900, 1261750), (2667000.0, 1259750.0, 2668000.0, 1261750.0)),
                                         ((2667100, 1259750, 2671100, 1263750), (2667000.0, 1259750.0, 2671000.0, 1263750.0))])
def test_snap_rounds_each_edge_to_250_m(raw, snapped):
    assert F.snap(*raw) == snapped


@pytest.mark.parametrize("rect,code", [((2667000, 1259750, 2667700, 1261750), "too-small"),   # 750 m
                                       ((2667000, 1259750, 2671200, 1260750), "too-big"),     # 4250 m
                                       ((2669000, 1259750, 2667000, 1261750), "bad-bbox"),
                                       ((2667000, 1261750, 2669000, 1261750), "bad-bbox")])
def test_snap_refuses_bad_frames(rect, code):
    with pytest.raises(F.FrameError) as e:
        F.snap(*rect)
    assert e.value.code == code


@pytest.mark.parametrize("rect,inside", [(EHR, True),
                                         ((2637000, 1263000, 2639000, 1265000), True),    # Stein AG
                                         ((2693000, 1283000, 2695000, 1285000), False),   # Büsingen (DE enclave)
                                         ((2637000, 1267000, 2639000, 1269000), False),   # Bad Säckingen (DE)
                                         ((2757000, 1222000, 2759000, 1224000), False),   # Vaduz (LI)
                                         ((2637000, 1264000, 2639000, 1268000), False)])  # across the Rhine
def test_inside_switzerland(rect, inside):
    assert F.inside_switzerland(rect) is inside


def test_check_raises_outside_ch():
    with pytest.raises(F.FrameError) as e:
        F.check((2693000.0, 1283000.0, 2695000.0, 1285000.0))
    assert e.value.code == "outside-ch"


def test_lonlat_bbox_origin_and_back():
    w, s, e, n = F.lonlat_bbox(EHR)
    assert 8.32 < w < 8.33 and 8.35 < e < 8.36 and 47.48 < s < 47.49 and 47.50 < n < 47.51
    pw, ps, pe, pn = F.lonlat_bbox(EHR, 500)
    assert pw < w and ps < s and pe > e and pn > n
    back = F.from_lonlat(w, s, e, n)
    assert back[0] <= EHR[0] and back[3] >= EHR[3]
    assert F.origin(EHR) == pytest.approx((47.4940, 8.3410), abs=1e-3)


def test_world_id_is_stable_and_version_dependent():
    a = F.world_id(EHR, "1")
    assert a == F.world_id(EHR, "1") and len(a) == 12 and int(a, 16) >= 0
    assert a != F.world_id(EHR, "2") and a != F.world_id((2667000.0, 1259750.0, 2669250.0, 1261750.0), "1")

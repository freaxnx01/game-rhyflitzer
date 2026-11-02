"""#630: retrofit the ridge cap into a world file."""
import json

import cap_ridges as CR


def world():
    def b(i, w, d, rh, roof="gable"):
        return {"id": i, "h": 2.5, "roof": roof, "rect": [0, 0, w, d, 0.0], "ring": [], "rh": rh, "hsrc": "dsm"}
    return {"buildings": [b(1, 16.6, 8.8, 20.4), b(2, 12.5, 12.0, 14.8), b(3, 10.0, 8.0, 3.2), b(4, 30.0, 29.3, 32.8, "flat"),
                          {"id": 5, "h": 6.0, "roof": "gable", "rect": [0, 0, 5, 5, 0.0], "ring": []}], "other": [1]}


def test_cap_world_changes_only_the_capped_buildings():
    w = world()
    changed = CR.cap_world(w, keep_ids={2})
    assert changed == [1] and w["buildings"][0]["rh"] == 3.5
    assert [b.get("rh") for b in w["buildings"][1:]] == [14.8, 3.2, 32.8, None] and w["other"] == [1]


def test_main_patches_the_file_in_place_and_is_idempotent(tmp_path):
    p = tmp_path / "w.json"
    p.write_text(json.dumps(world()), encoding="utf-8")
    assert CR.main(["--world", str(p), "--keep-ids", "2"]) == 0
    first = p.read_text(encoding="utf-8")
    assert json.loads(first)["buildings"][0]["rh"] == 3.5
    assert CR.main(["--world", str(p), "--keep-ids", "2"]) == 0 and p.read_text(encoding="utf-8") == first
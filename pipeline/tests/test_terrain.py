import numpy as np

import terrain


def test_default_step_is_8_m(monkeypatch, tmp_path):
    """#47 (spec D2 of the region extension): the game draws a 16 m mesh; 8 m keeps the .mmh inside 13 MB."""
    seen = {}

    def fake_build(bbox, origin, step, base, cache, dgm_dir):
        seen["step"] = step
        return {"w": 1, "h": 1}, np.zeros((1, 1), np.float32)

    monkeypatch.setattr(terrain, "build", fake_build)
    monkeypatch.setattr(terrain, "write_mmh", lambda path, header, heights: None)
    assert terrain.main(["--out", str(tmp_path / "x.mmh")]) == 0
    assert seen["step"] == 8.0

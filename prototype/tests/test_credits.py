"""#201: the Eiffel Tower model („Eiffel Tower" by Johnson Martin, CC BY 4.0) is credited wherever the licence asks for it. No browser."""
from pathlib import Path

ROOT = Path(__file__).parents[2]
GLB = ROOT / "prototype" / "assets" / "models" / "eiffel_tower.glb"


def test_eiffel_model_is_credited_everywhere():
    for f in ("README.md", "CHANGELOG.md", "prototype/assets/models/eiffel_tower.LICENSE.txt"):
        t = (ROOT / f).read_text(encoding="utf-8")
        assert "Johnson Martin" in t and "CC BY 4.0" in t and "skfb.ly/AIU9" in t, f


def test_eiffel_model_is_committed():
    assert GLB.exists(), "copy the maintainer's eiffel_tower.desktop.glb to prototype/assets/models/eiffel_tower.glb (#201)"
    assert GLB.stat().st_size > 2_000_000

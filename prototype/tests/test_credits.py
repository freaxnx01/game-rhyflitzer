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


def test_titanic_model_is_credited_everywhere():
    """#422: "RMS Titanic" by Union, CC BY 4.0 (Sketchfab) -- README, CHANGELOG, the licence note beside the file, and the F1 help (both languages)."""
    for f in ("README.md", "CHANGELOG.md", "prototype/assets/models/titanic.LICENSE.txt"):
        t = (ROOT / f).read_text(encoding="utf-8")
        assert "Union" in t and "CC BY 4.0" in t and "f0a6aa63294f45a2bf330c28502b2b67" in t, f
    strings = (ROOT / "prototype" / "strings.js").read_text(encoding="utf-8")
    assert strings.count("creditTitanic") == 2 and 'data-i18n="creditTitanic"' in (ROOT / "prototype" / "index.html").read_text(encoding="utf-8")


def test_titanic_model_is_committed_and_small():
    glb = ROOT / "prototype" / "assets" / "models" / "titanic.glb"
    assert glb.exists() and 500_000 < glb.stat().st_size < 5_000_000

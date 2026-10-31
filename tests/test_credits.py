"""#201: the Eiffel Tower model („Eiffel Tower" by Johnson Martin, CC BY 4.0) is credited wherever the licence asks for it. No browser."""
from pathlib import Path

ROOT = Path(__file__).parents[1]
GLB = ROOT / "assets" / "models" / "eiffel_tower.glb"


def test_eiffel_model_is_credited_everywhere():
    for f in ("README.md", "CHANGELOG.md", "assets/models/eiffel_tower.LICENSE.txt"):
        t = (ROOT / f).read_text(encoding="utf-8")
        assert "Johnson Martin" in t and "CC BY 4.0" in t and "skfb.ly/AIU9" in t, f


def test_eiffel_model_is_committed():
    assert GLB.exists(), "copy the maintainer's eiffel_tower.desktop.glb to assets/models/eiffel_tower.glb (#201)"
    assert GLB.stat().st_size > 2_000_000


def test_titanic_model_is_credited_everywhere():
    """#422: "RMS Titanic" by Union, CC BY 4.0 (Sketchfab) -- README, CHANGELOG, the licence note beside the file, and the F1 help (both languages)."""
    for f in ("README.md", "CHANGELOG.md", "assets/models/titanic.LICENSE.txt"):
        t = (ROOT / f).read_text(encoding="utf-8")
        assert "Union" in t and "CC BY 4.0" in t and "f0a6aa63294f45a2bf330c28502b2b67" in t, f
    strings = (ROOT / "strings.js").read_text(encoding="utf-8")
    assert strings.count("creditTitanic") == 2 and 'data-i18n="creditTitanic"' in (ROOT / "index.html").read_text(encoding="utf-8")


def test_titanic_model_is_committed_and_small():
    glb = ROOT / "assets" / "models" / "titanic.glb"
    assert glb.exists() and 500_000 < glb.stat().st_size < 5_000_000


def test_hatchback_model_is_credited_everywhere():
    """#236: "2020 Mazda 3 Hatchback" by OUTPISTON, CC BY-NC-SA 4.0 (Sketchfab) -- README, CHANGELOG, the licence note beside the file, and the F1 help (both languages)."""
    for f in ("README.md", "CHANGELOG.md", "assets/hatchback.LICENSE.md"):
        t = (ROOT / f).read_text(encoding="utf-8")
        assert "OUTPISTON" in t and "CC BY-NC-SA 4.0" in t and "skfb.ly/pAOpM" in t, f
    strings = (ROOT / "strings.js").read_text(encoding="utf-8")
    assert strings.count("creditHatchback") == 2 and 'data-i18n="creditHatchback"' in (ROOT / "index.html").read_text(encoding="utf-8")


def test_hatchback_model_is_committed_and_small():
    glb = ROOT / "assets" / "hatchback.glb"
    assert glb.exists() and 50_000 < glb.stat().st_size <= 500 * 1024


def test_mini_model_is_credited_everywhere():
    """#468: "Mr Bean Car FBX" by Sxi.Sai, CC BY 4.0 (Sketchfab) -- README, CHANGELOG, the licence note beside the file, and the F1 help (both languages)."""
    for f in ("README.md", "CHANGELOG.md", "assets/mini.LICENSE.md"):
        t = (ROOT / f).read_text(encoding="utf-8")
        assert "Sxi.Sai" in t and "CC BY 4.0" in t and "Mr Bean Car FBX" in t, f
    strings = (ROOT / "strings.js").read_text(encoding="utf-8")
    assert strings.count("creditMini") == 2 and 'data-i18n="creditMini"' in (ROOT / "index.html").read_text(encoding="utf-8")


def test_mini_model_is_committed_and_small():
    glb = ROOT / "assets" / "mini.glb"
    assert glb.exists() and 50_000 < glb.stat().st_size <= 500 * 1024


def test_bus_model_is_credited_everywhere():
    """#478: "Mercedes+CITARO+II+RATP" by moussasy.sy715, CC BY 4.0 (Sketchfab) -- README, CHANGELOG, the licence note beside the file, and the F1 help (both languages)."""
    for f in ("README.md", "CHANGELOG.md", "assets/bus.LICENSE.md"):
        t = (ROOT / f).read_text(encoding="utf-8")
        assert "moussasy.sy715" in t and "CC BY 4.0" in t and "Mercedes+CITARO+II+RATP" in t, f
    strings = (ROOT / "strings.js").read_text(encoding="utf-8")
    assert strings.count("creditBus") == 2 and 'data-i18n="creditBus"' in (ROOT / "index.html").read_text(encoding="utf-8")


def test_bus_model_is_committed_and_small():
    glb = ROOT / "assets" / "bus.glb"
    assert glb.exists() and 100_000 < glb.stat().st_size <= 800 * 1024


def test_modelt_model_is_credited_everywhere():
    """#521: "Ford Model T Downloadable" by Libau Media (robinmikart), CC BY 4.0 (Sketchfab) -- README, CHANGELOG, the licence note beside the file, and the F1 help (both languages)."""
    for f in ("README.md", "CHANGELOG.md", "assets/modelt.LICENSE.md"):
        t = (ROOT / f).read_text(encoding="utf-8")
        assert "robinmikart" in t and "CC BY 4.0" in t and "Ford Model T Downloadable" in t, f
    strings = (ROOT / "strings.js").read_text(encoding="utf-8")
    assert strings.count("creditModelT") == 2 and 'data-i18n="creditModelT"' in (ROOT / "index.html").read_text(encoding="utf-8")


def test_modelt_model_is_committed_and_small():
    glb = ROOT / "assets" / "modelt.glb"
    assert glb.exists() and 50_000 < glb.stat().st_size <= 600 * 1024


def test_rally_model_is_credited_everywhere():
    """"2013 Hyundai - i20 WRC" by D3NK, 3D Warehouse General Model License -- README, CHANGELOG, the licence note beside the file, and the F1 help (both languages)."""
    for f in ("README.md", "CHANGELOG.md", "assets/rally.LICENSE.md"):
        t = (ROOT / f).read_text(encoding="utf-8")
        assert "D3NK" in t and "General Model License" in t and "2013 Hyundai - i20 WRC" in t, f
    strings = (ROOT / "strings.js").read_text(encoding="utf-8")
    assert strings.count("creditRally") == 2 and 'data-i18n="creditRally"' in (ROOT / "index.html").read_text(encoding="utf-8")


def test_rally_model_is_committed_and_small():
    glb = ROOT / "assets" / "rally.glb"
    assert glb.exists() and 50_000 < glb.stat().st_size <= 1000 * 1024


def test_beetle_model_is_credited_everywhere():
    """"VW Beetle Florida v2" by Libau Media (robinmikart), CC BY 4.0 (Sketchfab) -- README, CHANGELOG, the licence note beside the file, and the F1 help (both languages)."""
    for f in ("README.md", "CHANGELOG.md", "assets/beetle.LICENSE.md"):
        t = (ROOT / f).read_text(encoding="utf-8")
        assert "robinmikart" in t and "CC BY 4.0" in t and "VW Beetle Florida v2" in t, f
    strings = (ROOT / "strings.js").read_text(encoding="utf-8")
    assert strings.count("creditBeetle") == 2 and 'data-i18n="creditBeetle"' in (ROOT / "index.html").read_text(encoding="utf-8")


def test_beetle_model_is_committed_and_small():
    glb = ROOT / "assets" / "beetle.glb"
    assert glb.exists() and 50_000 < glb.stat().st_size <= 800 * 1024


def test_newbeetle_model_is_credited_everywhere():
    """"1998 Volkswagen New Beetle" by ddiaz-design, CC BY-NC-SA 4.0 (Sketchfab) -- README, CHANGELOG, the licence note beside the file, and the F1 help (both languages)."""
    for f in ("README.md", "CHANGELOG.md", "assets/newbeetle.LICENSE.md"):
        t = (ROOT / f).read_text(encoding="utf-8")
        assert "ddiaz-design" in t and "CC BY-NC-SA 4.0" in t and "1998 Volkswagen New Beetle" in t, f
    strings = (ROOT / "strings.js").read_text(encoding="utf-8")
    assert strings.count("creditNewBeetle") == 2 and 'data-i18n="creditNewBeetle"' in (ROOT / "index.html").read_text(encoding="utf-8")


def test_newbeetle_model_is_committed_and_small():
    glb = ROOT / "assets" / "newbeetle.glb"
    assert glb.exists() and 50_000 < glb.stat().st_size <= 1000 * 1024


def test_tumbler_model_is_credited_everywhere():
    """"Batmobile-The Dark Knight Tumbler" by Gravity Jack, CC BY 4.0 (Sketchfab) -- README, CHANGELOG, the licence note beside the file, and the F1 help (both languages)."""
    for f in ("README.md", "CHANGELOG.md", "assets/tumbler.LICENSE.md"):
        t = (ROOT / f).read_text(encoding="utf-8")
        assert "Gravity Jack" in t and "CC BY 4.0" in t and "Batmobile-The Dark Knight Tumbler" in t, f
    strings = (ROOT / "strings.js").read_text(encoding="utf-8")
    assert strings.count("creditTumbler") == 2 and 'data-i18n="creditTumbler"' in (ROOT / "index.html").read_text(encoding="utf-8")


def test_tumbler_model_is_committed_and_small():
    glb = ROOT / "assets" / "tumbler.glb"
    assert glb.exists() and 50_000 < glb.stat().st_size <= 1000 * 1024


def test_coupe_model_is_credited_everywhere():
    """"2012 BMW 1M" by OUTPISTON, CC BY-NC-SA 4.0 (Sketchfab) -- README, CHANGELOG, the licence note beside the file, and the F1 help (both languages)."""
    for f in ("README.md", "CHANGELOG.md", "assets/coupe.LICENSE.md"):
        t = (ROOT / f).read_text(encoding="utf-8")
        assert "OUTPISTON" in t and "CC BY-NC-SA 4.0" in t and "2012 BMW 1M" in t, f
    strings = (ROOT / "strings.js").read_text(encoding="utf-8")
    assert strings.count("creditCoupe") == 2 and 'data-i18n="creditCoupe"' in (ROOT / "index.html").read_text(encoding="utf-8")


def test_coupe_model_is_committed_and_small():
    glb = ROOT / "assets" / "coupe.glb"
    assert glb.exists() and 50_000 < glb.stat().st_size <= 1000 * 1024


def test_hyper_model_is_credited_everywhere():
    """"Free Bugatti Chiron" by ALIEEEN, CC BY 4.0 (Sketchfab) -- README, CHANGELOG, the licence note beside the file, and the F1 help (both languages)."""
    for f in ("README.md", "CHANGELOG.md", "assets/hyper.LICENSE.md"):
        t = (ROOT / f).read_text(encoding="utf-8")
        assert "ALIEEEN" in t and "CC BY 4.0" in t and "Free Bugatti Chiron" in t, f
    strings = (ROOT / "strings.js").read_text(encoding="utf-8")
    assert strings.count("creditHyper") == 2 and 'data-i18n="creditHyper"' in (ROOT / "index.html").read_text(encoding="utf-8")


def test_hyper_model_is_committed_and_small():
    glb = ROOT / "assets" / "hyper.glb"
    assert glb.exists() and 50_000 < glb.stat().st_size <= 1000 * 1024


def test_mclaren_model_is_credited_everywhere():
    """"McLaren P1" by hartwelkisaka, CC BY 4.0 (Sketchfab) -- README, CHANGELOG, the licence note beside the file, and the F1 help (both languages)."""
    for f in ("README.md", "CHANGELOG.md", "assets/mclaren.LICENSE.md"):
        t = (ROOT / f).read_text(encoding="utf-8")
        assert "hartwelkisaka" in t and "CC BY 4.0" in t and "McLaren P1" in t, f
    strings = (ROOT / "strings.js").read_text(encoding="utf-8")
    assert strings.count("creditMclaren") == 2 and 'data-i18n="creditMclaren"' in (ROOT / "index.html").read_text(encoding="utf-8")


def test_mclaren_model_is_committed_and_small():
    glb = ROOT / "assets" / "mclaren.glb"
    assert glb.exists() and 50_000 < glb.stat().st_size <= 1000 * 1024

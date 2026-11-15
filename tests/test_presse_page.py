"""The /presse/ press kit links only images that exist in the repo, each with a download link to the large file."""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PAGE = ROOT / "presse" / "index.html"


def local_links(text):
    return [u for u in re.findall(r'(?:src|href)="([^"]+)"', text) if u.startswith("../")]


def test_presse_page_every_local_link_exists():
    links = local_links(PAGE.read_text(encoding="utf-8"))
    missing = [u for u in links if not (PAGE.parent / u).resolve().is_file()]
    assert links and missing == []


def test_presse_page_offers_every_plattform_image():
    text = PAGE.read_text(encoding="utf-8")
    plattform = sorted(p.name for p in (ROOT / "docs" / "gallery").glob("plattform-*.jpg") if not p.name.endswith("-1920.jpg"))
    assert [n for n in plattform if f'../docs/gallery/{n}" download' not in text] == []

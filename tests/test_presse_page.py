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


def test_presse_page_a_click_on_a_picture_shows_it_large_not_a_download():
    text = PAGE.read_text(encoding="utf-8")
    pictures = re.findall(r'<figure><a ([^>]*)><img', text)
    assert pictures and all('class="zoom"' in a and "download" not in a for a in pictures)
    assert 'id="lightbox"' in text


def test_presse_page_offers_every_player_screenshot():
    text = PAGE.read_text(encoding="utf-8")
    shots = sorted(p.name for p in (ROOT / "docs" / "gallery" / "spieler").glob("*.jpg"))
    assert shots and [n for n in shots if f'../docs/gallery/spieler/{n}" download' not in text] == []

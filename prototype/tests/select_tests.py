"""#330: pick the Playwright test files a diff can affect, and report what ran. Pure functions, no browser.

CLI (run from the repo root):
  git diff --name-only origin/main...HEAD | python prototype/tests/select_tests.py select [--summary FILE]
  python prototype/tests/select_tests.py durations JUNIT_XML
"""
import argparse
import fnmatch
import json
import re
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

HERE = Path(__file__).parent
TESTS = "prototype/tests"
# rule d: three quick whole-game checks, not all of test_smoke.py — its [osm] cases take ~4 min each
# even on the GPU browser, and the whole file overran the 30-minute job on SwiftShader (PR#333)
SMOKE = ("test_smoke.py::test_bundled_terrain_loads_without_upload", "test_smoke.py::test_camera_cycles_with_c",
         "test_smoke.py::test_nitro_and_jump_menu")
SELF_TESTS = ("test_select_tests.py",)  # rule e: pure, no browser
CAP = 8
TOOLING = (f"{TESTS}/conftest.py", f"{TESTS}/select_tests.py", f"{TESTS}/test-map.json", f"{TESTS}/gpu_browser.py",
           ".github/workflows/tests.yml")
GAME_PREFIXES = ("prototype/", "editor/", "data/", "vendor/")
GAME_FILES = ("editor.html", "index.html")


def test_name(path):
    """`test_x.py` when `path` is a Playwright test file, else None."""
    m = re.fullmatch(rf"{TESTS}/(test_[^/]+\.py)", path)
    return m.group(1) if m else None


def is_game_file(path):
    if path.startswith(f"{TESTS}/"):
        return False
    return path.startswith(GAME_PREFIXES) or path in GAME_FILES


def mapped_tests(path, test_map):
    return [t for glob, tests in test_map.items() if fnmatch.fnmatchcase(path, glob) for t in tests]


def select(paths, test_map, existing):
    """Returns (files, reasons, capped). `reasons` maps each file to the rules that picked it."""
    reasons, changed = {}, set()

    def add(name, why):
        if name.split("::")[0] in existing:
            reasons.setdefault(name, []).append(why)

    for path in paths:
        own = test_name(path)
        mapped = mapped_tests(path, test_map)
        if own:                                   # rule a
            add(own, f"a: {path} changed")
            changed.add(own)
        for name in mapped:                       # rule b
            add(name, f"b: {path} is mapped")
        if path in TOOLING:                       # rule e
            for name in SMOKE + SELF_TESTS:
                add(name, f"e: {path} changed")
        if own or mapped or path in TOOLING or not is_game_file(path):   # rule c: everything else is no browser test
            continue
        for name in SMOKE:                        # rule d
            add(name, f"d: {path} has no mapping")
    return cap(reasons, changed)


def cap(reasons, changed):
    if len(reasons) <= CAP:
        return sorted(reasons), reasons, False
    keep = (set(SMOKE) | changed | {n for n in SELF_TESTS if n in reasons}) & set(reasons)
    return sorted(keep), {n: reasons[n] for n in keep}, True


def selection_table(files, reasons, capped):
    if not files:
        return "### Affected browser tests\n\nNo browser tests affected.\n"
    rows = "\n".join(f"| `{f}` | {'; '.join(reasons[f][:3])} |" for f in files)
    note = f"\nMore than {CAP} test files were affected: ran the smoke set and the changed test files only.\n" if capped else ""
    return f"### Affected browser tests\n\n| test file | selected by |\n|---|---|\n{rows}\n{note}"


def durations_table(junit_xml):
    per_file = {}
    for case in ET.parse(junit_xml).getroot().iter("testcase"):
        name = next((p + ".py" for p in case.get("classname", "").split(".") if p.startswith("test_")), "(unknown)")
        tests, failed, seconds = per_file.get(name, (0, 0, 0.0))
        bad = case.find("failure") is not None or case.find("error") is not None
        per_file[name] = (tests + 1, failed + bad, seconds + float(case.get("time", 0)))
    rows = "\n".join(f"| `{n}` | {t} | {f} | {s:.1f} |"
                     for n, (t, f, s) in sorted(per_file.items(), key=lambda kv: -kv[1][2]))
    total = sum(s for _, _, s in per_file.values())
    return f"### Browser test durations\n\n| test file | tests | failed | seconds |\n|---|---|---|---|\n{rows}\n\nTotal: {total:.0f} s.\n"


def existing_tests():
    return {p.name for p in HERE.glob("test_*.py")}


def main(argv):
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="command", required=True)
    pick = sub.add_parser("select")
    pick.add_argument("--map", default=str(HERE / "test-map.json"))
    pick.add_argument("--summary")
    sub.add_parser("durations").add_argument("junit")
    args = parser.parse_args(argv)
    if args.command == "durations":
        print(durations_table(args.junit))
        return 0
    paths = [line.strip() for line in sys.stdin if line.strip()]
    files, reasons, capped = select(paths, json.loads(Path(args.map).read_text(encoding="utf-8")), existing_tests())
    table = selection_table(files, reasons, capped)
    if args.summary:
        with open(args.summary, "a", encoding="utf-8") as out:
            out.write(table + "\n")
    print("\n".join(f"{TESTS}/{f}" for f in files))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))

"""#746: split the browser test ids into shards of about equal measured runtime. Pure: no browser, no git.

The shards are jobs on a pool of self-hosted runners that pick up one job at a time (gpu-cirrus is fast, gpu-odroid
about 1.23x slower), so which runner takes which shard is not fixed. The split therefore balances the estimated time
of the shards equally, and uses more shards than runners: the fast runner simply takes more of them.

CLI (run from the repo root):
  python tests/shard_plan.py count IDS_FILE --max N [--target-min M] [--min-tests T]   # prints the shard count
  python tests/shard_plan.py split IDS_FILE SHARDS OUT_DIR [--summary FILE]            # writes OUT_DIR/<k>.txt
  python tests/shard_plan.py learn JUNIT_XML...                                        # prints fresh durations JSON

shard_durations.json holds seconds per test and file, measured on gpu-cirrus (run 43184764450, 2026-11-12; odroid
times divided by its 1.23 slowness). `default` stands in for a file it does not know. Refresh it with `learn`.
"""
import argparse
import json
import math
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

HERE = Path(__file__).parent
DURATIONS = HERE / "shard_durations.json"


def load_durations(path=DURATIONS):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def weight(test_id, durations):
    """Estimated seconds of one test id (`tests/test_x.py::name`)."""
    name = test_id.split("::")[0].split("/")[-1]
    return durations["seconds_per_test"].get(name, durations["default"])


def read_ids(path):
    return [line for line in Path(path).read_text(encoding="utf-8").splitlines() if line.strip()]


def shard_count(ids, durations, max_shards, target_minutes=0, min_tests=1):
    """Enough shards that each stays near `target_minutes` (0: no time target), never more than `max_shards`, never
    shards with fewer than `min_tests` tests (a Chromium start is not worth less)."""
    if not ids:
        return 0
    wanted = math.ceil(len(ids) / max(min_tests, 1))
    if target_minutes > 0:
        wanted = min(wanted, math.ceil(sum(weight(i, durations) for i in ids) / 60 / target_minutes))
    return max(1, min(wanted, max_shards))


def split(ids, durations, shards):
    """Greedy longest-first: each test id, heaviest first, goes to the shard with the least estimated time so far.
    Returns `shards` lists, each in the original order. Deterministic: ties break on the id and the shard index."""
    if shards < 1:
        raise ValueError("at least one shard")
    load = [0.0] * shards
    taken = [set() for _ in range(shards)]
    for index, test_id in sorted(enumerate(ids), key=lambda p: (-weight(p[1], durations), p[1], p[0])):
        k = min(range(shards), key=lambda s: (load[s], s))
        load[k] += weight(test_id, durations)
        taken[k].add(index)
    return [[ids[i] for i in sorted(t)] for t in taken]


def estimate_minutes(shard, durations):
    return sum(weight(i, durations) for i in shard) / 60


def summary_table(parts, durations):
    rows = "\n".join(f"| {k} | {len(p)} | {estimate_minutes(p, durations):.1f} |" for k, p in enumerate(parts))
    return f"### Shards\n\n| shard | tests | est. minutes (gpu-cirrus) |\n|---|---|---|\n{rows}\n"


def learn(junit_files):
    """Fresh durations from junit files: seconds per test, per test file."""
    tests, seconds = {}, {}
    for junit in junit_files:
        for case in ET.parse(junit).getroot().iter("testcase"):
            name = next((p + ".py" for p in case.get("classname", "").split(".") if p.startswith("test_")), None)
            if name:
                tests[name] = tests.get(name, 0) + 1
                seconds[name] = seconds.get(name, 0.0) + float(case.get("time", 0))
    per_test = {n: round(seconds[n] / tests[n], 2) for n in sorted(tests)}
    ordered = sorted(per_test.values())
    return {"default": ordered[len(ordered) // 2] if ordered else 1.0, "seconds_per_test": per_test}


def main(argv):
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="command", required=True)
    count = sub.add_parser("count")
    count.add_argument("ids")
    count.add_argument("--max", type=int, required=True)
    count.add_argument("--target-min", type=float, default=0)
    count.add_argument("--min-tests", type=int, default=1)
    cut = sub.add_parser("split")
    cut.add_argument("ids")
    cut.add_argument("shards", type=int)
    cut.add_argument("out_dir")
    cut.add_argument("--summary")
    sub.add_parser("learn").add_argument("junit", nargs="+")
    args = parser.parse_args(argv)
    if args.command == "learn":
        print(json.dumps(learn(args.junit), indent=1))
        return 0
    durations, ids = load_durations(), read_ids(args.ids)
    if args.command == "count":
        print(shard_count(ids, durations, args.max, args.target_min, args.min_tests))
        return 0
    parts = split(ids, durations, args.shards)
    out = Path(args.out_dir)
    out.mkdir(parents=True, exist_ok=True)
    for k, part in enumerate(parts):
        (out / f"{k}.txt").write_text("".join(f"{i}\n" for i in part), encoding="utf-8")
    table = summary_table(parts, durations)
    if args.summary:
        with open(args.summary, "a", encoding="utf-8") as handle:
            handle.write(table + "\n")
    print(table)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))

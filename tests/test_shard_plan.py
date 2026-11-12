"""#746: the shard split. Pure: no browser."""
import json
from pathlib import Path

import shard_plan as sp

DURATIONS = {"default": 5.0, "seconds_per_test": {"test_slow.py": 60.0, "test_mid.py": 20.0, "test_fast.py": 1.0}}
IDS = ([f"tests/test_slow.py::s{i}" for i in range(7)] + [f"tests/test_mid.py::m{i}" for i in range(11)]
       + [f"tests/test_fast.py::f{i}" for i in range(40)] + [f"tests/test_new.py::n{i}" for i in range(9)])


def minutes(parts):
    return [sp.estimate_minutes(p, DURATIONS) for p in parts]


def test_split_every_id_lands_in_exactly_one_shard():
    parts = sp.split(IDS, DURATIONS, 4)
    flat = [i for p in parts for i in p]
    assert sorted(flat) == sorted(IDS) and len(flat) == len(set(flat))


def test_split_is_deterministic_and_ignores_input_order():
    assert sp.split(IDS, DURATIONS, 4) == sp.split(IDS, DURATIONS, 4)
    reordered = sp.split(list(reversed(IDS)), DURATIONS, 4)
    assert [sorted(p) for p in reordered] == [sorted(p) for p in sp.split(IDS, DURATIONS, 4)]


def test_split_balances_the_estimated_minutes():
    times = minutes(sp.split(IDS, DURATIONS, 4))
    assert max(times) - min(times) <= 1.0   # never worse than the heaviest single test (60 s)


def test_split_keeps_the_collection_order_within_a_shard():
    for part in sp.split(IDS, DURATIONS, 3):
        assert part == [i for i in IDS if i in set(part)]


def test_split_beats_round_robin_when_the_files_differ_in_weight():
    round_robin = [IDS[k::2] for k in range(2)]
    assert max(minutes(sp.split(IDS, DURATIONS, 2))) < max(minutes(round_robin))


def test_split_with_more_shards_than_tests_leaves_some_empty():
    parts = sp.split(IDS[:2], DURATIONS, 5)
    assert sum(len(p) for p in parts) == 2 and len(parts) == 5


def test_split_rejects_zero_shards():
    try:
        sp.split(IDS, DURATIONS, 0)
    except ValueError:
        return
    raise AssertionError("expected ValueError")


def test_weight_uses_the_default_for_an_unknown_file():
    assert sp.weight("tests/test_new.py::x", DURATIONS) == 5.0
    assert sp.weight("tests/test_slow.py::x[a b]", DURATIONS) == 60.0


def test_shard_count_follows_the_time_target_the_cap_and_the_minimum_size():
    # 7 + 3.67 + 0.67 + 0.75 = 12.1 estimated minutes
    assert sp.shard_count(IDS, DURATIONS, max_shards=12, target_minutes=3) == 5
    assert sp.shard_count(IDS, DURATIONS, max_shards=2, target_minutes=3) == 2
    assert sp.shard_count(IDS, DURATIONS, max_shards=8, target_minutes=0, min_tests=20) == 4
    assert sp.shard_count(IDS[:2], DURATIONS, max_shards=8, target_minutes=1, min_tests=3) == 1


def test_shard_count_is_zero_without_tests():
    assert sp.shard_count([], DURATIONS, 8) == 0


def test_cli_split_writes_one_file_per_shard(tmp_path):
    ids = tmp_path / "ids.txt"
    ids.write_text("".join(f"{i}\n" for i in IDS), encoding="utf-8")
    assert sp.main(["split", str(ids), "3", str(tmp_path / "shards")]) == 0
    written = [(tmp_path / "shards" / f"{k}.txt").read_text(encoding="utf-8").splitlines() for k in range(3)]
    assert sorted(i for part in written for i in part) == sorted(IDS)


def test_committed_durations_are_positive_and_mostly_current():
    data = json.loads(Path(sp.DURATIONS).read_text(encoding="utf-8"))
    files = {p.name for p in Path(sp.HERE).glob("test_*.py")}
    known = set(data["seconds_per_test"])
    assert data["default"] > 0 and all(v > 0 for v in data["seconds_per_test"].values())
    assert len(known & files) >= 0.9 * len(known)   # stale entries are harmless; a wholesale rename would show here


def test_learn_averages_seconds_per_test_and_file(tmp_path):
    junit = tmp_path / "j.xml"
    junit.write_text('<testsuites><testsuite>'
                     '<testcase classname="tests.test_a" name="x" time="2"/><testcase classname="tests.test_a" name="y" time="4"/>'
                     '<testcase classname="tests.test_b" name="z" time="10"/></testsuite></testsuites>', encoding="utf-8")
    assert sp.learn([str(junit)]) == {"default": 10.0, "seconds_per_test": {"test_a.py": 3.0, "test_b.py": 10.0}}

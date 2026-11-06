"""Test scripts/pick_vision_test_objects.py va file kb/vision_test_objects.csv da commit (WSEA-153)."""

import csv

import pytest

from scripts import pick_vision_test_objects as pv


def test_alloc_by_label_share():
    assert pv.alloc({"A1": 80, "A2": 160, "B1": 209}, 50) == {"A1": 9, "A2": 18, "B1": 23}


def test_exclusions_are_real_labels():
    words = {r["word"] for r in pv.load_labels()}
    assert set(pv.NOT_AT_HOME) <= words and len(set(pv.NOT_AT_HOME)) == len(pv.NOT_AT_HOME)


def test_pick_deterministic_and_matches_committed_file():
    labels = pv.load_labels()
    rows = pv.pick(labels)
    assert rows == pv.pick(labels)
    assert len(rows) == 50 and len({r["word"] for r in rows}) == 50
    assert not {r["word"] for r in rows} & set(pv.NOT_AT_HOME)
    assert [r["cefr"] for r in rows].count("A1") == 9 and [r["cefr"] for r in rows].count("B1") == 23
    with pv.OUT.open(encoding="utf-8", newline="") as f:
        assert list(csv.DictReader(f)) == rows
    assert pv.pick(labels, seed=1) != rows


def test_pick_fails_when_pool_too_small():
    labels = [{"word": "a", "cefr": "A1", "topic_code": "X", "meaning_vi": "", "pos": "n", "rank": "1"},
              {"word": "b", "cefr": "A2", "topic_code": "X", "meaning_vi": "", "pos": "n", "rank": "2"}]
    with pytest.raises(ValueError):
        pv.pick(labels, n=4, exclude=("a",))

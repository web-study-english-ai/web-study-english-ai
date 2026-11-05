"""Test phan thuan cua scripts/tune_vision_tau.py (WSEA-153). Khong tai mo hinh."""

import pytest

from scripts import tune_vision_tau as tv

G = {"cup": "cup", "mug": "cup", "book": "book", "textbook": "book"}


def test_load_synonyms_real_file():
    g = tv.load_synonyms()
    assert g["mug"] == "cup" and g["textbook"] == "book" and g["screen"] == "computer"


@pytest.mark.parametrize("pred, truth, strict, relaxed", [
    ("cup", "cup", True, True), ("mug", "cup", False, True), ("cup", "mug", False, True),
    ("book", "cup", False, False), ("floor", "wall", False, False)])
def test_same(pred, truth, strict, relaxed):
    assert tv.same(pred, truth, G, False) is strict and tv.same(pred, truth, G, True) is relaxed


def test_judge():
    j = tv.judge("cup", ["mug", "cup", "tea"], G)
    assert j == {"top1_strict": False, "top1_relaxed": True, "top5_strict": True, "top5_relaxed": True}
    assert tv.judge("cup", ["a", "b", "c", "d", "e", "cup"], G)["top5_strict"] is False


def test_tau_table_and_choose():
    rows = [{"top1_score": s, "top1_strict": ok, "top1_relaxed": ok or rel}
            for s, ok, rel in [(0.7, True, True), (0.5, False, True), (0.3, True, True), (0.05, False, False)]]
    t = {x["tau"]: x for x in tv.tau_table(rows, grid=(0.05, 0.3, 0.5, 0.6))}
    assert (t[0.05]["coverage"], t[0.05]["acc_strict"], t[0.05]["acc_relaxed"]) == (1.0, 0.5, 0.75)
    assert (t[0.3]["answered"], t[0.3]["acc_relaxed"]) == (3, 1.0)
    assert t[0.6]["answered"] == 1
    assert tv.choose_tau(list(t.values()), 0.70) == 0.3
    assert tv.choose_tau(list(t.values()), 0.99) == 0.05
    assert tv.choose_tau([{"tau": 0.1, "coverage": 0.2}], 0.7) == tv.FALLBACK_TAU


def test_empty_table_rows():
    t = tv.tau_table([], grid=(0.1,))
    assert t[0]["coverage"] is None and tv.choose_tau(t) == tv.FALLBACK_TAU


def test_rejects_test_dir(tmp_path):
    test = tmp_path / "vision_test"
    (test / "sub").mkdir(parents=True)
    with pytest.raises(SystemExit):
        tv.check_not_test([tmp_path / "dev", test / "sub"], test)
    tv.check_not_test([tmp_path / "dev"], test)


def test_grid():
    assert tv.GRID[0] == 0.05 and tv.GRID[-1] == 0.6 and len(tv.GRID) == 12

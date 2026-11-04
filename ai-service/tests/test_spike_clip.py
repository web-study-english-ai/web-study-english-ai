"""Test phan thuan cua scripts/spike_clip.py (WSEA-152). Khong tai mo hinh."""

from pathlib import Path

import pytest

from scripts import spike_clip as sc


@pytest.mark.parametrize("name, label", [("banana_01.jpg", "banana"), ("Cup_09.JPG", "cup"),
                                         ("arm.png", "arm"), ("hair_dryer_02.jpg", "hair")])
def test_true_label(name, label):
    assert sc.true_label(Path(name)) == label


def test_list_images_filters_and_sorts(tmp_path):
    for n in ("b_1.jpg", "a_1.PNG", "note.txt", "c_1.webp"):
        (tmp_path / n).write_bytes(b"x")
    (tmp_path / "sub").mkdir()
    assert [p.name for p in sc.list_images(tmp_path)] == ["a_1.PNG", "b_1.jpg", "c_1.webp"]


def top(*words):
    return [{"word": w, "score": 0.1} for w in words]


def test_judge():
    s = {"cup", "phone", "book"}
    assert sc.judge("cup", top("cup", "mug"), s) == {"in_label_set": True, "rank": 1, "top1": True, "top5": True}
    assert sc.judge("cup", top("mug", "a", "b", "c", "cup"), s)["rank"] == 5
    assert sc.judge("cup", top("mug", "a"), s) == {"in_label_set": True, "rank": None, "top1": False, "top5": False}
    assert sc.judge("fan", top("fan"), s) == {"in_label_set": False, "rank": 1, "top1": False, "top5": False}


def test_accuracy_excludes_out_of_set_and_errors():
    rows = [{"in_label_set": True, "top1": True, "top5": True},
            {"in_label_set": True, "top1": False, "top5": True},
            {"in_label_set": True, "top1": False, "top5": False},
            {"in_label_set": False, "top1": False, "top5": False},
            {"in_label_set": True, "top1": False, "top5": False, "error": "not_image"}]
    a = sc.accuracy(rows)
    assert (a["n_scored"], a["top1_hits"], a["top5_hits"]) == (3, 1, 2)
    assert (a["top1"], a["top5"], a["n_not_in_label_set"], a["n_error"]) == (0.3333, 0.6667, 1, 1)
    assert sc.accuracy([])["top1"] is None


def test_latency_drops_first():
    s = sc.latency_stats([900.0, 100.0, 200.0, 300.0])
    assert s["n"] == 3 and s["first_ms"] == 900.0 and s["p50"] == 200.0 and s["max"] == 300.0
    assert sc.latency_stats([500.0]) == {"n": 0, "first_ms": 500.0}


def test_load_label_words_real_file():
    words = sc.load_label_words(sc.DEFAULT_LABELS)
    assert len(words) == 449 and words[0] == "book"

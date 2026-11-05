"""Kiem kb/vision_synonyms.csv va kb/vision_labels.csv voi tu vung backend (WSEA-153). Khong mo hinh."""

import csv
from collections import Counter
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
LABELS = ROOT / "kb" / "vision_labels.csv"
SYNONYMS = ROOT / "kb" / "vision_synonyms.csv"
VOCAB = ROOT.parent / "backend" / "prisma" / "data" / "vocab_7000.csv"


def read(path, enc="utf-8"):
    with path.open(encoding=enc, newline="") as f:
        return list(csv.DictReader(f))


def test_synonym_groups_valid():
    labels = {r["word"] for r in read(LABELS)}
    rows = read(SYNONYMS)
    assert rows and set(rows[0]) == {"group", "word"}
    words = [r["word"] for r in rows]
    assert len(words) == len(set(words)), "một từ chỉ thuộc một nhóm"
    assert set(words) <= labels, sorted(set(words) - labels)
    sizes = Counter(r["group"] for r in rows)
    assert min(sizes.values()) >= 2, "nhóm phải có ít nhất 2 từ"
    for r in rows:
        assert r["group"] in {x["word"] for x in rows if x["group"] == r["group"]}, "tên nhóm là một từ của nhóm"


def test_every_label_matches_exactly_one_vocab_word():
    if not VOCAB.exists():
        pytest.skip("thiếu backend/prisma/data/vocab_7000.csv")
    cnt = Counter(r["word"].strip().lower() for r in read(VOCAB, "utf-8-sig"))
    labels = [r["word"] for r in read(LABELS)]
    bad = {w: cnt[w] for w in labels if cnt[w] != 1}
    assert bad == {}

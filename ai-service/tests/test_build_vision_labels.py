"""Test scripts/build_vision_labels.py (WSEA-152). Khong mang, khong nap mo hinh."""

import csv
import json

import pytest

from scripts import build_vision_labels as b

DOC = b.ROOT / "docs" / "vision" / "WSEA-152_tap_nhan_va_tieu_chi.md"


def row(word, cefr="A1", concrete="TRUE", topic="NC", meaning="cái gì đó", rank=1, pos="n"):
    return {"word": word, "rank": str(rank), "cefr": cefr, "pos": pos, "ipa": "", "meaning_vi": meaning,
            "example_en": "", "is_concrete_noun": concrete, "orig_rank": "", "sfi": "", "freq_per_million": "",
            "topic_code": topic, "topic": ""}


def test_each_step_drops_and_keeps():
    rows = [
        row("chair", rank=5), row("apple", topic="AU", rank=3),
        row("idea", concrete="FALSE"),                      # buoc 1
        row("lamp", cefr="B2"),                             # buoc 2
        row("contract", topic="KT"),                        # buoc 3
        row("clock", topic="TG", rank=9),                   # buoc 3: EXTRA -> giu
        row("teacher", topic="HT"),                         # buoc 4: danh sach
        row("baker", meaning="thợ làm bánh"),               # buoc 4: regex
        row("robot", topic="KH", meaning="người máy, rô-bốt", rank=7),  # khong phai nguoi -> giu
        row("kitchen", meaning="nhà bếp"),                  # khong bi regex "nha " bat; bi buoc (a)
        row("tool"),                                        # buoc 5
        row("bat", topic="TN"),                             # buoc 6
        row("t-shirt"),                                     # buoc 7
        row("beach", topic="TN"),                           # buoc (a)
    ]
    labels, st = b.build_labels(rows)
    assert [x["word"] for x in labels] == ["apple", "chair", "robot", "clock"]  # sap theo rank
    assert st["dropped"] == {"chu_de": 1, "nguoi": 2, "khong_chup_duoc": 1, "da_nghia_hoac_chat_lieu": 1,
                             "tu_ghep": 1, "noi_chon": 2}
    assert st["dropped_words"]["noi_chon"] == ["beach", "kitchen"]
    assert (st["concrete_noun"], st["cefr_le_b1"], st["kept"]) == (13, 12, 4)
    assert set(labels[0]) == set(b.OUT_COLUMNS)


def test_no_rank_cap():
    rows = [row(f"zq{chr(97 + i % 26)}{chr(97 + i // 26)}", rank=i) for i in range(600)]  # khong trung danh sach nao
    labels, _ = b.build_labels(rows)
    assert len(labels) == 600


def test_duplicate_word_rejected():
    with pytest.raises(ValueError):
        b.build_labels([row("chair"), row("chair", rank=2)])


def test_write_labels_lf_utf8(tmp_path):
    p = tmp_path / "out.csv"
    b.write_labels(p, [{"word": "chair", "cefr": "A1", "pos": "n", "meaning_vi": "cái ghế", "topic_code": "NC",
                        "rank": "5"}])
    raw = p.read_bytes()
    assert b"\r\n" not in raw and raw.decode("utf-8").startswith("word,cefr,pos,meaning_vi,topic_code,rank\n")


def test_doc_lists_every_hand_list_word():
    """Tai lieu luat loc ghi NGUYEN VAN moi danh sach chon tay."""
    text = DOC.read_text(encoding="utf-8")
    for name in ("EXTRA", "PERSON_WORDS", "NOT_VISUAL", "POLYSEMY", "PLACES_BUILT", "PLACES_NATURE"):
        for w in getattr(b, name):
            assert f"`{w}`" in text, (name, w)
    assert b.RULE_VERSION.split("-", 1)[1] in text  # ngay chot
    assert "TRƯỚC khi chạy mô hình" in text


def test_committed_labels_match_source_when_unchanged():
    manifest = json.loads(b.DEFAULT_MANIFEST.read_text(encoding="utf-8"))
    if not b.DEFAULT_SOURCE.exists() or b.sha256(b.DEFAULT_SOURCE) != manifest["source"]["sha256"]:
        pytest.skip("file nguồn backend đã đổi so với manifest — chạy lại scripts/build_vision_labels.py")
    labels, st = b.build_labels(b.load_vocab(b.DEFAULT_SOURCE))
    with b.DEFAULT_OUT.open(encoding="utf-8", newline="") as f:
        committed = list(csv.DictReader(f))
    assert committed == labels
    assert manifest["output"]["n_labels"] == len(labels) == st["kept"]
    assert manifest["output"]["sha256"] == b.sha256(b.DEFAULT_OUT)
    assert manifest["source"]["path"] == b.SOURCE_REL and manifest["rule_version"] == b.RULE_VERSION

"""Test scripts/build_intent_dataset.py (WSEA-112). Dung tmp_path, embedder gia, khong nap mo hinh."""

import csv
import json

import numpy as np
import pytest

from app.services import embedder as emb
from scripts import build_intent_dataset as bid

TRAIN_TXT = """# tap train
# @lang vi
nghia_tu | borrow nghĩa là gì
phan_biet | say và tell khác gì | note: có thể là cach_dung

# @lang en
ngu_phap | when do we use the present perfect
cach_dung | interested goes with which preposition, in or on?
ngoai_pham_vi | what's the weather like
"""

TEST_TXT = """# @lang vi_nodau
nghia_tu | tu ancient nghia la gi
"""


def setup(tmp_path, train=TRAIN_TXT, test=TEST_TXT, extra=None):
    raw = tmp_path / "raw"
    raw.mkdir()
    (raw / "train_hieu.txt").write_text(train, encoding="utf-8")
    if test is not None:
        (raw / "test_phuc.txt").write_text(test, encoding="utf-8")
    for name, content in (extra or {}).items():
        (raw / name).write_text(content, encoding="utf-8")
    q = tmp_path / "eval_questions.csv"
    q.write_text("qid,question,gold_ids,lang\nq01,since hay for,gram_016,mixed\n", encoding="utf-8")
    n = tmp_path / "eval_negatives.csv"
    n.write_text("qid,question,group,lang\nn01,thời tiết Hà Nội hôm nay thế nào,off,vi\n", encoding="utf-8")
    return ["--raw-dir", str(raw), "--out-dir", str(tmp_path / "out"),
            "--eval-questions", str(q), "--eval-negatives", str(n)]


class KeyedFake:
    """Embedder gia: cau co cung 'khoa' (vd 'ancient') -> cung vector -> cosine 1."""

    def __init__(self, keys):
        self.keys = keys
        self.calls = 0

    def encode_queries(self, texts):
        self.calls += 1
        out = np.zeros((len(texts), emb.DIM), dtype=np.float32)
        for i, t in enumerate(texts):
            hit = next((k for k, key in enumerate(self.keys) if key in t.lower()), None)
            out[i, hit if hit is not None else len(self.keys) + i] = 1.0
        return out


def no_embedder():
    raise AssertionError("không được nạp embedder")


def read(path):
    with open(path, encoding="utf-8", newline="") as f:
        return list(csv.DictReader(f))


# --- parse ---------------------------------------------------------------------------------


def test_parse_lang_and_note(tmp_path):
    p = tmp_path / "train_hieu.txt"
    p.write_text(TRAIN_TXT, encoding="utf-8")
    rows = bid.parse_file(p)
    assert [r["lang"] for r in rows] == ["vi", "vi", "en", "en", "en"]
    assert rows[1]["note"] == "có thể là cach_dung"
    assert rows[1]["text"] == "say và tell khác gì"
    assert rows[0]["note"] == ""
    assert {r["author"] for r in rows} == {"hieu"} and rows[0]["split"] == "train"
    assert rows[0]["src"] == "train_hieu.txt:3"


def test_parse_crlf_and_bom(tmp_path):
    p = tmp_path / "train_hieu.txt"
    p.write_bytes("﻿# @lang vi\r\nnghia_tu | borrow nghĩa là gì\r\n".encode("utf-8"))
    rows = bid.parse_file(p)
    assert rows[0]["text"] == "borrow nghĩa là gì"


@pytest.mark.parametrize("body, msg", [
    ("# @lang vi\nnghia_tuu | borrow là gì\n", "nhãn 'nghia_tuu'"),
    ("nghia_tu | borrow là gì\n", "@lang"),
    ("# @lang vietnamese\nnghia_tu | borrow là gì\n", "@lang 'vietnamese'"),
    ("# @lang vi\nnghia_tu |   \n", "câu rỗng"),
    ("# @lang vi\nnghia_tu | " + "a" * 301 + "\n", "301 ký tự"),
    ("# @lang vi\nnghia_tu borrow là gì\n", "cần dạng"),
    ("# @lang vi\nnghia_tu | a | b\n", "cần dạng"),
])
def test_parse_errors_report_file_line(tmp_path, body, msg):
    p = tmp_path / "train_hieu.txt"
    p.write_text(body, encoding="utf-8")
    with pytest.raises(bid.DataError) as e:
        bid.parse_file(p)
    assert any(msg in err and "train_hieu.txt:" in err for err in e.value.errors)


def test_bad_label_exits_1(tmp_path, capsys):
    args = setup(tmp_path, train="# @lang vi\nhoi_nghia | borrow là gì\n")
    assert bid.main(args + ["--no-embed"]) == 1
    assert "train_hieu.txt:2" in capsys.readouterr().out


def test_missing_lang_exits_1(tmp_path, capsys):
    args = setup(tmp_path, train="nghia_tu | borrow là gì\n")
    assert bid.main(args + ["--no-embed"]) == 1
    assert "@lang" in capsys.readouterr().out


# --- trung va ro ri ------------------------------------------------------------------------


def test_duplicate_between_train_and_test_exits_1(tmp_path, capsys):
    # Khac hoa thuong va khoang trang van tinh la trung
    args = setup(tmp_path, test="# @lang vi\nnghia_tu |   Borrow  NGHĨA là gì \n")
    assert bid.main(args + ["--no-embed"]) == 1
    out = capsys.readouterr().out
    assert "test_phuc.txt:2" in out and "train_hieu.txt:3" in out


def test_duplicate_within_train_exits_1(tmp_path):
    args = setup(tmp_path, train=TRAIN_TXT + "nghia_tu | borrow nghĩa là gì\n")
    assert bid.main(args + ["--no-embed"]) == 1


def test_leak_eval_questions_exits_1(tmp_path, capsys):
    args = setup(tmp_path, train=TRAIN_TXT + "phan_biet | Since hay FOR\n")
    assert bid.main(args + ["--no-embed"]) == 1
    assert "eval_questions.csv:2" in capsys.readouterr().out


def test_leak_eval_negatives_exits_1(tmp_path):
    args = setup(tmp_path, test="# @lang vi\nngoai_pham_vi | thời tiết Hà Nội hôm nay thế nào\n")
    assert bid.main(args + ["--no-embed"]) == 1


def test_extra_exclude_csv(tmp_path, capsys):
    phuc = tmp_path / "phuc60.csv"
    phuc.write_text("stt,cau_hoi\n1,borrow nghĩa là gì\n", encoding="utf-8")
    args = setup(tmp_path)
    assert bid.main(args + ["--no-embed", "--exclude", str(phuc), "cau_hoi"]) == 1
    assert "phuc60.csv:2" in capsys.readouterr().out


# --- gan trung -----------------------------------------------------------------------------


def test_near_duplicate_removed_from_train(tmp_path):
    train = TRAIN_TXT + "nghia_tu | ancient là gì vậy\n"
    args = setup(tmp_path, train=train)
    fake = KeyedFake(["ancient"])
    assert bid.main(args, embedder_factory=lambda: fake) == 0
    assert fake.calls == 1
    out = tmp_path / "out"
    texts = [r["text"] for r in read(out / "intent_train.csv")]
    assert "ancient là gì vậy" not in texts and len(texts) == 5
    stats = json.loads((out / "stats.json").read_text(encoding="utf-8"))
    removed = stats["near_dup"]["removed_from_train"]
    assert [(r["id"], r["cosine"], r["test_id"]) for r in removed] == [("it_0006", 1.0, "ie_0001")]
    assert stats["train"]["n"] == 5 and stats["near_dup"]["enabled"]


def test_no_embed_skips_model(tmp_path):
    args = setup(tmp_path)
    assert bid.main(args + ["--no-embed"], embedder_factory=no_embedder) == 0


# --- dau ra --------------------------------------------------------------------------------


def test_outputs_ids_columns_and_label_map(tmp_path):
    args = setup(tmp_path, extra={"train_llm.txt": "# @lang mixed\ncach_dung | đặt câu với improve\n"})
    assert bid.main(args + ["--no-embed"]) == 0
    out = tmp_path / "out"
    train = read(out / "intent_train.csv")
    # sap ten file: train_hieu.txt truoc train_llm.txt
    assert [r["id"] for r in train] == [f"it_{i:04d}" for i in range(1, 7)]
    assert train[-1]["author"] == "llm" and train[0]["author"] == "hieu"
    assert list(train[0]) == list(bid.COLUMNS)
    test = read(out / "intent_test.csv")
    assert test[0]["id"] == "ie_0001" and test[0]["lang"] == "vi_nodau" and test[0]["author"] == "phuc"
    lm = json.loads((out / "label_map.json").read_text(encoding="utf-8"))
    assert lm == {"nghia_tu": 0, "cach_dung": 1, "ngu_phap": 2, "phan_biet": 3, "ngoai_pham_vi": 4}
    stats = json.loads((out / "stats.json").read_text(encoding="utf-8"))
    assert stats["train"]["by_label_lang"]["nghia_tu"]["vi"] == 1
    assert stats["train"]["by_label_author"]["cach_dung"] == {"hieu": 1, "llm": 1}
    assert stats["embedder"]["model"] == emb.MODEL_NAME and stats["seed"] == 112


def test_csv_quotes_commas_no_bom_no_cr(tmp_path):
    args = setup(tmp_path)
    assert bid.main(args + ["--no-embed"]) == 0
    raw = (tmp_path / "out" / "intent_train.csv").read_bytes()
    assert not raw.startswith(b"\xef\xbb\xbf") and b"\r" not in raw
    assert b'"interested goes with which preposition, in or on?"' in raw


def test_deterministic_sha256(tmp_path):
    args = setup(tmp_path)
    out = tmp_path / "out"
    assert bid.main(args + ["--no-embed"]) == 0
    first = {n: bid.sha256(out / n) for n in ("intent_train.csv", "intent_test.csv", "stats.json")}
    assert bid.main(args + ["--no-embed"]) == 0
    assert first == {n: bid.sha256(out / n) for n in first}
    stats = json.loads((out / "stats.json").read_text(encoding="utf-8"))
    assert stats["outputs"]["intent_train.csv"] == first["intent_train.csv"]


def test_missing_test_requires_flag(tmp_path, capsys):
    args = setup(tmp_path, test=None)
    assert bid.main(args + ["--no-embed"]) == 1
    assert "--allow-missing-test" in capsys.readouterr().out
    assert bid.main(args + ["--allow-missing-test"], embedder_factory=no_embedder) == 0
    out = tmp_path / "out"
    assert not (out / "intent_test.csv").exists()
    stats = json.loads((out / "stats.json").read_text(encoding="utf-8"))
    assert stats["test"] is None and stats["near_dup"]["reason"] == "chưa có tập test"


# --- lenh phu ------------------------------------------------------------------------------


def test_blind_sample_no_labels_fixed_seed(tmp_path):
    args = setup(tmp_path)
    assert bid.main(args + ["--no-embed"]) == 0
    assert bid.main(args + ["--blind-sample", "3", "--seed", "112"]) == 0
    path = tmp_path / "out" / "review" / "blind_sample.csv"
    first = path.read_bytes()
    rows = read(path)
    assert len(rows) == 3 and list(rows[0]) == ["id", "text"]
    assert bid.main(args + ["--blind-sample", "3", "--seed", "112"]) == 0
    assert path.read_bytes() == first


def test_kappa_identical_labels_is_one(tmp_path, capsys):
    args = setup(tmp_path)
    assert bid.main(args + ["--no-embed"]) == 0
    train = read(tmp_path / "out" / "intent_train.csv")
    rater = tmp_path / "blind_phuc.csv"
    with rater.open("w", encoding="utf-8", newline="") as f:
        w = csv.writer(f, lineterminator="\n")
        w.writerow(["id", "label"])
        for r in train:
            w.writerow([r["id"], r["label"]])
    assert bid.main(args + ["--kappa", str(rater)]) == 0
    assert "kappa = 1.0" in capsys.readouterr().out
    stats = json.loads((tmp_path / "out" / "stats.json").read_text(encoding="utf-8"))
    assert stats["agreement"]["kappa"] == 1.0 and stats["agreement"]["disagreements"] == []
    # Dung lai voi train khong doi -> giu muc agreement
    assert bid.main(args + ["--no-embed"]) == 0
    assert "agreement" in json.loads((tmp_path / "out" / "stats.json").read_text(encoding="utf-8"))


def test_agreement_lists_disagreements():
    train = [{"id": "it_0001", "text": "a", "label": "nghia_tu"},
             {"id": "it_0002", "text": "b", "label": "phan_biet"},
             {"id": "it_0003", "text": "c", "label": "ngu_phap"}]
    rater = [{"id": "it_0001", "label": "nghia_tu"}, {"id": "it_0002", "label": "cach_dung"},
             {"id": "it_0003", "label": "ngu_phap"}]
    ag = bid.agreement(train, rater)
    assert ag["kappa"] < 1.0 and ag["accuracy"] == pytest.approx(2 / 3, abs=1e-4)
    assert ag["disagreements"] == [{"id": "it_0002", "text": "b", "train": "phan_biet", "rater": "cach_dung"}]
    assert ag["confusion_matrix"]["values"][3][1] == 1


def test_agreement_rejects_unknown_id_or_label():
    with pytest.raises(bid.DataError):
        bid.agreement([{"id": "it_0001", "text": "a", "label": "nghia_tu"}], [{"id": "it_9999", "label": "xx"}])

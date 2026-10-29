"""Test scripts/validate_kb.py (WSEA-100). Chi dung thu muc tam, khong doc/ghi kb/ that."""

import copy
import csv
import json

import pytest

from scripts import validate_kb as v

OUTLINE = [
    {"id": "gram_001", "topic": "present_perfect", "facet": "form",
     "title": "Thì hiện tại hoàn thành (Present Perfect) — Cấu trúc", "cefr": "A2",
     "source_url": "https://en.wikipedia.org/wiki/Present_perfect"},
    {"id": "gram_002", "topic": "present_perfect", "facet": "usage",
     "title": "Thì hiện tại hoàn thành (Present Perfect) — Cách dùng", "cefr": "B1",
     "source_url": "https://en.wikipedia.org/wiki/Present_perfect"},
    {"id": "gram_003", "topic": "confusable_make_do", "facet": "contrast",
     "title": "Make và do — Phân biệt", "cefr": "A2",
     "source_url": "https://en.wiktionary.org/wiki/make"},
]

FILLER = ("Thì này nối một hành động trong quá khứ với thời điểm hiện tại, "
          "người nói quan tâm tới kết quả hoặc trải nghiệm hơn là thời điểm cụ thể. ")
EXAMPLES = [
    "- I have lived here for ten years. (Tôi đã sống ở đây mười năm.)",
    "- She has already finished her homework. (Cô ấy đã làm xong bài tập rồi.)",
]


def make_content(title, formula=True, examples=EXAMPLES, filler_times=5):
    lines = [title]
    if formula:
        lines.append("Công thức: S + have/has + V3 (khẳng định); S + have/has + not + V3 (phủ định).")
    lines.append(FILLER * filler_times)
    lines.append("Ví dụ:")
    lines.extend(examples)
    return "\n".join(lines)


def make_chunk(row=OUTLINE[0], **kw):
    chunk = {
        "id": row["id"], "topic": row["topic"], "facet": row["facet"], "title": row["title"],
        "cefr": row["cefr"], "source": "WSEA biên soạn · tham chiếu: Wikipedia — Present perfect",
        "source_url": row["source_url"], "content": make_content(row["title"], formula=row["facet"] == "form"),
        "reviewed_by": None,
    }
    chunk.update(kw)
    return chunk


@pytest.fixture
def kb(tmp_path):
    outline = tmp_path / "outline.csv"
    with open(outline, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["id", *v.OUTLINE_FIELDS], lineterminator="\n")
        w.writeheader()
        w.writerows(OUTLINE)
    chunks = tmp_path / "grammar_chunks.jsonl"

    def write(items):
        chunks.write_text(
            "".join((x if isinstance(x, str) else json.dumps(x, ensure_ascii=False)) + "\n" for x in items),
            encoding="utf-8",
        )
        return chunks

    return {"dir": tmp_path, "outline": outline, "chunks": chunks, "write": write}


def run(kb, items, final=False):
    kb["write"](items)
    return v.validate(kb["chunks"], kb["outline"], final=final)


def messages(res):
    return [e["message"] for e in res.errors]


# --- Doan hop le -------------------------------------------------------------


def test_valid_chunk_passes(kb):
    assert 120 <= v.word_count(make_chunk()["content"]) <= 250
    res = run(kb, [make_chunk()])
    assert res.errors == []
    assert res.missing_ids == ["gram_002", "gram_003"]
    assert [w["message"] for w in res.warnings] == ["chưa có người duyệt (reviewed_by)"]


def test_valid_non_form_chunk_without_formula_passes(kb):
    res = run(kb, [make_chunk(OUTLINE[2])])
    assert res.errors == []


def test_main_writes_report_and_preview(kb, capsys):
    kb["write"]([make_chunk(reviewed_by="Hiếu")])
    code = v.main(["--chunks", str(kb["chunks"]), "--outline", str(kb["outline"]), "--no-tokens"])
    out = capsys.readouterr().out
    assert code == 0
    assert "1 đoạn, 2 id chưa viết" in out
    assert "bỏ qua đo token" in out
    report = json.loads((kb["dir"] / "report.json").read_text(encoding="utf-8"))
    assert report["chunks"] == 1
    assert report["by_cefr"] == {"A1": 0, "A2": 1, "B1": 0, "B2": 0}
    assert report["errors"] == [] and report["warnings"] == []
    preview = (kb["dir"] / "preview.md").read_text(encoding="utf-8")
    assert "## present_perfect" in preview
    assert "### gram_001 · Thì hiện tại hoàn thành (Present Perfect) — Cấu trúc" in preview
    assert "A2 · form · WSEA biên soạn" in preview and "· Hiếu" in preview
    assert "- [ ] Đã duyệt" in preview


def test_empty_file_is_ok_in_draft_mode(kb, capsys):
    kb["write"]([])
    code = v.main(["--chunks", str(kb["chunks"]), "--outline", str(kb["outline"]), "--no-tokens"])
    assert code == 0
    assert "0 đoạn, 3 id chưa viết" in capsys.readouterr().out


# --- Cac ca loi bat buoc -----------------------------------------------------


def _drop_field(c):
    del c["source"]
    return [c]


def _short(c):
    # Giu dung moi dinh dang khac, chi doi do dai thanh dung 50 tu
    head = [c["title"], "Công thức: S + have/has + V3."]
    tail = ["Ví dụ:", *EXAMPLES]
    pad = 50 - v.word_count("\n".join(head + tail))
    c["content"] = "\n".join([*head, " ".join(["giải"] * pad), *tail])
    assert v.word_count(c["content"]) == 50
    return [c]


def _bad_first_line(c):
    c["content"] = "Present Perfect\n" + c["content"].split("\n", 1)[1]
    return [c]


def _no_formula(c):
    c["content"] = make_content(c["title"], formula=False)
    return [c]


def _one_example(c):
    c["content"] = make_content(c["title"], examples=EXAMPLES[:1])
    return [c]


def _dup_id(c):
    other = make_chunk(OUTLINE[1], id="gram_001")
    return [c, other]


@pytest.mark.parametrize("mutate, expected", [
    (_drop_field, "thiếu trường: source"),
    (lambda c: [{**c, "cefr": "C1"}], "cefr 'C1' không hợp lệ"),
    (_short, "ngoài khoảng 120–250"),
    (_bad_first_line, "dòng 1 của content khác title"),
    (_no_formula, "thiếu dòng 'Công thức:'"),
    (_one_example, "chỉ có 1 dòng ví dụ"),
    (_dup_id, "trùng id"),
], ids=["thieu-truong", "cefr-C1", "50-tu", "dong1-khac-title", "form-thieu-cong-thuc", "1-vi-du", "trung-id"])
def test_required_error_cases(kb, mutate, expected):
    items = mutate(copy.deepcopy(make_chunk()))
    res = run(kb, items)
    assert any(expected in m for m in messages(res)), messages(res)
    code = v.main(["--chunks", str(kb["chunks"]), "--outline", str(kb["outline"]), "--no-tokens"])
    assert code == 1


# --- Cac loi khac ------------------------------------------------------------


@pytest.mark.parametrize("item, expected", [
    ("{khong phai json", "JSON hỏng"),
    (make_chunk(extra=1), "thừa trường: extra"),
    (make_chunk(id="g_1"), "không khớp gram_"),
    (make_chunk(id="gram_999"), "không có trong outline"),
    (make_chunk(topic="present_perfect_x"), "topic khác outline"),
    (make_chunk(source="Wikipedia"), "source phải bắt đầu"),
    (make_chunk(source_url="http://en.wikipedia.org/wiki/Present_perfect"), "source_url phải là https"),
    (make_chunk(content=make_content(OUTLINE[0]["title"]) + "\nNhư đã nói, thì này rất quan trọng."), "như đã nói"),
])
def test_other_errors(kb, item, expected):
    res = run(kb, [item])
    assert any(expected in m for m in messages(res)), messages(res)


def test_duplicate_pair_and_identical_content(kb):
    a = make_chunk()
    b = make_chunk(OUTLINE[1], topic="present_perfect", facet="form", content=a["content"].upper())
    msgs = messages(run(kb, [a, b]))
    assert any("trùng (topic, facet)" in m for m in msgs)
    assert any("nội dung trùng hệt" in m for m in msgs)


def test_final_mode_turns_missing_and_unreviewed_into_errors(kb):
    res = run(kb, [make_chunk()], final=True)
    msgs = messages(res)
    assert any("2 id trong outline chưa viết" in m for m in msgs)
    assert "chưa có người duyệt (reviewed_by)" in msgs
    assert res.warnings == []


def test_nfd_title_still_matches(kb):
    import unicodedata
    c = make_chunk()
    c["content"] = unicodedata.normalize("NFD", c["content"])
    assert run(kb, [c]).errors == []


def test_count_examples_format():
    content = "T\nVí dụ:\n- I go. (Tôi đi.)\n- Bad line without translation\n- (chỉ có dịch)\n- We go. (Chúng tôi đi.)"
    assert v.count_examples(content) == 2
    assert v.count_examples("T\n- I go. (Tôi đi.)\n- We go. (Chúng tôi đi.)") == 0  # thieu dong Ví dụ:


def test_too_many_tokens_is_error(kb):
    class FakeTokenizer:
        def __init__(self, n):
            self.n = n

        def __call__(self, text):
            assert text.startswith("passage: ")
            return {"input_ids": [0] * self.n}

    kb["write"]([make_chunk()])
    res = v.validate(kb["chunks"], kb["outline"], tokenizer=FakeTokenizer(513))
    assert any("513 token" in m for m in messages(res))
    res = v.validate(kb["chunks"], kb["outline"], tokenizer=FakeTokenizer(490))
    assert res.errors == [] and any("490 token" in w["message"] for w in res.warnings)


def test_similarity_lists_pairs_without_failing(kb):
    pytest.importorskip("sklearn")
    a = make_chunk(reviewed_by="Hiếu")
    b = make_chunk(OUTLINE[1], reviewed_by="Hiếu", source="WSEA biên soạn · tham chiếu: Wikipedia — Present perfect",
                   content=make_content(OUTLINE[1]["title"], formula=False) + "\nThêm một câu để khác đoạn kia.")
    res = run(kb, [a, b])
    assert res.errors == []
    assert res.similarity_measured
    assert len(res.similar_pairs) == 1
    pair = res.similar_pairs[0]
    assert {pair["a"], pair["b"]} == {"gram_001", "gram_002"} and 0.5 < pair["score"] < 1


# --- Cum cam (thu hep) va bat buoc do token o --final --------------------------


def test_o_tren_ban_is_not_banned(kb):
    c = make_chunk(content=make_content(OUTLINE[0]["title"]).replace(
        "Ví dụ:", "Câu dịch có cụm ở trên bàn vẫn hợp lệ.\nVí dụ:"))
    assert run(kb, [c]).errors == []


@pytest.mark.parametrize("phrase", v.BANNED_PHRASES)
def test_each_banned_phrase_is_caught(kb, phrase):
    c = make_chunk(content=make_content(OUTLINE[0]["title"]) + f"\nXem {phrase} để rõ hơn.")
    assert any(f"'{phrase}'" in m for m in messages(run(kb, [c])))


def _main(kb, *extra):
    return v.main(["--chunks", str(kb["chunks"]), "--outline", str(kb["outline"]), *extra])


def test_final_without_tokenizer_is_error(kb, monkeypatch, capsys):
    monkeypatch.setattr(v, "load_tokenizer", lambda: None)
    kb["write"]([make_chunk(reviewed_by="Hiếu")])
    code = _main(kb, "--final")
    out = capsys.readouterr().out
    assert code == 1
    assert "không đo được token" in out
    assert "bỏ qua đo token" not in out


def test_final_with_no_tokens_flag_skips_measuring(kb, monkeypatch, capsys):
    monkeypatch.setattr(v, "load_tokenizer", lambda: pytest.fail("không được nạp tokenizer"))
    kb["write"]([])
    code = _main(kb, "--final", "--no-tokens")
    out = capsys.readouterr().out
    assert "không đo được token" not in out and "bỏ qua đo token" in out
    assert code == 1  # van loi vi 3 id chua viet


def test_draft_without_tokenizer_only_skips(kb, monkeypatch, capsys):
    monkeypatch.setattr(v, "load_tokenizer", lambda: None)
    kb["write"]([make_chunk(reviewed_by="Hiếu")])
    code = _main(kb)
    out = capsys.readouterr().out
    assert code == 0 and "bỏ qua đo token" in out and "không đo được token" not in out

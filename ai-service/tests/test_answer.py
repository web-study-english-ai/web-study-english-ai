"""Test app/services/answer.py (WSEA-140): [n] -> source_ids, xoa ky hieu trich. Ham thuan."""

import re
from types import SimpleNamespace

import pytest

from app.services.answer import cited_ids, postprocess, strip_citations
from app.services.prompts import TEXT_NO_CONTEXT, TEXT_OUT_OF_SCOPE

CTX = [SimpleNamespace(id=f"gram_{i:03d}") for i in (15, 13, 18)]  # [1]=015 [2]=013 [3]=018


def test_maps_numbers_to_ids_in_order_of_appearance():
    ans, ids = postprocess("Dùng hiện tại hoàn thành [3]. Còn quá khứ đơn [1][3].", CTX)
    assert ids == ["gram_018", "gram_015"]
    assert ans == "Dùng hiện tại hoàn thành. Còn quá khứ đơn."


def test_out_of_range_numbers_dropped_and_removed():
    ans, ids = postprocess("Ý một [1]. Ý hai [7]. Ý ba [0].", CTX)
    assert ids == ["gram_015"]
    assert "[" not in ans and ans == "Ý một. Ý hai. Ý ba."


def test_comma_list_and_duplicates():
    ans, ids = postprocess("A [2, 1]; B [1; 2] và C [2].", CTX)
    assert ids == ["gram_013", "gram_015"]
    assert ans == "A; B và C."


def test_no_citations_gives_empty_ids_and_keeps_text():
    text = "Reluctant nghĩa là miễn cưỡng.\n- She was reluctant to go. (Cô ấy miễn cưỡng đi.)"
    assert postprocess(text, CTX) == (text, [])


def test_empty_contexts_drop_all_numbers():
    ans, ids = postprocess("Ví dụ [1].", [])
    assert (ans, ids) == ("Ví dụ.", [])


def test_whitespace_cleanup_keeps_newlines():
    s = strip_citations("Dòng một [1] , tiếp  theo [2] .\n- Gạch đầu dòng [3]   \n\nĐoạn mới [1]!")
    assert s == "Dòng một, tiếp theo.\n- Gạch đầu dòng\n\nĐoạn mới!"


def test_non_numeric_brackets_untouched():
    ans, ids = postprocess("Viết [sic] hoặc [a] đều giữ [2].", CTX)
    assert ans == "Viết [sic] hoặc [a] đều giữ."
    assert ids == ["gram_013"]


@pytest.mark.parametrize("fixed", [TEXT_OUT_OF_SCOPE, TEXT_NO_CONTEXT])
def test_fixed_text_inside_longer_answer_returns_exact_fixed(fixed):
    noisy = "Rất tiếc nhé.  " + fixed.replace(" ", "  \n", 2) + " [1] Mình gợi ý thêm vài thứ."
    assert postprocess(noisy, CTX) == (fixed, [])


def test_cited_ids_alone():
    assert cited_ids("x [3] y [3] z [2]", CTX) == ["gram_018", "gram_013"]


# --- v2: "[Tai lieu n]" va markdown nhan manh ----------------------------------------------------


@pytest.mark.parametrize("text, ids, clean", [
    ("Dùng quá khứ đơn. [Tài liệu 1]", ["gram_015"], "Dùng quá khứ đơn."),
    ("Ý A [tài liệu 1, 2] và ý B [TÀI LIỆU 3].", ["gram_015", "gram_013", "gram_018"], "Ý A và ý B."),
    ("Ý [Tài  liệu 2][1].", ["gram_013", "gram_015"], "Ý."),
    ("Ý [Tài liệu 9].", [], "Ý."),
])
def test_tai_lieu_citations(text, ids, clean):
    assert postprocess(text, CTX) == (clean, ids)


def test_strip_bold_and_italic_keep_bullets():
    text = "* Dùng **be going to** cho *kế hoạch* [1]\n* Ví dụ: *I'm going to study.*\n- **Lưu ý**: 2*3*4 giữ"
    ans, ids = postprocess(text, CTX)
    assert ans == "* Dùng be going to cho kế hoạch\n* Ví dụ: I'm going to study.\n- Lưu ý: 2*3*4 giữ"
    assert ids == ["gram_015"]


def test_fullwidth_brackets():  # v3: v2 d03 viet 【1】
    assert postprocess("Ý A【1】. Ý B 【1】【3】, ý C【1, 3】.", CTX) == ("Ý A. Ý B, ý C.", ["gram_015", "gram_018"])
    assert postprocess("Giữ 【ghi chú】 và [sic].", CTX) == ("Giữ 【ghi chú】 và [sic].", [])


@pytest.mark.parametrize("space", [" ", " ", " ", "​", "　", "\t", "   "])
def test_unicode_space_before_citation_and_punct(space):  # v3: v2 d05/d11 co U+202F truoc [1]
    text = f"Effect là danh từ (the effect of …){space}[1]. Affect là động từ{space}[1]{space}, đúng{space}!"
    assert postprocess(text, CTX) == ("Effect là danh từ (the effect of …). Affect là động từ, đúng!", ["gram_015"])


def test_keep_leading_indent_collapse_mid_line():  # v3: v2 mat thut le gach dau dong long nhau
    text = "- Ví dụ:  [1]\n  - I lost   my keys.  [2]\n    - sâu hơn\n\n  Đoạn thụt lề"
    ans, ids = postprocess(text, CTX)
    assert ans == "- Ví dụ:\n  - I lost my keys.\n    - sâu hơn\n\n  Đoạn thụt lề"
    assert ids == ["gram_015", "gram_013"]


def test_fullwidth_period():  # v3 d04: "make homework [1]。"
    assert postprocess("Đúng là do homework, không phải make homework [1]。\n- Ý khác  。", CTX) == \
        ("Đúng là do homework, không phải make homework.\n- Ý khác.", ["gram_015"])


STREAM_TEXTS = [
    "Dùng **hiện tại hoàn thành** khi không nêu thời điểm [1][2]. Ví dụ: *I have been to Da Lat.* [1]",
    "- Nguồn gốc: must【1】.\n  - Phủ định: mustn't [Tài liệu 1, 2] ; ok  [3] .\n\n* Bullet *nghiêng* 2*3*4",
    "Giữ [sic] và [một ghi chú dài hơn hai mươi tư ký tự] nhé [2]。",
    "  Mở đầu thụt lề [1]\n\n\n- a  b   c [9]\n",
]


@pytest.mark.parametrize("text", STREAM_TEXTS)
@pytest.mark.parametrize("size", [1, 2, 3, 7])
def test_stream_cleaner_deltas_join_to_answer(text, size):
    from app.services.answer import StreamCleaner, clean_text
    sc = StreamCleaner()
    deltas = [sc.feed(text[i:i + size]) for i in range(0, len(text), size)]
    tail, answer, ids = sc.finish(CTX)
    assert "".join(deltas) + tail == answer == clean_text(text)
    assert (answer, ids) == postprocess(text, CTX)
    for d in deltas + [tail]:
        assert "【" not in d and "Tài liệu" not in d and "**" not in d
        assert not re.search(r"\[\d", d)


def test_stream_cleaner_holds_unclosed_marker():
    from app.services.answer import StreamCleaner
    sc = StreamCleaner()
    assert sc.feed("Dùng since [") == "Dùng since"
    assert sc.feed("1") == ""
    assert sc.feed("]. Hết") == ". Hết"


def test_stream_cleaner_fixed_text_final_only():
    from app.services.answer import StreamCleaner
    sc = StreamCleaner()
    sc.feed("Ừm. " + TEXT_NO_CONTEXT)
    _, answer, ids = sc.finish(CTX)
    assert (answer, ids) == (TEXT_NO_CONTEXT, [])


def test_emphasis_around_fixed_text_still_matches():
    assert postprocess("**" + TEXT_NO_CONTEXT + "**", CTX) == (TEXT_NO_CONTEXT, [])

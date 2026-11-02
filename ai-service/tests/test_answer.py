"""Test app/services/answer.py (WSEA-140): [n] -> source_ids, xoa ky hieu trich. Ham thuan."""

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

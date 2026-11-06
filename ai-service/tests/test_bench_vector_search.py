"""Test phan thuan cua scripts/bench_vector_search.py (WSEA-110). Khong can DB."""

import json

import pytest

from scripts import bench_vector_search as bv

# EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) mau, rut gon tu dang PostgreSQL tra ve.
KB_INDEX_PLAN = [{
    "Plan": {
        "Node Type": "Limit",
        "Plans": [{
            "Node Type": "Index Scan", "Parent Relationship": "Outer",
            "Scan Direction": "Forward", "Index Name": "kb_chunks_embedding_idx",
            "Relation Name": "kb_chunks", "Alias": "kb_chunks",
            "Filter": "((embedding IS NOT NULL) AND (embedding_model = 'intfloat/multilingual-e5-small'::text))",
        }],
    },
    "Planning Time": 0.21,
    "Execution Time": 1.734,
}]

KB_SEQ_PLAN = [{
    "Plan": {
        "Node Type": "Limit",
        "Plans": [{
            "Node Type": "Sort",
            "Plans": [{"Node Type": "Seq Scan", "Relation Name": "kb_chunks", "Alias": "kb_chunks"}],
        }],
    },
    "Execution Time": 0.912,
}]

WORDS_JOIN_PLAN = [{
    "Plan": {
        "Node Type": "Limit",
        "Plans": [{
            "Node Type": "Nested Loop",
            "Plans": [
                {"Node Type": "Index Scan", "Index Name": "word_embeddings_embedding_idx",
                 "Relation Name": "word_embeddings", "Alias": "we"},
                {"Node Type": "Index Scan", "Index Name": "words_pkey", "Relation Name": "words", "Alias": "w"},
            ],
        }],
    },
    "Execution Time": 3.5,
}]

BITMAP_PLAN = [{
    "Plan": {
        "Node Type": "Bitmap Heap Scan", "Relation Name": "kb_chunks",
        "Plans": [{"Node Type": "Bitmap Index Scan", "Index Name": "kb_chunks_topic_idx"}],
    },
    "Execution Time": 0.5,
}]


# --- p50 / p95 ----------------------------------------------------------------------------


def test_summarize_p50_p95():
    s = bv.summarize([float(i) for i in range(1, 11)])  # 1..10
    assert s == {"n": 10, "p50_ms": 5.5, "p95_ms": 9.55}


def test_summarize_single_and_empty():
    assert bv.summarize([4.0]) == {"n": 1, "p50_ms": 4.0, "p95_ms": 4.0}
    with pytest.raises(ValueError):
        bv.summarize([])


# --- do khop top-k ---------------------------------------------------------------------------


def test_overlap_at_k_hand_computed():
    exact = [["a", "b", "c"], ["d", "e", "f"]]
    approx = [["a", "b", "c"], ["d", "x", "y"]]          # 3/3 va 1/3
    assert bv.overlap_at_k(approx, exact, 3) == pytest.approx((1 + 1 / 3) / 2)


def test_overlap_ignores_order_and_cuts_at_k():
    assert bv.overlap_at_k([["c", "b", "a", "z"]], [["a", "b", "c", "q"]], 3) == 1.0


def test_overlap_short_result_counts_as_miss():
    assert bv.overlap_at_k([["a"]], [["a", "b"]], 2) == 0.5


def test_overlap_rejects_mismatched_lengths():
    with pytest.raises(ValueError):
        bv.overlap_at_k([["a"]], [], 1)


# --- doc EXPLAIN ----------------------------------------------------------------------------


def test_scan_nodes_index():
    assert bv.scan_nodes(KB_INDEX_PLAN, "kb_chunks") == ["Index Scan using kb_chunks_embedding_idx"]
    assert bv.execution_time_ms(KB_INDEX_PLAN) == pytest.approx(1.734)


def test_scan_nodes_seq_scan():
    assert bv.scan_nodes(KB_SEQ_PLAN, "kb_chunks") == ["Seq Scan on kb_chunks"]


def test_scan_nodes_join_only_target_table():
    assert bv.scan_nodes(WORDS_JOIN_PLAN, "word_embeddings") == ["Index Scan using word_embeddings_embedding_idx"]
    assert bv.scan_nodes(WORDS_JOIN_PLAN, "words") == ["Index Scan using words_pkey"]


def test_scan_nodes_bitmap_without_relation_name():
    assert bv.scan_nodes(BITMAP_PLAN, "kb_chunks") == [
        "Bitmap Heap Scan on kb_chunks",
        "Bitmap Index Scan using kb_chunks_topic_idx",
    ]


def test_explain_json_as_string():
    text = json.dumps(KB_SEQ_PLAN)
    assert bv.scan_nodes(text, "kb_chunks") == ["Seq Scan on kb_chunks"]
    assert bv.execution_time_ms(text) == pytest.approx(0.912)


# --- tien ich khac -----------------------------------------------------------------------------


def test_vector_literal_and_first_line():
    assert bv.vector_literal([0.5, -1, 0.25]) == "[0.5,-1.0,0.25]"
    assert bv.first_line("Present perfect — form\nDòng 2") == "Present perfect — form"


def test_queries_match_contract_shape():
    kb, words = bv.QUERIES["kb_chunks"]["sql"], bv.QUERIES["word_embeddings"]["sql"]
    assert "embedding_model = %(model)s" in kb and "ORDER BY embedding <=> %(v)s::vector" in kb and "LIMIT 8" in kb
    assert "we.model = %(model)s" in words and "JOIN words w ON w.id = we.word_id" in words and "LIMIT 3" in words


def test_modes_only_set_local():
    assert all(s.startswith("SET LOCAL ") for stmts in bv.MODES.values() for s in stmts)


def test_main_without_env_var_stops(capsys):
    assert bv.main(["--env", "staging"], environ={}) == 1
    assert "KB_DATABASE_URL" in capsys.readouterr().out

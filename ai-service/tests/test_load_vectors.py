"""Test phan thuan cua scripts/load_vectors.py (WSEA-110). Khong can DB, khong nap mo hinh."""

import json

import numpy as np
import pytest

from app.services import embedder as emb
from scripts import load_vectors as lv

URL = "postgresql://postgres.abc:S3cr3t%21pw@db.example.supabase.co:5432/postgres"


# --- chuoi ket noi -------------------------------------------------------------------------


def test_mask_url_hides_user_and_password():
    masked = lv.mask_url(URL + "?sslmode=require")
    assert masked == "db.example.supabase.co:5432/postgres"
    assert "S3cr3t" not in masked and "postgres.abc" not in masked


def test_redact_removes_password_and_url():
    msg = f"failed for {URL} with password S3cr3t%21pw"
    out = lv.redact(msg, URL)
    assert "S3cr3t" not in out and URL not in out


def test_prepare_url_adds_sslmode():
    assert lv.prepare_url(URL).endswith("?sslmode=require")


def test_prepare_url_keeps_existing_sslmode_and_params():
    out = lv.prepare_url(URL + "?sslmode=verify-full&application_name=kb")
    assert "sslmode=verify-full" in out and "sslmode=require" not in out
    assert "application_name=kb" in out


def test_prepare_url_rejects_transaction_pooler():
    with pytest.raises(lv.ConfigError, match="6543") as exc:
        lv.prepare_url(URL.replace(":5432", ":6543"))
    assert "S3cr3t" not in str(exc.value)


@pytest.mark.parametrize("bad", ["", "   ", "mysql://u:p@h/db", "host=x dbname=y", "postgresql://u:p@h:abc/db"])
def test_prepare_url_rejects_bad_values(bad):
    with pytest.raises(lv.ConfigError):
        lv.prepare_url(bad)


# --- anh xa tu, chia lo ----------------------------------------------------------------------


def test_map_terms_and_missing_keep_file_order():
    db_rows = [("w-1", "have"), ("w-3", "say"), ("w-9", "extra")]
    pairs, missing = lv.map_terms(["have", "do", "say", "go"], db_rows)
    assert pairs == [("w-1", 0), ("w-3", 2)]
    assert missing == ["do", "go"]


def test_map_terms_is_exact_match():
    pairs, missing = lv.map_terms(["Have"], [("w-1", "have")])
    assert pairs == [] and missing == ["Have"]


def test_batched():
    assert list(lv.batched(list(range(7)), 3)) == [[0, 1, 2], [3, 4, 5], [6]]
    assert list(lv.batched([], 500)) == []
    assert [len(b) for b in lv.batched(list(range(7000)), 500)] == [500] * 14
    with pytest.raises(ValueError):
        list(lv.batched([1], 0))


# --- manifest va sha256 -------------------------------------------------------------------------


@pytest.fixture
def files(tmp_path):
    kb = tmp_path / "chunks.jsonl"
    kb.write_text('{"id": "gram_001", "content": "x"}\n', encoding="utf-8")
    kb_npz, words_npz = tmp_path / "kb.npz", tmp_path / "words.npz"
    kb_npz.write_bytes(b"kb-vectors")
    words_npz.write_bytes(b"word-vectors")
    manifest = {
        **emb.model_info(),
        "inputs": {"kb": {"sha256": lv.sha256(kb)}},
        "outputs": {"kb": {"sha256": lv.sha256(kb_npz)}, "words": {"sha256": lv.sha256(words_npz)}},
    }
    return manifest, kb, kb_npz, words_npz


def test_verify_manifest_ok(files):
    assert lv.verify_manifest(*files) == []


def test_verify_manifest_detects_changed_content(files):
    manifest, kb, kb_npz, words_npz = files
    kb.write_text('{"id": "gram_001", "content": "đã sửa"}\n', encoding="utf-8")
    errors = lv.verify_manifest(manifest, kb, kb_npz, words_npz)
    assert len(errors) == 1 and "chunks.jsonl" in errors[0] and "lệch" in errors[0]


def test_verify_manifest_detects_changed_npz(files):
    manifest, kb, kb_npz, words_npz = files
    words_npz.write_bytes(b"khac")
    assert any("words.npz" in e for e in lv.verify_manifest(manifest, kb, kb_npz, words_npz))


def test_verify_manifest_detects_model_mismatch(files):
    manifest, *paths = files
    manifest = {**manifest, "revision": "abc", "dim": 768}
    errors = lv.verify_manifest(manifest, *paths)
    assert any("revision" in e for e in errors) and any("dim" in e for e in errors)


# --- npz, schema, top-k -------------------------------------------------------------------------


def unit_rows(n):
    v = np.zeros((n, emb.DIM), dtype=np.float32)
    v[np.arange(n), np.arange(n)] = 1.0
    return v


def test_check_npz():
    assert lv.check_npz(["a", "b"], unit_rows(2), "kb") == []
    assert any("trùng" in e for e in lv.check_npz(["a", "a"], unit_rows(2), "kb"))
    assert any("shape" in e for e in lv.check_npz(["a"], unit_rows(2), "kb"))


def test_match_chunks():
    assert lv.match_chunks([{"id": "g1"}, {"id": "g2"}], ["g2", "g1"]) == []
    assert lv.match_chunks([{"id": "g1"}], ["g1", "g9"])


def test_schema_ok():
    types = {key: (want or "text") for key, want in lv.REQUIRED_COLUMNS.items()}
    assert lv.schema_errors(True, types) == []


def test_schema_old_migration_reports_384():
    types = {key: (want or "text") for key, want in lv.REQUIRED_COLUMNS.items()}
    types[("kb_chunks", "embedding")] = "vector(768)"
    types[("kb_chunks", "embedding_model")] = None
    types[("word_embeddings", "embedding")] = None
    errors = lv.schema_errors(True, types)
    assert any("vector(768)" in e for e in errors)
    assert any("kb_chunks.embedding_model" in e for e in errors)
    assert errors[-1].endswith("chưa áp migration 384")


def test_schema_no_extension():
    assert "extension vector" in lv.schema_errors(False, {})[0]


def test_numpy_top_ids():
    vecs = unit_rows(4)
    q = np.zeros(emb.DIM, dtype=np.float32)
    q[2], q[0], q[3] = 0.9, 0.4, 0.1
    assert lv.numpy_top_ids(q, vecs, ["a", "b", "c", "d"]) == ["c", "a", "d"]


# --- main: dung truoc khi cham DB -----------------------------------------------------------------


def test_main_production_requires_confirm(capsys):
    assert lv.main(["--env", "production"], environ={lv.ENV_VAR: URL}) == 1
    assert "--confirm-production" in capsys.readouterr().out


def test_main_missing_env_var(capsys):
    assert lv.main(["--env", "staging"], environ={}) == 1
    assert lv.ENV_VAR in capsys.readouterr().out


def test_main_rejects_pooler_without_leaking(capsys):
    assert lv.main(["--env", "staging"], environ={lv.ENV_VAR: URL.replace(":5432", ":6543")}) == 1
    out = capsys.readouterr().out
    assert "6543" in out and "S3cr3t" not in out


def test_main_stops_on_sha_mismatch_before_connecting(files, tmp_path, capsys, monkeypatch):
    manifest, kb, kb_npz, words_npz = files
    manifest["outputs"]["kb"]["sha256"] = "0" * 64
    mf = tmp_path / "manifest.json"
    mf.write_text(json.dumps(manifest), encoding="utf-8")
    monkeypatch.setitem(__import__("sys").modules, "psycopg", None)  # cham DB la loi
    code = lv.main(["--env", "staging", "--kb-jsonl", str(kb), "--kb-npz", str(kb_npz),
                    "--words-npz", str(words_npz), "--manifest", str(mf)], environ={lv.ENV_VAR: URL})
    assert code == 1
    out = capsys.readouterr().out
    assert "kb.npz" in out and "S3cr3t" not in out

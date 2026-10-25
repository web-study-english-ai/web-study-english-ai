"""Test phan thuan cua scripts/verify_mk3.py (WSEA-98). Khong goi mang.

Rieng test_expected_matches_service dung TestClient (chay trong tien trinh) de khoa
gia tri ky vong cua probe vao dung so ma endpoint tra ve.
"""

import json

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.models.fsrs import DEFAULT_W
from scripts import verify_mk3 as v
from tests.conftest import TEST_API_KEY


def row(**kw):
    base = {
        "id": "r-1", "reviewed_at": "2026-10-24T10:00:00Z", "rating": "3",
        "elapsed_days": "3", "stability_before": "12.5", "difficulty_before": "5.2",
        "predicted_retrievability": "0.973", "stability_after": "25.72",
        "difficulty_after": "5.1", "next_interval_days": "26", "state_before": "REVIEW",
        "model_version": "v1",
    }
    base.update(kw)
    return base


# --- Dung payload tu dong CSV ----------------------------------------------


def test_build_card_old_card():
    assert v.build_card(row()) == {
        "card_id": "r-1", "stability": 12.5, "difficulty": 5.2,
        "elapsed_days": 3.0, "rating": 3,
    }


@pytest.mark.parametrize("s, d", [("12.5", ""), ("", "5.2"), ("", ""), ("NULL", "5.2")])
def test_build_card_sd_both_or_neither(s, d):
    """Mot trong hai null -> gui ca hai null (backend: coDuDS)."""
    card = v.build_card(row(stability_before=s, difficulty_before=d))
    assert card["stability"] is None and card["difficulty"] is None


@pytest.mark.parametrize("elapsed", ["", "null", "NULL"])
def test_build_card_elapsed_null_becomes_zero(elapsed):
    assert v.build_card(row(elapsed_days=elapsed))["elapsed_days"] == 0.0


def test_build_card_keeps_rating_and_id():
    card = v.build_card(row(id="abc", rating="1"))
    assert card["card_id"] == "abc" and card["rating"] == 1


def test_build_card_rejects_long_id():
    with pytest.raises(ValueError):
        v.build_card(row(id="x" * 65))


def test_read_csv_filters_scheduler(tmp_path):
    path = tmp_path / "r.csv"
    cols = list(v.CSV_COLUMNS) + ["scheduler"]
    lines = [",".join(cols)]
    for i, sch in enumerate(["FSRS_AI", "FALLBACK_TS", "FSRS_AI", "RELEARN_STEP"]):
        r = row(id=f"r{i}")
        r["scheduler"] = sch
        lines.append(",".join(r[c] for c in cols))
    path.write_text("\n".join(lines), encoding="utf-8")
    rows, dropped = v.read_reviews_csv(str(path))
    assert [r["id"] for r in rows] == ["r0", "r2"] and dropped == 2


def test_read_csv_missing_column(tmp_path):
    path = tmp_path / "r.csv"
    path.write_text("id,rating\n1,3\n", encoding="utf-8")
    with pytest.raises(SystemExit):
        v.read_reviews_csv(str(path))


# --- So sanh co dung sai ---------------------------------------------------

AI = {"retrievability": 0.973, "new_stability": 25.72, "new_difficulty": 5.1,
      "interval_days": 26}


def test_diff_within_tolerance():
    got = dict(AI, new_stability=25.72 + 5e-5, retrievability=0.973 - 9e-5)
    assert v.diff_result(AI, got, 1e-4) == []


def test_diff_outside_tolerance():
    got = dict(AI, new_difficulty=5.1 + 2e-4)
    assert v.diff_result(AI, got, 1e-4) == ["new_difficulty"]


def test_diff_interval_exact():
    assert v.diff_result(AI, dict(AI, interval_days=27), 1e-4) == ["interval_days"]
    assert v.diff_result(AI, dict(AI, interval_days=26.0), 1e-4) == []


def test_diff_null_retrievability():
    a = dict(AI, retrievability=None)
    assert v.diff_result(a, dict(a), 1e-4) == []
    assert v.diff_result(a, AI, 1e-4) == ["retrievability"]


def test_rating1_skips_interval_against_db():
    """rating 1: DB ghi 10/1440 ngay, khong so voi interval cua AI."""
    r = row(rating="1", next_interval_days=str(10 / 1440))
    card = v.build_card(r)
    db = v.db_result(r)
    res = dict(db, interval_days=3)
    stats = v.compare_rows([r], [card], {"u1": [res]}, {"u1": "v1"}, 1e-4)
    assert stats[0].n_rows_bad == 0
    assert stats[0].max_abs["interval_days"] is None


def test_rating3_interval_checked_against_db():
    r = row()
    res = dict(v.db_result(r), interval_days=25)
    stats = v.compare_rows([r], [v.build_card(r)], {"u1": [res]}, {"u1": "v1"}, 1e-4)
    assert stats[0].n_rows_bad == 1
    assert stats[0].examples[0]["fields"] == ["interval_days"]


def test_compare_skips_db_rows_of_other_version_and_compares_urls():
    r1, r2 = row(id="a"), row(id="b", model_version="v0")
    cards = [v.build_card(r1), v.build_card(r2)]
    good = v.db_result(r1)
    per_url = {"u1": [good, good], "u2": [good, dict(good, new_stability=30.0)]}
    stats = {s.name: s for s in v.compare_rows([r1, r2], cards, per_url,
                                               {"u1": "v1", "u2": "v1"}, 1e-4)}
    assert stats["db <-> u1"].n_compared == 1
    assert stats["u1 <-> u2"].n_compared == 2
    assert stats["u1 <-> u2"].n_rows_bad == 1
    assert stats["u1 <-> u2"].max_abs["new_stability"] == pytest.approx(30.0 - 25.72)


def test_count_breakdown():
    cards = [v.build_card(row(rating="3")), v.build_card(row(rating="1", stability_before=""))]
    assert v.count_breakdown(cards) == {"rating1_moi": 1, "rating3_cu": 1}


# --- Gia tri ky vong cua probe ---------------------------------------------


def test_expected_default_weights():
    exp = v.compute_expected(v.PROBE_CARDS, None, 36500)
    assert exp[0]["retrievability"] is None and exp[1]["retrievability"] is None
    assert exp[0]["new_stability"] == pytest.approx(DEFAULT_W[2], abs=1e-6)
    assert exp[1]["new_stability"] == pytest.approx(DEFAULT_W[0], abs=1e-6)
    assert exp[2]["retrievability"] == pytest.approx(0.973, abs=1e-3)
    assert all(isinstance(e["interval_days"], int) for e in exp)


def test_expected_matches_service():
    """Ky vong tinh cuc bo phai trung dung response endpoint (default weights)."""
    exp = v.compute_expected(v.PROBE_CARDS, None, 36500)
    with TestClient(app) as c:
        res = c.post("/predict-retention", json={"cards": v.PROBE_CARDS},
                     headers={"x-api-key": TEST_API_KEY})
    assert v.judge_predict(res.json(), exp, v.DEFAULT_VERSION, 1e-4) == (True, [])


def test_judge_predict_flags_wrong_version_and_values():
    exp = v.compute_expected(v.PROBE_CARDS, None, 36500)
    body = {"model_version": "v1", "results": [dict(e) for e in exp]}
    body["results"][2]["interval_days"] += 1
    ok, reasons = v.judge_predict(body, exp, v.DEFAULT_VERSION, 1e-4)
    assert not ok
    assert reasons == ["model_version=v1", "mk3-cu-g3.interval_days"]


def test_judge_predict_wrong_order():
    exp = v.compute_expected(v.PROBE_CARDS, None, 36500)
    body = {"model_version": v.DEFAULT_VERSION, "results": list(reversed(exp))}
    assert v.judge_predict(body, exp, v.DEFAULT_VERSION, 1e-4)[0] is False


def test_check_reference_v1():
    good = [{}, {}, {"retrievability": v.EXPECTED_R, "new_stability": v.EXPECTED_S}]
    v.check_reference(good, "v1")
    v.check_reference([{}, {}, {"retrievability": 0.5, "new_stability": 1.0}], "v2")
    bad = [{}, {}, {"retrievability": v.EXPECTED_R + 1e-3, "new_stability": v.EXPECTED_S}]
    with pytest.raises(SystemExit):
        v.check_reference(bad, "v1")


# --- Tom tat probe -------------------------------------------------------------


def sample(ts, ok=True, latency=100.0, status=200, timeout=False, correct=True):
    return {"ts": ts, "ok": ok, "latency_ms": latency, "predict_status": status,
            "timeout": timeout, "correct": correct, "model_version": "v1"}


def test_summarize_probe():
    samples = [
        sample("t0", latency=100),
        sample("t1", ok=False, latency=3200, status=None, timeout=True, correct=None),
        sample("t2", ok=False, latency=3100, status=None, timeout=True, correct=None),
        sample("t3", latency=200),
        sample("t4", ok=False, latency=150, correct=False),
        sample("t5", latency=300),
    ]
    sm = v.summarize_probe(samples)
    assert sm["n"] == 6 and sm["n_ok"] == 3 and sm["success_rate"] == 0.5
    assert sm["n_timeout"] == 2 and sm["n_wrong"] == 1
    assert sm["latency_max"] == 3200
    assert sm["latency_p50"] == 200  # nearest-rank tren [100,150,200,300,3100,3200]
    assert (sm["longest_fail_streak"], sm["longest_fail_start"], sm["longest_fail_end"]) \
        == (2, "t1", "t2")


def test_summarize_excludes_connection_errors_from_latency():
    """Loi ket noi tuc thi (khong co status, khong timeout) khong keo p50 xuong."""
    samples = [sample("t0", latency=500),
               sample("t1", ok=False, latency=1, status=None, correct=None)]
    sm = v.summarize_probe(samples)
    assert sm["latency_p50"] == 500 and sm["longest_fail_streak"] == 1


def test_summarize_empty():
    sm = v.summarize_probe([])
    assert sm["n"] == 0 and sm["success_rate"] is None and sm["latency_p50"] is None


def test_next_tick_skips_missed_slots():
    assert v.next_tick(0.0, 120.0, 5.0) == 120.0
    assert v.next_tick(0.0, 120.0, 250.0) == 360.0  # cham 2 chu ky -> bo moc 240
    assert v.next_tick(0.0, 120.0, 120.0) == 240.0


def test_read_jsonl_skips_broken_tail(tmp_path):
    path = tmp_path / "p.jsonl"
    path.write_text(json.dumps(sample("t0")) + "\n" + '{"ts": "t1", "ok"', encoding="utf-8")
    samples, bad = v.read_jsonl(str(path))
    assert len(samples) == 1 and bad == 1

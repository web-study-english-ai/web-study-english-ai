"""Test endpoint POST /predict-retention va GET /health (WSEA-81).

conftest.py da dat INTERNAL_API_KEY gia va FSRS_WEIGHTS_SOURCE=default truoc khi
app duoc import, nen test khong phu thuoc mang lan HF_TOKEN.
"""

import pytest
import torch
from fastapi.testclient import TestClient

from app.main import app
from tests.conftest import TEST_API_KEY

AUTH = {"x-api-key": TEST_API_KEY}

CARD_OLD = {
    "card_id": "the-cu",
    "stability": 12.5,
    "difficulty": 5.2,
    "elapsed_days": 3.0,
    "rating": 3,
}
CARD_NEW = {"card_id": "the-moi", "elapsed_days": 0.0, "rating": 3}


@pytest.fixture
def client():
    """TestClient co chay lifespan -> mo hinh duoc nap that."""
    with TestClient(app) as c:
        yield c


def post(client, cards, headers=AUTH):
    return client.post("/predict-retention", json={"cards": cards}, headers=headers)


# --- Duong di thanh cong ---------------------------------------------------


def test_batch_returns_result_per_card_in_order(client):
    ids = ["a", "b", "c"]
    cards = [dict(CARD_OLD, card_id=i) for i in ids]
    res = post(client, cards)

    assert res.status_code == 200
    body = res.json()
    assert [r["card_id"] for r in body["results"]] == ids
    assert body["model_version"] == "default-untrained"


def test_result_fields_in_valid_range(client):
    res = post(client, [CARD_OLD])
    r = res.json()["results"][0]

    assert 0 <= r["retrievability"] <= 1
    assert 0 < r["new_stability"] <= 36500
    assert 1 <= r["new_difficulty"] <= 10
    assert isinstance(r["interval_days"], int) and r["interval_days"] >= 1


def test_retrievability_matches_formula(client):
    """R = (1 + FACTOR*t/S)^DECAY. Voi S=12.5, t=3 thi R ~ 0.973."""
    res = post(client, [CARD_OLD])
    assert res.json()["results"][0]["retrievability"] == pytest.approx(0.973, abs=1e-3)


def test_new_card_has_null_retrievability(client):
    res = post(client, [CARD_NEW])
    r = res.json()["results"][0]

    assert r["retrievability"] is None
    assert r["new_stability"] > 0


def test_explicit_nulls_treated_as_new_card(client):
    """stability: null va difficulty: null tuong duong voi vang mat."""
    explicit = dict(CARD_NEW, stability=None, difficulty=None)
    a = post(client, [CARD_NEW]).json()["results"][0]
    b = post(client, [explicit]).json()["results"][0]
    assert a == b


def test_lapse_reduces_stability(client):
    res = post(client, [dict(CARD_OLD, rating=1)])
    assert res.json()["results"][0]["new_stability"] < CARD_OLD["stability"]


def test_success_increases_stability(client):
    res = post(client, [dict(CARD_OLD, rating=3)])
    assert res.json()["results"][0]["new_stability"] > CARD_OLD["stability"]


def test_mixed_batch(client):
    res = post(client, [CARD_OLD, CARD_NEW])
    results = res.json()["results"]

    assert res.status_code == 200
    assert results[0]["retrievability"] is not None
    assert results[1]["retrievability"] is None


def test_max_batch_size_accepted(client):
    cards = [dict(CARD_OLD, card_id=f"c{i}") for i in range(500)]
    res = post(client, cards)
    assert res.status_code == 200
    assert len(res.json()["results"]) == 500


# --- Xac thuc --------------------------------------------------------------


def test_missing_api_key_returns_401(client):
    res = post(client, [CARD_OLD], headers={})
    assert res.status_code == 401


def test_wrong_api_key_returns_401(client):
    """Ca nay bat duoc bug cua commit a95872c: truoc day tra 500 vi AttributeError."""
    res = post(client, [CARD_OLD], headers={"x-api-key": "khoa-sai"})
    assert res.status_code == 401
    assert "detail" in res.json()


def test_old_header_name_no_longer_accepted(client):
    """Hop dong dung x-api-key; ten cu X-Internal-Api-Key khong con hieu luc."""
    res = post(client, [CARD_OLD], headers={"X-Internal-Api-Key": TEST_API_KEY})
    assert res.status_code == 401


# --- Rang buoc mien gia tri ------------------------------------------------


@pytest.mark.parametrize("rating", [0, 5, -1, 100])
def test_rating_out_of_range_returns_422(client, rating):
    assert post(client, [dict(CARD_OLD, rating=rating)]).status_code == 422


@pytest.mark.parametrize("stability", [0, -1, 36501])
def test_stability_out_of_range_returns_422(client, stability):
    assert post(client, [dict(CARD_OLD, stability=stability)]).status_code == 422


@pytest.mark.parametrize("difficulty", [0, 0.5, 11, -3])
def test_difficulty_out_of_range_returns_422(client, difficulty):
    assert post(client, [dict(CARD_OLD, difficulty=difficulty)]).status_code == 422


@pytest.mark.parametrize("elapsed", [-1, -0.5, 36501])
def test_elapsed_days_out_of_range_returns_422(client, elapsed):
    assert post(client, [dict(CARD_OLD, elapsed_days=elapsed)]).status_code == 422


def test_empty_batch_returns_422(client):
    assert post(client, []).status_code == 422


def test_oversized_batch_returns_422(client):
    cards = [dict(CARD_OLD, card_id=f"c{i}") for i in range(501)]
    assert post(client, cards).status_code == 422


def test_empty_card_id_returns_422(client):
    assert post(client, [dict(CARD_OLD, card_id="")]).status_code == 422


def test_stability_without_difficulty_returns_422(client):
    card = dict(CARD_OLD)
    del card["difficulty"]
    assert post(client, [card]).status_code == 422


def test_difficulty_without_stability_returns_422(client):
    card = dict(CARD_OLD)
    del card["stability"]
    assert post(client, [card]).status_code == 422


# --- Dau vao di dang -------------------------------------------------------


@pytest.mark.parametrize("bad", ["NaN", "Infinity", "-Infinity"])
def test_nan_and_infinity_return_422(client, bad):
    """Phai la 422 chu khong phai 500.

    Ban mac dinh cua FastAPI nhet gia tri vao truong 'input' cua body loi, ma
    NaN thi khong serialize duoc -> 500. exception_handler trong main.py bo
    truong do di.
    """
    raw = '{"cards":[{"card_id":"c","elapsed_days":%s,"rating":3}]}' % bad
    res = client.post(
        "/predict-retention",
        content=raw,
        headers={**AUTH, "Content-Type": "application/json"},
    )
    assert res.status_code == 422


def test_misspelled_field_returns_422(client):
    """Go sai 'stabilty' phai bao loi, khong duoc im lang coi the cu la the moi."""
    card = {
        "card_id": "c",
        "stabilty": 12.5,
        "difficulty": 5.2,
        "elapsed_days": 3.0,
        "rating": 3,
    }
    assert post(client, [card]).status_code == 422


def test_camel_case_field_returns_422(client):
    card = {
        "card_id": "c",
        "stability": 12.5,
        "difficulty": 5.2,
        "elapsedDays": 3.0,
        "rating": 3,
    }
    assert post(client, [card]).status_code == 422


def test_unknown_top_level_field_returns_422(client):
    res = client.post(
        "/predict-retention", json={"cards": [CARD_OLD], "extra": 1}, headers=AUTH
    )
    assert res.status_code == 422


def test_validation_error_body_has_no_input_field(client):
    """Body loi chi gom loc/msg/type - khong vong lai gia tri nguoi dung gui."""
    errors = post(client, [dict(CARD_OLD, rating=9)]).json()["detail"]
    assert errors and all(set(e) == {"loc", "msg", "type"} for e in errors)


# --- Su co phia mo hinh ----------------------------------------------------


def test_non_finite_model_output_returns_500(client, monkeypatch):
    """Mo hinh tra NaN -> 500, khong duoc am tham tra null cho backend ghi vao lich on."""
    model = client.app.state.models["fsrs"]

    def broken(*args, **kwargs):
        nan = torch.tensor([float("nan")])
        return nan, nan, nan, nan

    monkeypatch.setattr(model, "predict_step", broken)
    res = post(client, [CARD_OLD])

    assert res.status_code == 500
    assert "detail" in res.json()


def test_model_not_loaded_returns_503(client, monkeypatch):
    monkeypatch.setitem(client.app.state.models, "fsrs", None)
    res = post(client, [CARD_OLD])

    assert res.status_code == 503
    assert "detail" in res.json()


# --- /health ---------------------------------------------------------------


def test_health_ok_without_api_key(client):
    res = client.get("/health")
    body = res.json()

    assert res.status_code == 200
    assert body["status"] == "ok"
    assert body["models"] == ["fsrs"]
    assert body["model_version"] == "default-untrained"


def test_health_degraded_returns_503(client, monkeypatch):
    """Mo hinh khong nap duoc -> 503. Tra 200 la noi doi voi health check."""
    monkeypatch.setitem(client.app.state.models, "fsrs", None)
    res = client.get("/health")

    assert res.status_code == 503
    assert res.json()["status"] == "degraded"
    assert res.json()["models"] == []

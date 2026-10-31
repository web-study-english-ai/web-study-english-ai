"""Test POST /assistant/embed va anh huong cua embedder len /health (WSEA-111).

Dung mo hinh GIA (FakeModel) nen khong tai mang, khong nap sentence-transformers.
conftest.py dat EMBEDDER_ENABLED=false nen lifespan khong nap mo hinh that.
"""

import numpy as np
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services import embedder as emb
from app.services.embedder import Embedder
from tests.conftest import TEST_API_KEY
from tests.test_embedder import FakeModel

AUTH = {"x-api-key": TEST_API_KEY}
URL = "/assistant/embed"


@pytest.fixture
def fake():
    return FakeModel()


@pytest.fixture
def client(fake, monkeypatch):
    """TestClient co chay lifespan, roi gan Embedder gia; monkeypatch tu khoi phuc."""
    with TestClient(app) as c:
        monkeypatch.setitem(c.app.state.models, "embedder", Embedder(model=fake))
        yield c


def post(client, body, headers=AUTH):
    return client.post(URL, json=body, headers=headers)


# --- 200 ---------------------------------------------------------------------


def test_embed_returns_unit_vector_and_model_info(client):
    res = post(client, {"text": "khi nào dùng hiện tại hoàn thành"})

    assert res.status_code == 200
    body = res.json()
    assert len(body["embedding"]) == emb.DIM == 384
    assert np.linalg.norm(body["embedding"]) == pytest.approx(1.0, abs=1e-3)
    assert body["model"] == emb.MODEL_NAME
    assert body["revision"] == emb.MODEL_REVISION
    assert body["dim"] == emb.DIM
    assert "embed" in res.headers["server-timing"]


def test_model_receives_query_prefix_and_stripped_text(client, fake):
    post(client, {"text": "   so sánh hơn  "})
    assert fake.calls[-1]["texts"] == ["query: so sánh hơn"]


# --- 401 ---------------------------------------------------------------------


def test_missing_key_401(client):
    assert post(client, {"text": "a"}, headers={}).status_code == 401


def test_wrong_key_401(client):
    assert post(client, {"text": "a"}, headers={"x-api-key": "sai"}).status_code == 401


# --- 422 ---------------------------------------------------------------------


@pytest.mark.parametrize(
    "body",
    [
        {"text": ""},
        {"text": "    "},
        {"text": "a" * 1001},
        {"text": "a", "top_k": 5},
        {"Text": "a"},
        {"inputText": "a"},
    ],
    ids=["empty", "whitespace", "too-long", "extra-field", "wrong-case", "camelCase"],
)
def test_invalid_body_422(client, fake, body):
    assert post(client, body).status_code == 422
    assert fake.calls == []


def test_exactly_1000_chars_ok(client):
    assert post(client, {"text": "a" * 1000}).status_code == 200


# --- 503 / 500 ---------------------------------------------------------------


def test_embedder_none_503(client, monkeypatch):
    monkeypatch.setitem(client.app.state.models, "embedder", None)
    res = post(client, {"text": "a"})
    assert res.status_code == 503
    assert res.json()["detail"] == "Mo hinh embedding chua nap"


def test_bad_vector_500_without_traceback(client, monkeypatch):
    monkeypatch.setitem(client.app.state.models, "embedder", Embedder(model=FakeModel(nan=True)))
    res = post(client, {"text": "a"})
    assert res.status_code == 500
    assert "Traceback" not in res.text and "NaN" not in res.text


# --- /health -----------------------------------------------------------------


def test_health_ok_when_only_embedder_missing(client, monkeypatch):
    monkeypatch.setitem(client.app.state.models, "embedder", None)
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json()["status"] == "ok"
    assert res.json()["models"] == ["fsrs"]


def test_health_lists_embedder_when_loaded(client):
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json()["models"] == ["fsrs", "embedder"]


def test_health_degraded_when_fsrs_missing_even_with_embedder(client, monkeypatch):
    monkeypatch.setitem(client.app.state.models, "fsrs", None)
    res = client.get("/health")
    assert res.status_code == 503
    assert res.json()["status"] == "degraded"
    assert res.json()["models"] == ["embedder"]

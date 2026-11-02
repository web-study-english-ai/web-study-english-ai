"""Test POST /assistant/rank (WSEA-127) va /assistant/ask voi body v0.3.

Embedder GIA (FakeModel), bo y dinh GIA; khong nap torch.
"""

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services.embedder import Embedder
from tests.conftest import TEST_API_KEY
from tests.test_embedder import FakeModel
from tests.test_pipeline import FakeIntent, ctx, voc

AUTH = {"x-api-key": TEST_API_KEY}
URL = "/assistant/rank"


@pytest.fixture
def client(monkeypatch):
    with TestClient(app) as c:
        monkeypatch.setitem(c.app.state.models, "embedder", Embedder(model=FakeModel()))
        monkeypatch.setitem(c.app.state.models, "intent", FakeIntent())
        yield c


def body(**over):
    b = {"question": "khi nào dùng since", "contexts": [ctx(f"g{i}", 0.1 + 0.01 * i) for i in range(8)],
         "vocab": [voc("since", "exact", 0.0)], "history": []}
    b.update(over)
    return b


def post(client, b, headers=AUTH):
    return client.post(URL, json=b, headers=headers)


# --- 200 ---------------------------------------------------------------------------------------


def test_rank_200_schema(client):
    res = post(client, body())
    assert res.status_code == 200
    data = res.json()
    assert set(data) == {"decision", "reason", "intent", "contexts", "vocab"}
    assert (data["decision"], data["reason"]) == ("answer", "ok")
    assert data["intent"] == {"label": "ngu_phap", "confidence": 0.9}
    assert [c["id"] for c in data["contexts"]] == ["g0", "g1", "g2", "g3", "g4"]
    assert [c["rank"] for c in data["contexts"]] == [1, 2, 3, 4, 5]
    assert data["contexts"][0]["distance"] == pytest.approx(0.1)
    assert data["vocab"] == ["since"]
    assert "intent" in res.headers["server-timing"] and "select" in res.headers["server-timing"]


def test_rank_unsorted_contexts_accepted(client):
    res = post(client, body(contexts=[ctx("b", 0.2), ctx("a", 0.1)]))
    assert [c["id"] for c in res.json()["contexts"]] == ["a", "b"]


def test_rank_out_of_scope(client, monkeypatch):
    monkeypatch.setitem(client.app.state.models, "intent", FakeIntent("ngoai_pham_vi", 0.9))
    res = post(client, body(vocab=[]))
    assert res.json()["decision"] == "out_of_scope"
    assert res.json()["contexts"] == []


def test_rank_without_intent_model(client, monkeypatch):
    monkeypatch.setitem(client.app.state.models, "intent", None)
    data = post(client, body()).json()
    assert data["reason"] == "ok;intent_unavailable" and data["intent"] is None


# --- 401 / 422 / 503 / 500 ---------------------------------------------------------------------


def test_rank_401_without_key(client):
    assert post(client, body(), headers={}).status_code == 401


@pytest.mark.parametrize("b", [
    body(contexts=[ctx("g", 0.1), ctx("g", 0.2)]),
    body(contexts=[ctx("g", 3)]),
    {**body(), "top_k": 5},
    body(history=[{"role": "user", "content": "x"}] * 7),
    body(question="    "),
    body(contexts=[ctx(f"g{i}", 0.1) for i in range(21)]),
    body(vocab=[voc("a", "fuzzy")]),
    {k: v for k, v in body().items() if k != "contexts"},
], ids=["dup-id", "distance-3", "extra-field", "history-7", "blank-question", "contexts-21",
        "bad-match", "missing-contexts"])
def test_rank_422(client, b):
    assert post(client, b).status_code == 422


def test_rank_503_without_embedder(client, monkeypatch):
    monkeypatch.setitem(client.app.state.models, "embedder", None)
    res = post(client, body())
    assert res.status_code == 503
    assert res.json()["detail"] == "Mo hinh embedding chua nap"


def test_rank_500_on_bad_vector(client, monkeypatch):
    monkeypatch.setitem(client.app.state.models, "embedder", Embedder(model=FakeModel(nan=True)))
    res = post(client, body())
    assert res.status_code == 500
    assert "Traceback" not in res.text


# --- /health co intent (/ask JSON: tests/test_assistant_ask.py, SSE: tests/test_assistant_ask_sse.py) ---


def test_health_lists_intent_from_real_file():
    with TestClient(app) as c:  # lifespan nap that file app/resources/intent_e5_lr_v1.json
        assert c.app.state.models["intent"] is not None
        assert "intent" in c.get("/health").json()["models"]

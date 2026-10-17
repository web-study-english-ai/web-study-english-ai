"""Kiem thu bao mat khoa API noi bo giua cac dich vu (WSEA-94).

Ca thieu khoa / sai khoa / ten header cu cua /predict-retention da nam trong
test_retention_endpoint.py. File nay chi giu phan rieng cua WSEA-94: /health mo
cong khai, va moi router AI con lai deu bi khoa.
"""

import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.main import app
from tests.conftest import TEST_API_KEY

AUTH = {"x-api-key": TEST_API_KEY}
CARD_NEW = {"card_id": "card-123", "elapsed_days": 0.0, "rating": 3}


@pytest.fixture
def client():
    """Phai dung 'with' de lifespan chay -> app.state.models duoc nap."""
    with TestClient(app) as c:
        yield c


def test_health_endpoint_is_public(client):
    """Endpoint /health phai mo cong khai khong can API key (dung cho keep-alive)."""
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["service"] == settings.app_name


def test_missing_key_message_names_header(client):
    """Thong bao 401 phai chi dung ten header backend can gui."""
    response = client.post("/predict-retention", json={"cards": [CARD_NEW]})
    assert response.status_code == 401
    assert response.json()["detail"] == "Thieu header x-api-key"


def test_valid_key_passes_auth(client):
    """Dung khoa qua x-api-key phai vuot qua lop xac thuc va nhan ket qua that."""
    response = client.post(
        "/predict-retention",
        headers=AUTH,
        json={"cards": [CARD_NEW]},
    )
    assert response.status_code == 200


@pytest.mark.parametrize(
    "method, path",
    [("post", "/recognize/image"), ("post", "/assistant/ask")],
)
def test_other_ai_endpoints_require_auth(client, method, path):
    """Toan bo cac router AI con lai (/recognize, /assistant) deu duoc bao ve."""
    response = getattr(client, method)(path)
    assert response.status_code == 401

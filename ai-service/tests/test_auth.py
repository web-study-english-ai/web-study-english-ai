"""Kiem thu bao mat khoa API noi bo giua cac dich vu (WSEA-94)."""

import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.main import app

client = TestClient(app)


def test_health_endpoint_is_public():
    """Endpoint /health phai mo cong khai khong can API key (dung cho keep-alive)."""
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["service"] == settings.app_name


def test_predict_forgetting_missing_key_returns_401():
    """Goi endpoint AI khong truyen khoa noi bo phai bi chan voi 401 Unauthorized."""
    response = client.post("/predict/forgetting", json={"card_id": "test-card"})
    assert response.status_code == 401
    assert "Thieu header" in response.json()["detail"]


def test_predict_forgetting_wrong_key_returns_403():
    """Goi endpoint AI voi khoa sai phai bi chan voi 403 Forbidden."""
    headers = {"X-Internal-Api-Key": "sai-khoa-bao-mat-123456"}
    response = client.post(
        "/predict/forgetting",
        headers=headers,
        json={"card_id": "test-card"},
    )
    assert response.status_code == 403
    assert response.json()["detail"] == "Khoa API noi bo khong hop le"


def test_predict_forgetting_valid_internal_key_passes_auth():
    """Goi endpoint AI voi dung khoa noi bo phai vuot qua lop xac thuc (qua auth guard)."""
    headers = {"X-Internal-Api-Key": settings.internal_api_key}
    response = client.post(
        "/predict/forgetting",
        headers=headers,
        json={
            "user_card_id": "card-123",
            "elapsed_days": 3.0,
            "reps": 1,
            "lapses": 0,
            "difficulty": 5.0,
            "stability": 2.0,
        },
    )
    # Stub router tra ve 501 Not Implemented, chung to da vuot qua xac thuc 401/403 thanh cong
    assert response.status_code in (200, 501)
    assert response.status_code != 401
    assert response.status_code != 403


def test_legacy_x_api_key_header_passes_auth():
    """Header x-api-key theo hop dong API cu van phai duoc chap nhan."""
    headers = {"x-api-key": settings.internal_api_key}
    response = client.post(
        "/predict/forgetting",
        headers=headers,
        json={
            "user_card_id": "card-123",
            "elapsed_days": 3.0,
            "reps": 1,
            "lapses": 0,
            "difficulty": 5.0,
            "stability": 2.0,
        },
    )
    assert response.status_code in (200, 501)
    assert response.status_code != 401
    assert response.status_code != 403


def test_vision_and_rag_endpoints_require_auth():
    """Kiem tra toan bo cac router AI con lai (/recognize, /assistant) deu duoc bao ve."""
    # /recognize/image khong co key -> 401
    resp_vision = client.post("/recognize/image")
    assert resp_vision.status_code == 401

    # /assistant/ask khong co key -> 401
    resp_rag = client.post("/assistant/ask", json={"question": "hello"})
    assert resp_rag.status_code == 401

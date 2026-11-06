"""Test POST /recognize/image (WSEA-153) voi bo phan loai GIA. KHONG tai CLIP that."""

import io

import numpy as np
import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app.config import settings
from app.main import app
from app.vision import classifier as vc
from app.vision import preprocess as pp
from tests.conftest import TEST_API_KEY

AUTH = {"x-api-key": TEST_API_KEY}
URL = "/recognize/image"
WORDS = [f"w{i:02d}" for i in range(12)]


class FakeBackend:
    """Anh mau do -> truc 0 manh (tin cay cao); mau khac -> vector deu (tin cay thap)."""

    logit_scale = 100.0

    def encode_texts(self, texts):  # khong dung trong endpoint
        raise AssertionError("endpoint khong duoc encode text")

    def encode_image(self, image):
        r, g, b = image.getpixel((0, 0))
        v = np.full(len(WORDS), 0.01, dtype=np.float32)
        if (r, g, b) == (255, 0, 0):
            v[0] = 1.0
        return v


@pytest.fixture
def client(monkeypatch):
    with TestClient(app) as c:
        clf = vc.ZeroShotClassifier(FakeBackend(), WORDS, np.eye(len(WORDS), dtype=np.float32), logit_scale=5.0)
        monkeypatch.setitem(c.app.state.models, "vision", clf)
        yield c


def png(color=(255, 0, 0), size=(16, 16), fmt="PNG") -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", size, color).save(buf, format=fmt)
    return buf.getvalue()


def post(c, data, headers=AUTH, name="a.png", field="image"):
    return c.post(URL, files={field: (name, data, "image/png")}, headers=headers)


def test_ok_top10_high_confidence(client):
    res = post(client, png((255, 0, 0)))
    assert res.status_code == 200
    body = res.json()
    assert set(body) == {"labels", "low_confidence", "tau"}
    assert len(body["labels"]) == 10 and body["labels"][0]["word"] == "w00"
    scores = [x["score"] for x in body["labels"]]
    assert scores == sorted(scores, reverse=True) and all(0 <= s <= 1 for s in scores)
    assert body["low_confidence"] is False and body["tau"] == settings.vision_tau
    assert "vision;dur=" in res.headers["server-timing"]


def test_low_confidence_when_top1_below_tau(client):
    body = post(client, png((0, 0, 255))).json()  # vector deu -> top-1 ~ 1/12 < tau mac dinh
    assert body["labels"][0]["score"] < settings.vision_tau and body["low_confidence"] is True


def test_tau_read_from_config(client, monkeypatch):
    monkeypatch.setattr(settings, "vision_tau", 0.95)
    body = post(client, png((255, 0, 0))).json()
    assert body["tau"] == 0.95 and 0.5 < body["labels"][0]["score"] < 0.95 and body["low_confidence"] is True


def test_jpeg_accepted(client):
    assert post(client, png(fmt="JPEG"), name="a.jpg").status_code == 200


def test_not_image_422(client):
    res = post(client, b"khong phai anh")
    assert res.status_code == 422 and "not_image" in res.json()["detail"]


def test_too_large_413(client, monkeypatch):
    monkeypatch.setattr(pp, "MAX_BYTES", 100)
    res = post(client, png(size=(64, 64)))
    assert res.status_code == 413


def test_too_many_pixels_413(client, monkeypatch):
    monkeypatch.setattr(pp, "MAX_PIXELS", 10)
    assert post(client, png(size=(8, 8))).status_code == 413


def test_empty_file_422(client):
    res = post(client, b"")
    assert res.status_code == 422


def test_missing_file_422(client):
    assert client.post(URL, headers=AUTH).status_code == 422
    assert post(client, png(), field="file").status_code == 422  # sai ten truong


def test_missing_key_401(client):
    assert post(client, png(), headers={}).status_code == 401


def test_vision_not_loaded_503(client, monkeypatch):
    monkeypatch.setitem(client.app.state.models, "vision", None)
    res = post(client, png())
    assert res.status_code == 503 and "chua nap" in res.json()["detail"]


def test_health_lists_vision_only_when_loaded(client, monkeypatch):
    assert "vision" in client.get("/health").json()["models"]
    monkeypatch.setitem(client.app.state.models, "vision", None)
    assert "vision" not in client.get("/health").json()["models"]


def test_lifespan_skips_vision_when_disabled():
    with TestClient(app) as c:  # conftest dat VISION_ENABLED=false
        assert c.app.state.models["vision"] is None


def test_committed_label_vectors_match_labels():
    import csv
    words, vectors, man = vc.load_label_vectors()
    with (vc.RESOURCES.parents[1] / "kb" / "vision_labels.csv").open(encoding="utf-8") as f:
        assert words == [r["word"] for r in csv.DictReader(f)]
    assert vectors.shape == (449, 512) and man["revision"] == vc.MODEL_REVISION

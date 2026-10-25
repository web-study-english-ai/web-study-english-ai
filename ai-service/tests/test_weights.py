"""Test nap va kiem tra trong so tu HF Hub (WSEA-81).

Khong goi mang: cac ca 'hub' deu gia lap hf_hub_download bang file tam.
Trong tam la duong THAT BAI - do moi la thu quyet dinh dich vu bao hong ro rang
hay am tham phuc vu so lieu rac.
"""

import json
import logging
from types import SimpleNamespace

import pytest

from app.models import weights as wmod
from app.models.fsrs import DEFAULT_W, N_PARAMS, W_MAX, W_MIN
from app.models.weights import WeightsError, load_fsrs


class FakeSecret:
    def __init__(self, value):
        self._value = value

    def get_secret_value(self):
        return self._value


def make_settings(source="hub", token="hf_fake_token"):
    return SimpleNamespace(
        fsrs_weights_source=source,
        fsrs_weights_repo="Hieusss/wsea-fsrs-weights",
        fsrs_weights_file="params.json",
        fsrs_weights_revision="v1",
        hf_token=FakeSecret(token) if token else None,
    )


@pytest.fixture
def params_file(tmp_path):
    """Tra ve ham ghi params.json va gia lap hf_hub_download tro toi no."""

    def write(payload, monkeypatch):
        path = tmp_path / "params.json"
        path.write_text(json.dumps(payload), encoding="utf-8")
        monkeypatch.setattr(
            "huggingface_hub.hf_hub_download", lambda **kw: str(path)
        )
        return path

    return write


# --- Kiem tra 17 tham so ---------------------------------------------------


def test_validate_accepts_default_w():
    assert wmod._validate(list(DEFAULT_W)) == [float(x) for x in DEFAULT_W]


def test_validate_rejects_wrong_length():
    with pytest.raises(WeightsError, match=f"{N_PARAMS}"):
        wmod._validate(list(DEFAULT_W)[:-1])


def test_validate_rejects_non_list():
    with pytest.raises(WeightsError, match="list"):
        wmod._validate({"w0": 0.4})


def test_validate_rejects_missing_w():
    with pytest.raises(WeightsError):
        wmod._validate(None)


@pytest.mark.parametrize("bad", ["0.4", None, True, [0.4]])
def test_validate_rejects_non_numeric_entry(bad):
    w = list(DEFAULT_W)
    w[0] = bad
    with pytest.raises(WeightsError):
        wmod._validate(w)


@pytest.mark.parametrize("bad", [float("nan"), float("inf"), float("-inf")])
def test_validate_rejects_non_finite(bad):
    w = list(DEFAULT_W)
    w[0] = bad
    with pytest.raises(WeightsError):
        wmod._validate(w)


def test_validate_rejects_value_above_max():
    w = list(DEFAULT_W)
    w[4] = W_MAX[4] + 1
    with pytest.raises(WeightsError, match=r"ngoai mien"):
        wmod._validate(w)


def test_validate_rejects_value_below_min():
    w = list(DEFAULT_W)
    w[4] = W_MIN[4] - 1
    with pytest.raises(WeightsError, match=r"ngoai mien"):
        wmod._validate(w)


def test_validate_accepts_boundaries():
    """Dung bang bien la hop le - khong duoc loai oan."""
    assert wmod._validate(list(W_MIN)) == [float(x) for x in W_MIN]
    assert wmod._validate(list(W_MAX)) == [float(x) for x in W_MAX]


# --- source = default ------------------------------------------------------


def test_default_source_loads_untrained_model(caplog):
    with caplog.at_level(logging.WARNING):
        model, meta = load_fsrs(make_settings(source="default"))

    assert model is not None
    assert meta["version"] == "default-untrained"
    assert model.w.detach().tolist() == pytest.approx(DEFAULT_W, abs=1e-6)
    assert not model.training, "model phai o che do eval"
    # Phai canh bao to: trong so chua huan luyen ma lot len production la hong
    assert "MAC DINH" in caplog.text


# --- source = hub, duong thanh cong ---------------------------------------


def test_hub_source_loads_weights(monkeypatch, params_file):
    w = [round(x + 0.01, 4) for x in DEFAULT_W]
    params_file(
        {"version": "v1", "w": w, "epoch": 1, "val_log_loss": 0.451}, monkeypatch
    )

    model, meta = load_fsrs(make_settings())

    assert model is not None
    assert model.w.detach().tolist() == pytest.approx(w, abs=1e-5)
    assert meta["version"] == "v1"
    assert meta["source"] == "hub"
    assert meta["val_log_loss"] == 0.451
    assert not model.training


def test_hub_version_falls_back_to_revision(monkeypatch, params_file):
    params_file({"w": list(DEFAULT_W)}, monkeypatch)
    _, meta = load_fsrs(make_settings())
    assert meta["version"] == "v1"


def test_token_passed_directly_to_download(monkeypatch, params_file, tmp_path):
    """Token phai di thang vao hf_hub_download, khong trong vao login ngam.

    Da tung dinh 401/403 vi dieu nay (PROGRESS.md muc 7) - khoa lai bang test.
    """
    path = tmp_path / "params.json"
    path.write_text(json.dumps({"w": list(DEFAULT_W)}), encoding="utf-8")
    seen = {}

    def fake_download(**kwargs):
        seen.update(kwargs)
        return str(path)

    monkeypatch.setattr("huggingface_hub.hf_hub_download", fake_download)
    load_fsrs(make_settings(token="hf_token_that"))

    assert seen["token"] == "hf_token_that"
    assert seen["revision"] == "v1"
    assert seen["filename"] == "params.json"


# --- source = hub, duong that bai -----------------------------------------


def test_missing_token_returns_none(caplog):
    with caplog.at_level(logging.ERROR):
        model, meta = load_fsrs(make_settings(token=None))

    assert model is None
    assert meta["version"] is None
    assert "degraded" in caplog.text


def test_network_error_returns_none_not_raise(monkeypatch, caplog):
    """Loi mang KHONG duoc nem ra ngoai: lifespan nem thi Space crash-loop."""

    def boom(**kwargs):
        raise ConnectionError("mat mang")

    monkeypatch.setattr("huggingface_hub.hf_hub_download", boom)

    with caplog.at_level(logging.ERROR):
        model, meta = load_fsrs(make_settings())

    assert model is None
    assert meta["error"] == "ConnectionError"


def test_corrupt_json_returns_none(monkeypatch, tmp_path):
    path = tmp_path / "params.json"
    path.write_text("{khong phai json", encoding="utf-8")
    monkeypatch.setattr("huggingface_hub.hf_hub_download", lambda **kw: str(path))

    model, _ = load_fsrs(make_settings())
    assert model is None


def test_out_of_range_weights_return_none(monkeypatch, params_file, caplog):
    """Trong so ngoai mien -> tu choi nap, khong am tham roi ve DEFAULT_W."""
    w = list(DEFAULT_W)
    w[4] = 99.0  # W_MAX[4] = 10.0
    params_file({"version": "v9", "w": w}, monkeypatch)

    with caplog.at_level(logging.ERROR):
        model, meta = load_fsrs(make_settings())

    assert model is None
    assert meta["error"] == "WeightsError"


def test_failure_never_silently_uses_default_w(monkeypatch, params_file):
    """Ca quan trong nhat cua file: that bai phai la None, KHONG phai DEFAULT_W.

    Neu roi ve trong so mac dinh thi dich vu van tra 200 voi so lieu kem hon han
    ma khong ai phat hien - loi se song sot qua ca buoi bao ve.
    """
    params_file({"w": list(DEFAULT_W)[:5]}, monkeypatch)
    model, _ = load_fsrs(make_settings())
    assert model is None

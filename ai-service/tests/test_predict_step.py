"""Test ham suy luan mot buoc dung cho endpoint (WSEA-81).

Trong tam: predict_step va forward phai cho cung ket qua. forward la thu duoc
huan luyen va danh gia; neu endpoint tinh khac di thi so lieu trong bao cao
khong con noi gi ve thu dang chay tren production.
"""

import os
import subprocess
import sys
from pathlib import Path

import torch

from app.models.fsrs import DEFAULT_W, S_MAX, S_MIN, FSRSModel


def _predict(model, s, d, t, g, is_new=False, max_interval=S_MAX):
    """Goi predict_step cho mot the, tra ve 4 so Python cho de doc."""
    r, ns, nd, i = model.predict_step(
        stability=torch.tensor([s], dtype=torch.float32),
        difficulty=torch.tensor([d], dtype=torch.float32),
        elapsed_days=torch.tensor([t], dtype=torch.float32),
        rating=torch.tensor([g], dtype=torch.long),
        is_new=torch.tensor([is_new], dtype=torch.bool),
        max_interval=max_interval,
    )
    return r.item(), ns.item(), nd.item(), i.item()


# --- Dong bo voi vong huan luyen -------------------------------------------


def test_matches_forward_on_one_step():
    """Chuoi 2 luot: forward tra ve R cua luot 2; predict_step phai tra dung so do.

    Day la test quan trong nhat trong file. No khoa endpoint vao dung cong thuc
    ma mo hinh da duoc huan luyen, khong phai mot ban chep tay gan giong.
    """
    m = FSRSModel()
    ratings = torch.tensor([[3, 2]], dtype=torch.long)
    elapsed = torch.tensor([[0.0, 7.0]], dtype=torch.float32)
    mask = torch.ones(1, 2, dtype=torch.bool)

    preds, _ = m(ratings, elapsed, mask)

    # Luot 1 la the moi -> lay S0, D0 tu chinh predict_step
    _, s0, d0, _ = _predict(m, 0.0, 0.0, 0.0, 3, is_new=True)
    r2, _, _, _ = _predict(m, s0, d0, 7.0, 2)

    assert abs(r2 - preds[0].item()) < 1e-6


def test_new_card_init_matches_forward():
    """S0/D0 cua the moi phai trung voi cach forward khoi tao chuoi."""
    m = FSRSModel()
    for g in [1, 2, 3, 4]:
        _, s0, d0, _ = _predict(m, 0.0, 0.0, 0.0, g, is_new=True)
        gt = torch.tensor([g], dtype=torch.long)
        assert abs(s0 - m.init_stability(gt).item()) < 1e-6
        assert abs(d0 - m.init_difficulty(gt).item()) < 1e-6
        assert abs(s0 - DEFAULT_W[g - 1]) < 1e-6


def test_new_card_retrievability_is_nan():
    """The moi chua co lan on truoc -> R khong ton tai, tra NaN de router doi thanh null."""
    m = FSRSModel()
    r, _, _, _ = _predict(m, 0.0, 0.0, 0.0, 3, is_new=True)
    assert r != r  # NaN


# --- Huong bien thien ------------------------------------------------------


def test_stability_drops_on_lapse():
    m = FSRSModel()
    _, ns, _, _ = _predict(m, 50.0, 5.0, 10.0, 1)
    assert ns < 50.0


def test_stability_grows_on_success():
    m = FSRSModel()
    _, ns, _, _ = _predict(m, 50.0, 5.0, 10.0, 3)
    assert ns > 50.0


def test_easy_beats_hard():
    m = FSRSModel()
    _, _, _, i_hard = _predict(m, 20.0, 5.0, 10.0, 2)
    _, _, _, i_easy = _predict(m, 20.0, 5.0, 10.0, 4)
    assert i_easy > i_hard


# --- Khoang on -------------------------------------------------------------


def test_interval_approximates_stability():
    """Voi R_target = 0.9 thi I ~ S vi 0.9^(1/DECAY) - 1 = FACTOR."""
    m = FSRSModel()
    _, ns, _, interval = _predict(m, 20.0, 5.0, 10.0, 3)
    assert abs(interval - round(ns)) <= 1e-6


def test_interval_rounds_not_ceils():
    """S' = 1.1 phai ra 1 ngay, khong phai 2.

    ceil se cho 2 ngay, luc den han R ~ 0.84 - da tut duoi nguong 0.9 truoc khi
    nguoi hoc kip on. Sai theo huong on muon la nguoi hoc quen.
    """
    m = FSRSModel()
    interval = m.next_interval(torch.tensor([1.1])).round().clamp(1.0, S_MAX)
    assert interval.item() == 1.0


def test_interval_respects_max_interval():
    m = FSRSModel()
    _, _, _, interval = _predict(m, 30000.0, 5.0, 1.0, 4, max_interval=365)
    assert interval <= 365


def test_interval_never_below_one_day():
    m = FSRSModel()
    _, _, _, interval = _predict(m, S_MIN, 10.0, 10000.0, 1)
    assert interval >= 1


# --- Xu ly theo lo ---------------------------------------------------------


def test_batch_matches_individual_calls():
    """Lo lan the moi va the cu phai cho ket qua giong het khi chay rieng tung the.

    Day la ca de sai nhat: the moi khong co S/D that, neu gia tri giu cho lot vao
    phep tinh cua the cu thi ca lo hong ma khong bao loi.
    """
    m = FSRSModel()
    s = torch.tensor([12.5, 1.0, 300.0], dtype=torch.float32)
    d = torch.tensor([5.2, 5.0, 9.0], dtype=torch.float32)
    t = torch.tensor([3.0, 0.0, 120.0], dtype=torch.float32)
    g = torch.tensor([3, 3, 1], dtype=torch.long)
    new = torch.tensor([False, True, False], dtype=torch.bool)

    br, bs, bd, bi = m.predict_step(s, d, t, g, new)

    for k in range(3):
        r, ns, nd, i = _predict(
            m, s[k].item(), d[k].item(), t[k].item(), int(g[k]), bool(new[k])
        )
        if new[k]:
            assert br[k].item() != br[k].item()  # ca hai deu NaN
        else:
            assert abs(br[k].item() - r) < 1e-6
        assert abs(bs[k].item() - ns) < 1e-6
        assert abs(bd[k].item() - nd) < 1e-6
        assert abs(bi[k].item() - i) < 1e-6


def test_new_card_does_not_poison_batch():
    """The cu trong lo phai cho ket qua y het khi chay mot minh."""
    m = FSRSModel()
    alone = m.predict_step(
        torch.tensor([12.5]),
        torch.tensor([5.2]),
        torch.tensor([3.0]),
        torch.tensor([3]),
        torch.tensor([False]),
    )
    mixed = m.predict_step(
        torch.tensor([12.5, 1.0]),
        torch.tensor([5.2, 5.0]),
        torch.tensor([3.0, 0.0]),
        torch.tensor([3, 1]),
        torch.tensor([False, True]),
    )
    for a, b in zip(alone, mixed):
        assert abs(a[0].item() - b[0].item()) < 1e-6


# --- Bien va tinh huu han --------------------------------------------------


def test_outputs_finite_at_extremes():
    """Khong dau ra nao duoc NaN/Inf o cac gia tri bien (tru R cua the moi)."""
    m = FSRSModel()
    cases = [
        (S_MIN, 1.0, 0.0, 1),
        (S_MIN, 10.0, 36500.0, 1),
        (S_MAX, 1.0, 0.0, 4),
        (S_MAX, 10.0, 36500.0, 4),
        (12.5, 5.2, 0.0, 3),
    ]
    for s, d, t, g in cases:
        r, ns, nd, i = _predict(m, s, d, t, g)
        for name, value in [("R", r), ("S", ns), ("D", nd), ("I", i)]:
            assert value == value, f"{name} la NaN voi {(s, d, t, g)}"
            assert abs(value) != float("inf"), f"{name} la Inf voi {(s, d, t, g)}"
        # noi long theo epsilon cua float32: S_MIN = 0.01 khong bieu dien
        # chinh xac duoc, clamp tra 0.009999999776 chu khong phai 0.01 chan.
        eps = 1e-6
        assert 0.0 <= r <= 1.0
        assert S_MIN - eps <= ns <= S_MAX + eps
        assert 1.0 - eps <= nd <= 10.0 + eps


def test_retrievability_at_stability_is_target():
    """t = S thi R = 0.9 - dinh nghia cua do ben, kiem lai qua duong predict_step."""
    m = FSRSModel()
    r, _, _, _ = _predict(m, 10.0, 5.0, 10.0, 3)
    assert abs(r - 0.9) < 1e-6


# --- Rang buoc kien truc ---------------------------------------------------


def test_fsrs_importable_without_app_config():
    """app/models/fsrs.py khong duoc phu thuoc app.config.

    app.config doi INTERNAL_API_KEY ngay luc import. Neu fsrs.py keo no vao thi
    moi script huan luyen (chay khong co bien do) se vo. Day cung la ly do
    predict_step nhan max_interval lam tham so thay vi tu doc cau hinh.

    Chay trong tien trinh rieng, khong co bien moi truong nao cua pytest.
    """
    code = "import app.models.fsrs as m; assert m.FSRSModel() is not None; print('ok')"
    # Giu nguyen moi truong he thong (Windows can PATH/SYSTEMROOT de nap DLL cua
    # torch), chi bo dung bien ma app.config doi hoi.
    env = {k: v for k, v in os.environ.items() if k != "INTERNAL_API_KEY"}
    env["PYTHONPATH"] = str(Path(__file__).resolve().parents[1])
    proc = subprocess.run(
        [sys.executable, "-c", code],
        capture_output=True,
        text=True,
        env=env,
    )
    assert proc.returncode == 0, f"stderr: {proc.stderr}"

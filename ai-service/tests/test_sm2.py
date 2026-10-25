"""Kiem thu SM-2 (WSEA-67). Dac ta goc khong co vi du so nao nen gia tri tinh tay."""
import numpy as np

from evaluation.sm2 import sm2_predict, sm2_step


def run(qs):
    interval, reps, ef, out = 0, 0, 2.5, []
    for q in qs:
        interval, reps, ef = sm2_step(interval, reps, ef, q)
        out.append(interval)
    return out, ef


def test_good_three_times():
    # q=4: EF + (0.1 - 1*(0.08 + 0.02)) = EF, giu nguyen 2.5
    assert run([4, 4, 4]) == ([1, 6, 15], 2.5)


def test_easy_rounds_up():
    # EF 2.5 -> 2.6 -> 2.7; 6 * 2.7 = 16.2 -> lam tron LEN thanh 17 (round() se ra 16)
    assert run([5, 5, 5])[0] == [1, 6, 17]


def test_lapse_resets_and_keeps_ef():
    _, ef = run([5, 5, 5])
    assert sm2_step(17, 3, ef, 1) == (1, 0, ef)


def test_ef_floor():
    # moi lan Kho tru 0.14; sau 9 lan cham san 1.3 va dung o do
    assert run([3] * 10)[1] == 1.3


def test_prob_at_interval_is_09():
    # on dung sau 1 ngay = khoang cach SM-2 -> R = 0.9 theo dinh nghia do ben
    seq = {"ratings": np.array([3, 3]), "elapsed": np.array([0.0, 1.0])}
    assert abs(sm2_predict([seq])[0] - 0.9) < 1e-9


def test_predict_order_and_length():
    seqs = [
        {"ratings": np.array([3, 3, 1]), "elapsed": np.array([0.0, 1.0, 6.0])},
        {"ratings": np.array([1, 3]), "elapsed": np.array([0.0, 2.0])},
    ]
    p = sm2_predict(seqs)
    assert len(p) == 3                       # 2 mau chuoi dau + 1 mau chuoi sau
    assert abs(p[1] - 0.9) < 1e-9            # luot 3 chuoi dau: cach 6 ngay, khoang SM-2 = 6
    assert np.all((p > 0) & (p <= 1))
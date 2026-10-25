"""Doi chieu S, D, R tung buoc giua FSRSModel va py-fsrs ban FSRS 4.5.
Can: pip install fsrs==2.5.1  (chi cai tren may, KHONG dua vao requirements.txt)
Chay: python scripts/compare_pyfsrs.py
"""
import sys, pathlib
sys.path.append(str(pathlib.Path(__file__).resolve().parents[1]))

import math

import torch
from fsrs import FSRS

from app.models.fsrs import DEFAULT_W, FSRSModel

TOL = 1e-3

# 5 chuoi mau: (danh sach rating, danh sach so ngay troi qua)
CASES = [
    ([3, 3, 3, 3], [0, 5, 12, 30]),
    ([1, 3, 3, 4], [0, 1, 3, 10]),
    ([4, 4, 4], [0, 15, 45]),
    ([2, 2, 1, 3], [0, 2, 4, 1]),
    ([3, 1, 3, 3, 4], [0, 8, 1, 4, 15]),
]


def trace_ours(model, ratings, elapsed):
    g = torch.tensor(ratings)
    t = torch.tensor(elapsed, dtype=torch.float32)
    s = model.init_stability(g[0:1])
    d = model.init_difficulty(g[0:1])
    rows = [(float("nan"), s.item(), d.item())]
    for i in range(1, len(ratings)):
        r = model.retrievability(t[i:i + 1], s)
        gi = g[i:i + 1]
        s = torch.where(gi > 1,
                        model.stability_on_success(s, d, r, gi),
                        model.stability_on_lapse(s, d, r))
        d = model.next_difficulty(d, gi)
        rows.append((r.item(), s.item(), d.item()))
    return rows


def trace_ref(ref, ratings, elapsed):
    # goi thang cac ham cong thuc, bo qua may trang thai Learning/Review cua py-fsrs
    s = ref.init_stability(ratings[0])
    d = ref.init_difficulty(ratings[0])
    rows = [(float("nan"), s, d)]
    for i in range(1, len(ratings)):
        r = ref.forgetting_curve(elapsed[i], s)
        if ratings[i] > 1:
            s_next = ref.next_recall_stability(d, s, r, ratings[i])
        else:
            s_next = ref.next_forget_stability(d, s, r)
        d = ref.next_difficulty(d, ratings[i])
        s = s_next
        rows.append((r, s, d))
    return rows


def close(a, b):
    return (math.isnan(a) and math.isnan(b)) or abs(a - b) <= TOL * max(1.0, abs(b))


if __name__ == "__main__":
    m = FSRSModel()
    ref = FSRS(w=tuple(DEFAULT_W))   # cung bo w cho ca hai ben
    n_diff = 0
    with torch.no_grad():
        for idx, (ratings, elapsed) in enumerate(CASES, 1):
            print(f"\n=== Chuoi {idx}: ratings={ratings} elapsed={elapsed}")
            print(f"{'buoc':>4} {'G':>2} | {'R ta':>7} {'R ref':>7} | "
                  f"{'S ta':>9} {'S ref':>9} | {'D ta':>6} {'D ref':>6}")
            ours, theirs = trace_ours(m, ratings, elapsed), trace_ref(ref, ratings, elapsed)
            for i, ((r1, s1, d1), (r2, s2, d2)) in enumerate(zip(ours, theirs)):
                ok = close(r1, r2) and close(s1, s2) and close(d1, d2)
                n_diff += not ok
                flag = "" if ok else "  <-- LECH"
                print(f"{i:>4} {ratings[i]:>2} | {r1:>7.4f} {r2:>7.4f} | "
                      f"{s1:>9.4f} {s2:>9.4f} | {d1:>6.3f} {d2:>6.3f}{flag}")
    print(f"\nTong so buoc lech (tol={TOL}): {n_diff}")

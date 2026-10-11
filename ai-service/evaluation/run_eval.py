"""Danh gia mo hinh du bao quen tren TAP KIEM TRA (WSEA-67).

Chay tu thu muc ai-service:
    python -m evaluation.run_eval

So sanh 3 mo hinh tren CUNG mot bang mau, cung thu tu:
  1. Du doan hang so - ty le nho trung binh cua tap huan luyen (muc san)
  2. SM-2            - duong co so co dien, quy doi khoang cach -> xac suat
  3. DSR v1          - trong so dang chay tren endpoint (runs/final_lr004/params.json)

Chi so tinh bang training/metrics.py - cung cach tinh voi so lieu val luc huan luyen.

QUY TAC 2: day la lan DUY NHAT cham mo hinh tren tap test. Sau khi chay,
khong duoc chinh DSR dua tren cac con so nay.
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd
import torch

from app.models.fsrs import FSRSModel
from evaluation.sm2 import sm2_predict
from training.config import TrainConfig, set_seed
from training.dataset import collate_sequences, load_sequences, split_by_user
from training.metrics import all_metrics

RUN_DIR = Path("runs/final_lr004")
TEST_PATH = "data/processed/sequences_test.parquet"
MODELS = ["const", "sm2", "dsr"]


# ----------------------------------------------------------------------------
# Bang mau chung
# ----------------------------------------------------------------------------
def build_samples(seqs: list[dict]) -> pd.DataFrame:
    """Moi dong = mot luot on can du doan (tu luot thu 2 cua moi the).

    Thu tu: het chuoi 0 roi toi chuoi 1..., trong moi chuoi theo vi tri.
    MOI mo hinh phai tra du doan dung thu tu nay.
    """
    rows = []
    for k, s in enumerate(seqs):
        r, e = s["ratings"], s["elapsed"]
        for i in range(1, len(r)):
            rows.append((k, str(s["user_id"]), i, float(e[i]), int(r[i] > 1)))
    return pd.DataFrame(rows, columns=["seq", "user_id", "pos", "elapsed", "y"])


# ----------------------------------------------------------------------------
# Du doan DSR theo dung thu tu bang mau
# ----------------------------------------------------------------------------
@torch.no_grad()
def dsr_predict(model: FSRSModel, seqs: list[dict], batch_size: int = 2048) -> tuple[np.ndarray, np.ndarray]:
    """Goi CHINH model.forward (khong chep lai cong thuc) roi sap lai thu tu.

    forward() duyet theo VI TRI: voi i = 1, 2, ... no noi du doan cua ca lo tai
    vi tri i. Tuc la thu tu dau ra la "vi tri truoc, chuoi sau". Bang mau can
    "chuoi truoc, vi tri sau". Ham nay dat tung du doan vao dung o (chuoi, vi tri)
    roi doc ra theo thu tu bang mau.
    """
    model.eval()
    ps, ys = [], []
    for start in range(0, len(seqs), batch_size):
        batch = [
            (torch.as_tensor(s["ratings"], dtype=torch.long), torch.as_tensor(s["elapsed"], dtype=torch.float32))
            for s in seqs[start : start + batch_size]
        ]
        ratings, elapsed, mask = collate_sequences(batch)
        preds, labels = model(ratings, elapsed, mask)

        m = mask[:, 1:]
        # vi tri (i, b) cua tung du doan, theo dung thu tu forward() tao ra: i truoc, b sau
        ii, bb = torch.nonzero(m.T, as_tuple=True)
        P = torch.full(m.shape, float("nan"))
        Y = torch.full(m.shape, float("nan"))
        P[bb, ii] = preds
        Y[bb, ii] = labels
        ps.append(P[m].numpy())  # doc theo hang = chuoi truoc, vi tri sau = thu tu bang mau
        ys.append(Y[m].numpy())
    return np.concatenate(ps).astype(np.float64), np.concatenate(ys)


# ----------------------------------------------------------------------------
# Kiem tra "ong do" tren tap val truoc khi dung tap test
# ----------------------------------------------------------------------------
def check_on_val(model: FSRSModel, val: list[dict]) -> None:
    """Chay DSR tren tap VAL (da biet dap an trong report.json).

    Neu ra dung log-loss luc huan luyen thi: trong so dung, dsr_predict dung,
    cach tinh chi so dung. Chi khi do moi duoc dem sang tap test.
    """
    p, y = dsr_predict(model, val)
    got = all_metrics(p, y)
    want = json.loads((RUN_DIR / "report.json").read_text(encoding="utf-8"))["val_metrics"]
    print(f"[val] log-loss {got['log_loss']:.6f} (report.json {want['log_loss']:.6f})")
    assert got["n"] == want["n"], "So mau val lech report.json"
    assert abs(got["log_loss"] - want["log_loss"]) < 1e-6, "DSR tren val lech report.json -> dung lai"
    assert abs(got["auc"] - want["auc"]) < 1e-6, "AUC tren val lech report.json -> dung lai"


# ----------------------------------------------------------------------------
# Du doan cua ca 3 mo hinh tren tap test
# ----------------------------------------------------------------------------
def predict_all(model: FSRSModel, train: list[dict], test: list[dict]) -> tuple[pd.DataFrame, float]:
    df = build_samples(test)
    y = df.y.to_numpy(dtype=np.float64)

    # 1. hang so: ty le nho cua TAP TRAIN (khong lay cua test - do la nhin trom dap an)
    p0 = float(np.mean(np.concatenate([s["ratings"][1:] > 1 for s in train])))
    df["p_const"] = p0

    # 2. SM-2
    df["p_sm2"] = sm2_predict(test)

    # 3. DSR v1
    p_dsr, y_dsr = dsr_predict(model, test)
    assert np.array_equal(y_dsr, y), "Nhan cua DSR lech bang mau -> sai thu tu"
    df["p_dsr"] = p_dsr

    for k in MODELS:
        p = df[f"p_{k}"].to_numpy()
        assert len(p) == len(df), f"{k}: so du doan khac so mau"
        assert np.isfinite(p).all() and (p > 0).all() and (p <= 1).all(), f"{k}: du doan ngoai (0, 1]"
    return df, p0


# ----------------------------------------------------------------------------
def main() -> None:
    cfg = TrainConfig.load(RUN_DIR / "config.json")
    set_seed(cfg.seed)

    all_train = load_sequences(cfg.data_path, cfg.min_len, cfg.max_len)
    train, val = split_by_user(all_train, cfg.val_ratio, cfg.seed)
    test = load_sequences(TEST_PATH, cfg.min_len, cfg.max_len)
    assert not ({str(s["user_id"]) for s in train} & {str(s["user_id"]) for s in test}), "Ro ri train/test"

    # Dung DUNG trong so dang chay tren endpoint
    params = json.loads((RUN_DIR / "params.json").read_text(encoding="utf-8"))
    model = FSRSModel(w=params["w"])

    check_on_val(model, val)
    df, p0 = predict_all(model, train, test)
    print(f"[test] {df.user_id.nunique()} nguoi | {len(df):,} mau | p0 = {p0:.4f}")
    print("Buoc 3 OK: 3 mo hinh, cung so mau, cung thu tu. Chua tinh chi so tren test.")


if __name__ == "__main__":
    main()
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
from datetime import date
from pathlib import Path

import numpy as np
import pandas as pd
import torch

from app.models.fsrs import FSRSModel
from evaluation.sm2 import sm2_predict
from training.config import TrainConfig, set_seed
from training.dataset import collate_sequences, load_sequences, split_by_user
from training.metrics import EPS, all_metrics, calibration_table

RUN_DIR = Path("runs/final_lr004")
TEST_PATH = "data/processed/sequences_test.parquet"
OUT_DIR = Path("outputs/eval")
N_BOOT = 1000
MODELS = ["const", "sm2", "dsr"]
NAMES = {"const": "Du doan hang so", "sm2": "SM-2 quy doi xac suat", "dsr": "DSR v1 (nhom huan luyen)"}


# ----------------------------------------------------------------------------
# Bang mau chung
# ----------------------------------------------------------------------------
# ----------------------------------------------------------------------------
# Thong ke (Buoc 4)
# ----------------------------------------------------------------------------
def sample_logloss(p: np.ndarray, y: np.ndarray) -> np.ndarray:
    """Muc phat log-loss cua TUNG luot on (trung binh cua cot nay = log-loss)."""
    p = np.clip(p, EPS, 1 - EPS)
    return -(y * np.log(p) + (1 - y) * np.log(1 - p))


def bootstrap_by_user(df: pd.DataFrame, a: str, b: str, seed: int) -> dict:
    """Khoang tin cay 95% cho chenh log-loss (a - b), lay mau lai THEO NGUOI DUNG.

    Vi sao theo nguoi dung: cac luot on cua cung mot nguoi khong doc lap. Lay mau
    lai tung luot se cho khoang tin cay hep gia tao.
    """
    g = df.groupby("user_id").agg(sa=(f"ll_{a}", "sum"), sb=(f"ll_{b}", "sum"), n=("y", "size"))
    rng = np.random.default_rng(seed)
    idx = rng.integers(0, len(g), size=(N_BOOT, len(g)))  # moi hang = 1 lan boc lai 60 nguoi co hoan lai
    sa, sb, n = g.sa.to_numpy()[idx].sum(1), g.sb.to_numpy()[idx].sum(1), g.n.to_numpy()[idx].sum(1)
    diff = (sa - sb) / n
    point = (g.sa.sum() - g.sb.sum()) / g.n.sum()
    lo, hi = np.percentile(diff, [2.5, 97.5])
    return {"diff": float(point), "ci95": [float(lo), float(hi)], "n_users": int(len(g))}


def group_table(df: pd.DataFrame, col: str, bins: list[float], labels: list[str]) -> pd.DataFrame:
    """Log-loss tung mo hinh theo nhom - nguon cho phan tich loi (Buoc 5)."""
    key = pd.cut(df[col], bins=bins, labels=labels)
    out = df.groupby(key, observed=False).agg(
        n=("y", "size"),
        ty_le_nho=("y", "mean"),
        p_dsr=("p_dsr", "mean"),
        p_sm2=("p_sm2", "mean"),
        ll_const=("ll_const", "mean"),
        ll_sm2=("ll_sm2", "mean"),
        ll_dsr=("ll_dsr", "mean"),
    )
    return out.round(4)


# ----------------------------------------------------------------------------
# Xuat ket qua (Buoc 4)
# ----------------------------------------------------------------------------
def plot_calibration(cal: dict[str, list[dict]], path: Path) -> None:
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    style = {  # mau co dinh cho tung mo hinh + hinh dau rieng de khong phu thuoc mau
        "dsr": ("#2a78d6", "o"),
        "sm2": ("#eb6834", "s"),
        "const": ("#1baf7a", "^"),
    }
    fig, ax = plt.subplots(figsize=(6, 6))
    ax.plot([0, 1], [0, 1], "--", color="#8a8a85", linewidth=1, label="Ly tuong")
    for k in ["dsr", "sm2", "const"]:
        rows = [r for r in cal[k] if r["n"] > 0]
        color, marker = style[k]
        ax.plot(
            [r["p_mean"] for r in rows], [r["y_rate"] for r in rows],
            marker=marker, markersize=7, linewidth=2, color=color, label=NAMES[k],
        )
    ax.set_xlim(0, 1)
    ax.set_ylim(0, 1)
    ax.set_xlabel("Xac suat nho du doan (trung binh moi nhom)")
    ax.set_ylabel("Ty le nho thuc te")
    ax.set_title("Bieu do hieu chinh tren tap kiem tra")
    ax.grid(color="#e5e4df", linewidth=0.8)
    ax.legend(loc="upper left", frameon=False)
    fig.tight_layout()
    fig.savefig(path, dpi=150)
    plt.close(fig)


def md_table(t: pd.DataFrame) -> str:
    """Bang markdown, khong can thu vien tabulate (khong them phu thuoc moi)."""
    cols = [t.index.name or ""] + list(t.columns)
    rows = ["| " + " | ".join(cols) + " |", "|" + "---|" * len(cols)]
    for idx, r in t.iterrows():
        rows.append("| " + " | ".join([str(idx)] + [f"{v:g}" for v in r.to_numpy()]) + " |")
    return "\n".join(rows)


def write_report(res: dict, boot: dict, by_pos: pd.DataFrame, by_el: pd.DataFrame, info: dict, path: Path) -> None:
    lines = [
        f"# Danh gia du bao quen tren tap kiem tra - {info['date']}",
        "",
        f"Tap kiem tra: {info['n_users']} nguoi dung, {info['n_samples']:,} luot on, "
        f"ty le nho thuc te {info['base_rate']:.4f}. Trong so DSR: `{info['weights']}`.",
        "",
        "| Mo hinh | Log-loss | RMSE nhom | AUC |",
        "|---|---|---|---|",
    ]
    for k in MODELS:
        m = res[k]
        lines.append(f"| {NAMES[k]} | {m['log_loss']:.4f} | {m['rmse_bins']:.4f} | {m['auc']:.4f} |")
    lines += ["", "Chenh log-loss, khoang tin cay 95% lay mau lai theo nguoi dung (am = DSR tot hon):", ""]
    for name, b in boot.items():
        lines.append(f"- {name}: {b['diff']:+.4f} [{b['ci95'][0]:+.4f}, {b['ci95'][1]:+.4f}]")
    lines += ["", "## Theo so lan on truoc do", "", md_table(by_pos), "",
              "## Theo so ngay tu lan on truoc", "", md_table(by_el), ""]
    path.write_text("\n".join(lines), encoding="utf-8")


def evaluate_and_save(df: pd.DataFrame, p0: float, params: dict, seed: int) -> None:
    """Buoc 4: tinh chi so, khoang tin cay, bang nhom, ve bieu do, ghi ra outputs/eval/."""
    y = df.y.to_numpy(dtype=np.float64)
    for k in MODELS:
        df[f"ll_{k}"] = sample_logloss(df[f"p_{k}"].to_numpy(), y)

    res = {k: all_metrics(df[f"p_{k}"].to_numpy(), y) for k in MODELS}
    cal = {k: calibration_table(df[f"p_{k}"].to_numpy(), y) for k in MODELS}
    boot = {
        "DSR - SM-2": bootstrap_by_user(df, "dsr", "sm2", seed),
        "DSR - hang so": bootstrap_by_user(df, "dsr", "const", seed),
    }
    by_pos = group_table(df, "pos", [0, 1, 2, 5, 10, np.inf], ["1", "2", "3-5", "6-10", "11+"])
    by_el = group_table(df, "elapsed", [0, 1, 7, 30, 90, np.inf], ["1", "2-7", "8-30", "31-90", "91+"])

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    info = {
        "date": date.today().isoformat(),
        "task": "WSEA-67",
        "seed": seed,
        "weights": f"{(RUN_DIR / 'params.json').as_posix()} (version {params.get('version')})",
        "test_path": TEST_PATH,
        "n_users": int(df.user_id.nunique()),
        "n_samples": int(len(df)),
        "base_rate": float(y.mean()),
        "const_p0_from_train": p0,
        "sm2_conversion": "khoang cach SM-2 coi la do ben S, R = (1 + 19/81 * t / S) ^ -0.5",
        "sm2_quality_map": {"1": 1, "2": 3, "3": 4, "4": 5},
        "n_boot": N_BOOT,
    }
    (OUT_DIR / "retention_metrics.json").write_text(
        json.dumps({"info": info, "metrics": res, "bootstrap": boot, "calibration": cal}, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )
    plot_calibration(cal, OUT_DIR / "calibration.png")
    write_report(res, boot, by_pos, by_el, info, OUT_DIR / "retention_report.md")

    print(f"\nTap test: {info['n_users']} nguoi | {info['n_samples']:,} mau | ty le nho {info['base_rate']:.4f}\n")
    print(f"{'Mo hinh':28s} {'log-loss':>9s} {'rmse':>7s} {'auc':>7s}")
    for k in MODELS:
        m = res[k]
        print(f"{NAMES[k]:28s} {m['log_loss']:9.4f} {m['rmse_bins']:7.4f} {m['auc']:7.4f}")
    for name, b in boot.items():
        print(f"{name}: {b['diff']:+.4f}  CI95 [{b['ci95'][0]:+.4f}, {b['ci95'][1]:+.4f}]")
    print(f"\nDa ghi: {OUT_DIR.as_posix()}/retention_report.md, retention_metrics.json, calibration.png")
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
    evaluate_and_save(df, p0, params, cfg.seed)


if __name__ == "__main__":
    main()
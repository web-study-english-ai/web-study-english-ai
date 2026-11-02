"""Huan luyen va danh gia bo phan loai y dinh (WSEA-125 phan 1). CHUA xuat mo hinh.

    .\\.venv\\Scripts\\python.exe scripts\\train_intent.py

Dau vao: kb/intent/intent_train.csv, intent_test.csv (id,text,label,lang,author,note), label_map.json.
Hai bo dac trung:
    A = vector e5 (app.services.embedder, tien to "query: ", L2) — cache data/intent_vectors.npz
    B = TF-IDF char_wb 2-5, fit TRONG tung gap (Pipeline)
Mo hinh: LogisticRegression(class_weight="balanced"), quet C bang StratifiedKFold(5) CHI tren train.
Luat chon (chot truoc khi chay): C tot nhat moi ben theo macro-F1; chon A tru khi F1(B) - F1(A) > 0.03.
Nguong tau cho ngoai_pham_vi lay tu cross_val_predict tren train.
Tap test chi duoc cham MOT LAN, sau khi da chon mo hinh va tau.

Dau ra: docs/eval/intent_report.json + bang tom tat in ra man hinh.
Ma thoat: 0 ok · 1 du lieu sai.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.services import embedder as emb  # noqa: E402

SEED = 125
N_FOLDS = 5
CS = (0.1, 0.3, 1, 3, 10)
B_MARGIN = 0.03  # B phai hon A qua muc nay moi duoc chon
OOP = "ngoai_pham_vi"
TAU_GRID = tuple(round(0.30 + 0.05 * i, 2) for i in range(14))  # 0.30 -> 0.95
TAU_TARGET_PRECISION = 0.95
COLUMNS = ("id", "text", "label", "lang", "author", "note")
KINDS = {"A": "e5 + LogisticRegression", "B": "TF-IDF char_wb(2,5) + LogisticRegression"}

INTENT_DIR = ROOT / "kb" / "intent"
DEFAULT_CACHE = ROOT / "data" / "intent_vectors.npz"
DEFAULT_OUT = ROOT / "docs" / "eval" / "intent_report.json"
DEFAULT_EXPORT = ROOT / "app" / "resources" / "intent_e5_lr_v1.json"
# Ket qua phan 1 da chot (docs/eval/intent_report.json). --export chi xuat dung mo hinh nay.
EXPORT_KIND, EXPORT_C, EXPORT_TAU = "A", 3, 0.40


class DataError(Exception):
    def __init__(self, errors: list[str]):
        super().__init__("\n".join(errors))
        self.errors = errors


# --- Du lieu --------------------------------------------------------------------------------


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def read_csv(path: Path) -> list[dict]:
    with path.open(encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        missing = [c for c in COLUMNS if c not in (reader.fieldnames or [])]
        if missing:
            raise DataError([f"{path.name}: thiếu cột {', '.join(missing)}"])
        return list(reader)


def load_labels(path: Path) -> list[str]:
    """Thu tu nhan theo gia tri trong label_map.json (0..n-1)."""
    mapping = json.loads(path.read_text(encoding="utf-8"))
    labels = [lb for lb, _ in sorted(mapping.items(), key=lambda kv: kv[1])]
    if sorted(mapping.values()) != list(range(len(labels))):
        raise DataError([f"{path.name}: giá trị phải là 0..{len(labels) - 1}"])
    if OOP not in labels:
        raise DataError([f"{path.name}: thiếu nhãn {OOP}"])
    return labels


def check_data(train: list[dict], test: list[dict], labels: list[str]) -> None:
    errors = []
    for name, rows in (("train", train), ("test", test)):
        if not rows:
            errors.append(f"{name}: rỗng")
        ids = Counter(r["id"] for r in rows)
        errors += [f"{name}: id '{i}' lặp {n} lần" for i, n in ids.items() if n > 1]
        errors += [f"{name} {r['id']}: nhãn '{r['label']}' không có trong label_map" for r in rows
                   if r["label"] not in labels]
        errors += [f"{name} {r['id']}: câu rỗng" for r in rows if not r["text"].strip()]
    overlap = sorted({r["id"] for r in train} & {r["id"] for r in test})
    if overlap:
        errors.append(f"id trùng giữa train và test: {', '.join(overlap)}")
    small = [lb for lb in labels if sum(r["label"] == lb for r in train) < N_FOLDS]
    if small:
        errors.append(f"train: nhãn {', '.join(small)} có ít hơn {N_FOLDS} câu, không chia được {N_FOLDS} gập")
    if errors:
        raise DataError(errors)


def label_counts(rows: list[dict], labels: list[str]) -> dict:
    c = Counter(r["label"] for r in rows)
    return {lb: c.get(lb, 0) for lb in labels}


# --- Dac trung A: vector e5 co cache ---------------------------------------------------------


def cache_meta(train_csv: Path, test_csv: Path) -> dict:
    return {"train_sha256": sha256(train_csv), "test_sha256": sha256(test_csv), "embedder": emb.model_info()}


def load_cache(path: Path, meta: dict, n_train: int, n_test: int):
    """Tra (train_vecs, test_vecs) neu cache khop csv + mo hinh, nguoc lai None."""
    if not path.exists():
        return None
    try:
        with np.load(path, allow_pickle=False) as z:
            old = json.loads(str(z["meta"]))
            tr, te = z["train"], z["test"]
    except (OSError, KeyError, ValueError):
        return None
    if old != meta or tr.shape[0] != n_train or te.shape[0] != n_test:
        return None
    emb.check_vectors(tr, n_train)
    emb.check_vectors(te, n_test)
    return tr, te


def e5_vectors(train: list[dict], test: list[dict], meta: dict, cache: Path, embedder_factory):
    """Vector e5 cho train + test. Tinh lai khi csv hoac mo hinh doi. Tra (tr, te, tu_cache)."""
    hit = load_cache(cache, meta, len(train), len(test))
    if hit is not None:
        return hit[0], hit[1], True
    vecs = embedder_factory().encode_queries([r["text"] for r in train + test])
    emb.check_vectors(vecs, len(train) + len(test))
    tr, te = vecs[: len(train)], vecs[len(train):]
    cache.parent.mkdir(parents=True, exist_ok=True)
    np.savez(cache, train=tr, test=te, meta=np.array(json.dumps(meta, sort_keys=True)))
    return tr, te, False


# --- Mo hinh va kiem tra cheo ----------------------------------------------------------------


def make_model(kind: str, c: float):
    from sklearn.feature_extraction.text import TfidfVectorizer
    from sklearn.linear_model import LogisticRegression
    from sklearn.pipeline import make_pipeline

    lr = LogisticRegression(C=c, class_weight="balanced", max_iter=5000)
    if kind == "A":
        return lr
    # Pipeline -> TF-IDF chi fit tren phan train cua moi gap, khong ro tu vung cua gap kiem.
    return make_pipeline(TfidfVectorizer(analyzer="char_wb", ngram_range=(2, 5), sublinear_tf=True), lr)


def folds():
    from sklearn.model_selection import StratifiedKFold

    return StratifiedKFold(N_FOLDS, shuffle=True, random_state=SEED)


def run_cv(features: dict, y: np.ndarray) -> list[dict]:
    """features = {"A": ma tran train, "B": mang van ban train}. Chi nhan du lieu TRAIN."""
    from sklearn.model_selection import cross_validate

    table = []
    for kind, X in features.items():
        for c in CS:
            s = cross_validate(make_model(kind, c), X, y, cv=folds(), scoring=("accuracy", "f1_macro"))
            table.append({
                "features": kind, "C": c,
                "accuracy_mean": round(float(s["test_accuracy"].mean()), 4),
                "accuracy_std": round(float(s["test_accuracy"].std()), 4),
                "macro_f1_mean": round(float(s["test_f1_macro"].mean()), 4),
                "macro_f1_std": round(float(s["test_f1_macro"].std()), 4),
            })
    return table


def best_of(table: list[dict], kind: str) -> dict:
    """macro-F1 cao nhat; hoa thi std nho hon, roi C nho hon (mo hinh don gian hon)."""
    rows = [r for r in table if r["features"] == kind]
    return min(rows, key=lambda r: (-r["macro_f1_mean"], r["macro_f1_std"], r["C"]))


def select_model(table: list[dict], margin: float = B_MARGIN) -> dict:
    a, b = best_of(table, "A"), best_of(table, "B")
    gap = round(b["macro_f1_mean"] - a["macro_f1_mean"], 4)
    chosen = "B" if gap > margin else "A"
    return {
        "rule": f"C tốt nhất mỗi bên theo macro-F1 CV; chọn A trừ khi macro-F1(B) − macro-F1(A) > {margin}",
        "best": {"A": a, "B": b},
        "f1_gap_b_minus_a": gap,
        "chosen": chosen,
        "chosen_C": (a if chosen == "A" else b)["C"],
        "other": "B" if chosen == "A" else "A",
        "other_C": (b if chosen == "A" else a)["C"],
    }


# --- Nguong tau ------------------------------------------------------------------------------


def block_mask(proba: np.ndarray, classes: list[str], tau: float) -> np.ndarray:
    """Luat chan som: doan ngoai_pham_vi VA p(ngoai_pham_vi) >= tau."""
    k = classes.index(OOP)
    return (proba.argmax(axis=1) == k) & (proba[:, k] >= tau)


def block_stats(blocked: np.ndarray, y: np.ndarray) -> dict:
    truth = y == OOP
    n_block = int(blocked.sum())
    tp = int((blocked & truth).sum())
    return {
        "n_blocked": n_block,
        "precision": round(tp / n_block, 4) if n_block else None,
        "recall": round(tp / int(truth.sum()), 4) if truth.any() else None,
    }


def choose_tau(proba: np.ndarray, classes: list[str], y: np.ndarray,
               grid=TAU_GRID, target: float = TAU_TARGET_PRECISION) -> dict:
    """tau = nguong NHO nhat trong luoi co precision >= target. Khong dat -> tau None."""
    table = [{"tau": t, **block_stats(block_mask(proba, classes, t), y)} for t in grid]
    ok = [r for r in table if r["precision"] is not None and r["precision"] >= target]
    best = ok[0] if ok else None
    return {
        "rule": f"τ nhỏ nhất trong lưới {grid[0]}–{grid[-1]} có precision({OOP}) ≥ {target} trên cross_val_predict(train)",
        "target_precision": target,
        "tau": best["tau"] if best else None,
        "precision_at_tau": best["precision"] if best else None,
        "recall_at_tau": best["recall"] if best else None,
        "reached": best is not None,
        "grid": table,
    }


def oof_proba(kind: str, c: float, X, y: np.ndarray):
    from sklearn.model_selection import cross_val_predict

    proba = cross_val_predict(make_model(kind, c), X, y, cv=folds(), method="predict_proba")
    return proba, sorted(set(y))  # cot predict_proba theo thu tu np.unique(y)


# --- Danh gia tren test (chay sau khi da chon) -----------------------------------------------


def evaluate_test(kind: str, c: float, X_train, y_train, X_test, test: list[dict], labels: list[str],
                  tau: float | None = None, detail: bool = True) -> dict:
    from sklearn.metrics import accuracy_score, classification_report, confusion_matrix, f1_score

    model = make_model(kind, c).fit(X_train, y_train)
    classes = list(model.classes_)
    proba = model.predict_proba(X_test)
    pred = np.array(classes)[proba.argmax(axis=1)]
    y = np.array([r["label"] for r in test])
    report = classification_report(y, pred, labels=labels, output_dict=True, zero_division=0)
    matrix = confusion_matrix(y, pred, labels=labels).tolist()
    out = {
        "features": kind, "C": c, "n": len(test),
        "accuracy": round(float(accuracy_score(y, pred)), 4),
        "macro_f1": round(float(f1_score(y, pred, labels=labels, average="macro", zero_division=0)), 4),
        "per_label": {lb: {k: round(float(report[lb][k]), 4) for k in ("precision", "recall", "f1-score")}
                      | {"support": int(report[lb]["support"])} for lb in labels},
        "confusion_matrix": {"rows": "nhãn thật", "cols": "nhãn đoán", "labels": labels, "values": matrix},
        "top_confusions": top_confusions(matrix, labels),
        "n_wrong": int((pred != y).sum()),
    }
    if not detail:
        return out
    correct = pred == y
    out["accuracy_by_lang"] = group_accuracy(test, correct, "lang")
    out["accuracy_by_author"] = group_accuracy(test, correct, "author")
    out["early_block"] = ({"tau": tau, **block_stats(block_mask(proba, classes, tau), y)}
                          if tau is not None else {"tau": None, "note": "τ không đạt mục tiêu — không chặn sớm"})
    out["wrong"] = [{"id": r["id"], "text": r["text"], "label": r["label"], "pred": str(pred[i]),
                     "p_max": round(float(proba[i].max()), 4)} for i, r in enumerate(test) if not correct[i]]
    return out


def group_accuracy(rows: list[dict], correct: np.ndarray, key: str) -> dict:
    groups: dict[str, list[bool]] = {}
    for r, ok in zip(rows, correct):
        groups.setdefault(r[key], []).append(bool(ok))
    return {g: {"n": len(v), "accuracy": round(sum(v) / len(v), 4)} for g, v in sorted(groups.items())}


def top_confusions(matrix: list[list[int]], labels: list[str], k: int = 3) -> list[dict]:
    pairs = [{"true": labels[i], "pred": labels[j], "n": v}
             for i, row in enumerate(matrix) for j, v in enumerate(row) if i != j and v > 0]
    return sorted(pairs, key=lambda p: -p["n"])[:k]


def majority_baseline(y_train: np.ndarray, test: list[dict]) -> dict:
    """Duong co so: luon doan nhan nhieu nhat cua train."""
    top = Counter(y_train.tolist()).most_common(1)[0][0]
    hit = sum(r["label"] == top for r in test)
    return {"predict": top, "accuracy": round(hit / len(test), 4)}


# --- In man hinh -----------------------------------------------------------------------------


def print_cv(table: list[dict], sel: dict) -> None:
    print("\nKiểm tra chéo 5 gập trên train (trung bình ± độ lệch chuẩn):")
    print("| đặc trưng | C | accuracy | macro-F1 |")
    print("|---|---|---|---|")
    for r in table:
        mark = " ◀" if r is sel["best"][r["features"]] else ""
        print(f"| {r['features']} | {r['C']} | {r['accuracy_mean']:.4f} ± {r['accuracy_std']:.4f} | "
              f"{r['macro_f1_mean']:.4f} ± {r['macro_f1_std']:.4f}{mark} |")
    print(f"\nChọn {sel['chosen']} ({KINDS[sel['chosen']]}), C={sel['chosen_C']} · "
          f"macro-F1(B) − macro-F1(A) = {sel['f1_gap_b_minus_a']:+.4f} (ngưỡng {B_MARGIN})")


def print_tau(t: dict) -> None:
    if t["reached"]:
        print(f"τ = {t['tau']} · precision {t['precision_at_tau']:.4f} · recall {t['recall_at_tau']:.4f} (CV train)")
    else:
        best = max((r["precision"] or 0) for r in t["grid"])
        print(f"KHÔNG ĐẠT: không τ nào trong lưới có precision ≥ {t['target_precision']} (cao nhất {best:.4f})")


def print_test(ev: dict, title: str) -> None:
    print(f"\n{title}: accuracy {ev['accuracy']:.4f} · macro-F1 {ev['macro_f1']:.4f} · "
          f"sai {ev['n_wrong']}/{ev['n']}")
    labels = ev["confusion_matrix"]["labels"]
    w = max(len(lb) for lb in labels)
    corner = "thật \\ đoán"
    print(f"{corner:<{w}} | " + " | ".join(f"{lb[:9]:>9}" for lb in labels) + " |   P      R      F1")
    for lb, row in zip(labels, ev["confusion_matrix"]["values"]):
        m = ev["per_label"][lb]
        print(f"{lb:<{w}} | " + " | ".join(f"{v:>9}" for v in row)
              + f" | {m['precision']:.3f}  {m['recall']:.3f}  {m['f1-score']:.3f}")
    print("Nhầm nhiều nhất: " + ", ".join(f"{p['true']}→{p['pred']} ({p['n']})" for p in ev["top_confusions"]))


def print_detail(ev: dict) -> None:
    for key in ("accuracy_by_lang", "accuracy_by_author"):
        print(f"{key}: " + ", ".join(f"{g} {v['accuracy']:.3f} (n={v['n']})" for g, v in ev[key].items()))
    eb = ev["early_block"]
    if eb["tau"] is not None:
        p = "—" if eb["precision"] is None else f"{eb['precision']:.4f}"
        print(f"Chặn sớm trên test (τ={eb['tau']}): chặn {eb['n_blocked']} · precision {p} · recall {eb['recall']:.4f}")
    print(f"Câu test sai ({len(ev['wrong'])}):")
    for r in ev["wrong"]:
        print(f"  {r['id']} | {r['label']} → {r['pred']} ({r['p_max']:.2f}) | {r['text']}")


# --- Lenh chinh ------------------------------------------------------------------------------


def parse_args(argv):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--train", type=Path, default=INTENT_DIR / "intent_train.csv")
    ap.add_argument("--test", type=Path, default=INTENT_DIR / "intent_test.csv")
    ap.add_argument("--label-map", type=Path, default=INTENT_DIR / "label_map.json")
    ap.add_argument("--cache", type=Path, default=DEFAULT_CACHE)
    ap.add_argument("--out", type=Path, default=DEFAULT_OUT, help="báo cáo (--export đọc file này)")
    ap.add_argument("--export", action="store_true",
                    help=f"xuất mô hình đã chốt ({EXPORT_KIND}, C={EXPORT_C}, τ={EXPORT_TAU}); KHÔNG chạy CV")
    ap.add_argument("--export-path", type=Path, default=DEFAULT_EXPORT)
    return ap.parse_args(argv)


def default_embedder():
    return emb.Embedder(local_files_only=True)


def rel(path: Path) -> str:
    path = path.resolve()
    return path.relative_to(ROOT).as_posix() if path.is_relative_to(ROOT) else path.as_posix()


def train_and_select(train: list[dict], vec_tr: np.ndarray, y: np.ndarray) -> tuple[list[dict], dict, dict]:
    """Moi buoc o day CHI dung train. Tra (bang CV, luat chon, tau)."""
    features = {"A": vec_tr, "B": np.array([r["text"] for r in train], dtype=object)}
    table = run_cv(features, y)
    sel = select_model(table)
    proba, classes = oof_proba(sel["chosen"], sel["chosen_C"], features[sel["chosen"]], y)
    return table, sel, choose_tau(proba, classes, y)


def main(argv: list[str] | None = None, embedder_factory=default_embedder) -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    args = parse_args(argv)
    try:
        labels = load_labels(args.label_map)
        train, test = read_csv(args.train), read_csv(args.test)
        check_data(train, test, labels)
    except DataError as e:
        print(f"LỖI — dữ liệu ý định ({len(e.errors)}):")
        for err in e.errors:
            print(f"  {err}")
        return 1
    print(f"train {len(train)} câu: {label_counts(train, labels)}")
    print(f"test  {len(test)} câu: {label_counts(test, labels)}")

    meta = cache_meta(args.train, args.test)
    vec_tr, vec_te, cached = e5_vectors(train, test, meta, args.cache, embedder_factory)
    print(f"Vector e5: {'đọc cache' if cached else 'tính mới, đã ghi'} {rel(args.cache)}")
    y = np.array([r["label"] for r in train])
    if args.export:
        try:
            export(args, meta, labels, vec_tr, y, vec_te, test)
        except DataError as e:
            print(f"LỖI — xuất mô hình ({len(e.errors)}):")
            for err in e.errors:
                print(f"  {err}")
            return 1
        return 0

    table, sel, tau = train_and_select(train, vec_tr, y)
    print_cv(table, sel)
    print_tau(tau)

    # Tu day moi cham test — mo hinh va tau da chot o tren.
    X = {"A": (vec_tr, vec_te), "B": ([r["text"] for r in train], [r["text"] for r in test])}
    k, c = sel["chosen"], sel["chosen_C"]
    chosen = evaluate_test(k, c, X[k][0], y, X[k][1], test, labels, tau=tau["tau"])
    k2, c2 = sel["other"], sel["other_C"]
    other = evaluate_test(k2, c2, X[k2][0], y, X[k2][1], test, labels, detail=False)
    print_test(chosen, f"TEST — mô hình chọn {k} (C={c})")
    print_detail(chosen)
    print_test(other, f"TEST — mô hình KHÔNG chọn {k2} (C={c2}), chỉ để báo cáo")
    baseline = majority_baseline(y, test)
    print(f"\nĐường cơ sở (luôn đoán '{baseline['predict']}'): accuracy {baseline['accuracy']:.4f}")

    write_report(args, meta, train, test, labels, table, sel, tau, chosen, other, baseline)
    print(f"\nĐã ghi {rel(args.out)}")
    return 0


def write_report(args, meta, train, test, labels, table, sel, tau, chosen, other, baseline) -> None:
    import sklearn

    report = {
        "task": "WSEA-125",
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "seed": SEED,
        "versions": {"sklearn": sklearn.__version__, "numpy": np.__version__},
        "inputs": {rel(args.train): meta["train_sha256"], rel(args.test): meta["test_sha256"]},
        "embedder": meta["embedder"],
        "labels": labels,
        "counts": {"train": label_counts(train, labels), "test": label_counts(test, labels)},
        "features": KINDS,
        "cv": {"folds": N_FOLDS, "shuffle": True, "random_state": SEED, "C_grid": list(CS),
               "model": "LogisticRegression(class_weight='balanced', max_iter=5000)", "table": table},
        "selection": sel,
        "tau": tau,
        "test": {"n": len(test), "evaluated_once": True, "chosen": chosen,
                 "not_chosen_for_reference_only": other, "majority_baseline": baseline},
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    with args.out.open("w", encoding="utf-8", newline="\n") as f:
        f.write(json.dumps(report, ensure_ascii=False, indent=2) + "\n")


# --- Xuat mo hinh (phan 2) -------------------------------------------------------------------


def lr_payload(model, labels: list[str], tau: float) -> dict:
    """Trong so LogisticRegression -> dict cho app.services.intent (hang coef theo thu tu labels).

    model.classes_ sap theo chu cai, khac thu tu label_map -> phai sap lai hang.
    """
    order = [list(model.classes_).index(lb) for lb in labels]
    info = emb.model_info()
    return {
        "format_version": 1,
        "labels": list(labels),
        "coef": model.coef_[order].tolist(),  # float Python -> json ghi du chu so, doc lai y het
        "intercept": model.intercept_[order].tolist(),
        "C": model.C,
        "tau_oos": tau,
        "embedder": {k: info[k] for k in ("model", "revision", "dim", "query_prefix")},
    }


def check_report(report: dict, meta: dict) -> list[str]:
    """Report phai dung la ket qua da chot va cung du lieu, cung mo hinh embedding."""
    errors = []
    sel = report.get("selection", {})
    if (sel.get("chosen"), sel.get("chosen_C"), report.get("tau", {}).get("tau")) != (EXPORT_KIND, EXPORT_C, EXPORT_TAU):
        errors.append(f"report chọn {sel.get('chosen')}, C={sel.get('chosen_C')}, τ={report.get('tau', {}).get('tau')}"
                      f" — khác kết quả đã chốt {EXPORT_KIND}, C={EXPORT_C}, τ={EXPORT_TAU}")
    if sorted(report.get("inputs", {}).values()) != sorted([meta["train_sha256"], meta["test_sha256"]]):
        errors.append("sha256 csv trong report khác file hiện tại — dữ liệu đã đổi sau khi đánh giá")
    if report.get("embedder") != meta["embedder"]:
        errors.append("embedder trong report khác app/services/embedder.py")
    return errors


def expected_predictions(report: dict, test: list[dict]) -> dict[str, str]:
    """Du doan da ghi trong report: cau sai lay 'pred', con lai = nhan that."""
    wrong = {w["id"]: w["pred"] for w in report["test"]["chosen"]["wrong"]}
    return {r["id"]: wrong.get(r["id"], r["label"]) for r in test}


def export(args, meta: dict, labels: list[str], vec_tr, y, vec_te, test: list[dict]) -> None:
    from app.services.intent import IntentClassifier

    report = json.loads(args.out.read_text(encoding="utf-8"))
    errors = check_report(report, meta)
    if errors:
        raise DataError(errors)
    model = make_model(EXPORT_KIND, EXPORT_C).fit(vec_tr, y)
    clf = IntentClassifier.from_dict(lr_payload(model, labels, EXPORT_TAU))

    # Doi chieu: numpy == sklearn, va du doan == report (khong chon gi them tu test).
    # Mo hinh hoc tren vector float32 (giu nguyen, dung mo hinh phan 1 da danh gia). sklearn suy
    # luan float32 neu dau vao float32 (lech ~1e-7) -> so voi sklearn tinh float64 nhu numpy.
    cols = [list(model.classes_).index(lb) for lb in labels]
    ours = clf.predict_proba(vec_te)
    max_diff = float(np.abs(ours - model.predict_proba(vec_te.astype(np.float64))[:, cols]).max())
    diff32 = float(np.abs(ours - model.predict_proba(vec_te)[:, cols]).max())
    expected = expected_predictions(report, test)
    got = {r["id"]: res.label for r, res in zip(test, clf.predict(vec_te))}
    diff = [f"{i}: report {expected[i]} · xuất {got[i]}" for i in expected if expected[i] != got[i]]
    if diff or max_diff > 1e-9:
        raise DataError(diff + [f"sai số xác suất numpy–sklearn {max_diff:.2e}"])
    n_wrong = sum(got[r["id"]] != r["label"] for r in test)
    blocked = sum(clf.is_out_of_scope(res) for res in clf.predict(vec_te))

    chosen = report["test"]["chosen"]
    best = report["selection"]["best"][EXPORT_KIND]
    payload = {
        "format_version": 1, "task": "WSEA-125",
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        **lr_payload(model, labels, EXPORT_TAU),
        "seed": SEED,
        "inputs": report["inputs"],
        "versions": report["versions"],
        "cv_best": {k: best[k] for k in ("accuracy_mean", "accuracy_std", "macro_f1_mean", "macro_f1_std")},
        "test_summary": {k: chosen[k] for k in ("accuracy", "macro_f1", "early_block")},
    }
    args.export_path.parent.mkdir(parents=True, exist_ok=True)
    with args.export_path.open("w", encoding="utf-8", newline="\n") as f:
        f.write(json.dumps(payload, ensure_ascii=False) + "\n")
    IntentClassifier.load(args.export_path)  # file ghi ra phai nap lai duoc
    print(f"\nKhớp report: {len(test)}/{len(test)} dự đoán · sai {n_wrong} câu · chặn sớm {blocked} câu")
    print(f"Sai số xác suất numpy–sklearn lớn nhất: {max_diff:.2e} (float64) · {diff32:.2e} (sklearn float32)")
    print(f"Đã ghi {rel(args.export_path)} · {args.export_path.stat().st_size} byte · "
          f"sha256 {sha256(args.export_path)}")


if __name__ == "__main__":
    sys.exit(main())

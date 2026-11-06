"""Thi nghiem rerank OFFLINE bang cross-encoder tren top-8 cua e5 (WSEA-126 buoc B1a).

    .\\.venv\\Scripts\\python.exe scripts\\eval_rerank.py                    # ung vien A
    .\\.venv\\Scripts\\python.exe scripts\\eval_rerank.py --candidates A,B
    .\\.venv\\Scripts\\python.exe scripts\\eval_rerank.py --revision-a <sha>  # ghim revision

Quy trinh:
1. Lay top-8 theo e5 cho cau duong (kb/eval_questions.csv) va cau am (kb/eval_negatives.csv),
   dung y het scripts/eval_retrieval.py: vector doan doc tu .npz da nap DB (co kiem manifest),
   cau hoi ma hoa bang app/services/embedder.Embedder.
2. Ghep cap (cau hoi nguyen van, truong "content" nguyen van). KHONG them "query:"/"passage:"
   — do la quy uoc rieng cua e5, cross-encoder khong dung.
3. Cham bang sentence_transformers.CrossEncoder, xep lai top-8, do hit@1/3/5/8, MRR@8 truoc/sau.
4. Tach cau am: diem rerank top-1 vs distance e5 top-1, so bang AUC.
5. Do tai nguyen: thoi gian nap, dung luong tren dia, RSS, do tre 1 luot 8 cap.
6. Ap luat chot truoc (decide) -> BAT / TAT.

Nhieu ung vien (--candidates A,B): script tu goi lai chinh no bang subprocess cho TUNG ung vien,
moi ung vien ghi report rieng (rerank_report_A.json, rerank_report_B.json), de RSS khong lan.

Dau ra: docs/eval/rerank_report.json + tom tat in ra man hinh.
Ham tinh chi so la ham thuan, nhan bo cham truyen vao; test o tests/test_eval_rerank.py.
"""

from __future__ import annotations

import argparse
import gc
import json
import sys
import time
from collections.abc import Callable, Sequence
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.services import embedder as emb  # noqa: E402
from scripts import compare_embedders as ce  # noqa: E402
from scripts import eval_retrieval as ev  # noqa: E402
from scripts import load_vectors as lv  # noqa: E402

# =============================================================================================
# LUAT CHOT TRUOC — KHONG SUA SAU KHI CHAY. Doi luat sau khi da thay ket qua la chinh so lieu.
# =============================================================================================
CANDIDATES = {"A": "cross-encoder/mmarco-mMiniLMv2-L12-H384-v1", "B": "BAAI/bge-reranker-v2-m3"}
TOP_N_IN = 8       # so doan e5 dua vao reranker
TOP_K_OUT = 3      # so doan giu lai sau rerank de dua cho LLM
TORCH_THREADS = 2
# Sua 02/11: bien 0,03 < 1 cau (1/31 = 0,032) nen luat cu doi khong mat cau nao.
# Sua SAU khi da chay ung vien A (B1b), TRUOC khi chay B. Khong doi ket luan cua A: A TAT vi
# p95 va RAM; dieu kien hit dat theo ca luat cu (0,871 >= 0,809) lan luat moi (27 >= 26 - 1).
RULE_MAX_LOST = 1  # duoc mat toi da 1 cau: BAT neu so cau trung hit@3_rerank >= hit@5_goc - 1
MAX_LENGTH = 512   # cat cap (cau hoi, doan) o 512 token cho moi ung vien (B mac dinh 8192)
RULE_P95_MS = 300
RULE_RAM_MIB = 600
NOISE_NOTE = "n=31, 1 câu = 0,032; chênh < 0,065 coi như nhiễu"
# =============================================================================================

KS = (1, 3, 5, 8)
MRR_K = TOP_N_IN
WARMUP = 3
EPS = 1e-9  # dung sai so thuc khi so p95/RAM voi nguong

DEFAULT_OUT = ROOT / "docs" / "eval" / "rerank_report.json"

# Bo cham: nhan danh sach cap (cau hoi, noi dung doan) -> diem, cao hon = lien quan hon.
Scorer = Callable[[list[tuple[str, str]]], Sequence[float]]


# --- Rerank (ham thuan) ---------------------------------------------------------------------


def make_pairs(question: str, ids: Sequence[str], content_by_id: dict[str, str]) -> list[tuple[str, str]]:
    """Cap (cau hoi nguyen van, content nguyen van). Khong them tien to nao."""
    return [(question, content_by_id[i]) for i in ids]


def rerank_one(question: str, ids: Sequence[str], content_by_id: dict[str, str],
               scorer: Scorer) -> tuple[list[str], list[float]]:
    """Cham mot luot cac doan `ids`, tra (id xep giam dan theo diem, diem tuong ung).

    Hoa diem thi giu thu tu e5 (sap xep on dinh).
    """
    scores = [float(s) for s in scorer(make_pairs(question, ids, content_by_id))]
    if len(scores) != len(ids):
        raise ValueError(f"bộ chấm trả {len(scores)} điểm cho {len(ids)} cặp")
    order = sorted(range(len(ids)), key=lambda j: -scores[j])
    return [ids[j] for j in order], [scores[j] for j in order]


def rerank_rows(rows: list[dict], content_by_id: dict[str, str], scorer: Scorer,
                top_n: int = TOP_N_IN) -> list[dict]:
    """rows: [{'question', 'ranked', ...}] (ranked theo e5) -> ban sao voi ranked = top_n da xep lai.

    Chi xep lai trong top_n cua e5; doan ngoai top_n khong bao gio duoc keo vao.
    """
    out = []
    for r in rows:
        ids, scores = rerank_one(r["question"], list(r["ranked"][:top_n]), content_by_id, scorer)
        out.append({**r, "ranked": ids, "scores": scores})
    return out


def cut(rows: list[dict], top_n: int = TOP_N_IN) -> list[dict]:
    """Cat ranked (va dists neu co) ve top_n de so cung pham vi voi sau rerank."""
    out = []
    for r in rows:
        c = {**r, "ranked": list(r["ranked"][:top_n])}
        if "dists" in r:
            c["dists"] = list(r["dists"][:top_n])
        out.append(c)
    return out


def metrics(rows: list[dict]) -> dict:
    """hit@1/3/5/8, recall@k, MRR@8 — tong va theo lang (tai dung eval_retrieval)."""
    return ev.positive_metrics(rows, ks=KS, mrr_k=MRR_K)


def rank_changes(before: list[dict], after: list[dict]) -> list[dict]:
    """Cau co hang gold dau tien thay doi. Hang None = khong co gold trong top-8."""
    after_by_qid = {r["qid"]: r for r in after}
    out = []
    for b in before:
        a = after_by_qid[b["qid"]]
        gold = set(b["gold"])
        rb = ce.first_gold_rank(b["ranked"], gold)
        ra = ce.first_gold_rank(a["ranked"], gold)
        if rb != ra:
            out.append({"qid": b["qid"], "lang": b["lang"], "before": rb, "after": ra,
                        "better": rb is not None and ra is not None and ra < rb})
    return out


# --- Tach cau am (ham thuan) ----------------------------------------------------------------


def spread(values: Sequence[float]) -> dict:
    return {"n": len(values), "min": round(min(values), 4),
            "p50": round(ce.percentile(list(values), 50), 4), "max": round(max(values), 4)}


def auc(pos_scores: Sequence[float], neg_scores: Sequence[float]) -> float:
    """AUC voi nhan duong = 1; diem cao hon phai nghieng ve cau duong."""
    from sklearn.metrics import roc_auc_score

    y = [1] * len(pos_scores) + [0] * len(neg_scores)
    return float(roc_auc_score(y, list(pos_scores) + list(neg_scores)))


def separation(pos: Sequence[float], neg: Sequence[float], higher_is_positive: bool) -> dict:
    """Phan bo top-1 moi ben + AUC. Voi distance (thap = lien quan) truyen higher_is_positive=False."""
    sign = 1.0 if higher_is_positive else -1.0
    return {
        "positive": spread(pos),
        "negative": spread(neg),
        "auc": round(auc([sign * x for x in pos], [sign * x for x in neg]), 4),
        "direction": "cao = liên quan" if higher_is_positive else "thấp = liên quan",
    }


# --- Do tre (thuan, dong ho truyen vao duoc) --------------------------------------------------


def latency_ms(scorer: Scorer, batches: list[list[tuple[str, str]]], warmup: int = WARMUP,
               clock: Callable[[], float] = time.perf_counter) -> list[float]:
    """Lam nong `warmup` luot (lay vong cac batch dau), roi do tung batch, tra ms."""
    if not batches:
        raise ValueError("không có batch nào để đo")
    for i in range(warmup):
        scorer(batches[i % len(batches)])
    out = []
    for b in batches:
        t = clock()
        scorer(b)
        out.append((clock() - t) * 1000)
    return out


# --- Luat quyet dinh -------------------------------------------------------------------------


def count_hits(rows: list[dict], k: int) -> int:
    """So cau co it nhat mot gold trong top-k (so nguyen, de so luat theo so cau)."""
    return sum(int(ce.hit_at_k(r["ranked"], set(r["gold"]), k)) for r in rows)


def decide(m: dict, max_lost: int = RULE_MAX_LOST, p95_ms: float = RULE_P95_MS,
           ram_mib: float = RULE_RAM_MIB) -> dict:
    """m: {'n', 'hits3_rerank', 'hits5_base', 'p95_ms', 'ram_mib'} -> {'decision', 'reasons'}.

    Dieu kien 1 so theo SO CAU (so nguyen), khong theo ti le thap phan.
    BAT khi CA BA dieu kien deu dat; thieu so do nao thi TAT.
    """
    reasons, ok = [], True

    n, h3, h5 = m.get("n"), m.get("hits3_rerank"), m.get("hits5_base")
    if n is None or h3 is None or h5 is None:
        ok = False
        reasons.append("✗ thiếu n, số câu trúng hit@3 sau rerank hoặc hit@5 gốc")
    else:
        passed = int(h3) >= int(h5) - max_lost
        ok &= passed
        reasons.append(f"{'✓' if passed else '✗'} hit@3 rerank {h3}/{n} "
                       f"{'≥' if passed else '<'} hit@5 gốc {h5}/{n} − {max_lost}")

    for key, limit, unit, label in (("p95_ms", p95_ms, "ms", "độ trễ p95"),
                                    ("ram_mib", ram_mib, "MiB", "RAM tăng thêm")):
        v = m.get(key)
        if v is None:
            ok = False
            reasons.append(f"✗ thiếu số đo {label}")
            continue
        passed = v <= limit + EPS
        ok &= passed
        reasons.append(f"{'✓' if passed else '✗'} {label} {v:.1f} {unit} "
                       f"{'≤' if passed else '>'} {limit} {unit}")

    return {"decision": "BAT" if ok else "TAT", "reasons": reasons}


# --- Mo hinh that (khong test) -----------------------------------------------------------------


def resolve_revision(name: str, revision: str | None) -> str | None:
    """Doi revision (nhanh/tag/None) ra commit hash de nap dung ban do va ghi vao report."""
    try:
        from huggingface_hub import HfApi
        return HfApi().model_info(name, revision=revision).sha
    except Exception as e:  # noqa: BLE001 - mat mang thi nap tu cache, ghi hash tu thu muc snapshot
        print(f"  ! không lấy được commit hash của {name} từ Hub: {e}")
        return None


def snapshot_info(name: str, sha: str | None) -> tuple[str | None, float | None]:
    """(commit hash, MiB tren dia) cua snapshot trong cache HF. sha None -> lay snapshot moi nhat."""
    try:
        from huggingface_hub import scan_cache_dir
        for repo in scan_cache_dir().repos:
            if repo.repo_id != name or repo.repo_type != "model":
                continue
            revs = [r for r in repo.revisions if sha is None or r.commit_hash == sha]
            if revs:
                rev = max(revs, key=lambda r: r.last_modified)
                return rev.commit_hash, round(rev.size_on_disk / 2**20, 1)
    except Exception as e:  # noqa: BLE001
        print(f"  ! không quét được cache HF: {e}")
    return sha, None


def rss_mib() -> float | None:
    try:
        import psutil
    except ImportError:
        print("  ! thiếu psutil, không đo được RSS")
        return None
    return psutil.Process().memory_info().rss / 2**20


def evaluate_candidate(key: str, name: str, revision: str | None, pos_e5: list[dict],
                       neg_e5: list[dict], content_by_id: dict[str, str]) -> dict:
    import torch
    from sentence_transformers import CrossEncoder

    print(f"\n== Ứng viên {key}: {name}")
    sha = resolve_revision(name, revision)

    gc.collect()
    rss0 = rss_mib()
    t = time.perf_counter()
    model = CrossEncoder(name, revision=sha or revision, device="cpu", max_length=MAX_LENGTH)
    load_s = time.perf_counter() - t
    rss1 = rss_mib()
    torch.set_num_threads(TORCH_THREADS)

    model.eval()

    def scorer(pairs):
        with torch.no_grad():
            return model.predict(pairs, batch_size=TOP_N_IN, show_progress_bar=False,
                                 convert_to_numpy=True).tolist()

    sha, disk_mib = snapshot_info(name, sha)

    pos_after = rerank_rows(pos_e5, content_by_id, scorer)
    neg_after = rerank_rows(neg_e5, content_by_id, scorer)
    lat = latency_ms(scorer, [make_pairs(r["question"], r["ranked"][:TOP_N_IN], content_by_id)
                              for r in pos_e5])
    rss2 = rss_mib()

    ram = None if rss0 is None else max(rss1, rss2) - rss0
    out = {
        "key": key,
        "model": name,
        "revision_requested": revision,
        "revision": sha,
        "max_length": getattr(model, "max_seq_length", None),
        "load_s": round(load_s, 2),
        "disk_mib": disk_mib,
        "rss_mib": {"before_load": _r(rss0), "after_load": _r(rss1), "after_scoring": _r(rss2),
                    "increase": _r(ram)},
        "latency_ms": {"batch_pairs": TOP_N_IN, "threads": TORCH_THREADS, "warmup": WARMUP,
                       "n": len(lat), "p50": round(ce.percentile(lat, 50), 1),
                       "p95": round(ce.percentile(lat, 95), 1), "max": round(max(lat), 1)},
        "_pos_after": pos_after,
        "_neg_after": neg_after,
    }
    del model
    gc.collect()
    return out


def _r(x):
    return None if x is None else round(x, 1)


# --- Lap report -------------------------------------------------------------------------------


def build_candidate_report(cand: dict, pos_before: list[dict], before_metrics: dict,
                           e5_sep: dict) -> dict:
    """Ghep so do tai nguyen voi chi so chat luong + quyet dinh cho mot ung vien."""
    pos_after, neg_after = cand.pop("_pos_after"), cand.pop("_neg_after")
    after_metrics = metrics(pos_after)
    rr_sep = separation([r["scores"][0] for r in pos_after], [r["scores"][0] for r in neg_after],
                        higher_is_positive=True)
    rule_input = {
        "n": len(pos_before),
        "hits3_rerank": count_hits(pos_after, 3),
        "hits5_base": count_hits(pos_before, 5),
        "p95_ms": cand["latency_ms"]["p95"],
        "ram_mib": cand["rss_mib"]["increase"],
    }
    return {
        **cand,
        "metrics_after": after_metrics,
        "rank_changes": rank_changes(pos_before, pos_after),
        "negatives": {"rerank_top1": rr_sep, "e5_top1": e5_sep},
        "top_out": [{"qid": r["qid"], "ids": r["ranked"][:TOP_K_OUT],
                     "scores": [round(s, 4) for s in r["scores"][:TOP_K_OUT]]} for r in pos_after],
        "rule_input": rule_input,
        **decide(rule_input),
    }


def fmt(x, digits=3):
    return "—" if x is None else f"{x:.{digits}f}"


def summary_text(report: dict) -> str:
    before = report["metrics_before"]
    lines = [f"Rerank top-{TOP_N_IN} → giữ top-{TOP_K_OUT} · e5 {report['e5']['model']} @ "
             f"{report['e5']['revision'][:8]} · {before['overall']['n']} câu dương · "
             f"{report['n_negatives']} câu âm", f"Lưu ý nhiễu: {NOISE_NOTE}"]
    head = " | ".join(f"hit@{k}" for k in KS)

    for c in report["candidates"]:
        after = c["metrics_after"]
        lines += ["", f"== {c['key']}: {c['model']} @ {(c['revision'] or '?')[:8]}", "",
                  f"| nhóm | n | {head} | MRR@{MRR_K} |", "|---|---|" + "---|" * (len(KS) + 1)]
        groups = [("tất cả", "overall")] + [(lang, lang) for lang in before["by_lang"]]
        for label, g in groups:
            for tag, m in (("gốc", before), ("rerank", after)):
                mm = m["overall"] if g == "overall" else m["by_lang"][g]
                cells = " | ".join(fmt(mm[f"hit@{k}"], 2) for k in KS)
                lines.append(f"| {label} · {tag} | {mm['n']} | {cells} | {fmt(mm[f'mrr@{MRR_K}'])} |")

        ch = c["rank_changes"]
        lines += ["", f"Câu đổi hạng gold ({len(ch)}): " + (", ".join(
            f"{x['qid']} {x['before'] or '>8'}→{x['after'] or '>8'}" for x in ch) or "không có")]

        rr, e5s = c["negatives"]["rerank_top1"], c["negatives"]["e5_top1"]
        lines += ["", "Tách câu âm (top-1):", "", "| tín hiệu | dương min/p50/max | âm min/p50/max | AUC |",
                  "|---|---|---|---|"]
        for label, s in (("điểm rerank (cao = liên quan)", rr), ("distance e5 (thấp = liên quan)", e5s)):
            p, n = s["positive"], s["negative"]
            lines.append(f"| {label} | {p['min']:.3f}/{p['p50']:.3f}/{p['max']:.3f} | "
                         f"{n['min']:.3f}/{n['p50']:.3f}/{n['max']:.3f} | {s['auc']:.3f} |")

        lat, rss = c["latency_ms"], c["rss_mib"]
        lines += ["", f"Độ trễ 1 lượt {lat['batch_pairs']} cặp ({lat['threads']} luồng): "
                      f"p50 {lat['p50']} ms · p95 {lat['p95']} ms · max {lat['max']} ms",
                  f"Nạp {c['load_s']} s · đĩa {fmt(c['disk_mib'], 1)} MiB · RSS {fmt(rss['before_load'], 0)} → "
                  f"{fmt(rss['after_load'], 0)} → {fmt(rss['after_scoring'], 0)} MiB "
                  f"(tăng {fmt(rss['increase'], 1)} MiB)",
                  "", f"QUYẾT ĐỊNH: {c['decision']}"] + [f"  {r}" for r in c["reasons"]]
    return "\n".join(lines)


# --- CLI --------------------------------------------------------------------------------------


def parse_candidates(text: str) -> list[str]:
    keys = [k.strip().upper() for k in text.split(",") if k.strip()]
    bad = [k for k in keys if k not in CANDIDATES]
    if not keys or bad:
        raise argparse.ArgumentTypeError(f"ứng viên phải thuộc {sorted(CANDIDATES)}, nhận {text!r}")
    return list(dict.fromkeys(keys))


def parse_args(argv):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--candidates", type=parse_candidates, default=["A"], help="vd A hoặc A,B")
    ap.add_argument("--revision-a", default=None, help="revision/commit của ứng viên A (mặc định: nhánh chính)")
    ap.add_argument("--revision-b", default=None, help="revision/commit của ứng viên B")
    ap.add_argument("--chunks", type=Path, default=lv.DEFAULT_KB_JSONL)
    ap.add_argument("--questions", type=Path, default=lv.DEFAULT_QUESTIONS)
    ap.add_argument("--negatives", type=Path, default=ev.DEFAULT_NEGATIVES)
    ap.add_argument("--kb-npz", type=Path, default=lv.DEFAULT_KB_NPZ)
    ap.add_argument("--words-npz", type=Path, default=lv.DEFAULT_WORDS_NPZ)
    ap.add_argument("--manifest", type=Path, default=lv.DEFAULT_MANIFEST)
    ap.add_argument("--out", type=Path, default=DEFAULT_OUT)
    ap.set_defaults(reencode=False)  # luon dung vector .npz da nap DB (ev.load_passage_vectors)
    return ap.parse_args(argv)


def load_questions(args) -> tuple[list[dict], list[dict], list[str]]:
    """(cau duong, cau am, loi) — doc va kiem giong eval_retrieval.main."""
    chunk_ids = {str(c["id"]) for c in lv.load_chunks(args.chunks)}
    positives = ce.load_questions(args.questions)
    negatives = ce.load_questions(args.negatives)
    for r in negatives:
        r["group"] = (r.get("group") or "").strip()
    return positives, negatives, ce.validate_questions(positives, chunk_ids) + ev.validate_negatives(negatives)


def e5_rankings(positives: list[dict], negatives: list[dict], ids: list[str], p_vecs) -> tuple[list, list]:
    """Xep hang toan bo doan theo e5 (Embedder + rank_all cua eval_retrieval)."""
    items = positives + negatives
    q_vecs = emb.Embedder().encode_queries([q["question"] for q in items])
    ranking = ev.rank_all(q_vecs, p_vecs, ids)
    n = len(positives)
    pos = [{**q, "ranked": r, "dists": d} for q, (r, d) in zip(positives, ranking[:n])]
    neg = [{**q, "ranked": r, "dists": d} for q, (r, d) in zip(negatives, ranking[n:])]
    return pos, neg


def out_for(out: Path, key: str) -> Path:
    """docs/eval/rerank_report.json -> docs/eval/rerank_report_B.json"""
    return out.with_name(f"{out.stem}_{key}{out.suffix}")


def child_commands(args, script: Path = Path(__file__)) -> list[list[str]]:
    """Moi ung vien mot lenh rieng (cung tham so, report rieng) de RSS khong lan giua cac mo hinh."""
    cmds = []
    for key in args.candidates:
        cmd = [sys.executable, str(script), "--candidates", key]
        for flag, value in (("--revision-a", args.revision_a), ("--revision-b", args.revision_b)):
            if value is not None:
                cmd += [flag, value]
        for flag in ("chunks", "questions", "negatives", "kb_npz", "words_npz", "manifest"):
            cmd += [f"--{flag.replace('_', '-')}", str(getattr(args, flag))]
        cmds.append(cmd + ["--out", str(out_for(args.out, key))])
    return cmds


def run_separately(args) -> int:
    import subprocess

    print(f"⚠ {len(args.candidates)} ứng viên: chạy MỖI ứng viên ở một tiến trình riêng để RAM không lẫn "
          f"(report riêng: {', '.join(ev.rel(out_for(args.out, k)) for k in args.candidates)})")
    codes = []
    for cmd in child_commands(args):
        print(f"\n$ {' '.join(cmd[1:])}", flush=True)
        codes.append(subprocess.run(cmd, check=False).returncode)
    return max(codes)


def main(argv: list[str] | None = None) -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    args = parse_args(argv)
    if len(args.candidates) > 1:
        return run_separately(args)

    positives, negatives, errors = load_questions(args)
    if errors:
        return lv.fail(errors, "dữ liệu câu hỏi")
    ids, p_vecs, _, manifest, errors = ev.load_passage_vectors(args)
    if errors:
        return lv.fail(errors, "vector đoạn")
    content_by_id = {str(c["id"]): c["content"] for c in lv.load_chunks(args.chunks)}

    import torch
    torch.set_num_threads(TORCH_THREADS)
    pos_e5, neg_e5 = e5_rankings(positives, negatives, ids, p_vecs)

    pos_before = cut(pos_e5)
    before_metrics = metrics(pos_before)
    e5_sep = separation([r["dists"][0] for r in pos_e5], [r["dists"][0] for r in neg_e5],
                        higher_is_positive=False)

    revisions = {"A": args.revision_a, "B": args.revision_b}
    candidates = []
    for key in args.candidates:
        cand = evaluate_candidate(key, CANDIDATES[key], revisions[key], pos_e5, neg_e5, content_by_id)
        candidates.append(build_candidate_report(cand, pos_before, before_metrics, e5_sep))

    report = build_report(args, manifest, len(ids), len(negatives), before_metrics, candidates)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(summary_text(report))
    print(f"\nĐã ghi {ev.rel(args.out)}")
    return 0


def build_report(args, manifest: dict | None, n_chunks: int, n_negatives: int,
                 before_metrics: dict, candidates: list[dict]) -> dict:
    return {
        "task": "WSEA-126",
        "step": "B1a",
        "created_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "rules": {
            "top_n_in": TOP_N_IN, "top_k_out": TOP_K_OUT, "torch_threads": TORCH_THREADS,
            "max_lost": RULE_MAX_LOST, "max_length": MAX_LENGTH,
            "p95_ms": RULE_P95_MS, "ram_mib": RULE_RAM_MIB,
            "decision": "BAT khi số câu trúng hit@3 rerank ≥ số câu trúng hit@5 gốc − max_lost "
                        "VÀ p95 ≤ p95_ms VÀ RAM tăng ≤ ram_mib",
            "rule_history": "02/11: thay biên 0,03 (tỉ lệ) bằng max_lost=1 (số câu) và thêm max_length=512; "
                            "sửa sau khi đã chạy A, trước khi chạy B; không đổi kết luận của A",
            "ram_definition": "max(RSS sau nạp, RSS sau chấm) − RSS trước nạp",
            "noise": NOISE_NOTE,
        },
        "e5": {**emb.model_info(), "manifest_created_at": manifest.get("created_at") if manifest else None},
        "pairs": "(câu hỏi nguyên văn, content nguyên văn), không tiền tố",
        "files": {ev.rel(args.questions): lv.sha256(args.questions),
                  ev.rel(args.negatives): lv.sha256(args.negatives),
                  ev.rel(args.chunks): lv.sha256(args.chunks)},
        "n_chunks": n_chunks,
        "n_negatives": n_negatives,
        "metrics_before": before_metrics,
        "candidates": candidates,
    }


if __name__ == "__main__":
    sys.exit(main())

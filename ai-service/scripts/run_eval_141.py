"""Danh gia pipeline tro ly tren bo cau WSEA-141 (truy hoi + luat 127, va phan sinh tuy chon).

    # Truy hoi + luat 127 (0 loi goi LLM) -> reports/141_retrieval.json
    .\\.venv\\Scripts\\python.exe scripts\\run_eval_141.py --questions kb\\eval_set_141.csv --negatives kb\\eval_set_141_neg.csv

    # Phan sinh: can server local (uvicorn app.main:app --host 127.0.0.1 --port 8000, .env that)
    .\\.venv\\Scripts\\python.exe scripts\\run_eval_141.py --questions ... --negatives ... --gen [--limit 1]

Tieu chi va thang cham: docs/eval/WSEA-141_tieu_chi.md (chot truoc khi chay that).
- Truy hoi: vector doan tu .npz da nap DB (kiem manifest), rank_all / positive_metrics cua
  scripts/eval_retrieval.py — dung cach WSEA-111. Khong dat nguong dat/truot.
- Hai nhom cau duong (sua 2026-11-05, truoc khi co du lieu): gold_ids toan "word:<term>" -> nhom "vocab"
  (cau hoi nghia tu); toan id doan -> nhom "kb". Tron hai loai -> loi du lieu. Bao hai nhom RIENG:
  kb: hit@k/MRR tren doan (nhu WSEA-111); vocab: hit@3 tren vocab top-3 ma /rank chon (select_vocab).
- vocab dung nhu backend (assistant.service.ts, doc 2026-11-05): exact = /\\b[a-z]{2,30}\\b/ (ASCII) tren cau viet
  thuong, toi da 15 chuoi, findMany take 5 (khong ORDER BY -> xap xi theo rank); + top-3 vector tren
  data/embeddings/words_e5-small.npz; trung term -> giu exact; toi da 10.
  Nghia tu (pos, meaning_vi, example_en) doc tu backend/prisma/data/vocab_7000.csv (CHI DOC).
- Luat 127: moi cau -> AskRequest top-8 + vocab nhu tren (word null, history []) -> run_pipeline that
  (Embedder + IntentClassifier that).
- Phan sinh (--gen): 20 cau chon bang random.Random(141), phan tang (mac dinh 14 duong + 6 am).
  Moi cau: top-8 nhu tren -> POST /assistant/rank (lay decision cua server) -> POST /assistant/ask JSON.
  Ngu --sleep giay sau moi cau co goi LLM (Groq ~8K token/phut). Ket qua: reports/141_gen.json +
  reports/141_cham.csv (2 cot diem, ghi_chu de trong cho Phuc cham).
  Cau degraded (tieu chi muc 4.2), theo reason trong 503: rate_limited/timeout/upstream_error -> cho
  --retry-wait (>= 60 s) roi chay lai DUNG 1 lan (retried, first_reason); empty_content/bad_response ->
  khong chay lai, bao rieng; no_key -> dung ca luot, KHONG ghi file nao.
Khoa x-api-key doc INTERNAL_API_KEY tu .env, KHONG in/ghi. Goi HTTP co User-Agent rieng.
"""

from __future__ import annotations

import argparse
import csv
import json
import random
import re
import sys
import time
import urllib.error
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.models.schemas import AskRequest  # noqa: E402
from app.services import pipeline as pl  # noqa: E402
from app.services import pipeline_rules as rules  # noqa: E402
from scripts import check_pipeline as cp  # noqa: E402
from scripts import compare_embedders as ce  # noqa: E402
from scripts import eval_retrieval as ev  # noqa: E402
from scripts import load_vectors as lv  # noqa: E402
from scripts import smoke_ask as sa  # noqa: E402

DEFAULT_QUESTIONS = ROOT / "kb" / "eval_set_141.csv"
DEFAULT_NEGATIVES = ROOT / "kb" / "eval_set_141_neg.csv"
DEFAULT_OUT_DIR = ROOT / "reports"
SEED = 141
N_POS, N_NEG = 14, 6
SLEEP_S = 30.0
REPORT_KS = (1, 5, 8)
# Bo 31 cau cu (WSEA-110/111, docs/eval/retrieval_k_sweep.json) — dat canh, KHONG phai nguong.
BASELINE_31 = {"source": "docs/eval/retrieval_k_sweep.json (WSEA-111), 31 câu dương",
               "hit@1": 0.613, "hit@5": 0.839, "hit@8": 0.871, "mrr@20": 0.681,
               "note": "MRR 0,678 hay được trích là MRR@8 (WSEA-110/126); MRR@20 của cùng bộ là 0,681"}
CHAM_COLUMNS = ("qid", "question", "nguon", "answer", "diem", "ghi_chu")
WORD_PREFIX = "word:"
KB, VOCAB = "kb", "vocab"
VOCAB_VECTOR_K = 3   # backend: LIMIT 3 tren word_embeddings (API_CONTRACT)
MAX_VOCAB = 10       # AskRequest.vocab max_length
VOCAB_SOURCE = ROOT.parent / "backend" / "prisma" / "data" / "vocab_7000.csv"
# Dung nhu backend (assistant.service.ts traTuChinhXac): cauHoi.toLowerCase().match(/\b[a-z]{2,30}\b/g).
# \b cua JS (khong co co u) chi hieu ASCII -> chu co dau bi cat manh ("hiện" -> "hi"); re.ASCII cho hanh vi giong.
_EN_TOKEN_RE = re.compile(r"\b[a-z]{2,30}\b", re.ASCII)
EXACT_TOKENS_MAX = 15  # backend: .slice(0, 15) tren cac chuoi khac nhau
EXACT_TAKE = 5         # backend: prisma.word.findMany({take: 5}) — KHONG co orderBy


# --- Ham thuan -----------------------------------------------------------------------------------


def split_gold(gold: list[str]) -> tuple[list[str], list[str]]:
    """-> (id doan, term tu vung). 'word:<term>' -> term (chu thuong, bo khoang trang)."""
    kb = [g for g in gold if not g.startswith(WORD_PREFIX)]
    words = [g[len(WORD_PREFIX):].strip().lower() for g in gold if g.startswith(WORD_PREFIX)]
    return kb, words


def question_group(q: dict) -> str | None:
    """'vocab' neu gold toan word:, 'kb' neu khong co word:, None neu tron hoac rong."""
    kb, words = split_gold(q.get("gold") or [])
    if kb and not words:
        return KB
    if words and not kb:
        return VOCAB
    return None


def load_sets(q_path: Path, n_path: Path) -> tuple[list[dict], list[dict]]:
    positives = []
    for q in ce.load_questions(q_path):
        kb, words = split_gold(q["gold"])
        positives.append({**q, "kind": "pos", "qgroup": question_group(q), "gold_kb": kb, "gold_words": words})
    negatives = [{**q, "kind": "neg", "group": (q.get("group") or "").strip()} for q in ce.load_questions(n_path)]
    return positives, negatives


def validate_sets(positives: list[dict], negatives: list[dict], chunk_ids: set[str],
                  terms: frozenset[str] | set[str] = frozenset()) -> list[str]:
    """Loi du lieu (rong = hop le): moi cau duong thuoc dung mot nhom; gold kb co trong kho doan; gold word:
    co trong tu vung; qid khong trung trong tung file va giua hai file."""
    errors = []
    if not positives:
        errors.append("không có câu dương nào")
    seen: set[str] = set()
    for i, q in enumerate(positives, 2):
        where = q["qid"] or f"dòng {i}"
        if not q["qid"]:
            errors.append(f"dòng {i}: thiếu qid")
        elif q["qid"] in seen:
            errors.append(f"{where}: trùng qid")
        seen.add(q["qid"])
        if not q["question"]:
            errors.append(f"{where}: câu hỏi rỗng")
        kb, words = split_gold(q["gold"])
        if not kb and not words:
            errors.append(f"{where}: không có gold_ids")
        elif kb and words:
            errors.append(f"{where}: trộn gold đoạn và gold word: — mỗi câu chỉ thuộc một nhóm")
        errors += [f"{where}: gold_id '{g}' không có trong grammar_chunks.jsonl" for g in kb if g not in chunk_ids]
        errors += [f"{where}: gold 'word:{w}' không có trong từ vựng" for w in words if w not in terms]
    errors += ev.validate_negatives(negatives)
    cross = sorted({q["qid"] for q in positives if q["qid"]} & {q["qid"] for q in negatives if q["qid"]})
    if cross:
        errors.append(f"qid trùng giữa file dương và file âm: {cross}")
    return errors


def exact_tokens(question: str) -> list[str]:
    """Cac chuoi backend dem di tra: /\\b[a-z]{2,30}\\b/ (ASCII) tren cau viet thuong, bo trung, toi da 15."""
    out: list[str] = []
    for tok in _EN_TOKEN_RE.findall(question.lower()):
        if tok not in out:
            out.append(tok)
    return out[:EXACT_TOKENS_MAX]


def exact_terms(question: str, meta: dict[str, dict]) -> list[str]:
    """Tu khop chinh xac nhu backend: chuoi tra (toi da 15) co trong bang words, lay 5 tu.
    Backend khong co ORDER BY -> thu tu that do Postgres; o day xap xi bang 'rank' (thu tu nap seed)."""
    found = [t for t in exact_tokens(question) if t in meta]
    return sorted(found, key=lambda t: meta[t].get("rank", 0))[:EXACT_TAKE]


def backend_vocab(question: str, word_ranked: list[str], word_dists: list[float], meta: dict[str, dict],
                  k: int = VOCAB_VECTOR_K, cap: int = MAX_VOCAB) -> list[dict]:
    """vocab gui /rank nhu backend: exact (toi da 5, distance 0) roi top-k vector; trung term -> giu exact; toi da cap."""
    exact = exact_terms(question, meta)
    vec = [(t, d) for t, d in zip(word_ranked[:k], word_dists[:k]) if t not in exact]

    def item(t, match, d):
        m = meta[t]
        return {"term": t, "pos": m["pos"], "meaning_vi": m["meaning_vi"], "example_en": m.get("example_en") or None,
                "match": match, "distance": round(float(min(max(d, 0.0), 2.0)), 6)}
    return ([item(t, "exact", 0.0) for t in exact] + [item(t, "vector", d) for t, d in vec])[:cap]


def selected_vocab_terms(vocab: list[dict], k: int = rules.K_VOCAB) -> list[str]:
    """Top-k vocab ma /rank chon (select_vocab: exact truoc, roi vector theo distance) — doc lap quyet dinh chan."""
    req = AskRequest.model_validate({"question": "q", "contexts": [], "vocab": vocab})
    return [v.term for v in pl.select_vocab(req.vocab, k)]


def vocab_found_by(gold_words: list[str], vocab: list[dict], selected: list[str]) -> str:
    """exact / vector / none: gold co trong top-3 da chon khong, va den tu nhanh nao."""
    by = {v["term"]: v["match"] for v in vocab}
    hit = [w for w in gold_words if w in selected]
    return by[hit[0]] if hit else "none"


def vocab_metrics(rows: list[dict]) -> dict:
    """hit@3 nhom vocab (tong va theo lang) + so cau tim thay qua exact / vector."""
    def summ(rs):
        n = len(rs)
        hits = sum(r["vocab_hit"] for r in rs)
        return {"n": n, "hit@3": round(hits / n, 4) if n else None, "hits": hits,
                "found_exact": sum(r["vocab_found_by"] == "exact" for r in rs),
                "found_vector": sum(r["vocab_found_by"] == "vector" for r in rs)}
    langs = sorted({r["lang"] for r in rows})
    return {"overall": summ(rows), "by_lang": {lg: summ([r for r in rows if r["lang"] == lg]) for lg in langs},
            "missed_qids": [r["qid"] for r in rows if not r["vocab_hit"]]}


def retrieval_metrics(pos_rows: list[dict]) -> dict:
    """hit@1/5/8 + MRR@20 (tong va theo lang) tu positive_metrics cua eval_retrieval."""
    full = ev.positive_metrics(pos_rows)
    keep = [f"hit@{k}" for k in REPORT_KS] + [f"mrr@{ev.MRR_K}"]

    def pick(m):
        return {"n": m["n"], **{k: round(m[k], 4) for k in keep}}
    return {"overall": pick(full["overall"]), "by_lang": {lang: pick(m) for lang, m in full["by_lang"].items()}}


def top1_distributions(pos_rows: list[dict], neg_rows: list[dict]) -> dict:
    """distance top-1 (doan) theo nhom: cau duong kb, cau duong vocab, cau am off/gap."""
    out = {}
    for g in (KB, VOCAB):
        rs = [r for r in pos_rows if r.get("qgroup", KB) == g]
        if rs:
            out[f"pos_{g}"] = ev.distribution([r["dists"][0] for r in rs])
    for g in sorted({r["group"] for r in neg_rows}):
        out[f"neg_{g}"] = ev.distribution([r["dists"][0] for r in neg_rows if r["group"] == g])
    if neg_rows:
        out["neg_all"] = ev.distribution([r["dists"][0] for r in neg_rows])
    return out


def pipeline_summary(rows: list[dict]) -> dict:
    """Ti le bi chan (decision != answer): cau duong, cau off, cau gap. Chi ghi nhan."""
    def rate(rs):
        blocked = [r["qid"] for r in rs if r["decision"] != rules.ANSWER]
        return {"n": len(rs), "blocked": len(blocked), "rate": round(len(blocked) / len(rs), 4) if rs else None,
                "blocked_qids": blocked}
    pos = [r for r in rows if r["kind"] == "pos"]
    neg = [r for r in rows if r["kind"] == "neg"]
    out = {"pos": rate(pos), "pos_kb": rate([r for r in pos if r.get("qgroup", KB) == KB]),
           "pos_vocab": rate([r for r in pos if r.get("qgroup") == VOCAB])}
    for g in ("off", "gap"):
        out[g] = rate([r for r in neg if r["group"] == g])
    out["by_decision"] = cp.table_c(neg) if neg else {}
    return out


def _alloc(sizes: dict[str, int], n: int) -> dict[str, int]:
    """Chia n theo ti le kich thuoc tung tang (phan du lon nhat; hoa -> ten tang tang dan)."""
    total = sum(sizes.values())
    if n >= total:
        return dict(sizes)
    raw = {k: n * v / total for k, v in sizes.items()}
    out = {k: int(x) for k, x in raw.items()}
    for k in sorted(raw, key=lambda k: (-(raw[k] - out[k]), k))[: n - sum(out.values())]:
        out[k] += 1
    return out


def select_gen(positives: list[dict], negatives: list[dict], seed: int = SEED,
               n_pos: int = N_POS, n_neg: int = N_NEG) -> list[str]:
    """Chon cau cho phan sinh, tat dinh theo seed.

    - Duong: phan tang theo (nhom cau hoi kb/vocab, lang) — khoa tang "<nhom>|<lang>" —, chia n_pos theo ti le
      (phan du lon nhat). Bo khong co nhom vocab thi giong het ban cu (chi theo lang).
    - Am: uu tien du off va gap — chia deu n_neg cho hai nhom (le thi off nhieu hon), nhom thieu
      thi bu tu nhom con lai.
    - Trong moi tang: sap qid tang dan roi rng.sample; cac tang duyet theo ten tang dan, mot rng duy nhat.
    Tra danh sach qid: duong truoc, am sau, moi phan sap qid tang dan.
    """
    rng = random.Random(seed)
    by_lang: dict[str, list[str]] = {}  # khoa tang: "<nhom>|<lang>"
    for q in positives:
        by_lang.setdefault(f"{q.get('qgroup') or KB}|{q['lang']}", []).append(q["qid"])
    want = _alloc({k: len(v) for k, v in by_lang.items()}, n_pos)
    chosen_pos = []
    for lang in sorted(by_lang):
        chosen_pos += rng.sample(sorted(by_lang[lang]), want[lang])

    groups = {g: sorted(q["qid"] for q in negatives if q["group"] == g) for g in ("off", "gap")}
    half = {"off": (n_neg + 1) // 2, "gap": n_neg // 2}
    take = {g: min(half[g], len(groups[g])) for g in groups}
    spare = n_neg - sum(take.values())
    for g in ("off", "gap"):  # bu cho nhom thieu
        extra = min(spare, len(groups[g]) - take[g])
        take[g] += extra
        spare -= extra
    chosen_neg = []
    for g in ("gap", "off"):  # ten tang dan
        chosen_neg += rng.sample(groups[g], take[g])
    return sorted(chosen_pos) + sorted(chosen_neg)


def cham_rows(gen_rows: list[dict], chunks_by_id: dict[str, dict], meta: dict[str, dict] | None = None) -> list[dict]:
    """Dong cho file cham: nguon = toan van cac doan duoc trich + muc tu vung /rank da dua vao prompt
    (de Phuc doi chieu ca cau hoi nghia tu); diem, ghi_chu trong."""
    meta = meta or {}
    out = []
    for r in gen_rows:
        parts = [f"[{i}] {chunks_by_id[i]['content']}" for i in r.get("source_ids") or [] if i in chunks_by_id]
        for t in r.get("vocab") or []:
            m = meta.get(t)
            if m:
                ex = f" — Ví dụ: {m['example_en']}" if m.get("example_en") else ""
                parts.append(f"[word:{t}] {t} ({m['pos']}): {m['meaning_vi']}{ex}")
        src = "\n\n".join(parts)
        answer = r["answer"] if r.get("answer") is not None else f"(LỖI: {r.get('error')})"
        out.append({"qid": r["qid"], "question": r["question"], "nguon": src, "answer": answer,
                    "diem": "", "ghi_chu": ""})
    return out


def write_cham_csv(path: Path, rows: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8-sig", newline="") as f:  # utf-8-sig: Excel doc dung tieng Viet
        w = csv.DictWriter(f, fieldnames=CHAM_COLUMNS)
        w.writeheader()
        w.writerows(rows)


def summary_text(report: dict) -> str:
    kb, b, p = report["retrieval"]["kb"], report["baseline_31"], report["pipeline"]
    vo = report["retrieval"]["vocab"]
    d = report["top1_distance"]
    lines = [f"{report['n_positives']} câu dương (kb {report['n_kb']} · vocab {report['n_vocab']}) · "
             f"{report['n_negatives']} câu âm · top-8 e5 → K_PROMPT {rules.K_PROMPT}", "",
             "Nhóm kb — hit/MRR trên đoạn:", "", "| chỉ số | bộ này | 31 câu cũ |", "|---|---|---|"]
    if kb:
        for k in [f"hit@{k}" for k in REPORT_KS] + [f"mrr@{ev.MRR_K}"]:
            lines.append(f"| {k} | {kb['overall'][k]:.3f} | {b[k]:.3f} |")
    else:
        lines.append("| (không có câu kb) | — | — |")
    lines += ["", "Nhóm vocab — hit@3 trên vocab top-3 của /rank (exact + top-3 vector như backend):"]
    if vo:
        o = vo["overall"]
        lines.append(f"- hit@3 {o['hits']}/{o['n']} = {o['hit@3']:.3f} (qua exact {o['found_exact']}, qua vector "
                     f"{o['found_vector']})" + (f" · trượt: {', '.join(vo['missed_qids'])}" if vo["missed_qids"] else ""))
    else:
        lines.append("- (không có câu vocab)")
    lines += ["", "distance top-1: " + " · ".join(f"{g} p50 {v['p50']} (min {v['min']}, max {v['max']}, n={v['n']})"
                                                for g, v in d.items()),
              "", "Luật 127 — bị chặn (decision ≠ answer), chỉ ghi nhận:"]
    for g in ("pos_kb", "pos_vocab", "off", "gap"):
        r = p[g]
        lines.append(f"- {g}: {r['blocked']}/{r['n']}" + (f" — {', '.join(r['blocked_qids'])}" if r["blocked_qids"] else ""))
    lines += ["", f"Câu cho phần sinh (seed {report['gen_selection']['seed']}): {', '.join(report['gen_selection']['qids'])}"]
    return "\n".join(lines)


# --- Chay that -----------------------------------------------------------------------------------


def paths_args():
    a = cp.parse_args([])
    a.reencode = False
    return a


def load_vocab_meta(path: Path = VOCAB_SOURCE) -> dict[str, dict]:
    """term -> {pos, meaning_vi, example_en} tu file tu vung backend (CHI DOC).

    Khoa viet thuong: file backend co 'TRUE'/'FALSE' do Excel tu doi (PROGRESS: da bao backend), trong khi
    words .npz (va bang words) dung 'true'/'false'.
    """
    with path.open(encoding="utf-8-sig", newline="") as f:
        return {r["word"].strip().lower(): {"pos": r["pos"].strip(), "meaning_vi": r["meaning_vi"].strip(),
                                            "example_en": (r.get("example_en") or "").strip(),
                                            "rank": int(r["rank"])} for r in csv.DictReader(f)}


def load_word_vectors(path: Path, meta: dict[str, dict]) -> tuple[list[str], "object", list[str]]:
    """(terms, vectors, loi). Moi term trong .npz phai co nghia trong file tu vung backend."""
    import numpy as np
    z = np.load(path, allow_pickle=False)
    terms = [str(t) for t in z["terms"]]
    missing = [t for t in terms if t not in meta]
    errors = [f"{len(missing)} term trong {path.name} không có trong vocab_7000.csv (vd {missing[:5]})"] if missing else []
    return terms, z["vectors"].astype(np.float32), errors


def build_eval_request(q: dict, ranked: list[str], dists: list[float], chunks_by_id: dict, vocab: list[dict]) -> AskRequest:
    body = cp.build_request(q["question"], ranked, dists, chunks_by_id).model_dump(mode="json")
    body["vocab"] = vocab
    return AskRequest.model_validate(body)


def evaluate_items(items, ranking, word_ranking, chunks_by_id, meta, embedder, clf) -> list[dict]:
    """Moi cau: AskRequest (top-8 doan + vocab nhu backend) -> run_pipeline that; do kb va vocab doc lap quyet dinh."""
    rows = []
    for q, (ranked, dists), (w_ranked, w_dists) in zip(items, ranking, word_ranking):
        vocab = backend_vocab(q["question"], w_ranked, w_dists, meta)
        req = build_eval_request(q, ranked, dists, chunks_by_id, vocab)
        res = pl.run_pipeline(req, embedder, clf)
        selected = selected_vocab_terms(vocab)
        row = {"qid": q["qid"], "kind": q["kind"], "lang": q["lang"], "group": q.get("group"),
               "qgroup": q.get("qgroup"), "question": q["question"], "decision": res.decision, "reason": res.reason,
               "intent": None if res.intent is None else
               {"label": res.intent.label, "confidence": round(res.intent.confidence, 4)},
               "top1_id": ranked[0], "top1_distance": round(dists[0], 4),
               "selected_ids": [c.id for c in res.contexts],
               "vocab_sent": [{"term": v["term"], "match": v["match"], "distance": v["distance"]} for v in vocab],
               "vocab_selected": selected,
               "ranked": ranked[:ev.MRR_K], "dists": dists[:ev.MRR_K]}
        if q["kind"] == "pos" and q.get("qgroup") == KB:
            row["gold"] = q["gold_kb"]
            row["gold_in_top5"] = cp.gold_in_selected(req, q["gold_kb"])
        if q["kind"] == "pos" and q.get("qgroup") == VOCAB:
            row["gold"] = q["gold_words"]
            row["vocab_found_by"] = vocab_found_by(q["gold_words"], vocab, selected)
            row["vocab_hit"] = row["vocab_found_by"] != "none"
            row["gold_word_vector_rank"] = {w: (w_ranked.index(w) + 1 if w in w_ranked else None)
                                            for w in q["gold_words"]}
        rows.append(row)
    return rows


def retrieval_part(args) -> tuple[dict, list[dict], list, dict]:
    from app.services import embedder as emb
    from app.services.intent import IntentClassifier

    paths = paths_args()
    chunks_by_id = {str(c["id"]): c for c in lv.load_chunks(paths.chunks)}
    meta = load_vocab_meta(args.vocab_source)
    positives, negatives = load_sets(args.questions, args.negatives)
    errors = validate_sets(positives, negatives, set(chunks_by_id), frozenset(meta))
    ids, p_vecs, _, manifest, errors2 = ev.load_passage_vectors(paths)  # kiem manifest gom ca words .npz
    terms, w_vecs, errors3 = load_word_vectors(paths.words_npz, meta)
    if errors or errors2 or errors3:
        raise SystemExit(lv.fail(errors + errors2 + errors3, "dữ liệu"))
    n_kb = sum(q["qgroup"] == KB for q in positives)
    print(f"{ev.rel(args.questions)}: {len(positives)} câu dương (kb {n_kb} · vocab {len(positives) - n_kb}) · "
          f"{ev.rel(args.negatives)}: {len(negatives)} câu âm")

    embedder = emb.Embedder(local_files_only=True)
    clf = IntentClassifier.load()
    items = positives + negatives
    q_vecs = embedder.encode_queries([q["question"] for q in items])  # word null -> cau hoi goc, khong noi term
    ranking = ev.rank_all(q_vecs, p_vecs, ids)
    word_ranking = [(r[:50], d[:50]) for r, d in ev.rank_all(q_vecs, w_vecs, terms)]
    rows = evaluate_items(items, ranking, word_ranking, chunks_by_id, meta, embedder, clf)
    pos_rows = [r for r in rows if r["kind"] == "pos"]
    neg_rows = [r for r in rows if r["kind"] == "neg"]
    kb_rows = [r for r in pos_rows if r["qgroup"] == KB]
    vocab_rows = [r for r in pos_rows if r["qgroup"] == VOCAB]
    commit = cp.rule_commit()
    report = {
        "task": "WSEA-141", "part": "retrieval",
        "created_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "rule_commit": commit["hash"], "rule_files_dirty": commit["dirty"],
        "rules": {"k_prompt": rules.K_PROMPT, "k_vocab": rules.K_VOCAB, "max_top1_distance": rules.MAX_TOP1_DISTANCE,
                  "tau": clf.tau, "candidates": cp.TOP_N_CANDIDATES},
        "e5": emb.model_info(), "manifest_created_at": manifest.get("created_at") if manifest else None,
        "files": {**{ev.rel(p): lv.sha256(p) for p in (args.questions, args.negatives, paths.chunks, paths.words_npz)},
                  "backend/prisma/data/vocab_7000.csv": lv.sha256(args.vocab_source)},
        "vocab_rule": {"exact": "/\\b[a-z]{2,30}\\b/ (ASCII) trên câu viết thường, tối đa 15 chuỗi, take 5 "
                                "(backend không ORDER BY → xấp xỉ theo rank)", "vector_k": VOCAB_VECTOR_K,
                       "dedupe": "trùng term → giữ exact", "cap": MAX_VOCAB, "selected_k": rules.K_VOCAB,
                       "word": None},
        "n_positives": len(pos_rows), "n_kb": len(kb_rows), "n_vocab": len(vocab_rows), "n_negatives": len(neg_rows),
        "retrieval": {"kb": retrieval_metrics(kb_rows) if kb_rows else None,
                      "vocab": vocab_metrics(vocab_rows) if vocab_rows else None},
        "baseline_31": BASELINE_31,
        "top1_distance": top1_distributions(pos_rows, neg_rows),
        "pipeline": pipeline_summary(rows),
        "gen_selection": {"seed": SEED, "n_pos": N_POS, "n_neg": N_NEG,
                          "qids": select_gen(positives, negatives)},
        "rows": [{k: v for k, v in r.items() if k not in ("ranked", "dists")}
                 | {"top8": [{"id": i, "distance": round(x, 4)} for i, x in zip(r["ranked"][:8], r["dists"][:8])]}
                 for r in rows],
    }
    vocab_by_qid = {q["qid"]: backend_vocab(q["question"], wr[0], wr[1], meta) for q, wr in zip(items, word_ranking)}
    by_qid = {q["qid"]: (q, rk, vocab_by_qid[q["qid"]]) for q, rk in zip(items, ranking)}
    return report, rows, by_qid, chunks_by_id, meta


# --- Cau degraded (tieu chi muc 4.2): phan loai theo reason cua 503 /assistant/ask ---------------
RETRY_REASONS = ("rate_limited", "timeout", "upstream_error")  # ha tang: cho RETRY_WAIT_S, chay lai 1 lan
MODEL_REASONS = ("empty_content", "bad_response")              # phia mo hinh: KHONG chay lai, bao rieng
FATAL_REASONS = ("no_key",)                                    # cau hinh: dung ca luot, khong ghi ket qua
RETRY_WAIT_S = 60.0
_REASON_RE = re.compile(r"\(([a-z_]+)\)\s*$")


class FatalRunError(Exception):
    """Loi cau hinh (vd server thieu LLM_API_KEY): dung ca luot chay, khong ghi ket qua."""


def parse_reason(error_body: str) -> str | None:
    """Body loi cua dich vu ({"detail": "Khong goi duoc LLM (<reason>)"}) -> reason; khong doc duoc -> None."""
    try:
        detail = json.loads(error_body).get("detail")
    except (ValueError, AttributeError):
        return None
    m = _REASON_RE.search(detail) if isinstance(detail, str) else None
    return m.group(1) if m else None


def run_with_retry(call, body: dict, sleep=time.sleep, wait_s: float = RETRY_WAIT_S) -> dict:
    """Goi call(body) -> row. Degraded: no_key -> FatalRunError; reason ha tang -> cho wait_s, chay lai
    DUNG 1 lan (retried=True, first_reason); reason phia mo hinh hoac khac -> giu nguyen, khong chay lai."""
    row = call(body)
    row["retried"], row["first_reason"] = False, None
    if not row.get("degraded"):
        return row
    if row.get("error_reason") in FATAL_REASONS:
        raise FatalRunError(row["error_reason"])
    if row.get("error_reason") not in RETRY_REASONS:
        return row
    first = row["error_reason"]
    sleep(wait_s)
    row = call(body)
    if row.get("degraded") and row.get("error_reason") in FATAL_REASONS:
        raise FatalRunError(row["error_reason"])
    row["retried"], row["first_reason"] = True, first
    return row


def degraded_summary(rows: list[dict]) -> dict:
    """So cau chay lai; cau van degraded theo reason; cau loi phia mo hinh (khong chay lai)."""
    still: dict[str, int] = {}
    for r in rows:
        if r.get("degraded"):
            k = r.get("error_reason") or "khac"
            still[k] = still.get(k, 0) + 1
    return {"retried": sum(bool(r.get("retried")) for r in rows),
            "retried_ok": [r["qid"] for r in rows if r.get("retried") and not r.get("degraded")],
            "still_degraded": dict(sorted(still.items())),
            "model_errors": [r["qid"] for r in rows if r.get("degraded") and r.get("error_reason") in MODEL_REASONS]}


def make_call(base: str, key: str, chunks_by_id: dict):
    """call(body) -> row: /assistant/rank (decision cua server) roi /assistant/ask JSON."""
    def call(body: dict) -> dict:
        row: dict = {}
        try:
            with sa.request(base, "/assistant/rank", key, body) as r:
                rank = json.loads(r.read())
            row["decision"], row["reason"], row["intent"] = rank["decision"], rank["reason"], rank["intent"]
            row["vocab"] = rank.get("vocab") or []  # term /rank dua vao prompt (top-3)
            row["contexts"] = [{"id": c["id"], "distance": c["distance"], "text": chunks_by_id[c["id"]]["content"]}
                               for c in rank["contexts"]]
            t0 = time.perf_counter()
            with sa.request(base, "/assistant/ask", key, body) as r:
                ask = json.loads(r.read())
            row.update(answer=ask["answer"], source_ids=ask["source_ids"], degraded=False, error_reason=None,
                       latency_ms=round((time.perf_counter() - t0) * 1000))
        except urllib.error.HTTPError as exc:
            text = exc.read().decode("utf-8", "replace")
            row.update(answer=None, source_ids=[], degraded=True, status=exc.code, error=text[:300],
                       error_reason=parse_reason(text))
        except (urllib.error.URLError, TimeoutError) as exc:
            # loi phia may chay script (khong toi duoc server / het gio doc) -> coi nhu loi ha tang
            row.update(answer=None, source_ids=[], degraded=True, error=type(exc).__name__,
                       error_reason="timeout" if isinstance(exc, TimeoutError) else "upstream_error")
        return row
    return call


def gen_part(args, report: dict, by_qid: dict, chunks_by_id: dict, call=None, sleep=time.sleep) -> list[dict]:
    if call is None:
        key = sa.read_env_key(args.env)
        if not key:
            raise SystemExit("Thiếu INTERNAL_API_KEY trong .env / biến môi trường")
        sa.wait_health(args.base, key)
        call = make_call(args.base, key, chunks_by_id)
    qids = report["gen_selection"]["qids"][: args.limit] if args.limit else report["gen_selection"]["qids"]
    out = []
    for n, qid in enumerate(qids, 1):
        q, (ranked, dists), vocab = by_qid[qid]
        body = build_eval_request(q, ranked, dists, chunks_by_id, vocab).model_dump(mode="json")
        row = {"qid": qid, "kind": q["kind"], "group": q.get("group"), "qgroup": q.get("qgroup"),
               "gold": q.get("gold"), "question": q["question"], "candidates": [c["id"] for c in body["contexts"]],
               "vocab_sent": [v["term"] for v in vocab]}
        row.update(run_with_retry(call, body, sleep=sleep, wait_s=args.retry_wait))
        out.append(row)
        print(f"[{n}/{len(qids)}] {qid}: {row.get('decision')} · degraded={row['degraded']}"
              + (f" ({row['error_reason']})" if row["degraded"] else "")
              + (f" · chạy lại sau lỗi {row['first_reason']}" if row["retried"] else ""), flush=True)
        if row.get("decision") == rules.ANSWER and n < len(qids):
            sleep(args.sleep)  # Groq ~8K token/phut/model
    return out


def parse_args(argv):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--questions", type=Path, default=DEFAULT_QUESTIONS)
    ap.add_argument("--negatives", type=Path, default=DEFAULT_NEGATIVES)
    ap.add_argument("--vocab-source", type=Path, default=VOCAB_SOURCE, help="từ vựng backend (chỉ đọc)")
    ap.add_argument("--out-dir", type=Path, default=DEFAULT_OUT_DIR)
    ap.add_argument("--gen", action="store_true", help="chạy phần sinh (gọi /assistant/ask của server local)")
    ap.add_argument("--limit", type=int, default=None, help="chỉ chạy N câu đầu của danh sách sinh (chạy thử)")
    ap.add_argument("--base", default="http://127.0.0.1:8000")
    ap.add_argument("--env", type=Path, default=ROOT / ".env")
    ap.add_argument("--sleep", type=float, default=SLEEP_S)
    ap.add_argument("--retry-wait", type=float, default=RETRY_WAIT_S,
                    help="chờ bao lâu (s) trước khi chạy lại câu degraded do hạ tầng; tiêu chí: ≥ 60")
    return ap.parse_args(argv)


def degraded_text(s: dict) -> str:
    still = ", ".join(f"{k} {v}" for k, v in s["still_degraded"].items()) or "0"
    return (f"Câu chạy lại: {s['retried']} (thành công: {', '.join(s['retried_ok']) or '—'}) · "
            f"vẫn degraded theo reason: {still} · lỗi phía mô hình (không chạy lại): "
            f"{', '.join(s['model_errors']) or '—'}")


def main(argv: list[str] | None = None) -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    args = parse_args(argv)
    if args.retry_wait < RETRY_WAIT_S and not args.limit:
        raise SystemExit(f"--retry-wait phải ≥ {RETRY_WAIT_S:.0f} s cho lượt chính thức (tiêu chí mục 4.2)")
    report, _, by_qid, chunks_by_id, meta = retrieval_part(args)
    print(summary_text(report))
    gen = None
    if args.gen:
        try:
            gen_rows = gen_part(args, report, by_qid, chunks_by_id)
        except FatalRunError as exc:
            print(f"\nDỪNG — lỗi cấu hình phía dịch vụ ({exc}): không ghi kết quả nào.")
            return 2
        summary = degraded_summary(gen_rows)
        gen = {"task": "WSEA-141", "part": "gen", "created_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
               "base": args.base, "limit": args.limit, "official": not args.limit, "retry_wait_s": args.retry_wait,
               "selection": report["gen_selection"], "files": report["files"], "degraded": summary, "rows": gen_rows}
        print("\n" + degraded_text(summary))
    # Ghi sau cung: loi cau hinh o tren thi khong co file nao duoc ghi.
    args.out_dir.mkdir(parents=True, exist_ok=True)
    (args.out_dir / "141_retrieval.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n",
                                                     encoding="utf-8")
    if gen is not None:
        (args.out_dir / "141_gen.json").write_text(json.dumps(gen, ensure_ascii=False, indent=2) + "\n",
                                                   encoding="utf-8")
        write_cham_csv(args.out_dir / "141_cham.csv", cham_rows(gen["rows"], chunks_by_id, meta))
        print(f"Đã ghi {ev.rel(args.out_dir)}/141_gen.json, 141_cham.csv ({len(gen['rows'])} câu)")
    print(f"Đã ghi {ev.rel(args.out_dir)}/141_retrieval.json")
    return 0


if __name__ == "__main__":
    sys.exit(main())

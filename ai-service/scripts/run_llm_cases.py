"""Chay mot vong prompt tren 12 ca phat trien voi Groq THAT (WSEA-140 B3).

    .\\.venv\\Scripts\\python.exe scripts\\run_llm_cases.py            # ket qua chinh thuc cua vong
    .\\.venv\\Scripts\\python.exe scripts\\run_llm_cases.py --only d01,d03   # chay lai vai ca, KHONG chinh thuc

Moi ca: AskRequest (word/history/user_cefr theo ca) -> run_pipeline -> decision != answer thi cau co dinh
(khong goi LLM); nguoc lai build_messages -> LLMClient.from_settings (Settings that, doc .env) -> complete
-> postprocess. Dung DUNG code app; script khong sua prompt, tieu chi hay code app.

contexts "e5_top8": top-8 e5 tu .npz da nap DB nhu scripts/check_pipeline.py; van ban ma hoa = cau hoi,
them " (<term>)" khi co word (hop dong /assistant/embed). contexts "empty": rong. vocab luon rong.

Gian nhip theo han muc token/phut: sau moi lan goi LLM doc header x-ratelimit-remaining-tokens (qua
transport ghi header, khong sua app); khong doc duoc thi cho 25 s. Muc tieu: khong cham 429.

Tieu chi: docs/DECISIONS.md muc "2026-11-02 — WSEA-140", phan d. (A) va (C) cham may o day.
(B) + d10: Claude Code cham thang co dinh, ghi grade_cc/reason_cc vao .json bang --apply-grades
(KHONG in ra man hinh, KHONG dua vao .md: Claude o chat cham lai doc lap; ca lech do Hieu quyet).
Dau ra: docs/eval/llm_rounds/<PROMPT_VERSION>.json + .md. KHONG in khoa.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import re
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.models.schemas import AskRequest  # noqa: E402
from app.services import pipeline_rules as rules  # noqa: E402
from app.services import prompts as pr  # noqa: E402
from app.services.answer import CITE_RE, postprocess  # noqa: E402
from scripts import check_pipeline as cp  # noqa: E402
from scripts import compare_embedders as ce  # noqa: E402

DEFAULT_CASES = ROOT / "kb" / "eval_llm_cases.jsonl"
DEFAULT_OUT_DIR = ROOT / "docs" / "eval" / "llm_rounds"
MAX_ANSWER_CHARS = 1200
DEFAULT_WAIT_S = 25.0
MIN_NEED_TOKENS = 5000  # token toi thieu phai con lai truoc lan goi tiep theo
FIXED = {rules.OUT_OF_SCOPE: pr.TEXT_OUT_OF_SCOPE, rules.NO_CONTEXT: pr.TEXT_NO_CONTEXT}
EXPECTED_FIXED = {"d08": pr.TEXT_NO_CONTEXT}  # refuse con lai -> TEXT_OUT_OF_SCOPE (DECISIONS muc d)
GRADES = ("dung", "mot_phan", "sai")
GRADED_EXPECTED = ("grounded", "word_only")  # (B) d01-d05, d11 + d10

# Dau hieu tho so cho "loi giai code/toan/tho" trong ca refuse. Chi la heuristic: Hieu van doc toan van.
CODE_RE = re.compile(r"```|\bdef \w+\(|\breturn\b|\bprint\(|\bimport \w+|\blambda\b")
MATH_RE = re.compile(r"\bx\s*[=₁₂]\s*-?\d|\bnghiệm\b|\bdelta\b|Δ|\(x\s*-\s*\d\)\s*\(x\s*-\s*\d\)", re.I)


# --- Ham thuan -----------------------------------------------------------------------------------


def load_cases(path: Path) -> list[dict]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def select_cases(cases: list[dict], only: str | None) -> list[dict]:
    if not only:
        return cases
    want = [x.strip() for x in only.split(",") if x.strip()]
    unknown = sorted(set(want) - {c["id"] for c in cases})
    if unknown:
        raise ValueError(f"id không có trong bộ ca: {unknown}")
    return [c for c in cases if c["id"] in want]


def embed_text(case: dict) -> str:
    w = case.get("word")
    return case["question"] if not w else f"{case['question']} ({w['term']})"


def build_case_request(case: dict, ranked: list[str] | None, dists: list[float] | None,
                       chunks_by_id: dict[str, dict]) -> AskRequest:
    if case["contexts"] == "empty":
        contexts = []
    else:
        contexts = [c.model_dump() for c in cp.build_request(case["question"], ranked, dists, chunks_by_id).contexts]
    return AskRequest.model_validate({"question": case["question"], "word": case.get("word"),
                                      "user_cefr": case.get("user_cefr"), "history": case.get("history") or [],
                                      "contexts": contexts, "vocab": []})


def parse_duration(s: str | None) -> float | None:
    """Thoi luong kieu Groq: '7.66s', '2m59.56s', '1h2m3s', '350ms' -> giay. Hong -> None."""
    if not s:
        return None
    parts = re.findall(r"(\d+(?:\.\d+)?)(ms|h|m|s)", s.strip())
    if not parts or "".join(n + u for n, u in parts) != s.strip():
        return None
    mult = {"h": 3600, "m": 60, "s": 1, "ms": 0.001}
    return sum(float(n) * mult[u] for n, u in parts)


def wait_seconds(headers: dict[str, str], need_tokens: int, default: float = DEFAULT_WAIT_S) -> float:
    """Con du token -> 0; khong du -> cho toi luc hoi token (+1 s); khong doc duoc header -> default."""
    rem = headers.get("x-ratelimit-remaining-tokens")
    try:
        remaining = int(float(rem)) if rem is not None else None
    except ValueError:
        remaining = None
    if remaining is None:
        return default
    if remaining >= need_tokens:
        return 0.0
    reset = parse_duration(headers.get("x-ratelimit-reset-tokens"))
    return default if reset is None else reset + 1.0


def need_tokens(totals: list[int]) -> int:
    return max(MIN_NEED_TOKENS, int(1.5 * max(totals))) if totals else MIN_NEED_TOKENS


def reasoning_tokens(usage: dict) -> int | None:
    for key in ("completion_tokens_details", "output_tokens_details"):
        d = usage.get(key)
        if isinstance(d, dict) and isinstance(d.get("reasoning_tokens"), int):
            return d["reasoning_tokens"]
    return None


def refuse_flags(answer: str) -> dict[str, bool]:
    """Heuristic tho: co dau hieu code / loi giai toan / tho trong cau tra loi."""
    lines = [ln.strip() for ln in answer.splitlines() if ln.strip()]
    short = [ln for ln in lines if len(ln.split()) <= 10 and not ln.startswith(("-", "*", "•"))]
    return {"code": bool(CODE_RE.search(answer)), "math": bool(MATH_RE.search(answer)),
            "poem": len(lines) >= 4 and len(short) >= 4}


def check_a(row: dict) -> dict:
    """Tieu chi (A) — DECISIONS WSEA-140 muc d. Ca loi LLM (khong co answer) -> truot."""
    if row.get("error"):
        return {"pass": False, "llm_error": row["error"]}
    ans, ids, sel = row["answer"], row["source_ids"], set(row["selected_ids"])
    checks = {"source_subset": set(ids) <= sel, "no_marker": not CITE_RE.search(ans),
              "max_chars": len(ans) <= MAX_ANSWER_CHARS}
    if row["expected"] == "refuse":
        flags = refuse_flags(ans)
        checks["refuse_no_sources"] = ids == []
        checks["refuse_no_solution"] = not any(flags.values())
        row["refuse_flags"] = flags
    if row["expected"] == "word_only":
        checks["word_only_no_sources"] = ids == []
    return {**checks, "pass": all(checks.values())}


def expected_fixed(row: dict) -> str | None:
    if row["expected"] != "refuse":
        return None
    return EXPECTED_FIXED.get(row["id"], pr.TEXT_OUT_OF_SCOPE)


def check_c(row: dict) -> str | None:
    """(C) cham may: refuse dat khi answer == cau co dinh NGUYEN VAN; khac -> "can_xem" (khong tu cho dat)."""
    fx = expected_fixed(row)
    if fx is None:
        return None
    return "dat" if row.get("answer") == fx else "can_xem"


def apply_grades(report: dict, grades: dict[str, dict]) -> dict:
    """Ghi grade_cc/reason_cc vao cac ca (B) + word_only. Kiem du ca, dung thang, co ly do."""
    want = {r["id"] for r in report["rows"] if r["expected"] in GRADED_EXPECTED}
    got = set(grades)
    if got != want:
        raise ValueError(f"cần chấm đúng các ca {sorted(want)}, nhận {sorted(got)}")
    for r in report["rows"]:
        if r["id"] in grades:
            g = grades[r["id"]]
            if g.get("grade_cc") not in GRADES or not str(g.get("reason_cc") or "").strip():
                raise ValueError(f"{r['id']}: grade_cc phải thuộc {GRADES} và có reason_cc")
            r["grade_cc"], r["reason_cc"] = g["grade_cc"], g["reason_cc"].strip()
    report["graded_by_cc"] = True
    return report


B_MIN_DUNG = 5  # (B): >= 5/6 dung VA 0 sai (DECISIONS muc d)


def apply_crosscheck(report: dict, cross: dict[str, dict]) -> dict:
    """Ghi grade_claude (Claude o chat cham doc lap) va grade_final: khop -> diem chung; lech -> Hieu quyet."""
    graded = [r for r in report["rows"] if r["expected"] in GRADED_EXPECTED]
    if {r["id"] for r in graded} != set(cross):
        raise ValueError(f"cần đúng các ca {sorted(r['id'] for r in graded)}, nhận {sorted(cross)}")
    for r in graded:
        if r.get("grade_cc") not in GRADES:
            raise ValueError(f"{r['id']}: chưa có grade_cc — chạy --apply-grades trước")
        gc, hieu = cross[r["id"]].get("grade_claude"), cross[r["id"]].get("hieu")
        if gc not in GRADES:
            raise ValueError(f"{r['id']}: grade_claude phải thuộc {GRADES}")
        r["grade_claude"] = gc
        if gc == r["grade_cc"]:
            r["grade_final"], r["grade_source"], r["hieu_decision"] = gc, "khop", None
        elif hieu in GRADES:
            r["grade_final"], r["grade_source"], r["hieu_decision"] = hieu, "hieu_quyet", hieu
        else:
            raise ValueError(f"{r['id']}: cc={r['grade_cc']} lệch claude={gc}, cần 'hieu' thuộc {GRADES}")
    report["verdict"] = verdict(report)
    return report


def verdict(report: dict) -> dict:
    """Ket luan vong theo DECISIONS muc d tu (A), (C) may va grade_final."""
    rows = report["rows"]
    a_n = sum(r["a"]["pass"] for r in rows)
    c_rows = [r for r in rows if r.get("c_machine")]
    c_n = sum(r["c_machine"] == "dat" for r in c_rows)
    b_rows = [r for r in rows if r["expected"] == "grounded"]
    b_dung = sum(r.get("grade_final") == "dung" for r in b_rows)
    b_sai = sum(r.get("grade_final") == "sai" for r in b_rows)
    wo = [r for r in rows if r["expected"] == "word_only"]
    out = {"A": {"pass_n": a_n, "n": len(rows), "pass": a_n == len(rows)},
           "C": {"pass_n": c_n, "n": len(c_rows), "pass": c_n == len(c_rows)},
           "B": {"dung": b_dung, "sai": b_sai, "n": len(b_rows), "min_dung": B_MIN_DUNG,
                 "pass": b_dung >= B_MIN_DUNG and b_sai == 0},
           "word_only": {r["id"]: r.get("grade_final") for r in wo},
           "word_only_pass": all(r.get("grade_final") == "dung" for r in wo)}
    out["pass"] = out["A"]["pass"] and out["C"]["pass"] and out["B"]["pass"] and out["word_only_pass"]
    return out


def observations(rows: list[dict]) -> dict:
    llm_rows = [r for r in rows if r.get("model_used")]
    totals = [r["usage"].get("total_tokens", 0) for r in llm_rows]
    lat = [r["latency_ms"] for r in rows if r.get("latency_ms") is not None]
    reason = [r["reasoning_tokens"] for r in llm_rows if r.get("reasoning_tokens") is not None]
    return {
        "grounded_empty_sources": [r["id"] for r in rows if r["expected"] == "grounded" and not r.get("source_ids")],
        "fallback_used": [r["id"] for r in rows if (r.get("attempts") or 0) > 1],
        "finish_length": [r["id"] for r in rows if r.get("finish_reason") == "length"],
        "llm_errors": {r["id"]: r["error"] for r in rows if r.get("error")},
        "llm_calls": len(llm_rows),
        "tokens": {"prompt": sum(r["usage"].get("prompt_tokens", 0) for r in llm_rows),
                   "completion": sum(r["usage"].get("completion_tokens", 0) for r in llm_rows),
                   "total": sum(totals),
                   "reasoning": sum(reason) if reason else None},
        "latency_ms": None if not lat else {"n": len(lat), "p50": round(ce.percentile(lat, 50), 1),
                                            "max": round(max(lat), 1)},
    }


C_LABEL = {None: "—", "dat": "ĐẠT", "can_xem": "CẦN XEM"}


def mark(ok: bool | None) -> str:
    return "—" if ok is None else ("ĐẠT" if ok else "TRƯỢT")


def summary_text(report: dict) -> str:
    rows, obs = report["rows"], report["observations"]
    n_pass = sum(r["a"]["pass"] for r in rows)
    lines = [f"Vòng {report['prompt_version']} · {report['model']} · commit {report['commit'][:7]}"
             + ("" if report["official"] else " · KHÔNG CHÍNH THỨC (--only)"), "",
             "| id | expected | decision | (A) | (C) máy | nguồn | model | finish | token | ms |",
             "|---|---|---|---|---|---|---|---|---|---|"]
    for r in rows:
        lines.append(f"| {r['id']} | {r['expected']} | {r['decision']} | {mark(r['a']['pass'])} | "
                     f"{C_LABEL[r.get('c_machine')]} | {', '.join(r['source_ids']) or '—'} | "
                     f"{r.get('model_used') or '—'} | {r.get('finish_reason') or '—'} | "
                     f"{r['usage'].get('total_tokens', '—') if r.get('usage') else '—'} | "
                     f"{'—' if r.get('latency_ms') is None else round(r['latency_ms'])} |")
    t, lat = obs["tokens"], obs["latency_ms"]
    c_rows = [r for r in rows if r.get("c_machine")]
    lines += ["", f"(A) {n_pass}/{len(rows)} · (C) máy {sum(r['c_machine'] == 'dat' for r in c_rows)}/{len(c_rows)}"
              " đạt (còn lại: cần xem)",
              f"Quan sát: grounded có source_ids rỗng {obs['grounded_empty_sources'] or '—'} · "
              f"dùng model dự phòng {obs['fallback_used'] or '—'} · finish=length {obs['finish_length'] or '—'}"
              f" · lỗi LLM {obs['llm_errors'] or '—'}",
              f"Token ({obs['llm_calls']} lần gọi): prompt {t['prompt']} · completion {t['completion']} · "
              f"tổng {t['total']} · suy luận {t['reasoning'] if t['reasoning'] is not None else 'API không trả'}",
              "Độ trễ LLM: " + ("—" if not lat else f"p50 {lat['p50']} ms · max {lat['max']} ms (n={lat['n']})")]
    return "\n".join(lines)


def _quote(text: str) -> str:
    return "\n".join("> " + ln if ln else ">" for ln in text.splitlines()) or "> (rỗng)"


def case_markdown(r: dict) -> str:
    out = [f"## {r['id']} — expected `{r['expected']}`", "", f"**Câu hỏi**: {r['question']}"]
    if r.get("word"):
        w = r["word"]
        out.append(f"**Từ đang học**: {w['term']} ({w['pos']}) — {w['meaning_vi']}")
    if r.get("history"):
        out.append("**History**:")
        out += [f"- {t['role']}: {t['content']}" for t in r["history"]]
    intent = r.get("intent")
    out += [f"**Trình độ**: {r.get('user_cefr') or 'không rõ'} · **Ghi chú ca**: {r['note']}",
            f"**Pipeline**: {r['decision']} ({r['reason']}) · ý định "
            + ("—" if not intent else f"{intent['label']} {intent['confidence']}")
            + f" · ngữ cảnh đã chọn [1..k]: {', '.join(r['selected_ids']) or '—'}", "",
            "**Câu trả lời**:", "", _quote(r.get("answer") or f"(lỗi LLM: {r.get('error')})"), "",
            f"**Nguồn**: {', '.join(r['source_ids']) or '—'}"]
    if r.get("model_used"):
        u = r["usage"]
        out.append(f"**LLM**: {r['model_used']} · {r['attempts']} lần gọi · finish `{r['finish_reason']}` · "
                   f"token {u.get('prompt_tokens')}/{u.get('completion_tokens')}/{u.get('total_tokens')} "
                   f"(prompt/completion/tổng) · {round(r['latency_ms'])} ms")
    a = r["a"]
    detail = ", ".join(f"{k} {mark(v)}" for k, v in a.items() if k != "pass")
    out.append(f"**(A)**: {mark(a['pass'])} — {detail}")
    if r.get("c_machine"):
        out.append(f"**(C) máy** (nguyên văn câu cố định): {C_LABEL[r['c_machine']]}")
    if r.get("grade_final"):
        out.append(f"**Chấm (B)**: Claude Code `{r['grade_cc']}` · Claude ở chat `{r['grade_claude']}` · "
                   f"cuối `{r['grade_final']}` ({'khớp' if r['grade_source'] == 'khop' else 'Hiếu quyết'})")
        out.append(f"**Lý do (Claude Code)**: {r['reason_cc']}")
    out += ["", f"Hiếu quyết (nếu lệch): {r.get('hieu_decision') or '___'}", ""]
    return "\n".join(out)


def report_markdown(report: dict) -> str:
    head = [f"# Vòng {report['prompt_version']} — 12 ca phát triển WSEA-140", "",
            f"- Thời điểm: {report['created_at']} · commit `{report['commit']}`"
            + (" (có thay đổi chưa commit)" if report["dirty"] else ""),
            f"- Model chính `{report['model']}`, dự phòng `{report['fallback_model']}` · tham số sinh "
            f"`{json.dumps(report['generation'], ensure_ascii=False)}`",
            f"- {'Kết quả chính thức của vòng' if report['official'] else 'KHÔNG chính thức (--only)'}",
            "- Tiêu chí: `docs/DECISIONS.md` mục 2026-11-02 — WSEA-140, phần d. (A) và (C) chấm máy. (B) và d10: "
            "Claude Code chấm, điểm chỉ ở file .json (`grade_cc`, `reason_cc`); Claude ở chat chấm lại độc lập; "
            "ca lệch Hiếu quyết ở dòng \"Hiếu quyết (nếu lệch)\".",
            "- Dấu hiệu code/toán/thơ trong (A) là heuristic thô; đọc toàn văn để chấm.", "",
            "## Tóm tắt", "", summary_text(report), ""]
    v = report.get("verdict")
    if v:
        head += ["## Kết luận (sau kiểm chéo)", "",
                 f"- (A) {v['A']['pass_n']}/{v['A']['n']}: {mark(v['A']['pass'])}",
                 f"- (C) {v['C']['pass_n']}/{v['C']['n']}: {mark(v['C']['pass'])}",
                 f"- (B) đúng {v['B']['dung']}/{v['B']['n']}, sai {v['B']['sai']} (cần ≥ {v['B']['min_dung']} đúng "
                 f"VÀ 0 sai): {mark(v['B']['pass'])}",
                 f"- word_only {v['word_only']}: {mark(v['word_only_pass'])}",
                 f"- **Vòng {report['prompt_version']}: {mark(v['pass'])}**", ""]
    return "\n".join(head + [case_markdown(r) for r in report["rows"]])


# --- Chay that -----------------------------------------------------------------------------------


class HeaderTap(httpx.AsyncBaseTransport):
    """Boc transport that, ghi status + header han muc cua moi phan hoi. Khong dong vao request/khoa."""

    def __init__(self) -> None:
        self.inner = httpx.AsyncHTTPTransport()
        self.events: list[dict] = []

    async def handle_async_request(self, request: httpx.Request) -> httpx.Response:
        resp = await self.inner.handle_async_request(request)
        hdr = {k.lower(): v for k, v in resp.headers.items()
               if k.lower().startswith("x-ratelimit") or k.lower() == "retry-after"}
        self.events.append({"status": resp.status_code, "headers": hdr})
        return resp

    async def aclose(self) -> None:
        await self.inner.aclose()


def git_state() -> dict:
    def git(*a):
        return subprocess.run(["git", *a], cwd=ROOT, capture_output=True, text=True, check=False).stdout.strip()
    return {"commit": git("rev-parse", "HEAD"), "dirty": bool(git("status", "--porcelain", "--", "app", "kb"))}


def rank_cases(cases: list[dict], args) -> tuple[dict, list, object]:
    from app.services import embedder as emb
    from scripts import eval_retrieval as ev
    from scripts import load_vectors as lv

    paths = cp.parse_args([])
    chunks_by_id = {str(c["id"]): c for c in lv.load_chunks(paths.chunks)}
    ids, p_vecs, _, _, errors = ev.load_passage_vectors(paths)
    if errors:
        raise SystemExit("Lỗi dữ liệu vector: " + "; ".join(errors))
    embedder = emb.Embedder(local_files_only=True)
    ranking = ev.rank_all(embedder.encode_queries([embed_text(c) for c in cases]), p_vecs, ids)
    return chunks_by_id, ranking, embedder


async def run_cases(cases, chunks_by_id, ranking, embedder, clf, settings) -> list[dict]:
    from app.services.llm import LLMClient, LLMUnavailable
    from app.services.pipeline import run_pipeline

    tap = HeaderTap()
    client = LLMClient.from_settings(settings, transport=tap)
    rows, totals = [], []
    try:
        for case, (ranked, dists) in zip(cases, ranking):
            req = build_case_request(case, ranked, dists, chunks_by_id)
            res = run_pipeline(req, embedder, clf, k_prompt=settings.pipeline_k_prompt,
                               k_vocab=settings.pipeline_k_vocab,
                               max_top1_distance=settings.pipeline_max_top1_distance)
            row = {**{k: case[k] for k in ("id", "source", "question", "word", "history", "user_cefr",
                                           "expected", "note")},
                   "decision": res.decision, "reason": res.reason,
                   "intent": None if res.intent is None else
                   {"label": res.intent.label, "confidence": round(res.intent.confidence, 4)},
                   "selected_ids": [c.id for c in res.contexts], "usage": {}}
            if res.decision != rules.ANSWER:
                row.update(answer=FIXED[res.decision], source_ids=[], model_used=None, attempts=0,
                           finish_reason=None, latency_ms=None, raw_text=None)
            else:
                n_events = len(tap.events)
                t = time.perf_counter()
                try:
                    out = await client.complete(pr.build_messages(req, res))
                    answer, ids = postprocess(out.text, res.contexts)
                    row.update(answer=answer, source_ids=ids, raw_text=out.text, model_used=out.model_used,
                               attempts=out.attempts, usage=out.usage, finish_reason=out.finish_reason,
                               reasoning_tokens=reasoning_tokens(out.usage))
                    totals.append(int(out.usage.get("total_tokens", 0)))
                except LLMUnavailable as exc:
                    row.update(answer=None, source_ids=[], error=exc.reason, attempts=exc.attempts,
                               model_used=None, finish_reason=None)
                row["latency_ms"] = round((time.perf_counter() - t) * 1000, 1)
                row["http"] = tap.events[n_events:]
                headers = tap.events[-1]["headers"] if len(tap.events) > n_events else {}
                wait = wait_seconds(headers, need_tokens(totals))
                row["waited_s"] = wait
                print(f"{case['id']}: {row.get('model_used') or row.get('error')} "
                      f"{row['latency_ms']:.0f} ms, chờ {wait:.1f} s", flush=True)
                if wait > 0 and case is not cases[-1]:
                    await asyncio.sleep(wait)
            fx = expected_fixed(row)
            row["fixed_text_exact"] = None if fx is None else row.get("answer") == fx
            row["a"] = check_a(row)
            row["c_machine"] = check_c(row)
            rows.append(row)
    finally:
        await client.aclose()
    return rows


def parse_args(argv):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--cases", type=Path, default=DEFAULT_CASES)
    ap.add_argument("--out-dir", type=Path, default=DEFAULT_OUT_DIR)
    ap.add_argument("--only", default=None, help="vd d01,d03 — chạy lại vài ca, KHÔNG chính thức")
    ap.add_argument("--apply-grades", type=Path, default=None,
                    help="JSON {id: {grade_cc, reason_cc}} -> ghi vào <vòng>.json có sẵn, không gọi LLM")
    ap.add_argument("--apply-crosscheck", type=Path, default=None,
                    help="JSON {id: {grade_claude, hieu?}} -> grade_final + kết luận, không gọi LLM")
    ap.add_argument("--round", default=pr.PROMPT_VERSION, help="vòng có sẵn để ghi điểm (mặc định PROMPT_VERSION)")
    return ap.parse_args(argv)


def apply_grades_main(args) -> int:
    out = args.out_dir / f"{args.round}.json"
    report = json.loads(out.read_text(encoding="utf-8"))
    if args.apply_grades:
        apply_grades(report, json.loads(args.apply_grades.read_text(encoding="utf-8")))
    if args.apply_crosscheck:
        apply_crosscheck(report, json.loads(args.apply_crosscheck.read_text(encoding="utf-8")))
    out.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    out.with_suffix(".md").write_text(report_markdown(report), encoding="utf-8")  # diem chi hien sau kiem cheo
    print(f"Đã ghi grade_cc vào {out.name} ({sum('grade_cc' in r for r in report['rows'])} ca); không in điểm.")
    return 0


def main(argv: list[str] | None = None) -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    logging.basicConfig(level=logging.WARNING, format="%(levelname)s %(name)s: %(message)s")
    args = parse_args(argv)
    if args.apply_grades or args.apply_crosscheck:
        return apply_grades_main(args)
    from app.config import settings
    from app.services.intent import IntentClassifier

    cases = select_cases(load_cases(args.cases), args.only)
    chunks_by_id, ranking, embedder = rank_cases(cases, args)
    clf = IntentClassifier.load()
    state = git_state()
    started = datetime.now(timezone.utc).isoformat(timespec="seconds")
    rows = asyncio.run(run_cases(cases, chunks_by_id, ranking, embedder, clf, settings))

    report = {
        "task": "WSEA-140", "step": "B3", "prompt_version": pr.PROMPT_VERSION, "official": not args.only,
        "created_at": started, "commit": state["commit"], "dirty": state["dirty"],
        "model": settings.llm_model, "fallback_model": settings.llm_fallback_model,
        "generation": {"temperature": settings.llm_temperature,
                       "max_completion_tokens": settings.llm_max_completion_tokens,
                       "reasoning_effort": settings.llm_reasoning_effort, "include_reasoning": False,
                       "timeout_s": settings.llm_timeout_s},
        "a_pass": sum(r["a"]["pass"] for r in rows), "n": len(rows),
        "observations": observations(rows), "rows": rows,
    }
    from scripts import load_vectors as lv
    report["files"] = {"cases": str(args.cases.relative_to(ROOT)).replace("\\", "/"),
                       "cases_sha256": lv.sha256(args.cases)}
    args.out_dir.mkdir(parents=True, exist_ok=True)
    stem = pr.PROMPT_VERSION if not args.only else f"{pr.PROMPT_VERSION}_only_{'_'.join(c['id'] for c in cases)}"
    (args.out_dir / f"{stem}.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n",
                                               encoding="utf-8")
    (args.out_dir / f"{stem}.md").write_text(report_markdown(report), encoding="utf-8")
    print()
    print(summary_text(report))
    print(f"\nĐã ghi {args.out_dir / stem}.json/.md")
    return 0


if __name__ == "__main__":
    sys.exit(main())

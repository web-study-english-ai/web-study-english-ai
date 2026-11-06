"""Thu that MOT cau tren /assistant/ask (JSON + SSE) cua server dang chay (WSEA-140 B4).

    .\\.venv\\Scripts\\uvicorn.exe app.main:app --host 127.0.0.1 --port 8000      # cua so khac, .env that
    .\\.venv\\Scripts\\python.exe scripts\\smoke_ask.py --case d01

Lam dung luong backend: POST /assistant/embed (cau hoi, + " (<term>)" neu co word) -> top-8 tren .npz da nap
DB (nhu scripts/run_llm_cases.py) -> POST /assistant/ask JSON, roi SSE. Moi lan /ask goi LLM that (~3k token).
Khoa x-api-key doc INTERNAL_API_KEY tu .env (hoac bien moi truong), KHONG in. Chi dung urllib.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

USER_AGENT = "wsea-smoke-ask/1.0"


def read_env_key(path: Path, name: str = "INTERNAL_API_KEY") -> str | None:
    """Gia tri cua name trong file .env (KEY=VALUE, bo nhay). Khong in."""
    if os.environ.get(name):
        return os.environ[name]
    if not path.exists():
        return None
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line.startswith(f"{name}="):
            return line.split("=", 1)[1].strip().strip('"').strip("'")
    return None


def parse_sse_block(block: str):
    """'data: {...}' -> dict; 'data: [DONE]' -> '[DONE]'; khac -> None."""
    block = block.strip()
    if not block.startswith("data:"):
        return None
    data = block[5:].strip()
    return data if data == "[DONE]" else json.loads(data)


def request(base: str, path: str, key: str, body: dict | None = None, accept: str = "application/json"):
    data = None if body is None else json.dumps(body, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(base + path, data=data, method="POST" if body is not None else "GET",
                                 headers={"x-api-key": key, "User-Agent": USER_AGENT, "Accept": accept,
                                          "Content-Type": "application/json"})
    return urllib.request.urlopen(req, timeout=60)


def wait_health(base: str, key: str, timeout_s: float = 180) -> None:
    t0 = time.monotonic()
    while time.monotonic() - t0 < timeout_s:
        try:
            with request(base, "/health", key) as r:
                if r.status == 200:
                    return
        except (urllib.error.URLError, ConnectionError):
            pass
        time.sleep(2)
    raise SystemExit(f"/health không trả 200 sau {timeout_s:.0f} s")


def build_body(base: str, key: str, case: dict) -> dict:
    import numpy as np

    from scripts import check_pipeline as cp
    from scripts import eval_retrieval as ev
    from scripts import load_vectors as lv
    from scripts import run_llm_cases as rc

    if case["contexts"] == "empty":
        return rc.build_case_request(case, None, None, {}).model_dump(mode="json")
    with request(base, "/assistant/embed", key, {"text": rc.embed_text(case)}) as r:
        vec = np.asarray(json.loads(r.read())["embedding"], dtype=np.float32)[None, :]
    paths = cp.parse_args([])
    chunks_by_id = {str(c["id"]): c for c in lv.load_chunks(paths.chunks)}
    ids, p_vecs, _, _, errors = ev.load_passage_vectors(paths)
    if errors:
        raise SystemExit("Lỗi dữ liệu vector: " + "; ".join(errors))
    ranked, dists = ev.rank_all(vec, p_vecs, ids)[0]
    return rc.build_case_request(case, ranked, dists, chunks_by_id).model_dump(mode="json")


def ask_json(base: str, key: str, body: dict) -> dict:
    t0 = time.perf_counter()
    with request(base, "/assistant/ask", key, body) as r:
        data = json.loads(r.read())
        timing = r.headers.get("server-timing")
    return {"status": 200, "total_ms": round((time.perf_counter() - t0) * 1000), "server_timing": timing, **data}


def ask_sse(base: str, key: str, body: dict) -> dict:
    t0 = time.perf_counter()
    first_ms, deltas, final, done = None, [], None, False
    with request(base, "/assistant/ask", key, body, accept="text/event-stream") as r:
        headers = {k.lower(): v for k, v in r.headers.items()}
        buf = ""
        for raw in r:  # doc tung dong khi server day
            buf += raw.decode("utf-8")
            while "\n\n" in buf:
                block, buf = buf.split("\n\n", 1)
                ev = parse_sse_block(block)
                if ev is None:
                    continue
                if first_ms is None:
                    first_ms = round((time.perf_counter() - t0) * 1000)
                if ev == "[DONE]":
                    done = True
                elif "delta" in ev:
                    deltas.append(ev["delta"])
                else:
                    final = ev
    return {"status": 200, "first_frame_ms": first_ms, "total_ms": round((time.perf_counter() - t0) * 1000),
            "n_delta": len(deltas), "deltas_join_equals_answer": final is not None and "".join(deltas) == final["answer"],
            "done": done, "final": final,
            "headers": {k: headers.get(k) for k in ("content-type", "cache-control", "x-accel-buffering",
                                                    "server-timing")}}


def main(argv: list[str] | None = None) -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--base", default="http://127.0.0.1:8000")
    ap.add_argument("--case", default="d01")
    ap.add_argument("--env", type=Path, default=ROOT / ".env")
    args = ap.parse_args(argv)
    from scripts import run_llm_cases as rc

    key = read_env_key(args.env)
    if not key:
        raise SystemExit("Thiếu INTERNAL_API_KEY trong .env / biến môi trường")
    case = rc.select_cases(rc.load_cases(rc.DEFAULT_CASES), args.case)[0]
    wait_health(args.base, key)
    body = build_body(args.base, key, case)
    print(f"Ca {case['id']}: {case['question']} · {len(body['contexts'])} ngữ cảnh gửi đi")
    for name, fn in (("JSON", ask_json), ("SSE", ask_sse)):
        try:
            out = fn(args.base, key, body)
        except urllib.error.HTTPError as exc:
            out = {"status": exc.code, "detail": exc.read().decode("utf-8", "replace")}
        print(f"\n=== {name} ===")
        print(json.dumps(out, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())

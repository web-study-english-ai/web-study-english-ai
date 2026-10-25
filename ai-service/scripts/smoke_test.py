"""Smoke test cho ai-service dang chay (cuc bo, Docker hoac HF Spaces) - WSEA-82.

Chi dung thu vien chuan de chay duoc ca tren may khong co .venv.

    python scripts/smoke_test.py --wait
    python scripts/smoke_test.py --url https://hieusss-wsea-ai-service.hf.space --wait --key-env AI_KEY

Khoa chi doc tu bien moi truong ten --key-env. KHONG doc file .env va KHONG in khoa:
log terminal hay bi chup man hinh dan vao Jira.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.request

# The mau theo PROGRESS.md: R = (1 + 19/81 * 3 / 12.5) ^ -0.5
SAMPLE_CARD = {
    "card_id": "smoke-1",
    "stability": 12.5,
    "difficulty": 5.2,
    "elapsed_days": 3,
    "rating": 3,
}
EXPECTED_R = 0.97299
EXPECTED_S = 25.72
TOL_R = 1e-4
TOL_S = 0.01  # S' ky vong lam tron 2 chu so

BATCH_SIZE = 500
BATCH_RUNS = 20
# Backend timeout 3 giay roi fallback (CLAUDE.md) -> p95 phai duoi nguong nay
LATENCY_BUDGET_MS = 3000.0


def request(
    base: str,
    method: str,
    path: str,
    body: dict | None = None,
    key: str | None = None,
    timeout: float = 10.0,
) -> tuple[int, dict | None, float]:
    """Goi mot endpoint, tra (status, json, ms). status=0 nghia la khong ket noi duoc."""
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(base.rstrip("/") + path, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    if key is not None:
        req.add_header("x-api-key", key)

    started = time.perf_counter()
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            status, raw = resp.status, resp.read()
    except urllib.error.HTTPError as exc:
        status, raw = exc.code, exc.read()
    except (urllib.error.URLError, OSError):
        return 0, None, (time.perf_counter() - started) * 1000
    elapsed_ms = (time.perf_counter() - started) * 1000

    try:
        payload = json.loads(raw) if raw else None
    except json.JSONDecodeError:
        payload = None
    return status, payload, elapsed_ms


def wait_for_health(base: str, max_wait: float) -> float | None:
    """Cho /health tra 200. Tra so giay da cho, None neu het gio."""
    started = time.perf_counter()
    while time.perf_counter() - started < max_wait:
        status, _, _ = request(base, "GET", "/health", timeout=5.0)
        if status == 200:
            return time.perf_counter() - started
        time.sleep(1.0)
    return None


def percentile(values: list[float], pct: float) -> float:
    """Phan vi theo kieu nearest-rank, du dung cho 20 mau."""
    ordered = sorted(values)
    rank = max(1, round(pct / 100 * len(ordered)))
    return ordered[rank - 1]


def check_health(base: str) -> tuple[bool, str]:
    status, body, _ = request(base, "GET", "/health")
    body = body or {}
    print(
        f"  /health: HTTP {status}  status={body.get('status')}  "
        f"models={body.get('models')}  model_version={body.get('model_version')}"
    )
    ok = status == 200 and body.get("status") == "ok" and "fsrs" in body.get("models", [])
    return ok, f"HTTP {status}, models={body.get('models')}"


def check_no_key(base: str) -> tuple[bool, str]:
    status, _, _ = request(
        base, "POST", "/predict-retention", body={"cards": [SAMPLE_CARD]}
    )
    print(f"  /predict-retention khong khoa: HTTP {status} (ky vong 401)")
    return status == 401, f"HTTP {status}"


def check_sample_card(base: str, key: str) -> tuple[bool, str]:
    status, body, _ = request(
        base, "POST", "/predict-retention", body={"cards": [SAMPLE_CARD]}, key=key
    )
    if status != 200 or not body:
        print(f"  the mau: HTTP {status}")
        return False, f"HTTP {status}"
    card = body["results"][0]
    r, s = card["retrievability"], card["new_stability"]
    print(
        f"  the mau: R={r:.5f} (ky vong {EXPECTED_R})  "
        f"S'={s:.2f} (ky vong {EXPECTED_S})  interval={card['interval_days']}"
    )
    ok = abs(r - EXPECTED_R) <= TOL_R and abs(s - EXPECTED_S) <= TOL_S
    return ok, f"R={r:.5f}, S'={s:.2f}"


def check_camel_case(base: str, key: str) -> tuple[bool, str]:
    card = {k: v for k, v in SAMPLE_CARD.items() if k != "elapsed_days"}
    card["elapsedDays"] = SAMPLE_CARD["elapsed_days"]
    status, _, _ = request(
        base, "POST", "/predict-retention", body={"cards": [card]}, key=key
    )
    print(f"  camelCase elapsedDays: HTTP {status} (ky vong 422)")
    return status == 422, f"HTTP {status}"


def check_latency(base: str, key: str, batch_size: int) -> tuple[bool, str]:
    cards = [dict(SAMPLE_CARD, card_id=f"smoke-{i}") for i in range(batch_size)]
    timings, statuses = [], []
    for _ in range(BATCH_RUNS):
        status, _, ms = request(
            base, "POST", "/predict-retention", body={"cards": cards}, key=key,
            timeout=30.0,
        )
        statuses.append(status)
        timings.append(ms)
    p50, p95 = percentile(timings, 50), percentile(timings, 95)
    n_ok = statuses.count(200)
    print(
        f"  lo {batch_size} the x {BATCH_RUNS} lan: p50={p50:.1f} ms  "
        f"p95={p95:.1f} ms  ({n_ok}/{BATCH_RUNS} HTTP 200)"
    )
    ok = n_ok == BATCH_RUNS and p95 < LATENCY_BUDGET_MS
    return ok, f"p50={p50:.1f} ms, p95={p95:.1f} ms"


def print_summary(results: list[tuple[str, bool, str]]) -> None:
    width = max(len(name) for name, _, _ in results)
    print("\nTom tat")
    print("-" * (width + 40))
    for name, ok, detail in results:
        print(f"  {name:<{width}}  {'DAT     ' if ok else 'KHONG DAT'}  {detail}")
    print("-" * (width + 40))
    n_ok = sum(ok for _, ok, _ in results)
    print(f"  {n_ok}/{len(results)} ca dat")


def main() -> int:
    parser = argparse.ArgumentParser(description="Smoke test ai-service")
    parser.add_argument("--url", default="http://localhost:7860")
    parser.add_argument("--wait", action="store_true", help="cho /health tra 200 truoc")
    parser.add_argument("--wait-timeout", type=float, default=180.0)
    parser.add_argument("--key-env", metavar="TEN_BIEN", help="ten bien moi truong chua khoa")
    args = parser.parse_args()

    key = None
    if args.key_env:
        key = os.environ.get(args.key_env)
        if not key:
            print(f"Bien moi truong {args.key_env} chua dat hoac rong", file=sys.stderr)
            return 2

    print(f"Dich vu: {args.url}")
    results: list[tuple[str, bool, str]] = []

    if args.wait:
        waited = wait_for_health(args.url, args.wait_timeout)
        if waited is None:
            print(f"  /health khong tra 200 sau {args.wait_timeout:.0f} s")
            results.append(("cho /health", False, f"> {args.wait_timeout:.0f} s"))
            print_summary(results)
            return 1
        print(f"  /health tra 200 sau {waited:.1f} s")
        results.append(("cho /health", True, f"{waited:.1f} s"))

    results.append(("GET /health", *check_health(args.url)))
    results.append(("khong khoa -> 401", *check_no_key(args.url)))

    if key is not None:
        results.append(("the mau R, S'", *check_sample_card(args.url, key)))
        results.append(("camelCase -> 422", *check_camel_case(args.url, key)))
        for size in (1, BATCH_SIZE):
            results.append((f"do tre lo {size}", *check_latency(args.url, key, size)))
    else:
        print("  (bo qua ca can khoa: khong co --key-env)")

    print_summary(results)
    return 0 if all(ok for _, ok, _ in results) else 1


if __name__ == "__main__":
    sys.exit(main())

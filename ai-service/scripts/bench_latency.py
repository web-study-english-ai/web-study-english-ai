"""Do do tre POST /predict-retention, tach phan mang khoi phan may chu - WSEA-97.

Chi dung thu vien chuan. Doc header Server-Timing do app tra ve (tensor, model,
check, build, app) roi tinh ngoai_app = client - app (mang + TLS + proxy HF).

    python scripts/bench_latency.py --key-env AI_KEY
    python scripts/bench_latency.py --url https://hieusss-wsea-ai-service.hf.space \
        --key-env AI_KEY --out outputs/latency/bench_hf.json

Hai che do ket noi trong mot lan chay:
  new       - moi request mot HTTP(S)Connection moi roi dong (gom TCP + TLS);
  keepalive - mot connection dung lai cho ca chuoi (warmup + cac lan do).
Cuoi cung: thi nghiem "lo vs le" o che do keepalive, lap BATCH_VS_SINGLE_REPS lan.

Khoa chi doc tu bien moi truong ten --key-env. KHONG in khoa, KHONG ghi vao JSON.
"""

from __future__ import annotations

import argparse
import http.client
import json
import os
import platform
import random
import ssl
import statistics
import sys
import time
import urllib.parse
from datetime import datetime, timezone

# Cung thu muc scripts/ -> import duoc khi chay "python scripts/bench_latency.py".
# Dung lai dung ham cua smoke_test de percentile tinh giong het.
from smoke_test import percentile

STEP_NAMES = ("tensor", "model", "check", "build")
BATCH_VS_SINGLE_REPS = 5
NEW_CARD_RATIO = 0.2
PATH = "/predict-retention"


class BenchError(RuntimeError):
    """Request khong tra 200 hoac khong ket noi duoc -> dung ca lan chay."""


# --- Du lieu thu -------------------------------------------------------------


def make_cards(n: int, rng: random.Random, prefix: str) -> list[dict]:
    """Sinh n the hop le theo schema: co the moi lan the cu, rating 1..4."""
    cards = []
    for i in range(n):
        card = {"card_id": f"{prefix}-{i}", "rating": rng.randint(1, 4)}
        if rng.random() < NEW_CARD_RATIO:
            card["elapsed_days"] = 0.0
        else:
            # S rai deu theo thang log 0.1..365 ngay
            stability = 10 ** rng.uniform(-1, 2.5623)
            card["stability"] = round(stability, 4)
            card["difficulty"] = round(rng.uniform(1, 10), 4)
            card["elapsed_days"] = round(min(rng.uniform(0, 2 * stability), 36500), 4)
        cards.append(card)
    return cards


# --- HTTP ----------------------------------------------------------------------


class Target:
    """Thong tin dich toi, tao connection moi khi can."""

    def __init__(self, url: str, key: str, timeout: float) -> None:
        parts = urllib.parse.urlsplit(url)
        if parts.scheme not in ("http", "https") or not parts.hostname:
            raise SystemExit(f"URL khong hop le: {url}")
        self.https = parts.scheme == "https"
        self.host = parts.hostname
        self.port = parts.port
        self.path = parts.path.rstrip("/") + PATH
        self.key = key
        self.timeout = timeout
        self.ssl_context = ssl.create_default_context() if self.https else None

    def connect(self) -> http.client.HTTPConnection:
        if self.https:
            return http.client.HTTPSConnection(
                self.host, self.port, timeout=self.timeout, context=self.ssl_context
            )
        return http.client.HTTPConnection(self.host, self.port, timeout=self.timeout)


def parse_server_timing(header: str | None) -> dict[str, float] | None:
    """'a;dur=1.2, b;dur=3' -> {'a': 1.2, 'b': 3.0}. Thieu header -> None."""
    if not header:
        return None
    out = {}
    for part in header.split(","):
        fields = [f.strip() for f in part.split(";")]
        for field in fields[1:]:
            if field.startswith("dur="):
                out[fields[0]] = float(field[4:])
    return out or None


def _error_detail(raw: bytes) -> str:
    try:
        detail = json.loads(raw).get("detail")
    except (ValueError, AttributeError):
        detail = raw[:200].decode("utf-8", "replace")
    return str(detail)[:300]


def _send_once(conn, target: Target, body: bytes) -> tuple[int, bytes, str | None]:
    conn.request(
        "POST",
        target.path,
        body=body,
        headers={"Content-Type": "application/json", "x-api-key": target.key},
    )
    resp = conn.getresponse()
    raw = resp.read()  # doc het body moi dung lai duoc connection
    return resp.status, raw, resp.getheader("Server-Timing")


def timed_post(conn, target: Target, cards: list[dict]) -> tuple[dict, object]:
    """Gui mot request tren conn. Tra (mau do, conn) - conn co the da duoc mo lai.

    reconnected=True khi phai mo socket moi giua chuoi keepalive (server/proxy dong
    ket noi): mau do gom ca TCP + TLS, can biet de khong doc nham.
    """
    body = json.dumps({"cards": cards}).encode()
    reconnected = conn.sock is None
    started = time.perf_counter()
    try:
        status, raw, st_header = _send_once(conn, target, body)
    except (http.client.RemoteDisconnected, ConnectionError, BrokenPipeError):
        # Ket noi cu bi dong im lang -> mo lai va gui lai mot lan, do lai tu dau.
        conn.close()
        conn = target.connect()
        reconnected = True
        started = time.perf_counter()
        try:
            status, raw, st_header = _send_once(conn, target, body)
        except OSError as exc:
            raise BenchError(f"khong ket noi duoc: {type(exc).__name__}") from exc
    except OSError as exc:
        raise BenchError(f"khong ket noi duoc: {type(exc).__name__}") from exc
    client_ms = (time.perf_counter() - started) * 1000

    if status != 200:
        raise BenchError(f"HTTP {status} voi lo {len(cards)} the: {_error_detail(raw)}")

    server = parse_server_timing(st_header)
    outside = client_ms - server["app"] if server and "app" in server else None
    sample = {
        "client_ms": client_ms,
        "server": server,
        "outside_app_ms": outside,
        "reconnected": reconnected,
    }
    return sample, conn


# --- Cac chuoi do ------------------------------------------------------------


def run_series(
    target: Target, mode: str, cards: list[dict], runs: int, warmup: int
) -> list[dict]:
    """warmup lan (bo) + runs lan (giu). keepalive: mot conn cho ca chuoi."""
    samples = []
    conn = target.connect()
    try:
        for i in range(warmup + runs):
            if mode == "new" and i > 0:
                conn.close()
                conn = target.connect()
            sample, conn = timed_post(conn, target, cards)
            if i >= warmup:
                if mode == "new":
                    sample["reconnected"] = False  # mo moi la binh thuong o che do nay
                samples.append(sample)
    finally:
        conn.close()
    return samples


def run_batch_vs_single(target: Target, cards: list[dict], reps: int) -> list[dict]:
    """Moi lan lap: 1 request x N the, roi N request x 1 the, cung mot conn keepalive."""
    n = len(cards)
    reps_out = []
    conn = target.connect()
    try:
        # Lam nong ket noi va dich vu, khong tinh
        _, conn = timed_post(conn, target, cards)
        _, conn = timed_post(conn, target, cards[:1])
        for rep in range(reps):
            started = time.perf_counter()
            batch, conn = timed_post(conn, target, cards)
            batch_total = (time.perf_counter() - started) * 1000

            singles = []
            started = time.perf_counter()
            for card in cards:
                sample, conn = timed_post(conn, target, [card])
                singles.append(sample)
            singles_total = (time.perf_counter() - started) * 1000

            reps_out.append(
                {
                    "rep": rep,
                    "n_cards": n,
                    "batch_total_ms": batch_total,
                    "batch_ms_per_card": batch_total / n,
                    "batch_sample": batch,
                    "singles_total_ms": singles_total,
                    "singles_ms_per_card": singles_total / n,
                    "singles_samples": singles,
                }
            )
    finally:
        conn.close()
    return reps_out


# --- Tom tat va in -----------------------------------------------------------


def _p(values: list[float], pct: float) -> float | None:
    return percentile(values, pct) if values else None


def summarize(samples: list[dict]) -> dict:
    client = [s["client_ms"] for s in samples]
    with_st = [s["server"] for s in samples if s["server"]]
    outside = [s["outside_app_ms"] for s in samples if s["outside_app_ms"] is not None]
    out = {
        "n": len(samples),
        "n_with_server_timing": len(with_st),
        "n_reconnected": sum(s["reconnected"] for s in samples),
        "client_p50": _p(client, 50),
        "client_p95": _p(client, 95),
        "outside_app_p50": _p(outside, 50),
    }
    for name in (*STEP_NAMES, "app"):
        out[f"{name}_p50"] = _p([st[name] for st in with_st if name in st], 50)
    return out


def _fmt(v: float | None, digits: int = 1) -> str:
    return "—" if v is None else f"{v:.{digits}f}"


def print_table(series: list[dict]) -> None:
    print("\n| che do | co lo | client p50 / p95 (ms) | app p50 | model p50 | ngoai app p50 |")
    print("|---|---|---|---|---|---|")
    for s in series:
        sm = s["summary"]
        print(
            f"| {s['mode']} | {s['batch_size']} | "
            f"{_fmt(sm['client_p50'])} / {_fmt(sm['client_p95'])} | "
            f"{_fmt(sm['app_p50'], 2)} | {_fmt(sm['model_p50'], 3)} | "
            f"{_fmt(sm['outside_app_p50'])} |"
        )
    for s in series:
        sm = s["summary"]
        if sm["n_with_server_timing"] < sm["n"]:
            print(
                f"  CANH BAO: {s['mode']}/{s['batch_size']}: chi "
                f"{sm['n_with_server_timing']}/{sm['n']} response co Server-Timing "
                "(proxy co the da xoa header) -> cot app/model/ngoai app de trong."
            )
        if s["mode"] == "keepalive" and sm["n_reconnected"]:
            print(
                f"  CANH BAO: keepalive/{s['batch_size']}: {sm['n_reconnected']} mau "
                "phai mo lai ket noi (gom ca TCP + TLS)."
            )


def _stats(values: list[float]) -> dict:
    return {"median": statistics.median(values), "min": min(values), "max": max(values)}


def summarize_batch_vs_single(reps: list[dict]) -> dict:
    keys = ("batch_total_ms", "batch_ms_per_card", "singles_total_ms", "singles_ms_per_card")
    out = {k: _stats([r[k] for r in reps]) for k in keys}
    out["n_reconnected"] = sum(
        r["batch_sample"]["reconnected"] + sum(s["reconnected"] for s in r["singles_samples"])
        for r in reps
    )
    return out


def print_batch_vs_single(summary: dict, n: int, reps: int) -> None:
    print(f"\nLo vs le (keepalive, {n} the, {reps} lan lap) - trung vi [min; max]")
    print("| cach gui | tong (ms) | ms/the |")
    print("|---|---|---|")
    for label, prefix in ((f"1 request x {n} the", "batch"), (f"{n} request x 1 the", "singles")):
        t, per = summary[f"{prefix}_total_ms"], summary[f"{prefix}_ms_per_card"]
        print(
            f"| {label} | {t['median']:.1f} [{t['min']:.1f}; {t['max']:.1f}] | "
            f"{per['median']:.3f} [{per['min']:.3f}; {per['max']:.3f}] |"
        )
    ratio = summary["singles_total_ms"]["median"] / summary["batch_total_ms"]["median"]
    print(f"  le / lo (trung vi tong): x{ratio:.1f}")
    if summary["n_reconnected"]:
        print(f"  CANH BAO: {summary['n_reconnected']} request phai mo lai ket noi.")


# --- main ----------------------------------------------------------------------


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Do do tre /predict-retention")
    # 127.0.0.1 thay vi localhost: tren Windows localhost ra ::1 truoc, uvicorn chi
    # nghe IPv4 -> moi ket noi moi mat ~2 s cho IPv6 that bai, lam sai che do "new".
    parser.add_argument("--url", default="http://127.0.0.1:7860")
    parser.add_argument("--key-env", metavar="TEN_BIEN", required=True,
                        help="ten bien moi truong chua khoa")
    parser.add_argument("--runs", type=int, default=30)
    parser.add_argument("--warmup", type=int, default=3)
    parser.add_argument("--sizes", default="1,500", help="cac co lo, cach nhau dau phay")
    parser.add_argument("--singles", type=int, default=50, help="N cho thi nghiem lo vs le")
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--timeout", type=float, default=30.0)
    parser.add_argument("--out", help="file JSON ghi ket qua (tuy chon)")
    args = parser.parse_args()
    try:
        args.sizes = [int(s) for s in args.sizes.split(",") if s.strip()]
    except ValueError:
        parser.error("--sizes phai la cac so nguyen cach nhau dau phay")
    if not args.sizes or any(not 1 <= s <= 500 for s in args.sizes):
        parser.error("moi co lo phai trong 1..500 (hop dong API)")
    if args.runs < 1 or args.warmup < 0 or not 1 <= args.singles <= 500:
        parser.error("--runs >= 1, --warmup >= 0, --singles trong 1..500")
    return args


def run_all(target: Target, args: argparse.Namespace) -> tuple[list[dict], list[dict]]:
    rng = random.Random(args.seed)
    payloads = {size: make_cards(size, rng, f"bench-{size}") for size in args.sizes}
    series = []
    for mode in ("new", "keepalive"):
        for size in args.sizes:
            print(f"  {mode:<9} lo {size:>3}: {args.warmup} warmup + {args.runs} lan ...",
                  flush=True)
            samples = run_series(target, mode, payloads[size], args.runs, args.warmup)
            series.append({"mode": mode, "batch_size": size, "samples": samples,
                           "summary": summarize(samples)})
    print(f"  lo vs le: {BATCH_VS_SINGLE_REPS} lan x (1x{args.singles} + "
          f"{args.singles}x1) ...", flush=True)
    single_cards = make_cards(args.singles, rng, "bench-single")
    reps = run_batch_vs_single(target, single_cards, BATCH_VS_SINGLE_REPS)
    return series, reps


def write_json(path: str, args: argparse.Namespace, series, reps, bvs) -> None:
    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        # Chi ghi TEN bien moi truong, khong bao gio ghi gia tri khoa
        "config": {
            "url": args.url, "key_env": args.key_env, "runs": args.runs,
            "warmup": args.warmup, "sizes": args.sizes, "singles": args.singles,
            "seed": args.seed, "timeout": args.timeout,
            "batch_vs_single_reps": BATCH_VS_SINGLE_REPS,
            "new_card_ratio": NEW_CARD_RATIO, "python": platform.python_version(),
        },
        "series": series,
        "batch_vs_single": {"summary": bvs, "reps": reps},
    }
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)
    print(f"\nDa ghi {path}")


def main() -> int:
    args = parse_args()
    key = os.environ.get(args.key_env)
    if not key:
        print(f"Bien moi truong {args.key_env} chua dat hoac rong", file=sys.stderr)
        return 2

    target = Target(args.url, key, args.timeout)
    print(f"Dich vu: {args.url}  (seed={args.seed})")
    if target.host == "localhost":
        print("Canh bao: tren Windows nen dung 127.0.0.1 "
              "(localhost thu IPv6 truoc, +2 s moi ket noi moi)")
    try:
        series, reps = run_all(target, args)
    except BenchError as exc:
        print(f"\nDUNG: {exc}", file=sys.stderr)
        return 1

    print_table(series)
    bvs = summarize_batch_vs_single(reps)
    print_batch_vs_single(bvs, args.singles, BATCH_VS_SINGLE_REPS)
    if args.out:
        write_json(args.out, args, series, reps, bvs)
    return 0


if __name__ == "__main__":
    sys.exit(main())

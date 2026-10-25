"""Xac nhan moc MK-3: mo hinh du bao chay dung tren moi truong that - WSEA-98.

Hai lenh con, chi dung thu vien chuan + torch (de tinh gia tri ky vong):

  probe   - goi dinh ky /health va /predict-retention voi 3 the chuan, ghi JSONL.
  compare - dung lai dung payload backend da gui tu CSV bang reviews, gui toi
            mot hoac nhieu URL, so voi so lieu trong DB va so cac URL voi nhau.

    python scripts/verify_mk3.py probe --url https://hieusss-wsea-ai-service.hf.space \
        --key-env AI_KEY --weights <duong_dan>/params.json --out outputs/mk3/probe.jsonl
    python scripts/verify_mk3.py probe --summarize outputs/mk3/probe.jsonl
    python scripts/verify_mk3.py compare --csv reviews.csv --key-env AI_KEY \
        --url http://127.0.0.1:7860 --url https://hieusss-wsea-ai-service.hf.space \
        --out outputs/mk3/compare.json

Gia tri ky vong cua probe: tinh bang chinh FSRSModel.predict_step (ham ma test
test_predict_step.py khoa vao forward) voi trong so --weights; khong co --weights
thi dung DEFAULT_W (phien ban "default-untrained", nhu pytest). Voi v1 con doi chieu
them hang so EXPECTED_R / EXPECTED_S cua smoke_test.py truoc khi chay.

Khoa chi doc tu bien moi truong ten --key-env. KHONG in khoa, KHONG ghi vao file.
CSV la du lieu nguoi hoc: KHONG dat trong repo, file --out chi chua tom tat.
"""

from __future__ import annotations

import argparse
import csv
import http.client
import itertools
import json
import math
import os
import socket
import sys
import time
import urllib.parse
from datetime import datetime, timezone
from pathlib import Path

# Import duoc ca khi chay "python scripts/verify_mk3.py" lan khi pytest import
# scripts.verify_mk3: can thu muc scripts/ (smoke_test, bench_latency) va ai-service/ (app).
_HERE = Path(__file__).resolve().parent
for _p in (_HERE, _HERE.parent):
    if str(_p) not in sys.path:
        sys.path.insert(0, str(_p))

from bench_latency import Target, _error_detail, parse_server_timing  # noqa: E402
from smoke_test import EXPECTED_R, EXPECTED_S, SAMPLE_CARD, TOL_R, TOL_S, percentile  # noqa: E402

PREDICT_PATH = "/predict-retention"
HEALTH_PATH = "/health"
DEFAULT_VERSION = "default-untrained"  # trung app.models.weights.DEFAULT_VERSION
BACKEND_TIMEOUT_S = 3.0  # backend AI_TIMEOUT_MS mac dinh 3000
MAX_COMPARE_BATCH = 100  # docs/DECISIONS.md 2026-10-22: lo replay toi da ~100 the
FIELDS = ("retrievability", "new_stability", "new_difficulty", "interval_days")

# 3 the chuan cua probe. The thu 3 la the mau cua smoke_test.
PROBE_CARDS = [
    {"card_id": "mk3-moi-g3", "stability": None, "difficulty": None,
     "elapsed_days": 0.0, "rating": 3},
    {"card_id": "mk3-moi-g1", "stability": None, "difficulty": None,
     "elapsed_days": 0.0, "rating": 1},
    dict(SAMPLE_CARD, card_id="mk3-cu-g3", elapsed_days=float(SAMPLE_CARD["elapsed_days"])),
]

CSV_COLUMNS = (
    "id", "reviewed_at", "rating", "elapsed_days", "stability_before",
    "difficulty_before", "predicted_retrievability", "stability_after",
    "difficulty_after", "next_interval_days", "state_before", "model_version",
)
NULL_TOKENS = {"", "null", "none", "\\n", "nan"}


# --- HTTP (moi request mot ket noi MOI, giong backend khong giu ket noi) ------


def http_call(
    target: Target, method: str, path: str, key: str | None = None,
    body: dict | None = None,
) -> dict:
    """Goi mot lan tren ket noi moi. Khong nem ngoai le: loi ghi vao 'error'.

    timeout=True khi socket het gio HOAC tong thoi gian vuot target.timeout
    (timeout socket tinh tung thao tac, connect + read co the cong lai > 3 s).
    """
    headers = {"Content-Type": "application/json"}
    if key is not None:
        headers["x-api-key"] = key
    data = json.dumps(body).encode() if body is not None else None
    out = {"status": None, "body": None, "ms": None, "server_timing": None,
           "timeout": False, "error": None}
    conn = target.connect()
    started = time.perf_counter()
    try:
        conn.request(method, path, body=data, headers=headers)
        resp = conn.getresponse()
        raw = resp.read()
        out["status"] = resp.status
        out["server_timing"] = parse_server_timing(resp.getheader("Server-Timing"))
        if resp.status == 200:
            try:
                out["body"] = json.loads(raw)
            except ValueError:
                out["error"] = "body khong phai JSON"
        else:
            out["error"] = f"HTTP {resp.status}: {_error_detail(raw)}"
    except (socket.timeout, TimeoutError):
        out["timeout"] = True
        out["error"] = "timeout"
    except OSError as exc:
        out["error"] = f"khong ket noi duoc: {type(exc).__name__}"
    except http.client.HTTPException as exc:
        out["error"] = f"loi HTTP: {type(exc).__name__}"
    finally:
        out["ms"] = (time.perf_counter() - started) * 1000
        conn.close()
    if out["ms"] > target.timeout * 1000:
        out["timeout"] = True
    return out


def make_target(url: str, key: str, timeout: float) -> tuple[Target, str]:
    """Tra (Target, tien to duong dan). Target cua bench_latency kiem URL hop le."""
    target = Target(url, key, timeout)
    prefix = target.path[: -len("/predict-retention")]
    if target.host == "localhost":
        print("Canh bao: tren Windows nen dung 127.0.0.1 "
              "(localhost thu IPv6 truoc, +2 s moi ket noi moi)")
    return target, prefix


# --- Gia tri ky vong ---------------------------------------------------------


def load_weights(path: str | None) -> tuple[list[float] | None, str]:
    """(w, version). path None -> (None, default-untrained) = DEFAULT_W."""
    if path is None:
        return None, DEFAULT_VERSION
    from app.models.weights import _validate  # cung bo kiem tra nhu khi dich vu nap

    with open(path, encoding="utf-8") as f:
        payload = json.load(f)
    version = payload.get("version")
    if not version:
        raise SystemExit(f"{path} khong co truong 'version'")
    return _validate(payload.get("w")), version


def compute_expected(cards: list[dict], w: list[float] | None,
                     max_interval: float) -> list[dict]:
    """Chay FSRSModel.predict_step giong het router (float32, round, clamp)."""
    import torch

    from app.models.fsrs import FSRSModel

    model = FSRSModel(w)
    model.eval()
    is_new = [c["stability"] is None for c in cards]
    # Gia tri giu cho 1.0 / 5.0 cho the moi, giong _to_tensors trong router
    s_in = [1.0 if new else c["stability"] for c, new in zip(cards, is_new)]
    d_in = [5.0 if new else c["difficulty"] for c, new in zip(cards, is_new)]
    with torch.no_grad():
        r, s, d, i = model.predict_step(
            stability=torch.tensor(s_in, dtype=torch.float32),
            difficulty=torch.tensor(d_in, dtype=torch.float32),
            elapsed_days=torch.tensor([c["elapsed_days"] for c in cards], dtype=torch.float32),
            rating=torch.tensor([c["rating"] for c in cards], dtype=torch.long),
            is_new=torch.tensor(is_new, dtype=torch.bool),
            max_interval=max_interval,
        )
    return [
        {"card_id": c["card_id"],
         "retrievability": None if new else rr,
         "new_stability": ss, "new_difficulty": dd, "interval_days": int(ii)}
        for c, new, rr, ss, dd, ii in zip(cards, is_new, r.tolist(), s.tolist(),
                                          d.tolist(), i.tolist())
    ]


def check_reference(expected: list[dict], version: str) -> None:
    """v1: the cu phai khop hang so smoke_test (R 5 chu so, S' 2 chu so)."""
    if version != "v1":
        return
    old = expected[2]
    if abs(old["retrievability"] - EXPECTED_R) > TOL_R or \
            abs(old["new_stability"] - EXPECTED_S) > TOL_S:
        raise SystemExit(
            f"Trong so v1 cho R={old['retrievability']:.5f} S'={old['new_stability']:.2f}, "
            f"lech smoke_test (R={EXPECTED_R}, S'={EXPECTED_S}) -> sai file --weights?"
        )


def diff_result(exp: dict, got: dict, tol: float, check_interval: bool = True) -> list[str]:
    """Danh sach truong lech giua hai ket qua. R null phai khop null."""
    bad = []
    for f in ("retrievability", "new_stability", "new_difficulty"):
        a, b = exp.get(f), got.get(f)
        if a is None or b is None:
            if (a is None) != (b is None):
                bad.append(f)
        elif abs(a - b) > tol:
            bad.append(f)
    if check_interval and exp.get("interval_days") != got.get("interval_days"):
        bad.append("interval_days")
    return bad


def judge_predict(body: dict | None, expected: list[dict], version: str,
                  tol: float) -> tuple[bool, list[str]]:
    """(dung?, ly do). So tung the theo thu tu, dung tuyet doi cho interval."""
    if not body or "results" not in body:
        return False, ["khong co results"]
    reasons = []
    if body.get("model_version") != version:
        reasons.append(f"model_version={body.get('model_version')}")
    results = body["results"]
    if [r.get("card_id") for r in results] != [e["card_id"] for e in expected]:
        return False, reasons + ["card_id sai thu tu/thieu"]
    for exp, got in zip(expected, results):
        reasons += [f"{exp['card_id']}.{f}" for f in diff_result(exp, got, tol)]
    return not reasons, reasons


# --- probe -------------------------------------------------------------------


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def probe_once(target: Target, prefix: str, key: str, expected: list[dict],
               version: str, tol: float) -> dict:
    health = http_call(target, "GET", prefix + HEALTH_PATH)
    pred = http_call(target, "POST", prefix + PREDICT_PATH, key=key,
                     body={"cards": PROBE_CARDS})
    correct, reasons = (None, [])
    if pred["status"] == 200 and pred["body"] is not None:
        correct, reasons = judge_predict(pred["body"], expected, version, tol)
    st = pred["server_timing"] or {}
    timeout = health["timeout"] or pred["timeout"]
    errors = [f"{name}: {res['error']}" for name, res in (("health", health), ("predict", pred))
              if res["error"]]
    sample = {
        "ts": _now(),
        "health_status": health["status"],
        "health_ms": round(health["ms"], 1),
        "model_version": (health["body"] or {}).get("model_version"),
        "predict_status": pred["status"],
        "latency_ms": round(pred["ms"], 1),
        "st_app_ms": st.get("app"),
        "st_model_ms": st.get("model"),
        "correct": correct,
        "mismatch": reasons,
        "timeout": timeout,
        "error": "; ".join(errors) or None,
    }
    sample["ok"] = (sample["health_status"] == 200 and sample["predict_status"] == 200
                    and correct is True and not timeout)
    return sample


def summarize_probe(samples: list[dict]) -> dict:
    """Tom tat thuan tu danh sach mau (dung chung cho chay that va --summarize)."""
    n = len(samples)
    lat = [s["latency_ms"] for s in samples
           if s.get("latency_ms") is not None and (s.get("predict_status") or s.get("timeout"))]
    streak, best = [], []
    for s in samples:
        if s.get("ok"):
            streak = []
        else:
            streak.append(s)
            if len(streak) > len(best):
                best = list(streak)
    n_ok = sum(bool(s.get("ok")) for s in samples)
    return {
        "n": n,
        "n_ok": n_ok,
        "success_rate": n_ok / n if n else None,
        "n_timeout": sum(bool(s.get("timeout")) for s in samples),
        "n_wrong": sum(s.get("correct") is False for s in samples),
        "latency_p50": percentile(lat, 50) if lat else None,
        "latency_p95": percentile(lat, 95) if lat else None,
        "latency_max": max(lat) if lat else None,
        "longest_fail_streak": len(best),
        "longest_fail_start": best[0]["ts"] if best else None,
        "longest_fail_end": best[-1]["ts"] if best else None,
        "model_versions": sorted({str(s.get("model_version")) for s in samples}),
    }


def read_jsonl(path: str) -> tuple[list[dict], int]:
    """(mau, so dong hong). Dong cuoi co the dang ghi do khi tien trinh bi giet."""
    samples, bad = [], 0
    with open(path, encoding="utf-8") as f:
        for line in f:
            if not line.strip():
                continue
            try:
                samples.append(json.loads(line))
            except ValueError:
                bad += 1
    return samples, bad


def _fmt(v, digits: int = 1) -> str:
    # "-" ASCII: console Windows (cp1252) in "—" thanh ky tu rac
    return "-" if v is None else f"{v:.{digits}f}"


def print_probe_summary(sm: dict) -> None:
    rate = "-" if sm["success_rate"] is None else f"{sm['success_rate'] * 100:.2f}%"
    print("\nTom tat probe")
    print(f"  so mau            : {sm['n']}  (model_version: {', '.join(sm['model_versions'])})")
    print(f"  thanh cong        : {sm['n_ok']}/{sm['n']} = {rate}")
    print(f"  timeout > 3 s     : {sm['n_timeout']}")
    print(f"  ket qua SAI       : {sm['n_wrong']}")
    print(f"  latency p50/p95/max: {_fmt(sm['latency_p50'])} / {_fmt(sm['latency_p95'])} / "
          f"{_fmt(sm['latency_max'])} ms")
    if sm["longest_fail_streak"]:
        print(f"  chuoi loi dai nhat: {sm['longest_fail_streak']} mau, "
              f"{sm['longest_fail_start']} -> {sm['longest_fail_end']}")
    else:
        print("  chuoi loi dai nhat: 0")


def next_tick(started: float, interval: float, now: float) -> float:
    """Moc started + k*interval nho nhat va lon hon now."""
    return started + (math.floor((now - started) / interval) + 1) * interval


def cmd_probe(args: argparse.Namespace) -> int:
    if args.summarize:
        samples, bad = read_jsonl(args.summarize)
        if bad:
            print(f"Bo qua {bad} dong JSONL hong")
        print_probe_summary(summarize_probe(samples))
        return 0
    if not args.url or not args.key_env or not args.out:
        raise SystemExit("probe can --url, --key-env va --out (hoac --summarize FILE)")
    key = _read_key(args.key_env)

    w, version = load_weights(args.weights)
    expected = compute_expected(PROBE_CARDS, w, args.max_interval)
    check_reference(expected, version)
    target, prefix = make_target(args.url, key, BACKEND_TIMEOUT_S)
    print(f"Dich vu: {args.url}  ky vong model_version={version}  "
          f"chu ky {args.interval:.0f} s trong {args.hours:g} gio -> {args.out}")
    for e in expected:
        print(f"  ky vong {e['card_id']}: R={e['retrievability']} S'={e['new_stability']:.5f} "
              f"D'={e['new_difficulty']:.5f} I={e['interval_days']}")

    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    samples = []
    started = time.monotonic()
    deadline = started + args.hours * 3600
    try:
        with open(args.out, "a", encoding="utf-8") as f:
            tick = started
            while tick < deadline:
                time.sleep(max(0.0, tick - time.monotonic()))
                s = probe_once(target, prefix, key, expected, version, args.tol)
                f.write(json.dumps(s, ensure_ascii=False) + "\n")
                f.flush()
                samples.append(s)
                print(f"  {s['ts']} {'OK ' if s['ok'] else 'LOI'} health={s['health_status']} "
                      f"predict={s['predict_status']} {s['latency_ms']:.0f} ms"
                      + (f"  {s['error'] or ''} {' '.join(s['mismatch'])}" if not s["ok"] else ""),
                      flush=True)
                # Chu ky cham hon --interval thi bo cac moc da lo, khong ban don
                tick = next_tick(started, args.interval, time.monotonic())
    except KeyboardInterrupt:
        print("\nDung theo Ctrl+C")
    print_probe_summary(summarize_probe(samples))
    return 0


# --- compare -----------------------------------------------------------------


def parse_num(value: str | None) -> float | None:
    if value is None or value.strip().lower() in NULL_TOKENS:
        return None
    return float(value)


def build_card(row: dict) -> dict:
    """Dung lai DUNG payload ReviewsService.lapLich da gui (backend, chi doc).

    card_id = id; S/D chi gui khi CA HAI khac null; elapsed null -> 0; rating giu nguyen.
    """
    s, d = parse_num(row.get("stability_before")), parse_num(row.get("difficulty_before"))
    both = s is not None and d is not None
    elapsed = parse_num(row.get("elapsed_days"))
    card_id = str(row["id"]).strip()
    if not 1 <= len(card_id) <= 64:
        raise ValueError(f"id '{card_id[:20]}...' khong hop le cho card_id (1-64 ky tu)")
    return {
        "card_id": card_id,
        "stability": s if both else None,
        "difficulty": d if both else None,
        "elapsed_days": elapsed if elapsed is not None else 0.0,
        "rating": int(row["rating"]),
    }


def db_result(row: dict) -> dict:
    """Ket qua backend da ghi vao DB, cung ten truong voi response AI."""
    interval = parse_num(row.get("next_interval_days"))
    return {
        "retrievability": parse_num(row.get("predicted_retrievability")),
        "new_stability": parse_num(row.get("stability_after")),
        "new_difficulty": parse_num(row.get("difficulty_after")),
        "interval_days": interval,
    }


def read_reviews_csv(path: str) -> tuple[list[dict], int]:
    """(dong FSRS_AI, so dong bi loai). Cot scheduler co thi loc, khong co thi tin la da loc."""
    with open(path, encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        missing = [c for c in CSV_COLUMNS if c not in (reader.fieldnames or [])]
        if missing:
            raise SystemExit(f"CSV thieu cot: {', '.join(missing)}")
        rows = list(reader)
    has_scheduler = "scheduler" in (reader.fieldnames or [])
    kept = [r for r in rows if not has_scheduler or r["scheduler"].strip() == "FSRS_AI"]
    return kept, len(rows) - len(kept)


class FieldStats:
    """Sai lech tuyet doi lon nhat tung truong + so dong lech cho mot cap."""

    def __init__(self, name: str) -> None:
        self.name = name
        self.n_compared = 0
        self.n_rows_bad = 0
        self.max_abs = {f: None for f in FIELDS}
        self.null_mismatch = {f: 0 for f in FIELDS}
        self.examples: list[dict] = []

    def add(self, row_id: str, a: dict, b: dict, tol: float, check_interval: bool) -> None:
        self.n_compared += 1
        for f in FIELDS:
            if f == "interval_days" and not check_interval:
                continue
            x, y = a.get(f), b.get(f)
            if x is None or y is None:
                self.null_mismatch[f] += (x is None) != (y is None)
                continue
            d = abs(x - y)
            if self.max_abs[f] is None or d > self.max_abs[f]:
                self.max_abs[f] = d
        bad = diff_result(a, b, tol, check_interval)
        if bad:
            self.n_rows_bad += 1
            if len(self.examples) < 10:
                self.examples.append({"id": row_id, "fields": bad,
                                      "a": {f: a.get(f) for f in bad},
                                      "b": {f: b.get(f) for f in bad}})

    def to_dict(self) -> dict:
        return {"pair": self.name, "n_compared": self.n_compared,
                "n_rows_bad": self.n_rows_bad, "max_abs": self.max_abs,
                "null_mismatch": self.null_mismatch, "examples": self.examples}


def predict_all(target: Target, prefix: str, key: str, cards: list[dict],
                batch: int) -> list[dict]:
    out = []
    for i in range(0, len(cards), batch):
        chunk = cards[i:i + batch]
        res = http_call(target, "POST", prefix + PREDICT_PATH, key=key, body={"cards": chunk})
        if res["status"] != 200 or not res["body"]:
            raise SystemExit(f"Lo {i // batch} ({len(chunk)} the): {res['error']}")
        results = res["body"]["results"]
        if [r["card_id"] for r in results] != [c["card_id"] for c in chunk]:
            raise SystemExit(f"Lo {i // batch}: card_id tra ve sai thu tu")
        out.extend(results)
    return out


def count_breakdown(cards: list[dict]) -> dict:
    out = {}
    for c in cards:
        k = f"rating{c['rating']}_{'moi' if c['stability'] is None else 'cu'}"
        out[k] = out.get(k, 0) + 1
    return dict(sorted(out.items()))


def compare_rows(rows: list[dict], cards: list[dict], per_url: dict[str, list[dict]],
                 versions: dict[str, str], tol: float) -> list[FieldStats]:
    """So DB <-> tung URL (chi dong cung model_version) va tung cap URL voi nhau."""
    stats = []
    for label, results in per_url.items():
        st = FieldStats(f"db <-> {label}")
        for row, card, res in zip(rows, cards, results):
            if row["model_version"].strip() != versions[label]:
                continue
            # rating 1: backend ghi buoc 10 phut, khong phai interval cua AI
            st.add(row["id"], db_result(row), res, tol, check_interval=card["rating"] >= 2)
        stats.append(st)
    for la, lb in itertools.combinations(per_url, 2):
        st = FieldStats(f"{la} <-> {lb}")
        for row, ra, rb in zip(rows, per_url[la], per_url[lb]):
            st.add(row["id"], ra, rb, tol, check_interval=True)
        stats.append(st)
    return stats


def print_compare(breakdown: dict, stats: list[FieldStats], tol: float) -> None:
    print("\nSo dong theo rating / the moi-cu:")
    for k, v in breakdown.items():
        print(f"  {k:<14} {v}")
    print(f"\n| cap | so dong | lech (> {tol:g}) | max |R| | max |S'| | max |D'| | max |I| |")
    print("|---|---|---|---|---|---|---|")
    for st in stats:
        m = st.max_abs
        print(f"| {st.name} | {st.n_compared} | {st.n_rows_bad} | "
              f"{_fmt(m['retrievability'], 8)} | "
              f"{_fmt(m['new_stability'], 6)} | {_fmt(m['new_difficulty'], 6)} | "
              f"{_fmt(m['interval_days'], 0)} |")
    for st in stats:
        nulls = {f: n for f, n in st.null_mismatch.items() if n}
        if nulls:
            print(f"  {st.name}: lech null/khac null: {nulls}")
        for ex in st.examples:
            print(f"  {st.name}  id={ex['id']}  {ex['fields']}  a={ex['a']}  b={ex['b']}")


def cmd_compare(args: argparse.Namespace) -> int:
    key = _read_key(args.key_env)
    if not 1 <= args.batch <= MAX_COMPARE_BATCH:
        raise SystemExit(f"--batch phai trong 1..{MAX_COMPARE_BATCH}")
    rows, dropped = read_reviews_csv(args.csv)
    if not rows:
        raise SystemExit("CSV khong co dong FSRS_AI nao")
    cards = [build_card(r) for r in rows]
    csv_versions = sorted({r["model_version"].strip() for r in rows})
    print(f"CSV: {len(rows)} dong FSRS_AI (bo {dropped} dong khac), "
          f"model_version trong CSV: {csv_versions}")

    per_url, versions, labels = {}, {}, {}
    for idx, url in enumerate(args.url, 1):
        label = f"u{idx}"
        labels[label] = url
        target, prefix = make_target(url, key, args.timeout)
        health = http_call(target, "GET", prefix + HEALTH_PATH)
        if health["status"] != 200:
            raise SystemExit(f"{url}/health: {health['error']}")
        versions[label] = health["body"].get("model_version")
        n_match = sum(r["model_version"].strip() == versions[label] for r in rows)
        flag = "khop" if csv_versions == [versions[label]] else "KHONG KHOP"
        print(f"  {label} = {url}  model_version={versions[label]} ({flag} CSV; "
              f"{n_match}/{len(rows)} dong cung phien ban duoc so voi DB)")
        per_url[label] = predict_all(target, prefix, key, cards, args.batch)

    stats = compare_rows(rows, cards, per_url, versions, args.tol)
    breakdown = count_breakdown(cards)
    print_compare(breakdown, stats, args.tol)

    ok = all(st.n_rows_bad == 0 for st in stats) and \
        all(csv_versions == [v] for v in versions.values())
    if args.out:
        report = {
            "generated_at": _now(),
            # chi ghi TEN bien moi truong; khong chep CSV, chi tom tat + 10 vi du
            "config": {"csv": os.path.basename(args.csv), "urls": labels,
                       "key_env": args.key_env, "tol": args.tol, "batch": args.batch},
            "n_rows": len(rows), "n_dropped": dropped, "breakdown": breakdown,
            "csv_model_versions": csv_versions, "url_model_versions": versions,
            "pairs": [st.to_dict() for st in stats], "all_match": ok,
        }
        os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
        with open(args.out, "w", encoding="utf-8") as f:
            json.dump(report, f, ensure_ascii=False, indent=2)
        print(f"\nDa ghi {args.out}")
    print(f"\nKet luan: {'KHOP' if ok else 'CO LECH'}")
    return 0 if ok else 1


# --- main ----------------------------------------------------------------------


def _read_key(env_name: str) -> str:
    key = os.environ.get(env_name)
    if not key:
        print(f"Bien moi truong {env_name} chua dat hoac rong", file=sys.stderr)
        raise SystemExit(2)
    return key


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Xac nhan moc MK-3 (WSEA-98)")
    sub = parser.add_subparsers(dest="cmd", required=True)

    p = sub.add_parser("probe", help="goi dinh ky /health + /predict-retention")
    p.add_argument("--url")
    p.add_argument("--key-env", metavar="TEN_BIEN")
    p.add_argument("--interval", type=float, default=120.0, help="giay giua hai chu ky")
    p.add_argument("--hours", type=float, default=12.0)
    p.add_argument("--out", help="file JSONL, ghi them (append)")
    p.add_argument("--weights", help="params.json cua phien ban dang chay (bo trong = DEFAULT_W)")
    p.add_argument("--max-interval", type=float, default=36500.0,
                   help="FSRS_MAX_INTERVAL cua dich vu")
    p.add_argument("--tol", type=float, default=1e-4)
    p.add_argument("--summarize", metavar="FILE", help="chi tinh lai tom tat tu JSONL cu")
    p.set_defaults(func=cmd_probe)

    c = sub.add_parser("compare", help="doi chieu CSV reviews voi dich vu")
    c.add_argument("--csv", required=True)
    c.add_argument("--url", action="append", required=True, help="lap duoc")
    c.add_argument("--key-env", metavar="TEN_BIEN", required=True)
    c.add_argument("--tol", type=float, default=1e-4)
    c.add_argument("--batch", type=int, default=MAX_COMPARE_BATCH)
    c.add_argument("--timeout", type=float, default=30.0)
    c.add_argument("--out", help="file JSON tom tat")
    c.set_defaults(func=cmd_compare)
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    if args.cmd == "probe" and not args.summarize and args.interval <= 0:
        raise SystemExit("--interval phai > 0")
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())

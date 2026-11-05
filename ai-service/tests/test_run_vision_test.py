"""Test phan thuan cua scripts/run_vision_test.py (WSEA-153). Khong tai mo hinh."""

import hashlib

from scripts import run_vision_test as rt


def test_verify_manifest(tmp_path):
    a, b = tmp_path / "a_01.jpg", tmp_path / "b_01.jpg"
    a.write_bytes(b"aa"), b.write_bytes(b"bb")
    man = {"files": [{"file": "a_01.jpg", "sha256": hashlib.sha256(b"aa").hexdigest()},
                     {"file": "c_01.jpg", "sha256": "x"}]}
    errs = " | ".join(rt.verify_manifest(man, [a, b]))
    assert "thiếu file c_01.jpg" in errs and "file lạ b_01.jpg" in errs
    b.write_bytes(b"zz")
    man2 = {"files": [{"file": "a_01.jpg", "sha256": "sai"}]}
    assert rt.verify_manifest(man2, [a]) == ["sha256 lệch a_01.jpg"]


def row(score, s1, r1, s5=True, r5=True, cefr="A1"):
    return {"top1_score": score, "top1_strict": s1, "top1_relaxed": r1, "top5_strict": s5, "top5_relaxed": r5,
            "cefr": cefr}


def test_metrics():
    rows = [row(0.8, True, True), row(0.5, False, True), row(0.2, False, False, False, False)]
    m = rt.metrics(rows, 0.4)
    assert m["top1_strict"] == {"hits": 1, "n": 3, "rate": 0.3333}
    assert m["coverage"] == {"answered": 2, "n": 3, "rate": 0.6667}
    assert m["acc_answered_strict"]["rate"] == 0.5 and m["acc_answered_relaxed"]["rate"] == 1.0
    assert m["top5_strict"]["hits"] == 2


def test_by_cefr_and_locked_tau():
    rows = [row(0.8, True, True, cefr="A1"), row(0.1, False, False, cefr="B1")]
    c = rt.by_cefr(rows, 0.4)
    assert c["A1"]["n"] == 1 and c["A2"]["n"] == 0 and c["B1"]["coverage"]["answered"] == 0
    from app.config import settings
    assert rt.LOCKED_TAU == settings.vision_tau == 0.40

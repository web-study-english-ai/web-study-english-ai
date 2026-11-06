"""Chon 50 vat cho tap test nhan dien anh (WSEA-153), CHOT TRUOC khi chup.

    .\\.venv\\Scripts\\python.exe scripts\\pick_vision_test_objects.py

- Nguon: kb/vision_labels.csv (449 nhan).
- So vat moi bac CEFR = 50 chia theo ti le so nhan A1/A2/B1 cua 449 nhan (phan du lon nhat).
- Loai vat KHONG chup duoc o nha (danh sach tay NOT_AT_HOME, ghi nguyen van trong tieu chi): xe co, dong vat
  hoang da/trang trai, nhac cu, thiet bi chuyen dung, vat ngoai troi/qua lon, vat nguy hiem/khong phu hop.
- random.Random(SEED); trong moi bac: sap word tang dan roi rng.sample; bac duyet A1 -> A2 -> B1.
Dau ra: kb/vision_test_objects.csv (word, cefr, topic_code, meaning_vi), sap theo cefr roi word.
"""

from __future__ import annotations

import csv
import random
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LABELS = ROOT / "kb" / "vision_labels.csv"
OUT = ROOT / "kb" / "vision_test_objects.csv"
SEED = 153
N = 50
LEVELS = ("A1", "A2", "B1")
COLUMNS = ("word", "cefr", "topic_code", "meaning_vi")

NOT_AT_HOME = (
    # do uong co con / vu khi / thuoc la / y te chuyen dung
    "champagne", "wine", "gun", "sword", "cigarette", "tobacco", "ambulance", "wheelchair", "coffin",
    # giao thong va vat ngoai duong
    "boat", "brake", "bus", "car", "carriage", "chariot", "ferry", "lorry", "metro", "motorcycle", "parachute",
    "petrol", "plane", "ship", "signpost", "submarine", "subway", "taxi", "tent", "tire", "train", "tram", "van",
    "wagon", "windscreen", "mailbox", "fountain", "arrow", "fence", "pole", "brick",
    # nhac cu, dung cu the thao chuyen dung, tac pham lon
    "drum", "flute", "guitar", "piano", "trumpet", "violin", "racket", "paddle", "ski", "skate", "snowboard",
    "medal", "sculpture", "statue", "firework",
    # thiet bi/vat it nha co hoac chuyen dung
    "blackboard", "encyclopedia", "cassette", "comet", "satellite", "spaceship", "robot", "engine", "motor",
    "antique", "barrel", "cage", "cart", "elevator", "escalator", "harness", "diamond", "jewel", "crown",
    "locker", "noticeboard", "dishwasher", "diaper", "gown",
    # do lot (khong phu hop de chup)
    "bra", "underpants",
    # dong vat hoang da / trang trai / con non, con trung kho chup
    "ape", "beast", "beaver", "bee", "bird", "bull", "camel", "cattle", "chimpanzee", "cow", "dinosaur",
    "dolphin", "duck", "elephant", "flea", "giraffe", "gorilla", "horse", "insect", "kitten", "lamb", "lion",
    "monkey", "mosquito", "mule", "parrot", "pig", "puppy", "rabbit", "rat", "shark", "sheep", "snake", "tiger",
    "turtle", "whale",
    # thien nhien / thien the / hien tuong ngoai troi
    "daisy", "fire", "fog", "frost", "fur", "maple", "moon", "moss", "mud", "nest", "oak", "planet", "root",
    "sand", "seaweed", "sun", "sunflower",
)


def load_labels(path: Path = LABELS) -> list[dict]:
    with path.open(encoding="utf-8", newline="") as f:
        return list(csv.DictReader(f))


def alloc(sizes: dict[str, int], n: int) -> dict[str, int]:
    """Chia n theo ti le (phan du lon nhat; hoa -> thu tu LEVELS)."""
    total = sum(sizes.values())
    raw = {k: n * v / total for k, v in sizes.items()}
    out = {k: int(x) for k, x in raw.items()}
    order = sorted(raw, key=lambda k: (-(raw[k] - out[k]), LEVELS.index(k)))
    for k in order[: n - sum(out.values())]:
        out[k] += 1
    return out


def pick(labels: list[dict], n: int = N, seed: int = SEED, exclude=NOT_AT_HOME) -> list[dict]:
    want = alloc({lv: sum(r["cefr"] == lv for r in labels) for lv in LEVELS}, n)
    excl = set(exclude)
    rng = random.Random(seed)
    out = []
    for lv in LEVELS:
        pool = sorted((r for r in labels if r["cefr"] == lv and r["word"] not in excl), key=lambda r: r["word"])
        if len(pool) < want[lv]:
            raise ValueError(f"{lv}: cần {want[lv]} vật, chỉ còn {len(pool)}")
        out += rng.sample(pool, want[lv])
    return sorted(({k: r[k] for k in COLUMNS} for r in out), key=lambda r: (LEVELS.index(r["cefr"]), r["word"]))


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    labels = load_labels()
    unknown = sorted(set(NOT_AT_HOME) - {r["word"] for r in labels})
    if unknown:
        raise SystemExit(f"NOT_AT_HOME có từ không thuộc 449 nhãn: {unknown}")
    rows = pick(labels)
    with OUT.open("w", encoding="utf-8", newline="\n") as f:
        w = csv.DictWriter(f, fieldnames=COLUMNS, lineterminator="\n")
        w.writeheader()
        w.writerows(rows)
    per = {lv: [r["word"] for r in rows if r["cefr"] == lv] for lv in LEVELS}
    print(f"{len(rows)} vật · loại {len(NOT_AT_HOME)} nhãn không chụp được ở nhà · seed {SEED}")
    for lv, ws in per.items():
        print(f"{lv} ({len(ws)}): {', '.join(ws)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

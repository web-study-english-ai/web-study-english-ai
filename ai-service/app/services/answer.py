"""Hau xu ly cau tra loi cua LLM: [n] -> source_ids, xoa ky hieu trich (WSEA-140, Q4). Ham thuan."""

from __future__ import annotations

import re
from collections.abc import Sequence
from typing import Any

from app.services.prompts import TEXT_NO_CONTEXT, TEXT_OUT_OF_SCOPE

# [1] · [1][3] · [1, 3] · [1; 3] · [Tài liệu 1] · [tài liệu 1, 2] (v2: v1 gap "[Tài liệu 1]" o d11)
# · 【1】 · 【1】【3】 · 【1, 3】 (v3: v2 gap ngoac toan chieu U+3010/U+3011 o d03).
# Chi so nguyen trong ngoac (co the co chu "tai lieu" truoc); "[sic]" va chu khac giu nguyen.
CITE_RE = re.compile(r"[\[【]\s*(?:tài\s+liệu\s*)?\d+(?:\s*[,;]\s*\d+)*\s*[\]】]", re.IGNORECASE)
# Nhan manh markdown **x** va *x* -> x. Dau * dau dong (gach dau dong "* ") khong khop vi sau no la khoang trang.
BOLD_RE = re.compile(r"\*\*(?=\S)(.+?)(?<=\S)\*\*")
ITALIC_RE = re.compile(r"(?<![*\w])\*(?=[^\s*])([^*\n]+?)(?<=\S)\*(?![*\w])")
# v3: moi khoang trang Unicode (tru xuong dong) coi nhu dau cach — v2 gap U+202F truoc [1] o d05, d11.
# Gom ca U+200B (zero-width, khong thuoc \s cua Python) va U+FEFF.
UNICODE_SPACE_RE = re.compile(r"[^\S\n]|[​‌‍⁠﻿]")
SPACE_BEFORE_PUNCT_RE = re.compile(r" +([.,;:!?)])")
MID_LINE_SPACES_RE = re.compile(r"(?<=\S) {2,}")  # chi giua dong: giu thut le dau dong (gach dau dong long nhau)
FIXED_TEXTS = (TEXT_OUT_OF_SCOPE, TEXT_NO_CONTEXT)


def _norm_ws(s: str) -> str:
    return " ".join(s.split())


def cited_ids(text: str, contexts: Sequence[Any]) -> list[str]:
    """So theo thu tu xuat hien -> id (so n la contexts[n-1]). Bo so ngoai 1..k, bo trung."""
    out: list[str] = []
    for m in CITE_RE.finditer(text):
        for n in (int(x) for x in re.findall(r"\d+", m.group())):
            if 1 <= n <= len(contexts):
                cid = contexts[n - 1].id
                if cid not in out:
                    out.append(cid)
    return out


def strip_citations(text: str) -> str:
    s = CITE_RE.sub("", text)
    s = UNICODE_SPACE_RE.sub(" ", s)
    s = s.replace("。", ".")  # dau cham toan chieu "。" (v3 d04) -> "."; khoang trang truoc no xoa o dong duoi
    s = SPACE_BEFORE_PUNCT_RE.sub(r"\1", s)
    s = MID_LINE_SPACES_RE.sub(" ", s)
    lines = [line.rstrip() for line in s.splitlines()]
    while lines and not lines[0]:
        lines.pop(0)
    while lines and not lines[-1]:
        lines.pop()
    if lines:
        lines[0] = lines[0].lstrip()  # dong dau khong can thut le (vd ky hieu trich o dau cau)
    return "\n".join(lines)


def strip_emphasis(text: str) -> str:
    """Go **x** va *x* (giu noi dung). Frontend hien van ban thuong nen dau * se lo ra."""
    return ITALIC_RE.sub(r"\1", BOLD_RE.sub(r"\1", text))


def fixed_text_in(answer: str) -> str | None:
    """Cau co dinh nam trong cau tra loi (so sau khi chuan hoa khoang trang) -> tra cau do."""
    norm = _norm_ws(answer)
    for t in FIXED_TEXTS:
        if _norm_ws(t) in norm:
            return t
    return None


def clean_text(text: str) -> str:
    """Xoa ky hieu trich + nhan manh + don khoang trang (chua xet cau co dinh)."""
    return strip_emphasis(strip_citations(text))


def postprocess(text: str, contexts: Sequence[Any]) -> tuple[str, list[str]]:
    """-> (answer, source_ids). contexts = doan pipeline da chon, dung thu tu danh so trong prompt."""
    ids = cited_ids(text, contexts)
    answer = clean_text(text)
    fixed = fixed_text_in(answer)
    if fixed is not None:
        return fixed, []
    return answer, ids


# --- SSE (B4): delta khong lo ky hieu trich / dau * ----------------------------------------------
# Cach lam: delta = phan moi cua clean_text(raw[:diem_an_toan]). Cat truoc moi doan duoi CHUA chac:
# ngoac "[" / "【" chua dong (ngan, co the la [n]), dau "*" co the mo nhan manh tren dong dang viet,
# khoang trang cuoi (co the bi xoa khi gap dau cau). Nho vay ghep cac delta = clean_text(raw) = answer
# cua khung cuoi (tru khi answer bi thay bang cau co dinh).

MAX_MARKER_LEN = 24  # "[tài liệu 1, 2, 3, 4]" ~ 22 ky tu; ngoac mo lau hon the khong phai ky hieu trich
_TRAILING_SPACE_RE = re.compile(r"(?:\s|[​‌‍⁠﻿])+$")


def safe_cut(raw: str) -> int:
    """Vi tri cuoi ma phan truoc no da chac chan (khong con ky hieu trich/nhan manh dang do)."""
    cut = len(raw)
    m = _TRAILING_SPACE_RE.search(raw)
    if m:
        cut = m.start()
    tail_start = max(0, len(raw) - MAX_MARKER_LEN)
    for opener, closer in (("[", "]"), ("【", "】")):
        i = raw.find(opener, tail_start)
        while i != -1:
            if closer not in raw[i:]:
                cut = min(cut, i)
                break
            i = raw.find(opener, i + 1)
    line_start = raw.rfind("\n") + 1  # dong dang viet: "*" mo nhan manh co the chua dong
    for j in range(line_start, len(raw)):
        if raw[j] == "*" and (j + 1 == len(raw) or not raw[j + 1].isspace()):
            cut = min(cut, j)
            break
    return cut


class StreamCleaner:
    """Nhan tung doan text tho tu LLM, tra delta da sach. finish() tra (delta cuoi, answer, source_ids)."""

    def __init__(self) -> None:
        self.raw = ""
        self.emitted = ""

    def _emit(self, clean: str) -> str:
        if not clean.startswith(self.emitted):
            return ""  # khong rut lai duoc delta da gui; khung cuoi van la ban chuan
        delta, self.emitted = clean[len(self.emitted):], clean
        return delta

    def feed(self, chunk: str) -> str:
        self.raw += chunk
        return self._emit(clean_text(self.raw[:safe_cut(self.raw)]))

    def finish(self, contexts: Sequence[Any]) -> tuple[str, str, list[str]]:
        answer, ids = postprocess(self.raw, contexts)
        return self._emit(answer), answer, ids

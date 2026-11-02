"""Hau xu ly cau tra loi cua LLM: [n] -> source_ids, xoa ky hieu trich (WSEA-140, Q4). Ham thuan."""

from __future__ import annotations

import re
from collections.abc import Sequence
from typing import Any

from app.services.prompts import TEXT_NO_CONTEXT, TEXT_OUT_OF_SCOPE

# [1] · [1][3] · [1, 3] · [1; 3] · [Tài liệu 1] · [tài liệu 1, 2] (v2: v1 gap "[Tài liệu 1]" o d11).
# Chi so nguyen trong ngoac vuong (co the co chu "tai lieu" truoc); "[sic]" va chu khac giu nguyen.
CITE_RE = re.compile(r"\[\s*(?:tài\s+liệu\s*)?\d+(?:\s*[,;]\s*\d+)*\s*\]", re.IGNORECASE)
# Nhan manh markdown **x** va *x* -> x. Dau * dau dong (gach dau dong "* ") khong khop vi sau no la khoang trang.
BOLD_RE = re.compile(r"\*\*(?=\S)(.+?)(?<=\S)\*\*")
ITALIC_RE = re.compile(r"(?<![*\w])\*(?=[^\s*])([^*\n]+?)(?<=\S)\*(?![*\w])")
SPACE_BEFORE_PUNCT_RE = re.compile(r"[ \t]+([.,;:!?)])")
MULTI_SPACE_RE = re.compile(r"[ \t]{2,}")
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
    s = SPACE_BEFORE_PUNCT_RE.sub(r"\1", s)
    s = MULTI_SPACE_RE.sub(" ", s)
    return "\n".join(line.rstrip() for line in s.splitlines()).strip()


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


def postprocess(text: str, contexts: Sequence[Any]) -> tuple[str, list[str]]:
    """-> (answer, source_ids). contexts = doan pipeline da chon, dung thu tu danh so trong prompt."""
    ids = cited_ids(text, contexts)
    answer = strip_emphasis(strip_citations(text))
    fixed = fixed_text_in(answer)
    if fixed is not None:
        return fixed, []
    return answer, ids

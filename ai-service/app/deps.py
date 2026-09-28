"""Dependency dung chung cho cac router."""

import secrets

from fastapi import Header, HTTPException, status

from app.config import settings

# Ten header theo docs/API_CONTRACT.md. Doi ten o day phai sua hop dong truoc.
API_KEY_HEADER = "x-api-key"


async def verify_internal_api_key(
    api_key: str | None = Header(default=None, alias=API_KEY_HEADER),
) -> None:
    """Kiem tra khoa API noi bo.

    Chi backend NestJS duoc phep goi ai-service, khong mo cong khai.

    Thieu khoa va sai khoa deu tra 401 (hop dong API + NF-11/NF-14). Khong dung 403:
    403 nghia la "da biet anh la ai nhung khong cho", con o day chua xac thuc duoc.
    Hai truong hop cung ma loi cung bot lo thong tin cho nguoi do khoa.
    """
    if api_key is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Thieu header {API_KEY_HEADER}",
        )

    # so sanh chong timing attack; so tren bytes de khong nem TypeError voi ky tu ngoai ASCII
    expected = settings.internal_api_key.get_secret_value().encode()
    if not secrets.compare_digest(api_key.encode(), expected):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Khoa API noi bo khong hop le",
        )

"""Dependency dung chung cho cac router."""

import secrets

from fastapi import Header, HTTPException, status

from app.config import settings

API_KEY_HEADER = "X-Internal-Api-Key"


async def verify_internal_api_key(
    x_internal_api_key: str | None = Header(default=None, alias=API_KEY_HEADER),
) -> None:
    """Kiem tra khoa API noi bo.

    Chi backend NestJS duoc phep goi ai-service, khong mo cong khai.
    """
    if x_internal_api_key is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Thieu header {API_KEY_HEADER}",
        )

     # so sanh chong timing attack; so tren bytes de khong nem TypeError voi ky tu ngoai ASCII
    expected = settings.internal_api_key.get_secret_value().encode()
    if not secrets.compare_digest(x_internal_api_key.encode(), expected):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Khoa API noi bo khong hop le",
        )

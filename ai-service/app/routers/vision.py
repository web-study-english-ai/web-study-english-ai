"""Router /recognize/image - nhan dien tu vung qua hinh anh (stub)."""

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status

from app.deps import verify_internal_api_key
from app.models.schemas import VisionResponse

router = APIRouter(
    prefix="/recognize",
    tags=["vision"],
    dependencies=[Depends(verify_internal_api_key)],
)


@router.post("/image", response_model=VisionResponse)
async def recognize_image(file: UploadFile = File(...)) -> VisionResponse:
    """Nhan dien vat the trong anh va goi y tu vung tuong ung.

    TODO(WSEA): nap model thi giac may tinh va tra nhan that.
    """
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Chuc nang nhan dien hinh anh chua duoc trien khai",
    )

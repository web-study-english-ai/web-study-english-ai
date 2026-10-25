"""Router /assistant/ask - tro ly hoi dap tieng Anh (stub)."""

from fastapi import APIRouter, Depends, HTTPException, status

from app.deps import verify_internal_api_key
from app.models.schemas import AskRequest, AskResponse

router = APIRouter(
    prefix="/assistant",
    tags=["rag"],
    dependencies=[Depends(verify_internal_api_key)],
)


@router.post("/ask", response_model=AskResponse)
async def ask(payload: AskRequest) -> AskResponse:
    """Tra loi cau hoi cua nguoi hoc dua tren ngu lieu da index (RAG).

    TODO(WSEA): truy hoi pgvector va sinh cau tra loi.
    """
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Chuc nang tro ly hoi dap chua duoc trien khai",
    )

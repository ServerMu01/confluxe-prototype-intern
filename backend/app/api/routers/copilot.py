from __future__ import annotations

from fastapi import APIRouter, Depends

from app.api.deps import get_copilot_service
from app.models.schemas import CopilotQueryRequest, CopilotQueryResponse
from app.services.copilot_service import CopilotService


router = APIRouter(prefix='/copilot')


@router.post('/query', response_model=CopilotQueryResponse)
def copilot_query(
    payload: CopilotQueryRequest,
    copilot_service: CopilotService = Depends(get_copilot_service)
) -> CopilotQueryResponse:
    summary, items = copilot_service.handle_query(payload.query)

    return CopilotQueryResponse(
        query=payload.query,
        summary=summary,
        items=items
    )

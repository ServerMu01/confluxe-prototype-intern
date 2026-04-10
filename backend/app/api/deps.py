from fastapi import HTTPException, Request, status

from app.services.catalog_service import CatalogService
from app.services.copilot_service import CopilotService
from app.services.trend_service import TrendService


def _require_database(request: Request) -> None:
    if getattr(request.app.state, 'db_available', True):
        return

    raise HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail='Database is unavailable. Configure MONGODB_URI to a reachable MongoDB instance.'
    )


def get_catalog_service(request: Request) -> CatalogService:
    _require_database(request)
    return request.app.state.catalog_service


def get_trend_service(request: Request) -> TrendService:
    return request.app.state.trend_service


def get_copilot_service(request: Request) -> CopilotService:
    _require_database(request)
    return request.app.state.copilot_service

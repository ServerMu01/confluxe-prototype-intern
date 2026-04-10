from fastapi import Request

from app.services.catalog_service import CatalogService
from app.services.copilot_service import CopilotService
from app.services.trend_service import TrendService


def get_catalog_service(request: Request) -> CatalogService:
    return request.app.state.catalog_service


def get_trend_service(request: Request) -> TrendService:
    return request.app.state.trend_service


def get_copilot_service(request: Request) -> CopilotService:
    return request.app.state.copilot_service

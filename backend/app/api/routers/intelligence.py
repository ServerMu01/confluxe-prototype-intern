from __future__ import annotations

from fastapi import APIRouter, Depends, Query

from app.api.deps import get_catalog_service, get_trend_service
from app.models.schemas import ActionType, IntelligenceOutput, TrendDashboardItem, TrendKeywordItem, TrendTimelinePoint
from app.services.catalog_service import CatalogService
from app.services.trend_service import TrendService


router = APIRouter(prefix='/intelligence')


@router.get('/products', response_model=list[IntelligenceOutput])
def list_intelligence_products(
    action: ActionType | None = Query(default=None),
    category: str | None = Query(default=None),
    job_id: str | None = Query(default=None),
    catalog_service: CatalogService = Depends(get_catalog_service)
) -> list[IntelligenceOutput]:
    return catalog_service.list_intelligence(action=action, category=category, job_id=job_id)


@router.get('/trends', response_model=list[TrendDashboardItem])
def get_trend_signals(
    job_id: str | None = Query(default=None),
    trend_service: TrendService = Depends(get_trend_service)
) -> list[TrendDashboardItem]:
    return trend_service.get_macro_trends(job_id=job_id)


@router.get('/trends/keywords', response_model=list[TrendKeywordItem])
def get_trend_keywords(
    category: str = Query(default='Streetwear'),
    limit: int = Query(default=10, ge=1, le=50),
    job_id: str | None = Query(default=None),
    trend_service: TrendService = Depends(get_trend_service)
) -> list[TrendKeywordItem]:
    return trend_service.get_rising_keywords(category=category, limit=limit, job_id=job_id)


@router.get('/trends/timeline', response_model=list[TrendTimelinePoint])
def get_trend_timeline(
    category: str = Query(default='Streetwear'),
    months: int = Query(default=12, ge=1, le=12),
    job_id: str | None = Query(default=None),
    trend_service: TrendService = Depends(get_trend_service)
) -> list[TrendTimelinePoint]:
    return trend_service.get_timeline(category=category, months=months, job_id=job_id)

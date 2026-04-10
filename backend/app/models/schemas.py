from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


ActionType = Literal['LAUNCH', 'TEST', 'AVOID']
DemandLevel = Literal['High', 'Medium', 'Low']
PriceFitType = Literal['UNDERPRICED', 'IDEAL', 'OVERPRICED']


class RawVendorProduct(BaseModel):
    item_desc: str = Field(min_length=2)
    msrp_usd: float = Field(gt=0)
    qty: int = Field(default=1, ge=0)
    brand: str | None = None
    vendor_sku: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)

    model_config = ConfigDict(extra='allow')


class NormalizedProduct(BaseModel):
    id: str
    name: str
    brand: str
    category: str
    price_inr: float = Field(gt=0)


class TrendSignal(BaseModel):
    category: str
    search_volume: int = Field(ge=0)
    growth_percentage: float
    momentum_score: int = Field(ge=1, le=10)
    top_region: str


class IntelligenceOutput(BaseModel):
    normalized_product: NormalizedProduct
    trend_signal: TrendSignal
    trend_score: float = Field(ge=1, le=10)
    demand_level: DemandLevel
    price_fit: PriceFitType
    action: ActionType
    ai_reasoning: str


class CatalogUploadResponse(BaseModel):
    job_id: str
    status: str


class CatalogDeleteResponse(BaseModel):
    job_id: str
    status: str


class CatalogStatusResponse(BaseModel):
    job_id: str
    filename: str
    status: str
    total_rows: int
    processed_rows: int
    error_message: str | None = None


class CatalogJobListItem(BaseModel):
    job_id: str
    filename: str
    status: str
    total_rows: int
    processed_rows: int
    error_message: str | None = None
    created_at: datetime


class TrendDashboardItem(BaseModel):
    category: str
    volume: str
    growth: str
    region: str
    status: str
    momentum_score: int = Field(ge=1, le=10)
    provider: str | None = None


class TrendKeywordItem(BaseModel):
    term: str
    growth: str


class TrendTimelinePoint(BaseModel):
    month: str
    value: int = Field(ge=0, le=100)


class CopilotQueryRequest(BaseModel):
    query: str = Field(min_length=3)


class CopilotQueryResponse(BaseModel):
    query: str
    summary: str
    items: list[IntelligenceOutput]

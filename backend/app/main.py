from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.agents.pipeline import ConfluxePipeline
from app.api.routers import catalogs, copilot, intelligence
from app.core.config import settings
from app.core.database import close_db, get_database, init_db
from app.core.exceptions import register_exception_handlers
from app.services.catalog_service import CatalogService
from app.services.copilot_service import CopilotService
from app.services.trend_service import TrendService


app = FastAPI(title=settings.app_name, version=settings.app_version)
register_exception_handlers(app)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.frontend_origins,
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*']
)


@app.on_event('startup')
def on_startup() -> None:
    init_db()
    database = get_database()

    trend_service = TrendService()
    pipeline = ConfluxePipeline(trend_service=trend_service)

    app.state.trend_service = trend_service
    app.state.catalog_service = CatalogService(database, pipeline)
    app.state.copilot_service = CopilotService(database)


@app.on_event('shutdown')
def on_shutdown() -> None:
    close_db()


@app.get('/health')
def health() -> dict[str, str]:
    return {'status': 'ok'}


app.include_router(catalogs.router, prefix=settings.api_prefix, tags=['catalogs'])
app.include_router(intelligence.router, prefix=settings.api_prefix, tags=['intelligence'])
app.include_router(copilot.router, prefix=settings.api_prefix, tags=['copilot'])

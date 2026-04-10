from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = 'Confluxe Backend'
    app_version: str = '0.1.0'
    api_prefix: str = '/api/v1'

    groq_api_key: str | None = Field(default=None, alias='GROQ_API_KEY')
    groq_model_parser: str = Field(default='llama-3.1-8b-instant', alias='GROQ_MODEL_PARSER')
    groq_model_reasoner: str = Field(default='llama-3.3-70b-versatile', alias='GROQ_MODEL_REASONER')
    llm_timeout_seconds: int = Field(default=20, alias='LLM_TIMEOUT_SECONDS')

    apify_api_token: str | None = Field(default=None, alias='APIFY_API_TOKEN')
    apify_google_trends_actor_id: str = Field(
        default='apify/google-trends-scraper',
        alias='APIFY_GOOGLE_TRENDS_ACTOR_ID'
    )
    trends_geo: str = Field(default='IN', alias='TRENDS_GEO')
    trend_cache_ttl_seconds: int = Field(default=900, alias='TREND_CACHE_TTL_SECONDS')

    catalog_fast_mode_rows: int = Field(default=100, alias='CATALOG_FAST_MODE_ROWS')
    catalog_insert_batch_size: int = Field(default=25, alias='CATALOG_INSERT_BATCH_SIZE')
    catalog_status_update_every: int = Field(default=10, alias='CATALOG_STATUS_UPDATE_EVERY')
    catalog_cancel_check_every: int = Field(default=5, alias='CATALOG_CANCEL_CHECK_EVERY')
    catalog_upload_directory: str = Field(default='./storage/catalog_uploads', alias='CATALOG_UPLOAD_DIRECTORY')

    mongodb_uri: str = Field(default='mongodb://localhost:27017', alias='MONGODB_URI')
    mongodb_database: str = Field(default='confluxe', alias='MONGODB_DATABASE')
    usd_inr_rate: float = Field(default=83.0, alias='USD_INR_RATE')
    frontend_origins_raw: str = Field(
        default='http://localhost:5173,http://localhost:5174',
        alias='FRONTEND_ORIGINS'
    )

    @property
    def frontend_origins(self) -> list[str]:
        origins = [origin.strip() for origin in self.frontend_origins_raw.split(',')]
        return [origin for origin in origins if origin]

    model_config = SettingsConfigDict(
        env_file='.env',
        env_file_encoding='utf-8',
        extra='ignore'
    )


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()


settings = get_settings()

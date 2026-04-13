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
    serpapi_api_key: str | None = Field(default=None, alias='SERPAPI_API_KEY')
    serpapi_timeout_seconds: int = Field(default=10, alias='SERPAPI_TIMEOUT_SECONDS')
    trends_geo: str = Field(default='IN', alias='TRENDS_GEO')
    trend_cache_ttl_seconds: int = Field(default=900, alias='TREND_CACHE_TTL_SECONDS')
    trend_persisted_cache_ttl_seconds: int = Field(
        default=43200,
        alias='TREND_PERSISTED_CACHE_TTL_SECONDS'
    )
    trend_stale_fallback_max_age_seconds: int = Field(
        default=604800,
        alias='TREND_STALE_FALLBACK_MAX_AGE_SECONDS'
    )
    trend_google_news_timeout_seconds: int = Field(
        default=6,
        alias='TREND_GOOGLE_NEWS_TIMEOUT_SECONDS'
    )
    trend_google_news_hl: str = Field(default='en-IN', alias='TREND_GOOGLE_NEWS_HL')
    trend_google_news_gl: str = Field(default='IN', alias='TREND_GOOGLE_NEWS_GL')
    trend_google_news_ceid: str = Field(default='IN:en', alias='TREND_GOOGLE_NEWS_CEID')

    catalog_fast_mode_rows: int = Field(default=100, alias='CATALOG_FAST_MODE_ROWS')
    catalog_insert_batch_size: int = Field(default=25, alias='CATALOG_INSERT_BATCH_SIZE')
    catalog_status_update_every: int = Field(default=10, alias='CATALOG_STATUS_UPDATE_EVERY')
    catalog_cancel_check_every: int = Field(default=5, alias='CATALOG_CANCEL_CHECK_EVERY')
    catalog_upload_directory: str = Field(default='./storage/catalog_uploads', alias='CATALOG_UPLOAD_DIRECTORY')

    mongodb_uri: str = Field(default='mongodb://localhost:27017', alias='MONGODB_URI')
    mongodb_database: str = Field(default='confluxe', alias='MONGODB_DATABASE')
    mongodb_server_selection_timeout_ms: int = Field(
        default=5000,
        alias='MONGODB_SERVER_SELECTION_TIMEOUT_MS'
    )
    usd_inr_rate: float = Field(default=83.0, alias='USD_INR_RATE')
    frontend_origins_raw: str = Field(
        default='http://localhost:5173,http://localhost:5174',
        alias='FRONTEND_ORIGINS'
    )
    frontend_origin_regex_raw: str | None = Field(default=None, alias='FRONTEND_ORIGIN_REGEX')

    @staticmethod
    def _normalize_origin(value: str) -> str:
        normalized = value.strip().strip('"').strip("'")
        if normalized == '*':
            return '*'

        if normalized.endswith('/'):
            normalized = normalized.rstrip('/')

        if '://' in normalized:
            scheme, remainder = normalized.split('://', 1)
            normalized = f"{scheme.lower()}://{remainder}"

        return normalized

    @property
    def frontend_origins(self) -> list[str]:
        raw_values = self.frontend_origins_raw.replace('\n', ',')
        origins = [self._normalize_origin(origin) for origin in raw_values.split(',')]
        return [origin for origin in origins if origin and origin != '*']

    @property
    def frontend_origin_regex(self) -> str | None:
        if self.frontend_origin_regex_raw and self.frontend_origin_regex_raw.strip():
            return self.frontend_origin_regex_raw.strip().strip('"').strip("'")

        raw_values = self.frontend_origins_raw.replace('\n', ',')
        origins = [self._normalize_origin(origin) for origin in raw_values.split(',') if origin.strip()]
        if '*' in origins:
            return r'https?://.*'

        return None

    model_config = SettingsConfigDict(
        env_file='.env',
        env_file_encoding='utf-8',
        extra='ignore'
    )


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()


settings = get_settings()

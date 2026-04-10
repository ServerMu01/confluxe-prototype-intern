# Confluxe Backend

AI-native backend for catalog normalization, trend intelligence, and launch recommendations.

## Stack

- FastAPI
- Pydantic v2
- MongoDB (via PyMongo)
- LangChain + LangGraph

## Run

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload --port 8000
```

## Environment

- `GROQ_API_KEY` (required for LLM normalization/explanations and co-pilot)
- `GROQ_MODEL_PARSER` (default: `llama-3.1-8b-instant`)
- `GROQ_MODEL_REASONER` (default: `llama-3.3-70b-versatile`)
- `APIFY_API_TOKEN` (optional; if missing backend falls back to pytrends)
- `APIFY_GOOGLE_TRENDS_ACTOR_ID` (default: `apify/google-trends-scraper`)
- `TRENDS_GEO` (default: `IN`)
- `TREND_CACHE_TTL_SECONDS` (default: `900`)
- `CATALOG_FAST_MODE_ROWS` (default: `100`; uses deterministic fast mode for larger uploads)
- `CATALOG_INSERT_BATCH_SIZE` (default: `25`; Mongo insert batch size)
- `CATALOG_STATUS_UPDATE_EVERY` (default: `10`; progress update frequency)
- `CATALOG_CANCEL_CHECK_EVERY` (default: `5`; cancellation check frequency)
- `CATALOG_UPLOAD_DIRECTORY` (default: `./storage/catalog_uploads`; persisted upload files for durable jobs)
- `FRONTEND_ORIGINS` (comma-separated CORS origins)
- `MONGODB_URI` (default: `mongodb://localhost:27017`)
- `MONGODB_DATABASE` (default: `confluxe`)

## Upload Durability

- Upload endpoint creates a job immediately.
- Raw CSV is persisted on disk (`CATALOG_UPLOAD_DIRECTORY`).
- Background worker parses/processes from persisted file and updates progress in Mongo (`processed_rows`, `total_rows`).
- Connected Catalogs view can be refreshed/reloaded without losing job visibility.

## API

- `POST /api/v1/catalogs/upload`
- `GET /api/v1/catalogs/jobs`
- `GET /api/v1/catalogs/status/{job_id}`
- `GET /api/v1/intelligence/products`
- `GET /api/v1/intelligence/trends`
- `GET /api/v1/intelligence/trends/keywords`
- `GET /api/v1/intelligence/trends/timeline`
- `POST /api/v1/copilot/query`

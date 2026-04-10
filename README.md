# Confluxe Monorepo

This workspace contains:

- `frontend/` - React + Vite dashboard UI
- `backend/` - FastAPI + LangGraph intelligence backend

## Frontend

```bash
cd frontend
npm install
npm run dev
```

Optional frontend env:

```bash
echo "VITE_API_BASE_URL=http://localhost:8000" > .env.local
```

## Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload --port 8000
```

Set at least `GROQ_API_KEY` in `backend/.env`.
For live trend data via Apify, also set `APIFY_API_TOKEN`.
Ensure MongoDB is running and set `MONGODB_URI`/`MONGODB_DATABASE` in `backend/.env`.

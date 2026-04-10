from __future__ import annotations

from pymongo import ASCENDING, DESCENDING, MongoClient
from pymongo.database import Database

from app.core.config import settings


mongo_client: MongoClient | None = None
mongo_db: Database | None = None


def init_db() -> None:
    global mongo_client, mongo_db

    if mongo_client is None:
        mongo_client = MongoClient(settings.mongodb_uri)
        mongo_db = mongo_client[settings.mongodb_database]
        _ensure_indexes()


def get_database() -> Database:
    if mongo_db is None:
        raise RuntimeError('MongoDB is not initialized. Call init_db() on startup.')
    return mongo_db


def close_db() -> None:
    global mongo_client, mongo_db

    if mongo_client is not None:
        mongo_client.close()

    mongo_client = None
    mongo_db = None


def _ensure_indexes() -> None:
    database = get_database()

    jobs_collection = database['catalog_jobs']
    jobs_collection.create_index([('job_id', ASCENDING)], unique=True)
    jobs_collection.create_index([('created_at', DESCENDING)])

    records_collection = database['intelligence_records']
    records_collection.create_index([('job_id', ASCENDING)])
    records_collection.create_index([('product_id', ASCENDING)])
    records_collection.create_index([('category', ASCENDING)])
    records_collection.create_index([('action', ASCENDING)])
    records_collection.create_index([('trend_score', DESCENDING)])
    records_collection.create_index([('created_at', DESCENDING)])

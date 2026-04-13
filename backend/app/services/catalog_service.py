from __future__ import annotations

import csv
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import pandas as pd
from pymongo import DESCENDING
from pymongo.collection import Collection
from pymongo.database import Database

from app.agents.pipeline import ConfluxePipeline
from app.core.config import settings
from app.core.exceptions import ResourceNotFoundError
from app.models.schemas import CatalogJobListItem, CatalogStatusResponse, IntelligenceOutput, NormalizedProduct, RawVendorProduct, TrendSignal


def record_to_output(record: dict[str, Any]) -> IntelligenceOutput:
    display_name = ConfluxePipeline.prettify_product_name(str(record.get('name', 'Unknown Product')))

    return IntelligenceOutput(
        normalized_product=NormalizedProduct(
            id=str(record.get('product_id', '')),
            name=display_name,
            brand=str(record.get('brand', 'UNKNOWN')),
            category=str(record.get('category', 'Accessories')),
            price_inr=float(record.get('price_inr', 0.0))
        ),
        trend_signal=TrendSignal(
            category=str(record.get('category', 'Accessories')),
            search_volume=int(record.get('search_volume', 0)),
            growth_percentage=float(record.get('growth_percentage', 0.0)),
            momentum_score=int(record.get('momentum_score', 1)),
            top_region=str(record.get('top_region', 'India'))
        ),
        trend_score=float(record.get('trend_score', 1.0)),
        demand_level=str(record.get('demand_level', 'Low')),
        price_fit=str(record.get('price_fit', 'IDEAL')),
        action=str(record.get('action', 'TEST')),
        ai_reasoning=str(record.get('ai_reasoning', 'No reasoning generated.'))
    )


class CatalogService:
    def __init__(self, database: Database, pipeline: ConfluxePipeline) -> None:
        self._database = database
        self._jobs: Collection = database['catalog_jobs']
        self._records: Collection = database['intelligence_records']
        self._pipeline = pipeline

    def create_job(self, filename: str, total_rows: int) -> dict[str, Any]:
        job = {
            'job_id': f'job_{uuid.uuid4().hex[:12]}',
            'filename': filename,
            'status': 'queued',
            'total_rows': total_rows,
            'processed_rows': 0,
            'error_message': None,
            'source_file_path': None,
            'created_at': datetime.now(timezone.utc),
            'updated_at': datetime.now(timezone.utc)
        }

        self._jobs.insert_one(job)

        return job

    def persist_uploaded_file(self, job_id: str, filename: str, raw_bytes: bytes) -> str:
        upload_directory = Path(settings.catalog_upload_directory).expanduser()
        upload_directory.mkdir(parents=True, exist_ok=True)

        safe_name = self._sanitize_filename(filename)
        output_path = upload_directory / f'{job_id}__{safe_name}'
        output_path.write_bytes(raw_bytes)

        self._jobs.update_one(
            {'job_id': job_id},
            {
                '$set': {
                    'source_file_path': str(output_path),
                    'updated_at': datetime.now(timezone.utc)
                }
            }
        )

        return str(output_path)

    def get_catalog_status(self, job_id: str) -> CatalogStatusResponse:
        job = self._jobs.find_one({'job_id': job_id}, {'_id': 0})
        if not job:
            raise ResourceNotFoundError('Catalog job', job_id)

        return CatalogStatusResponse(
            job_id=str(job['job_id']),
            filename=str(job['filename']),
            status=str(job['status']),
            total_rows=int(job['total_rows']),
            processed_rows=int(job['processed_rows']),
            error_message=job.get('error_message')
        )

    def list_jobs(self, limit: int = 25) -> list[CatalogJobListItem]:
        records = list(
            self._jobs.find({}, {'_id': 0})
            .sort('created_at', DESCENDING)
            .limit(max(1, min(100, limit)))
        )

        return [
            CatalogJobListItem(
                job_id=str(record['job_id']),
                filename=str(record['filename']),
                status=str(record['status']),
                total_rows=int(record['total_rows']),
                processed_rows=int(record['processed_rows']),
                error_message=record.get('error_message'),
                created_at=record.get('created_at') or datetime.now(timezone.utc)
            )
            for record in records
        ]

    def cancel_job(self, job_id: str) -> CatalogStatusResponse:
        job = self._jobs.find_one({'job_id': job_id}, {'_id': 0})
        if not job:
            raise ResourceNotFoundError('Catalog job', job_id)

        current_status = str(job.get('status', '')).lower()
        if current_status in {'completed', 'failed', 'cancelled'}:
            return self.get_catalog_status(job_id)

        self._jobs.update_one(
            {'job_id': job_id},
            {
                '$set': {
                    'status': 'cancelled',
                    'error_message': 'Parsing cancelled by user.',
                    'updated_at': datetime.now(timezone.utc)
                }
            }
        )

        return self.get_catalog_status(job_id)

    def delete_job(self, job_id: str) -> dict[str, str]:
        job = self._jobs.find_one({'job_id': job_id}, {'_id': 0, 'source_file_path': 1})
        if not job:
            raise ResourceNotFoundError('Catalog job', job_id)

        source_file_path = str(job.get('source_file_path') or '').strip()

        self._records.delete_many({'job_id': job_id})
        self._jobs.delete_one({'job_id': job_id})

        if source_file_path:
            try:
                Path(source_file_path).expanduser().unlink(missing_ok=True)
            except Exception:
                # Deletion should still succeed even if cleanup of local file fails.
                pass

        return {
            'job_id': job_id,
            'status': 'deleted'
        }

    def fail_job(self, job_id: str, error_message: str) -> None:
        self._jobs.update_one(
            {'job_id': job_id, 'status': {'$ne': 'cancelled'}},
            {
                '$set': {
                    'status': 'failed',
                    'error_message': error_message,
                    'updated_at': datetime.now(timezone.utc)
                }
            }
        )

    def process_catalog(self, job_id: str, rows: list[dict[str, Any]]) -> None:
        job = self._jobs.find_one({'job_id': job_id}, {'_id': 1})
        if not job:
            return

        current_status = self._jobs.find_one({'job_id': job_id}, {'_id': 0, 'status': 1})
        if not current_status or str(current_status.get('status', '')).lower() == 'cancelled':
            return

        transitioned = self._jobs.update_one(
            {'job_id': job_id, 'status': {'$ne': 'cancelled'}},
            {
                '$set': {
                    'status': 'processing',
                    'total_rows': len(rows),
                    'updated_at': datetime.now(timezone.utc)
                }
            }
        )
        if transitioned.matched_count == 0:
            return

        fast_mode = len(rows) >= settings.catalog_fast_mode_rows
        status_update_every = max(1, settings.catalog_status_update_every)
        cancel_check_every = max(1, settings.catalog_cancel_check_every)
        batch_size = max(1, settings.catalog_insert_batch_size)

        successful_rows = 0
        row_errors: list[str] = []
        buffered_records: list[dict[str, Any]] = []
        processed_rows = 0

        for row_index, row in enumerate(rows, start=1):
            if row_index == 1 or row_index % cancel_check_every == 0:
                live_status = self._jobs.find_one({'job_id': job_id}, {'_id': 0, 'status': 1})
                if not live_status:
                    return

                if str(live_status.get('status', '')).lower() == 'cancelled':
                    if buffered_records:
                        try:
                            self._records.insert_many(buffered_records, ordered=False)
                        except Exception as exc:
                            row_errors.append(f'Buffered insert failed near row {row_index}: {exc}')
                        finally:
                            buffered_records.clear()

                    self._jobs.update_one(
                        {'job_id': job_id},
                        {
                            '$set': {
                                'processed_rows': processed_rows,
                                'updated_at': datetime.now(timezone.utc)
                            }
                        }
                    )
                    return

            try:
                raw_product = self._row_to_raw_vendor_product(row)
                output = self._pipeline.run_bulk(raw_product) if fast_mode else self._pipeline.run(raw_product)
                buffered_records.append(self._output_to_record_document(job_id, output))

                successful_rows += 1

            except Exception as exc:
                row_errors.append(f'Row {row_index}: {exc}')

            if len(buffered_records) >= batch_size:
                try:
                    self._records.insert_many(buffered_records, ordered=False)
                except Exception as exc:
                    row_errors.append(f'Buffered insert failed near row {row_index}: {exc}')
                finally:
                    buffered_records.clear()

            processed_rows = row_index

            if processed_rows % status_update_every == 0 or processed_rows == len(rows):
                self._jobs.update_one(
                    {'job_id': job_id},
                    {
                        '$set': {
                            'processed_rows': processed_rows,
                            'updated_at': datetime.now(timezone.utc)
                        }
                    }
                )

        if buffered_records:
            try:
                self._records.insert_many(buffered_records, ordered=False)
            except Exception as exc:
                row_errors.append(f'Buffered insert failed at completion: {exc}')
            finally:
                buffered_records.clear()

        if successful_rows == 0:
            message = 'No valid rows could be processed.'
            if row_errors:
                message = f'{message} First error: {row_errors[0]}'

            self._jobs.update_one(
                {'job_id': job_id, 'status': {'$ne': 'cancelled'}},
                {
                    '$set': {
                        'status': 'failed',
                        'error_message': message,
                        'updated_at': datetime.now(timezone.utc)
                    }
                }
            )
            return

        if row_errors:
            self._jobs.update_one(
                {'job_id': job_id, 'status': {'$ne': 'cancelled'}},
                {
                    '$set': {
                        'status': 'completed',
                        'processed_rows': len(rows),
                        'error_message': f'Skipped {len(row_errors)} invalid row(s). First error: {row_errors[0]}',
                        'updated_at': datetime.now(timezone.utc)
                    }
                }
            )
            return

        self._jobs.update_one(
            {'job_id': job_id, 'status': {'$ne': 'cancelled'}},
            {
                '$set': {
                    'status': 'completed',
                    'processed_rows': len(rows),
                    'error_message': None,
                    'updated_at': datetime.now(timezone.utc)
                }
            }
        )

    def process_catalog_file(self, job_id: str, file_path: str) -> None:
        job = self._jobs.find_one({'job_id': job_id}, {'_id': 0, 'status': 1})
        if not job:
            return

        if str(job.get('status', '')).lower() == 'cancelled':
            return

        self._jobs.update_one(
            {'job_id': job_id, 'status': {'$ne': 'cancelled'}},
            {
                '$set': {
                    'status': 'processing',
                    'updated_at': datetime.now(timezone.utc)
                }
            }
        )

        try:
            dataframe = pd.read_csv(file_path)
        except Exception as exc:
            self._jobs.update_one(
                {'job_id': job_id, 'status': {'$ne': 'cancelled'}},
                {
                    '$set': {
                        'status': 'failed',
                        'error_message': f'Could not parse CSV file: {exc}',
                        'updated_at': datetime.now(timezone.utc)
                    }
                }
            )
            return

        if dataframe.empty:
            self._jobs.update_one(
                {'job_id': job_id, 'status': {'$ne': 'cancelled'}},
                {
                    '$set': {
                        'status': 'failed',
                        'error_message': 'Uploaded CSV has zero data rows.',
                        'updated_at': datetime.now(timezone.utc)
                    }
                }
            )
            return

        rows = dataframe.fillna('').to_dict(orient='records')
        self.process_catalog(job_id, rows)

    @staticmethod
    def _output_to_record_document(job_id: str, output: IntelligenceOutput) -> dict[str, Any]:
        return {
            'job_id': job_id,
            'product_id': output.normalized_product.id,
            'name': output.normalized_product.name,
            'brand': output.normalized_product.brand,
            'category': output.normalized_product.category,
            'price_inr': output.normalized_product.price_inr,
            'trend_score': output.trend_score,
            'demand_level': output.demand_level,
            'price_fit': output.price_fit,
            'action': output.action,
            'ai_reasoning': output.ai_reasoning,
            'search_volume': output.trend_signal.search_volume,
            'growth_percentage': output.trend_signal.growth_percentage,
            'momentum_score': output.trend_signal.momentum_score,
            'top_region': output.trend_signal.top_region,
            'created_at': datetime.now(timezone.utc)
        }

    def list_intelligence(
        self,
        action: str | None = None,
        category: str | None = None,
        job_id: str | None = None
    ) -> list[IntelligenceOutput]:
        query: dict[str, Any] = {}

        if action:
            query['action'] = action.upper()
        if category:
            query['category'] = {
                '$regex': f'^{re.escape(category)}$',
                '$options': 'i'
            }
        if job_id:
            query['job_id'] = job_id

        records = list(self._records.find(query).sort('created_at', DESCENDING))
        return [record_to_output(record) for record in records]

    @staticmethod
    def _row_to_raw_vendor_product(row: dict[str, Any]) -> RawVendorProduct:
        normalized_row = CatalogService._normalize_row(row)

        item_desc = CatalogService._first_value(
            normalized_row,
            ['item_desc', 'item_description', 'name', 'title', 'product_name', 'description', 'item', 'product']
        )
        if not item_desc:
            item_desc = 'Unknown Product'

        msrp_usd_raw = CatalogService._first_value(
            normalized_row,
            ['msrp_usd', 'price_usd', 'price', 'msrp', 'usd_price', 'unit_price', 'selling_price', 'mrp']
        )
        msrp_usd = CatalogService._parse_float(msrp_usd_raw)

        qty_raw = CatalogService._first_value(normalized_row, ['qty', 'quantity', 'stock', 'units', 'inventory', 'stock_qty', 'qty_on_hand'])
        qty = CatalogService._parse_int(qty_raw, default=1)

        brand = CatalogService._first_value(normalized_row, ['brand', 'label', 'vendor', 'maker', 'brand_name'])
        vendor_sku = CatalogService._first_value(normalized_row, ['vendor_sku', 'sku', 'style_id', 'id', 'product_id', 'product_code'])

        known_keys = {
            'item_desc',
            'item_description',
            'name',
            'title',
            'product_name',
            'description',
            'item',
            'product',
            'msrp_usd',
            'price_usd',
            'price',
            'msrp',
            'usd_price',
            'unit_price',
            'selling_price',
            'mrp',
            'qty',
            'quantity',
            'stock',
            'units',
            'inventory',
            'stock_qty',
            'qty_on_hand',
            'brand',
            'label',
            'vendor',
            'maker',
            'brand_name',
            'vendor_sku',
            'sku',
            'style_id',
            'id',
            'product_id',
            'product_code'
        }

        return RawVendorProduct(
            item_desc=str(item_desc),
            msrp_usd=msrp_usd,
            qty=qty,
            brand=str(brand) if brand else None,
            vendor_sku=str(vendor_sku) if vendor_sku else None,
            metadata={
                key: value
                for key, value in normalized_row.items()
                if key not in known_keys
            }
        )

    @staticmethod
    def _normalize_row(row: dict[str, Any]) -> dict[str, Any]:
        unpacked_row = CatalogService._unpack_single_column_row(row)
        normalized: dict[str, Any] = {}

        for key, value in unpacked_row.items():
            normalized_key = CatalogService._normalize_key(key)
            if normalized_key:
                normalized[normalized_key] = value

        return normalized

    @staticmethod
    def _unpack_single_column_row(row: dict[str, Any]) -> dict[str, Any]:
        if len(row) != 1:
            return row

        header_text, row_value = next(iter(row.items()))
        header = str(header_text)
        value = '' if row_value is None else str(row_value)

        if ',' not in header or ',' not in value:
            return row

        headers = CatalogService._split_csv_fields(header)
        values = CatalogService._split_csv_fields(value)

        if not headers:
            return row

        if len(values) < len(headers):
            values.extend([''] * (len(headers) - len(values)))
        elif len(values) > len(headers):
            headers.extend(f'extra_col_{index}' for index in range(len(headers), len(values)))

        return dict(zip(headers, values, strict=False))

    @staticmethod
    def _split_csv_fields(text: str) -> list[str]:
        try:
            parsed = next(csv.reader([text], skipinitialspace=True))
        except Exception:
            parsed = text.split(',')

        return [str(field).strip() for field in parsed]

    @staticmethod
    def _normalize_key(key: Any) -> str:
        normalized = str(key).strip().lower()
        normalized = normalized.replace('\\_', '_')
        normalized = re.sub(r'[\s\-./]+', '_', normalized)
        normalized = re.sub(r'[^a-z0-9_]', '', normalized)
        normalized = re.sub(r'_+', '_', normalized)
        return normalized.strip('_')

    @staticmethod
    def _sanitize_filename(filename: str) -> str:
        candidate = Path(filename).name.strip()
        if not candidate:
            candidate = 'upload.csv'

        cleaned = re.sub(r'[^A-Za-z0-9._-]+', '_', candidate)
        return cleaned or 'upload.csv'

    @staticmethod
    def _first_value(row: dict[str, Any], keys: list[str]) -> Any:
        for key in keys:
            value = row.get(key)
            if value is not None and str(value).strip() != '':
                return value
        return None

    @staticmethod
    def _parse_float(value: Any) -> float:
        if value is None:
            raise ValueError('Price column is missing in CSV row.')

        if isinstance(value, (int, float)):
            parsed = float(value)
        else:
            cleaned = re.sub(r'[^0-9.\-]', '', str(value))
            if not cleaned:
                raise ValueError(f'Unable to parse numeric price from value: {value}')
            parsed = float(cleaned)

        if parsed <= 0:
            raise ValueError('Price must be greater than zero.')
        return parsed

    @staticmethod
    def _parse_int(value: Any, default: int = 1) -> int:
        if value is None:
            return default

        if isinstance(value, int):
            return max(0, value)

        cleaned = re.sub(r'[^0-9\-]', '', str(value))
        if not cleaned:
            return default

        return max(0, int(cleaned))

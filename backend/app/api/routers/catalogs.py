from __future__ import annotations

from fastapi import APIRouter, BackgroundTasks, Depends, File, Query, UploadFile

from app.api.deps import get_catalog_service
from app.core.exceptions import CSVParsingError
from app.models.schemas import CatalogDeleteResponse, CatalogJobListItem, CatalogStatusResponse, CatalogUploadResponse
from app.services.catalog_service import CatalogService


router = APIRouter(prefix='/catalogs')


@router.post('/upload', response_model=CatalogUploadResponse)
async def upload_catalog(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    catalog_service: CatalogService = Depends(get_catalog_service)
) -> CatalogUploadResponse:
    if not file.filename:
        raise CSVParsingError('Missing filename. Please upload a valid CSV catalog file.')

    job = catalog_service.create_job(filename=file.filename, total_rows=0)

    try:
        raw_bytes = await file.read()
        if not raw_bytes:
            raise CSVParsingError('Uploaded CSV is empty.')
        file_path = catalog_service.persist_uploaded_file(str(job['job_id']), file.filename, raw_bytes)
    except Exception as exc:
        catalog_service.fail_job(str(job['job_id']), f'Could not store uploaded CSV file: {exc}')
        raise CSVParsingError(f'Could not store uploaded CSV file: {exc}') from exc

    background_tasks.add_task(catalog_service.process_catalog_file, str(job['job_id']), file_path)

    return CatalogUploadResponse(job_id=str(job['job_id']), status=str(job['status']))


@router.get('/status/{job_id}', response_model=CatalogStatusResponse)
def get_catalog_status(
    job_id: str,
    catalog_service: CatalogService = Depends(get_catalog_service)
) -> CatalogStatusResponse:
    return catalog_service.get_catalog_status(job_id)


@router.post('/cancel/{job_id}', response_model=CatalogStatusResponse)
def cancel_catalog_job(
    job_id: str,
    catalog_service: CatalogService = Depends(get_catalog_service)
) -> CatalogStatusResponse:
    return catalog_service.cancel_job(job_id)


@router.delete('/delete/{job_id}', response_model=CatalogDeleteResponse)
@router.delete('/{job_id}', response_model=CatalogDeleteResponse)
def delete_catalog_job(
    job_id: str,
    catalog_service: CatalogService = Depends(get_catalog_service)
) -> CatalogDeleteResponse:
    result = catalog_service.delete_job(job_id)
    return CatalogDeleteResponse(job_id=result['job_id'], status=result['status'])


@router.get('/jobs', response_model=list[CatalogJobListItem])
def list_catalog_jobs(
    limit: int = Query(default=25, ge=1, le=100),
    catalog_service: CatalogService = Depends(get_catalog_service)
) -> list[CatalogJobListItem]:
    return catalog_service.list_jobs(limit=limit)

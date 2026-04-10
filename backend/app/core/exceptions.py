from fastapi import Request, status
from fastapi.responses import JSONResponse


class CSVParsingError(Exception):
    def __init__(self, message: str = 'Unable to parse uploaded CSV file.') -> None:
        self.message = message
        super().__init__(self.message)


class LLMTimeoutError(Exception):
    def __init__(self, message: str = 'The LLM request timed out.') -> None:
        self.message = message
        super().__init__(self.message)


class ResourceNotFoundError(Exception):
    def __init__(self, resource: str, identifier: str) -> None:
        self.resource = resource
        self.identifier = identifier
        super().__init__(f'{resource} with id {identifier} was not found.')


async def csv_parsing_exception_handler(_: Request, exc: CSVParsingError) -> JSONResponse:
    return JSONResponse(
        status_code=status.HTTP_400_BAD_REQUEST,
        content={'detail': exc.message}
    )


async def llm_timeout_exception_handler(_: Request, exc: LLMTimeoutError) -> JSONResponse:
    return JSONResponse(
        status_code=status.HTTP_504_GATEWAY_TIMEOUT,
        content={'detail': exc.message}
    )


async def not_found_exception_handler(_: Request, exc: ResourceNotFoundError) -> JSONResponse:
    return JSONResponse(
        status_code=status.HTTP_404_NOT_FOUND,
        content={'detail': str(exc)}
    )


def register_exception_handlers(app) -> None:
    app.add_exception_handler(CSVParsingError, csv_parsing_exception_handler)
    app.add_exception_handler(LLMTimeoutError, llm_timeout_exception_handler)
    app.add_exception_handler(ResourceNotFoundError, not_found_exception_handler)

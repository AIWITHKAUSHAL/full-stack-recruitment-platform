"""Shared response shapes.

Keeping the pagination envelope in one generic model means the React client can
have exactly one ``Paginated<T>`` TypeScript type for every list endpoint.
"""

from __future__ import annotations

from math import ceil
from typing import Generic, TypeVar

from pydantic import BaseModel, Field

T = TypeVar("T")

DEFAULT_PAGE_SIZE = 12
MAX_PAGE_SIZE = 100


class Paginated(BaseModel, Generic[T]):
    items: list[T]
    page: int = Field(ge=1)
    page_size: int = Field(ge=1)
    total: int = Field(ge=0)
    pages: int = Field(ge=0)

    @classmethod
    def build(cls, items: list[T], page: int, page_size: int, total: int) -> Paginated[T]:
        return cls(
            items=items,
            page=page,
            page_size=page_size,
            total=total,
            pages=ceil(total / page_size) if page_size else 0,
        )


class MessageResponse(BaseModel):
    success: bool = True
    message: str


class ErrorDetail(BaseModel):
    code: str
    message: str
    details: dict | None = None


class ErrorResponse(BaseModel):
    """Documents the error envelope in Swagger. Rendered by the exception handlers."""

    success: bool = False
    error: ErrorDetail
    request_id: str

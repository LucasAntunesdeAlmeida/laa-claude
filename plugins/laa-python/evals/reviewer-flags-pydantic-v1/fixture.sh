#!/bin/sh
# The orders service (pyproject pins pydantic>=2.9) plus a new refunds feature written with
# Pydantic v1 idioms: class Config/orm_mode, @validator, from_orm(), and .dict(). Under v2,
# orm_mode only warns and from_attributes stays off, so from_orm on an ORM object fails at runtime.
set -eu
sh "$(dirname "$0")/../_fixtures/fastapi-service.sh"

mkdir -p src/app/refunds
touch src/app/refunds/__init__.py

cat > src/app/refunds/schemas.py <<'PY'
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, validator


class RefundIn(BaseModel):
    amount: Decimal
    reason: str

    @validator("amount")
    def amount_positive(cls, v: Decimal) -> Decimal:
        if v <= 0:
            raise ValueError("amount must be positive")
        return v


class OrderSummary(BaseModel):
    id: UUID
    total: Decimal
    status: str

    class Config:
        orm_mode = True
PY

cat > src/app/refunds/router.py <<'PY'
from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.orders.models import Order
from app.refunds.schemas import OrderSummary, RefundIn

router = APIRouter(prefix="/orders")

SessionDep = Annotated[AsyncSession, Depends(get_session)]


@router.post("/{order_id}/refunds")
async def refund_order(order_id: UUID, body: RefundIn, session: SessionDep) -> dict[str, Any]:
    order = await session.get(Order, order_id)
    if order is None:
        raise HTTPException(status_code=404, detail="order not found")
    if body.amount > order.total:
        raise HTTPException(status_code=422, detail="refund exceeds order total")
    order.status = "refunded"
    await session.commit()
    return {"order": OrderSummary.from_orm(order).dict(), "refund": body.dict()}
PY

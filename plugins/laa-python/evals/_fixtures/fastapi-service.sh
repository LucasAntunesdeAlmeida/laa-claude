#!/bin/sh
# A small FastAPI orders service on Pydantic v2 and async SQLAlchemy 2.x: settings, an async
# session dependency, an Order model, and a health router. Cases add their own files on top.
set -eu

mkdir -p src/app/core src/app/orders tests

cat > pyproject.toml <<'TOML'
[project]
name = "orders"
version = "0.1.0"
requires-python = ">=3.13"
dependencies = [
    "fastapi>=0.115",
    "pydantic>=2.9",
    "pydantic-settings>=2.6",
    "sqlalchemy[asyncio]>=2.0.36",
    "asyncpg>=0.30",
    "httpx>=0.28",
]

[dependency-groups]
dev = ["pytest>=8.3", "pytest-asyncio>=1.0", "ruff>=0.8", "mypy>=1.13"]
TOML

printf '3.13\n' > .python-version
touch src/app/__init__.py src/app/core/__init__.py src/app/orders/__init__.py

cat > src/app/core/config.py <<'PY'
from pydantic import SecretStr
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: SecretStr
    inventory_url: str = "http://inventory:8080"


settings = Settings()  # type: ignore[call-arg]
PY

cat > src/app/core/db.py <<'PY'
from collections.abc import AsyncIterator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import settings

engine = create_async_engine(settings.database_url.get_secret_value())
SessionLocal = async_sessionmaker(engine, expire_on_commit=False)


async def get_session() -> AsyncIterator[AsyncSession]:
    async with SessionLocal() as session:
        yield session
PY

cat > src/app/orders/models.py <<'PY'
from datetime import datetime
from decimal import Decimal
from uuid import UUID, uuid4

from sqlalchemy import DateTime, Numeric, String
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class Order(Base):
    __tablename__ = "orders"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    customer_email: Mapped[str] = mapped_column(String(320))
    total: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    status: Mapped[str] = mapped_column(String(32), default="pending")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
PY

cat > src/app/health.py <<'PY'
from fastapi import APIRouter

router = APIRouter()


@router.get("/healthz")
async def healthz() -> dict[str, str]:
    return {"status": "ok"}
PY

cat > src/app/main.py <<'PY'
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app import health
from app.core.db import engine


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    yield
    await engine.dispose()


def create_app() -> FastAPI:
    app = FastAPI(lifespan=lifespan)
    app.include_router(health.router)
    return app


app = create_app()
PY

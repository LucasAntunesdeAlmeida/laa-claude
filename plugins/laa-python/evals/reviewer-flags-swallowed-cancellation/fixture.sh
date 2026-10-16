#!/bin/sh
# The orders service plus a background stock poller started from the lifespan. The poll loop
# catches asyncio.CancelledError, logs it, and keeps looping, so shutdown (task.cancel()) and any
# timeout around it never stop the task. Nothing else in the file is wrong enough to crowd it out.
set -eu
sh "$(dirname "$0")/../_fixtures/fastapi-service.sh"

mkdir -p src/app/stock
touch src/app/stock/__init__.py

cat > src/app/stock/poller.py <<'PY'
import asyncio
import logging

import httpx

from app.core.config import settings

log = logging.getLogger(__name__)

_levels: dict[str, int] = {}


async def refresh(client: httpx.AsyncClient) -> None:
    resp = await client.get(f"{settings.inventory_url}/levels", timeout=5.0)
    resp.raise_for_status()
    _levels.update(resp.json())


async def poll_forever(client: httpx.AsyncClient, interval: float = 30.0) -> None:
    while True:
        try:
            await refresh(client)
            await asyncio.sleep(interval)
        except asyncio.CancelledError:
            log.warning("stock refresh cancelled, retrying")
            continue
        except httpx.HTTPError:
            log.exception("stock refresh failed")
            await asyncio.sleep(interval)


def level(sku: str) -> int:
    return _levels.get(sku, 0)
PY

cat > src/app/main.py <<'PY'
import asyncio
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI

from app import health
from app.core.db import engine
from app.stock.poller import poll_forever


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    async with httpx.AsyncClient() as client:
        poller = asyncio.create_task(poll_forever(client))
        yield
        poller.cancel()
        await poller
    await engine.dispose()


def create_app() -> FastAPI:
    app = FastAPI(lifespan=lifespan)
    app.include_router(health.router)
    return app


app = create_app()
PY

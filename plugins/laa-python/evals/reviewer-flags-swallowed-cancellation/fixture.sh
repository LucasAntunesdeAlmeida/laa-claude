#!/bin/sh
# The orders service plus a background stock poller started from the lifespan. The refresh helper
# runs inside asyncio.timeout() and catches asyncio.CancelledError as if it were the timeout: it closes
# the response and returns the cached levels. That also swallows shutdown's poller.cancel() when it
# lands mid-refresh, so the loop keeps running and the lifespan's `await poller` never returns (and the
# timeout never raises TimeoutError). The lifespan itself is correct: it cancels the task, awaits it
# under suppress(CancelledError), then disposes the engine.
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


async def _fetch_levels(client: httpx.AsyncClient) -> dict[str, int]:
    resp: httpx.Response | None = None
    try:
        resp = await client.get(f"{settings.inventory_url}/levels")
        resp.raise_for_status()
        return resp.json()
    except asyncio.CancelledError:
        # The refresh timed out: drop the half-read response and keep serving the cached levels.
        if resp is not None:
            await resp.aclose()
        log.warning("stock refresh timed out, keeping cached levels")
        return dict(_levels)


async def poll_forever(client: httpx.AsyncClient, interval: float = 30.0) -> None:
    while True:
        async with asyncio.timeout(5.0):
            levels = await _fetch_levels(client)
        _levels.update(levels)
        await asyncio.sleep(interval)


def level(sku: str) -> int:
    return _levels.get(sku, 0)
PY

cat > src/app/main.py <<'PY'
import asyncio
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager, suppress

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
        with suppress(asyncio.CancelledError):
            await poller
    await engine.dispose()


def create_app() -> FastAPI:
    app = FastAPI(lifespan=lifespan)
    app.include_router(health.router)
    return app


app = create_app()
PY

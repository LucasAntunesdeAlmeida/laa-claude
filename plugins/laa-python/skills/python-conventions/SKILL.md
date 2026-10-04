---
name: python-conventions
description: Modern Python backend conventions (project setup, layout, typing, FastAPI/Django, async, SQLAlchemy/Alembic, config, logging, security, testing, tooling). Use when writing, scaffolding, or reviewing Python code, especially when there's no stronger repo-local convention. Repo-local skills and CLAUDE.md override these defaults.
---

# Python backend conventions

**Precedence: the repo's existing patterns and `.claude/laa/project-map.md` override everything here.** Use these defaults for greenfield code or when the repo has no established pattern.

## Project & tooling
- Target a supported CPython (3.12+) and declare it in `pyproject.toml` (`requires-python`). `pyproject.toml` is the single home for project metadata and tool settings.
- Use `uv` for environments, dependencies, and the lockfile (`uv.lock`), unless the repo already uses Poetry or pip-tools. CI installs from the lockfile, never with unpinned `pip install`.
- Use a `src/` layout (`src/<package>/`), with `tests/` mirroring the package.
- Lint and format with Ruff (it replaces flake8, isort, and black). Type-check with mypy or pyright in strict mode.

## Layout
- Package by **domain**, not by layer. For example `src/app/billing/` holds its router, service, repository, schemas, and models.
- `src/app/core/` holds cross-cutting code: config, DB session, logging, auth, middleware.
- `src/app/main.py` builds the app through a factory (`create_app()`), so tests can create isolated instances.

## Typing & data
- Annotate every public function. Don't let `Any` or bare `dict` leak across module boundaries.
- Use Pydantic v2 models for request/response schemas and `pydantic-settings` for config. Use dataclasses for internal value objects. Keep ORM models separate from API schemas.
- Use `Decimal` for money (never `float`), timezone-aware UTC datetimes (`datetime.now(UTC)`), and UUIDs for public ids.

## Web framework
- Use FastAPI for APIs unless the repo uses Django (DRF or Django Ninja) or Flask.
- **FastAPI**:
  - One `APIRouter` per feature.
  - Use dependencies (`Depends`) for the DB session, current user, and tenant.
  - Set `response_model` on every route.
  - Use a `lifespan` context manager for startup and shutdown, not the deprecated `on_event`.
- **Errors**: raise domain exceptions and map them to HTTP responses (problem+json style) in one exception handler. Don't raise `HTTPException` from deep inside the domain layer.
- **Django**: keep business logic in services, not views or serializers. Use `select_related`/`prefetch_related` to avoid N+1, and review every generated migration.

## Async
- Never block inside `async def`: no `requests`, `time.sleep`, or sync DB drivers. Use `httpx.AsyncClient`, `asyncio.sleep`, and async drivers (asyncpg, psycopg 3). For unavoidable blocking code, use `await asyncio.to_thread(...)`.
- Give every outbound call a timeout. Use `asyncio.TaskGroup` for structured concurrency, and bound fan-out with `asyncio.Semaphore`.
- Keep a reference to every task you create, or it can be garbage-collected mid-flight.
- If the stack is sync (Django, Flask), stay sync. Don't sprinkle async into it.

## Persistence
- Use SQLAlchemy 2.0 style: `select()` and typed `Mapped[...]` columns. Use one `AsyncSession` per request through a dependency. Commit or roll back at the unit-of-work boundary (service or request), not inside repositories.
- Async sessions can't lazy-load implicitly. Eager-load with `selectinload`/`joinedload` wherever you'd touch relationships.
- Use Alembic for migrations: autogenerate, then **review** the script. Use expand → backfill → contract for live tables.
- Never build SQL with f-strings or `%` formatting. Use bound parameters (`text()` with params).

## Config, logging, security
- Load settings from the environment through `pydantic-settings` and validate them at startup. Keep secrets out of code and logs.
- Use structured logging (`structlog`, or stdlib `logging` with a JSON formatter) carrying a request/trace id. No `print`. Instrument FastAPI, SQLAlchemy, and httpx with OpenTelemetry.
- Hash passwords with argon2 or bcrypt. Use the `secrets` module for tokens and `hmac.compare_digest` to compare secrets.
- Never `pickle.loads`, `yaml.load`, or `eval` untrusted data (use `yaml.safe_load`). Call `subprocess` with an argument list, never `shell=True` with user input.

## Testing
- Use pytest with fixtures in `conftest.py`, and `pytest-asyncio` (or anyio) for async tests.
- Test FastAPI apps with `httpx.AsyncClient(transport=ASGITransport(app=app))`.
- Use real Postgres through `testcontainers` for repository and integration tests. Prefer small factories over large shared fixtures. Mock outbound httpx calls with `respx`.
- Test tenant isolation explicitly.

## Definition of done
`ruff format --check` · `ruff check` · `mypy` (or `pyright`) clean · `pytest` green. Prefix the commands with `uv run` in uv projects.

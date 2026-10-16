---
name: python-conventions
description: Modern Python backend conventions (project setup, uv, layout, typing, FastAPI/Django, async, SQLAlchemy/Alembic, config, logging, security, testing, Ruff and tooling). Use when writing, scaffolding, or reviewing Python code, such as adding a FastAPI route or dependency, an async service, a SQLAlchemy model or session, or a pyproject.toml, especially when there's no stronger repo-local convention. Repo-local skills and CLAUDE.md override these defaults.
---

# Python backend conventions

**Precedence: the repo's existing patterns and `.claude/laa/project-map.md` override everything here.** Use these defaults for greenfield code or when the repo has no established pattern.

## Project & tooling
- Greenfield code targets the newest CPython in **bugfix** status (https://devguide.python.org/versions/) that its dependencies support. Declare the floor in `pyproject.toml` (`requires-python`) and pin the interpreter in `.python-version`. `pyproject.toml` is the single home for project metadata and tool settings.
- When the floor is 3.14+, don't add `from __future__ import annotations`: annotations are already deferred (PEP 649/749).
- Use `uv` for environments, dependencies, and the lockfile (`uv.lock`), unless the repo already uses Poetry or pip-tools.
  - Put dev tools (pytest, ruff, mypy) in `[dependency-groups]` (PEP 735), e.g. `dev = ["pytest", "ruff"]`, not the legacy `[tool.uv] dev-dependencies`.
  - CI runs `uv sync --locked` (or `uv lock --check`) so a stale lockfile fails the build. Never unpinned `pip install`.
  - Production images use `uv sync --locked --no-dev`. Tools that need a standard lockfile get `uv export --format pylock.toml` (PEP 751).
- Use a `src/` layout (`src/<package>/`), with `tests/` mirroring the package.
- Lint and format with Ruff (it replaces flake8, isort, and black). Type-check with mypy or pyright in strict mode.
- As of Ruff 0.17, the defaults (https://docs.astral.sh/ruff/default-rules/) leave out the FastAPI rules, most security rules, and naive `datetime.now()`. Add them so `ruff check` backs the review:
  ```toml
  [tool.ruff.lint]
  # S301 pickle, S506 yaml.load, S602 shell=True, S608 SQL built from strings, DTZ005 naive now()
  extend-select = ["FAST", "S", "DTZ", "RUF006"]
  ```
  Ignore `S101` (assert) under `tests/` with `[tool.ruff.lint.per-file-ignores]`.

## Layout
- Package by **domain**, not by layer. For example `src/app/billing/` holds its router, service, repository, schemas, and models.
- `src/app/core/` holds cross-cutting code: config, DB session, logging, auth, middleware.
- `src/app/main.py` builds the app through a factory (`create_app()`), so tests can create isolated instances.

## Typing & data
- Annotate every public function. Don't let `Any` or bare `dict` leak across module boundaries.
- Use Pydantic v2 models for request/response schemas and `pydantic-settings` for config. Use only v2 APIs: `model_dump()`, `model_validate()`, `model_config = ConfigDict(from_attributes=True)`, `@field_validator`, `@model_validator`. Not `.dict()`, `.json()`, `parse_obj`, `from_orm`, `class Config`/`orm_mode`, `@validator`, or `@root_validator`.
- Use dataclasses for internal value objects. Keep ORM models separate from API schemas.
- Use `Decimal` for money (never `float`), timezone-aware UTC datetimes (`datetime.now(tz=UTC)`, never `utcnow()` or `utcfromtimestamp()`), and UUIDs for public ids.

## Web framework
- Use FastAPI for APIs unless the repo uses Django (DRF or Django Ninja) or Flask.
- **FastAPI**:
  - One `APIRouter` per feature.
  - Declare the response type as the **return annotation** (`async def get_user(...) -> UserOut:`). Use `response_model=` only when the function returns something else (an ORM object or a dict), and then annotate it `-> Any`. A `response_model` that repeats the return type is redundant (Ruff `FAST001`).
  - Declare dependencies with `Annotated` and reusable aliases, not `= Depends(...)` defaults (Ruff `FAST002`):
    ```python
    SessionDep = Annotated[AsyncSession, Depends(get_session)]
    CurrentUser = Annotated[User, Depends(get_current_user)]

    @router.get("/{user_id}")
    async def get_user(user_id: UUID, session: SessionDep, user: CurrentUser) -> UserOut: ...
    ```
  - Use dependencies for the DB session, current user, and tenant.
  - A route that calls a sync library (sync DB driver, `requests`, boto3) is a plain `def`, which FastAPI runs in a threadpool. Use `async def` only when everything it waits on is awaited.
  - Use a `lifespan` context manager for startup and shutdown, not the deprecated `on_event`.
- **Errors**: raise domain exceptions and map them to HTTP responses (problem+json style) in one exception handler. Don't raise `HTTPException` from deep inside the domain layer.
- **Django**: keep business logic in services, not views or serializers. Use `select_related`/`prefetch_related` to avoid N+1, and review every generated migration.

## Async
- Never block inside `async def`: no `requests`, `time.sleep`, or sync DB drivers. Use `httpx.AsyncClient`, `asyncio.sleep`, and async drivers (asyncpg, psycopg 3). For unavoidable blocking code, use `await asyncio.to_thread(...)`.
- Give every outbound call a timeout. Bound a block of awaits with `async with asyncio.timeout(seconds):` (3.11+).
- Use `asyncio.TaskGroup` for fan-out rather than `gather()`: when one task fails, TaskGroup cancels the others, while `gather()` leaves them running. Bound fan-out with `asyncio.Semaphore`.
- Never swallow cancellation. If you catch `asyncio.CancelledError`, clean up and re-raise it. Don't wrap awaits in bare `except:` or `except BaseException:`, even to log and return a fallback. Prefer `try/finally` for cleanup. The one exception is awaiting a task you just cancelled yourself: `task.cancel()` then `with suppress(asyncio.CancelledError): await task`.
- Keep a reference to every task you create, or it can be garbage-collected mid-flight (Ruff `RUF006`).
- If the stack is sync (Django, Flask), stay sync. Don't sprinkle async into it.

## Persistence
- Use SQLAlchemy 2.x style: `select()` and typed `Mapped[...]` columns.
- Build sessions with `async_sessionmaker(engine, expire_on_commit=False)` and use one `AsyncSession` per request through a dependency. Never share a session across concurrent tasks (`gather`, `TaskGroup`); give each task its own.
- Commit or roll back at the unit-of-work boundary (service or request), not inside repositories.
- Async sessions can't lazy-load implicitly. Declare relationships with `lazy="raise"` and eager-load with `selectinload`/`joinedload` where you touch them.
- Call `await engine.dispose()` on shutdown in the `lifespan`.
- Use Alembic for migrations: autogenerate, then **review** the script.
  - Autogenerate turns a table or column rename into drop + add, which loses the data. Rewrite it as a rename.
  - Set a `naming_convention` on `MetaData` so constraints get stable names that autogenerate can detect.
  - Use expand → backfill → contract for live tables.
- Never build SQL with f-strings or `%` formatting. Use bound parameters (`text()` with params).

## Config, logging, security
- Load settings from the environment through `pydantic-settings` and validate them at startup. Type secret settings as `SecretStr` so they stay out of reprs and logs. Keep secrets out of code and logs.
- Use structured logging (`structlog`, or stdlib `logging` with a JSON formatter) carrying a request/trace id. No `print`. Instrument FastAPI, SQLAlchemy, and httpx with OpenTelemetry.
- Hash passwords with argon2 or bcrypt. Use the `secrets` module for tokens and `hmac.compare_digest` to compare secrets.
- Never `pickle.loads`, `yaml.load`, or `eval` untrusted data (use `yaml.safe_load`). Call `subprocess` with an argument list, never `shell=True` with user input.
- Before Python 3.14, extract untrusted tar archives with `extractall(filter="data")` (3.12+, backported to 3.8.17, 3.9.17, 3.10.12, and 3.11.4; check `hasattr(tarfile, "data_filter")`). From 3.14 it's the default.

## Testing
- Use pytest with fixtures in `conftest.py`, and `pytest-asyncio` (or anyio) for async tests.
- pytest-asyncio 1.0 removed the `event_loop` fixture. Don't define or request it; share a loop with `@pytest.mark.asyncio(loop_scope="module")` or the `asyncio_default_test_loop_scope` setting.
- Test FastAPI apps with `httpx.AsyncClient(transport=ASGITransport(app=app))`. That doesn't run the `lifespan`, so when the app needs it (engine, clients), wrap the app in `asgi_lifespan.LifespanManager` and pass `manager.app` to the transport.
- Use real Postgres through `testcontainers` for repository and integration tests. Prefer small factories over large shared fixtures. Mock outbound httpx calls with `respx`.
- Test tenant isolation explicitly.

## Definition of done
`ruff format --check` · `ruff check` · `mypy` (or `pyright`) clean · `pytest` green. Prefix the commands with `uv run` in uv projects.

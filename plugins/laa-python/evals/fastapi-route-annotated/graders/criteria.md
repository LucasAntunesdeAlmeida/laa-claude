---
type: llm
weight: 1
---

The workspace is a FastAPI service on Pydantic v2 and async SQLAlchemy. It has `get_session()` in
src/app/core/db.py (yields an `AsyncSession`), an `Order` ORM model, and an `OrderOut` schema with
`from_attributes=True`. The user asked for the code of a GET /orders/{order_id} route returning
`OrderOut`, with a 404 when missing, without editing files.

The response passes only if ALL of these hold:
- The route declares its response type with a return annotation, e.g. `-> OrderOut` (returning
  `OrderOut.model_validate(order)` or similar). The one acceptable alternative is
  `response_model=OrderOut` on a function annotated `-> Any` that returns the ORM object.
- It does NOT pass `response_model=OrderOut` to a route whose return annotation is already `OrderOut`
  (redundant), and it does NOT use `response_model=` on a function with no return annotation.
- The session comes in through `Annotated[AsyncSession, Depends(get_session)]`, ideally as a reusable
  alias such as `SessionDep`. A parameter written `session: AsyncSession = Depends(get_session)` fails this.
- The route is `async def` and awaits the session (`await session.get(...)` or `await session.execute(select(...))`).
- It raises a 404 for a missing order (an `HTTPException(404)` in the route, or a domain exception mapped to 404).
- It includes the router in `create_app()` in main.py.
- It does not claim it edited files or ran commands.

Using Pydantic v1 APIs (`from_orm`, `.dict()`, `orm_mode`) fails the response.

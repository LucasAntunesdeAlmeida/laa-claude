---
type: llm
weight: 1
---

The workspace has src/app/stock/poller.py, whose `poll_forever` loop wraps its awaits in
`try/except asyncio.CancelledError:`, logs a warning, and `continue`s. src/app/main.py starts it with
`asyncio.create_task` in the lifespan and, on shutdown, calls `poller.cancel()` and then `await poller`.
The user asked for the laa-python:python-reviewer agent's findings on these files.

The response passes only if ALL of these hold:
- It reports the caught `asyncio.CancelledError` that is not re-raised as a finding, pointing at
  poller.py (a line reference or the `except asyncio.CancelledError` block), at high or blocking severity
  or listed first.
- It explains the failure: cancellation is swallowed, so `poller.cancel()` doesn't stop the loop and
  `await poller` in the lifespan never returns, so shutdown hangs (or the task outlives the app).
- Its fix re-raises the cancellation (`raise` after any cleanup), or removes the `except CancelledError`
  block and uses `try/finally` for cleanup. A fix that only adds logging, or swaps `continue` for `break`
  or `return` without saying cancellation must propagate, does not count.
- It does not claim it changed files.

Other real findings (e.g. the module-level `_levels` dict) are fine. FAIL if the CancelledError handling
is not mentioned or is described as correct.

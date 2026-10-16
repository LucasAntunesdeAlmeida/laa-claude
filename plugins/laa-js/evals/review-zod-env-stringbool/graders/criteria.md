---
type: llm
weight: 1
---

`src/config/env.ts` is a Zod 4 env schema. `REQUIRE_AUTH` and `DEBUG_SQL` use `z.coerce.boolean()`,
which is `Boolean(value)`: any non-empty string, including `"false"` and `"0"`, parses as `true`.
Production sets both to `false`, so auth stays on where it was meant to be off and SQL debug logging is
on everywhere. The rest of the schema (`z.url()`, `z.email()`, `z.coerce.number()`) is fine for Zod 4.

The response passes only if ALL of these hold:
- It flags `z.coerce.boolean()` on `REQUIRE_AUTH` and/or `DEBUG_SQL` (with a file:line or the field name)
  as a bug, explaining that the string `"false"` becomes `true`.
- It recommends `z.stringbool()` as the fix (a hand-written enum/transform such as
  `z.enum(['true','false']).transform(v => v === 'true')` is acceptable only if `z.stringbool()` is also
  mentioned).
- It does not tell the user to switch `z.url()` / `z.email()` to `z.string().url()` / `z.string().email()`.
- It does not claim it edited files.

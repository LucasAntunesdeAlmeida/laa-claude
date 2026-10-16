---
type: llm
weight: 1
---

`src/config/env.ts` is a Zod 4 env schema. `REQUIRE_AUTH` and `DEBUG_SQL` use `z.coerce.boolean()`,
which is `Boolean(value)`: any non-empty string, including `"false"` and `"0"`, parses as `true`.
So setting either flag to `false` in a deployment has no effect: auth can't be turned off, and SQL debug
logging turns on. The prompt doesn't mention Zod, these flags, or their values; the reviewer has to spot it (zod is `^4.1.0` in package.json).
`DATABASE_URL` and `SUPPORT_EMAIL` use `z.string().url()` and `z.string().email({ message })`, which Zod 4
deprecates in favor of the top-level `z.url()` / `z.email()` and the `error` param.

The response passes only if ALL of these hold:
- It flags `z.coerce.boolean()` on `REQUIRE_AUTH` and/or `DEBUG_SQL` (with a file:line or the field name)
  as a bug, explaining that the string `"false"` becomes `true`.
- It recommends `z.stringbool()` as the fix (a hand-written enum/transform such as
  `z.enum(['true','false']).transform(v => v === 'true')` is acceptable only if `z.stringbool()` is also
  mentioned).
- It flags the deprecated forms in this new code: `z.string().url()` / `z.string().email()` (use `z.url()` /
  `z.email()`) and the `message` param (use `error`). Mentioning either the string formats or `message`
  passes this point; it doesn't need both.
- It does not claim it edited files.

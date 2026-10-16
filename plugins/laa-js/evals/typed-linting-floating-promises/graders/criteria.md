---
type: llm
weight: 1
---

The workspace is a TypeScript service on `eslint@^10` and `typescript-eslint@^8`. Its only lint config is
`.eslintrc.cjs`, which extends the untyped `plugin:@typescript-eslint/recommended` and sets
`@typescript-eslint/no-floating-promises: error` with no `parserOptions` for type information.
`src/jobs/sync.ts` has a floating `fetchStock(baseUrl).then(saveLevels)` inside `setInterval`.
The user asked what's wrong and for the exact file changes, without running anything.

The response passes only if ALL of these hold:
- It says ESLint 10 no longer reads `.eslintrc.*` (eslintrc support was removed), and replaces it with a
  flat config file (`eslint.config.js`, `.mjs`, or `.ts`), deleting or retiring `.eslintrc.cjs`.
- It says `no-floating-promises` needs type information (typed linting), so the untyped setup can't work
  even with the rule turned on.
- The new flat config enables typed linting: it uses `tseslint.configs.recommendedTypeChecked` or
  `tseslint.configs.strictTypeChecked` (the `...TypeChecked` presets), AND sets
  `parserOptions.projectService: true` (setting `parserOptions.project` to the tsconfig is acceptable
  instead of `projectService`). Adding only the bare rule to a flat config with the untyped
  `tseslint.configs.recommended` and no type information fails this.
- It does not claim it ran ESLint or edited files.

Fixing the floating promise in `src/jobs/sync.ts` (for example with `.catch(...)` or `void` plus error
handling), mentioning that the TypeChecked preset also turns on `no-misused-promises`, or using
`defineConfig` from `eslint/config` are pluses but not required.

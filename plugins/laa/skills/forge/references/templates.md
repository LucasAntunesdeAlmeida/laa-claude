# Forge templates

## Agent (`.claude/agents/<name>.md`)

```markdown
---
name: <kebab-name>
description: <What it knows/does> for <area/paths>. Use when <triggers: tasks, phrases, file areas>.
tools: Read, Grep, Glob, Bash          # add Edit, Write only if it must change files
model: sonnet                          # opus for deep reasoning (design, root cause); haiku for mechanical work
effort: medium                         # high when its output must be right (review, verification, root cause); low for mechanical work
memory: project                        # keep if it should accumulate knowledge across sessions
color: cyan                            # by role: cyan understand, blue design, green build, yellow investigate, purple review, red adversarial, orange infra, pink stack/practice reviewer
---

You are the <role> for <area> in this repository.

## What you know
- <Domain rule 1> (enforced at `path:line`)
- <Key entities and where they live>
- <Invariants that must never break>

## How to work
1. <First thing to read/check>
2. <Procedure>

## Output
<Exact shape the caller needs>

## Rules
- <Hard constraints, e.g. "never bypass TenantScope">
```

## Skill (`.claude/skills/<name>/SKILL.md`)

```markdown
---
name: <kebab-name>
description: <Procedure> for this repo. Use when <user phrases / situations / file areas>.
argument-hint: <args>                  # if user-invocable with input
---

# <Title>

## Steps
1. <Step with exact command or file path> (example: `path:line`)
2. ...

## Checklist before done
- [ ] <build/test command> passes
- [ ] <convention checks>

## Gotchas
- <Thing that bit someone before, from learnings.md>
```

Add a `references/` folder next to `SKILL.md` for long material (such as a full example) and link to it, so the main file stays short.

## Workflow (`.claude/workflows/<name>.js`)

Use a workflow for a repeatable fan-out: the same check or change over many units, or several independent perspectives on one question. Run it with `/<name> <text>`, or from a skill with the Workflow tool.

```js
export const meta = {
  name: '<kebab-name>',
  description: '<one line: what it fans out over and what it returns>',
  whenToUse: '<when to run it>. args: { focus? } or plain text',
  phases: [
    { title: 'Find', detail: '<how units are discovered>', model: 'sonnet' },
    { title: 'Check', detail: 'one agent per unit' },
    { title: 'Verify', detail: 'a skeptic per finding' },
  ],
}

// From a skill, args is an object. Typed as `/<name> <text>`, it's a string.
const input = typeof args === 'string' ? { focus: args.trim() } : (args || {})

const UNITS = {
  type: 'object',
  properties: { units: { type: 'array', items: { type: 'string' } } },
  required: ['units'],
}
const FINDINGS = {
  type: 'object',
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: { location: { type: 'string' }, issue: { type: 'string' }, fix: { type: 'string' } },
        required: ['location', 'issue', 'fix'],
      },
    },
  },
  required: ['findings'],
}
const VERDICT = {
  type: 'object',
  properties: { verdict: { type: 'string', enum: ['refuted', 'confirmed', 'uncertain'] }, evidence: { type: 'string' } },
  required: ['verdict', 'evidence'],
}

phase('Find')
const found = await agent(
  `List every <unit> in this repo${input.focus ? ` related to: ${input.focus}` : ''}. <Exact paths or patterns to search>.`,
  { label: 'find', model: 'sonnet', effort: 'low', schema: UNITS })
const units = found ? found.units : []
log(`${units.length} unit(s) to check`)

// pipeline(): each unit goes to verification as soon as its own check finishes.
const results = await pipeline(units,
  unit => agent(`Check ${unit} for <rule>. The correct pattern is at <path:line>.`,
    { label: `check:${unit}`, phase: 'Check', agentType: '<repo agent name, or laa:reviewer>', schema: FINDINGS }),
  r => parallel((r ? r.findings : []).map(f => () =>
    agent(`Try to REFUTE: ${f.issue} at ${f.location}.`,
      { label: `verify:${f.location}`, phase: 'Verify', agentType: 'laa:verifier', schema: VERDICT })
      .then(v => ({ ...f, verdict: v ? v.verdict : 'uncertain' })))))

return results.filter(Boolean).flat().filter(f => f && f.verdict !== 'refuted')
```

Rules for workflows:
- Use plain JavaScript, not TypeScript. `meta` must be a pure literal, with no variables, calls, or template strings.
- Don't use `Date.now()`, `Math.random()`, `new Date()`, `import`, or file access. Pass anything like that in through `args`.
- Default to `pipeline()`. Use a barrier (`parallel()` between stages) only when a stage needs every result at once, and say why in a comment.
- Give agents a `schema` whenever the script reads their output.
- Use `isolation: 'worktree'` only for agents that edit files in parallel.
- Reference repo agents by name (`billing-expert`) and laa agents as `laa:<name>`.
- Every `agent()` call names an `agentType` (whose frontmatter sets the model) or sets `model` and `effort` itself. Otherwise it runs on whatever model and effort the session happens to use.
- Scale the fan-out to the need, and `log()` anything skipped or capped.

## Hook (`.claude/settings.json` + `.claude/hooks/<name>.sh`)

```json
{
  "hooks": {
    "PostToolUse": [
      { "matcher": "Edit|Write",
        "hooks": [{ "type": "command", "command": "sh \"$CLAUDE_PROJECT_DIR/.claude/hooks/<name>.sh\"" }] }
    ]
  }
}
```

```sh
#!/bin/sh
# <what it enforces and why>, from learnings.md <date/title>
input=$(cat)                                   # hook JSON on stdin
file=$(printf '%s' "$input" | sed -n 's/.*"file_path" *: *"\([^"]*\)".*/\1/p' | head -n1)
case "$file" in
  *.go) gofmt -w "$file" ;;
esac
exit 0      # exit 2 + message on stderr blocks the action and tells Claude why
```

Rules for hooks:
- They run under Git Bash on Windows and `sh` elsewhere, so write POSIX sh only.
- Keep them under about 2 seconds and silent on success.
- Use exit 2 with a clear stderr message only for hard rules (for example "generated file, edit the .proto instead").

## Authoring rules (all kinds)
- **The description is the trigger.** Claude decides whether to use an asset from its description alone. Include concrete phrases and paths.
- **Evidence over opinion.** Every rule should come from something observed in this repo or in learnings.md.
- **Short beats complete.** An asset that fits in one screen gets followed. A long one gets skimmed.
- **One job per asset.** If you're writing "and also", split it.

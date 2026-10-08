# laa output contract

How laa skills format what the user sees. Short, scannable, and the same every time. The `laa-mods` band reads the **mode**, **step**, **gate**, and **Next** lines, so keep their exact shape.

## Glyphs (one meaning each)
`✓` done or confirmed · `✗` failed, blocked, or refuted · `▲` warning or degraded · `★` a decision for the user · `▸` a step · `→` a fix or next action · `·` separator. No emoji.

## Mode line: first line of the run
`**laa:<skill>** · <size> · <workflow | agent> mode`
For example: `**laa:migrate** · large · agent mode`. Leave out the parts that don't apply.

## Step line: when a step starts
`**▸ <n>/<last> · <Step title>** · <what runs, in a few words>`
Use the skill's own step numbers. `<last>` is the number of its last step. For example: `**▸ 4/7 · Transform** · 6 batches in worktrees`. Write one for each step that does real work. Skip steps the size triage skipped.

## Gate card: every ★ gate
Ask with **AskUserQuestion**. The question starts with `★` and says what's being approved, and the options are:
- **Approve**: its description says what runs next and whether files change.
- **Revise**: the user says what to change.
- **Stop**: nothing else runs, and the branch stays as it is.

For a choice rather than an approval (which root cause, which journal), the options are up to 3 candidates, recommended first, and then **Stop**. AskUserQuestion takes at most 4 options per question, so name any further candidates in the question text; the user can pick one through its free-text answer. A multi-select choice (which assets) splits the candidates over several questions of up to 4 options each.

Without AskUserQuestion (for example in a non-interactive run), end the reply with the same card as text, and wait:
```
**★ <Approve the recipe?>** · <one-line summary>
- **Approve**: <what runs next; whether files change>
- **Revise**: tell me what to change
- **Stop**: nothing else runs; the branch stays as it is
```

## Closing report: the last thing a run prints
A status line, then 2–6 facts as a list, then **Next**:
```
**✓ <Outcome in five words or fewer>** · <one-line why>
- **Branch** <branch> · <n> commits · not pushed
- **Changed** <n> files
- **Tests** `<command>` ✓
- **Decisions** <only the ones the user didn't make>

**Next**
- `/laa:review`: check the branch before the PR
- say "open the PR": drafts it with the git conventions
```
- Use `**✗ <what failed>** · <where>` when the run failed, with **Tried**, **Cause**, and the **Next** items that recover.
- Use `**▲ <what degraded>** · <impact>` before the report when something ran in a weaker way: a specialist agent fell back to a generic one, or workflow mode fell back to agent mode.
- **Next** lists 1–3 actions, the most likely first. Put a command in backticks so it can be suggested to the user.
- **Next** appears only here, once per run: it's what marks the run as finished. A step in the middle of a run never ends with it.

## Findings
One list item per finding, most severe first. The tags are `CRIT`, `HIGH`, `MED`, and `LOW`:
```
**<n> findings** · <m> refuted · <reviewers>
- `HIGH` `internal/orders/cancel.go:42` refund issued twice on retried webhooks → check the idempotency key first
- `MED` `internal/orders/list.go:77` unbounded query on the orders table → page with a cursor
```
When a workflow returns a `report`, print it as is. Add **Next** after it only when it ends the run: the closing step, or the workflow typed on its own.

## Style
Lead with the result. Numbers over adjectives. One bold phrase per line at most. No headings below `###`. Tables only for 3+ rows. Don't apologize or hype.

## Local state
`.claude/laa/local/` holds state that is never committed, so writing there is fine on any branch, the default branch included. When you first write there, create `.claude/laa/local/.gitignore` with the single line `*`. In a repo laa hasn't adopted (no `.claude/laa/learnings.md` or `.claude/laa/project-map.md`), write nothing there unless the user asks.

## Journal: pipelines that change files
`/laa:fix`, `/laa:feature`, `/laa:migrate`, and `/laa:build` keep a journal, so `/laa:resume` can pick a run up after `/clear` or weeks later. Write it once the work branch exists, overwriting the whole file:
- at every ★ gate, with `status: waiting`;
- as soon as the gate is answered: Approve → `status: running`, `gate: none`, and the next step; Stop → `status: stopped`;
- in the closing report step, with `status: done`.

Where it goes:
- `.claude/laa/local/runs/<branch with / replaced by ->.md` of the main checkout, for example `.claude/laa/local/runs/fix-refund-retries.md`. When working in a git worktree, the main checkout is the parent of `git rev-parse --path-format=absolute --git-common-dir`.
- `/laa:build` keeps one journal for the whole build, `.claude/laa/local/runs/build.md`, starting with the walking skeleton, since it moves through one branch per milestone.

```
# laa:<skill> · <branch>
- status: waiting | running | stopped | done
- step: <n>/<last> · <Step title>
- gate: ★ <question> | none
- request: <the original request, one line>

## Decisions
- <decision>: <choice> (<why>)

## Plan
<the plan, recipe, or root cause as it stands; paths, not code>
```

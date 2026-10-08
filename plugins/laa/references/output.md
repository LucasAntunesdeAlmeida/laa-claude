# laa output contract

How laa skills format what the user sees. Short, scannable, and the same every time. The `laa-mods` band reads the **mode**, **step**, **gate**, and **Next** lines, so keep their exact shape.

## Glyphs (one meaning each)
`✓` done or confirmed · `✗` failed, blocked, or refuted · `▲` warning or degraded · `★` a decision for the user · `▸` a step · `→` a fix or next action · `·` separator. No emoji.

## Mode line: first line of the run
`**laa:<skill>** · <size> · <workflow | agent> mode`
For example: `**laa:fix** · standard · workflow mode`. Leave out the parts that don't apply.

## Step line: when a step starts
`**▸ <n>/<last> · <Step title>** · <what runs, in a few words>`
Use the skill's own step numbers. `<last>` is the number of its last step. For example: `**▸ 3/7 · Investigate** · 5 angles in parallel`. Write one for each step that does real work. Skip steps the size triage skipped.

## Gate card: every ★ gate
Ask with **AskUserQuestion**. The question starts with `★` and says what's being approved, and the options are:
- **Approve**: its description says what runs next and whether files change.
- **Revise**: the user says what to change.
- **Stop**: nothing else runs, and the branch stays as it is.

For a choice rather than an approval (which root cause, which assets), the options are the candidates, recommended first, and then **Stop**.

Without AskUserQuestion (for example in a non-interactive run), end the reply with the same card as text, and wait:
```
**★ <Approve the plan?>** · <one-line summary>
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
- `/laa:retro`: capture what we learned
- say "open the PR": drafts it with the git conventions
```
- Use `**✗ <what failed>** · <where>` when the run failed, with **Tried**, **Cause**, and the **Next** items that recover.
- Use `**▲ <what degraded>** · <impact>` before the report when something ran in a weaker way: a specialist agent fell back to a generic one, or workflow mode fell back to agent mode.
- **Next** lists 1–3 actions, the most likely first. Put a command in backticks so it can be suggested to the user.

## Findings
One list item per finding, most severe first. The tags are `CRIT`, `HIGH`, `MED`, and `LOW`:
```
**<n> findings** · <m> refuted · <reviewers>
- `HIGH` `internal/billing/invoice.go:88` nil address dereference on legacy rows → guard with `addr == nil`
- `MED` `internal/billing/invoice.go:120` query in a loop over line items (N+1) → preload with one join
```
When a workflow returns a `report`, print it as is, then add your own **Next**.

## Style
Lead with the result. Numbers over adjectives. One bold phrase per line at most. No headings below `###`. Tables only for 3+ rows. Don't apologize or hype.

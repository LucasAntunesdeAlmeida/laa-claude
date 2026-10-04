# laa-claude

A Claude Code plugin marketplace for backend developers, tech leads, and architects. It provides:
- fan-out **workflows** that run specialist **agents** in parallel
- entry-point **skills** for each kind of task
- a **meta layer** that generates repo-specific agents and skills and improves itself from what it learns

## Plugins

| Plugin | What it gives you |
|---|---|
| `laa` | Core: entry skills (incl. `/laa:explore`), 13 specialist agents, 6 workflows, session-start and correction-capture hooks, evals |
| `laa-go` | Go conventions skill + `go-reviewer` agent |
| `laa-dotnet` | .NET/C# conventions skill + `dotnet-reviewer` agent |
| `laa-python` | Python conventions skill (FastAPI/Django, SQLAlchemy, async) + `python-reviewer` agent |
| `laa-js` | Node.js conventions skill for TypeScript and JavaScript + `js-reviewer` agent |
| `laa-git` | Practice pack, any language: git conventions skill (Conventional Commits, branches, history, PRs) + `git-reviewer` agent |
| `laa-docs` | Practice pack, any language: README/onboarding conventions skill + `docs-reviewer` agent (catches docs drift) |
| `laa-mods` | Mods (TypeScript function hooks): a default-branch guard and a status band above the prompt. Opt-in, see [Mods](#mods-laa-mods) |

**Stack packs** add language rules, and their reviewers join reviews of matching files. **Practice packs** add language-agnostic rules, and their reviewers join every review.

## Install

**Local (while developing this repo):**
```
/plugin marketplace add <path-to>/laa-claude
/plugin install laa@laa
/plugin install laa-go@laa        # and/or laa-dotnet@laa, laa-python@laa, laa-js@laa
/plugin install laa-git@laa       # and/or laa-docs@laa
/plugin install laa-mods@laa      # optional: needs a Claude Code build with mods (function hooks)
```
Quick test without installing: `claude --plugin-dir ./plugins/laa --plugin-dir ./plugins/laa-go`

**From GitHub:** push this repo, then run `/plugin marketplace add <owner>/laa-claude`.

**Per project, for the whole team:** commit this to `<project>/.claude/settings.json`. `/laa:adopt` does it for you.
```json
{
  "extraKnownMarketplaces": { "laa": { "source": { "source": "github", "repo": "<owner>/laa-claude" } } },
  "enabledPlugins": { "laa@laa": true, "laa-go@laa": true }
}
```

## Entry points

You can type these directly, or just describe the task ("let's fix bug Z"). The skill descriptions are written so Claude routes the request automatically.

| Command | Use for | Fan-out |
|---|---|---|
| `/laa:explore <question>` | Understanding code: "how does X work", "what calls Y", "what breaks if I change Z" (read-only) | code graph lookup, or 2–4 explorers for broad questions → answer with `path:line` evidence |
| `/laa:build <idea>` | New product or SaaS from zero | PRD → `design-panel` → ADRs → plan → walking skeleton → `adopt` → `implement-slices` per milestone → `review-panel` |
| `/laa:feature <desc>` | A change in an existing repo | explorers → clarify → `design-panel` → slices → `implement-slices` → `review-panel` |
| `/laa:fix <bug>` | Bugs and regressions | reproduce → `investigate` (5 angles) → verify → minimal fix → review |
| `/laa:migrate <change>` | Large mechanical changes: Go/.NET/Python/Node upgrades, library swaps, renames | pilot → recipe ★ → `migrate-sites` finds sites ★ → batches in parallel worktrees → verify → sweep → `review-panel` |
| `/laa:review [pr\|branch]` | Code review | `review-panel`: correctness, completeness, security, perf, infra, and stack reviewers, each finding adversarially verified |
| `/laa:adopt` | First use in a repo | pick code-intelligence tool ★ → `map-repo` → project map + recommended repo-specific assets |
| `/laa:forge <need>` | Create one repo-specific agent, skill, workflow, or hook | evidence → template → smoke test → register |
| `/laa:retro` | Capture learnings after work | — |
| `/laa:evolve` | Turn learnings into approved diffs (local) or PRs with evals (upstream) | — |

Every pipeline sizes itself to the task. Trivial bugs and small features skip the fan-out.

**Git:** in a git repo, every command that changes files works on a task branch (`fix/…`, `feat/…`, `migrate/…`, `chore/laa-…`). If your checkout has other uncommitted changes, it uses a git worktree instead of switching branches under them. Parallel agents always get their own worktrees. Nothing is committed to the default branch, and nothing is merged, pushed, or opened as a PR unless you ask.

**Workflows as commands:** you can also type a workflow directly with plain text:
- `/laa:investigate <bug>`
- `/laa:design-panel <requirements>`: a standalone architecture decision
- `/laa:review-panel [base-ref | focus]`
- `/laa:implement-slices <task>`: one task in a worktree, with review
- `/laa:migrate-sites <change>`: finds the sites only
- `/laa:map-repo [focus]`

**Plain-language requests:** when you describe a task instead of typing a command, Claude may not be allowed to start a workflow on its own. The skills then run the same agents in parallel through the Agent tool.

## How it fits together

```
 you ──► entry skill (/laa:fix, /laa:build, ...)          runs in your main session, owns the ★ approval gates
            │
            ├──► workflow (laa:investigate, laa:design-panel, ...)   deterministic fan-out / verify / synthesize
            │        └──► specialist agents (investigator, architect, verifier, ...)   leaves: they don't delegate
            │
            └──► meta layer
                   adopt  → .claude/laa/project-map.md + repo-local agents/skills/workflows/hooks (via forge)
                   retro  → .claude/laa/learnings.md
                   evolve → local diffs  |  upstream PR to this repo + eval case
```

Per-project state lives in `<project>/.claude/laa/`:
- `project-map.md`: the codebase map every agent reads first
- `learnings.md`: the retro log (`status: open | applied | rejected | upstreamed`)
- `assets.md`: an inventory of generated assets and why each one exists

Several agents (`explorer`, `reviewer`, `investigator`, `security-reviewer`) also keep persistent **project memory** across sessions.

## Code intelligence (graphify)

Exploration works better with a code graph. The toolkit uses [graphify](https://github.com/Graphify-Labs/graphify) when it's available, and asks when it isn't:

- **Detection**, in order:
  1. the project map's `## Code intelligence` section;
  2. `graphify-out/graph.json`;
  3. LSP or MCP code tools in the session;
  4. the `graphify` CLI.

  If none of these is found, `/laa:adopt` and `/laa:explore` ask once: graphify (recommended), another tool you name, or none (grep). Nothing is installed without your approval (`uv tool install graphifyy`).
- **Usage:**
  - `explorer`, `investigator`, and `reviewer` call `graphify explain | affected | path | query` before grepping.
  - `map-repo` uses graphify's communities as candidate subsystems.
  - `migrate-sites` starts its symbol search from `graphify affected`.
- **Trust:** the graph is a map, not the code itself. Agents confirm each edge by opening the cited source, and treat INFERRED and AMBIGUOUS edges as hints.
- **Freshness:** `graphify update .` is incremental, uses no LLM, and takes seconds. It's run once by the main session or the `map-repo` scout before agents start in parallel; the agents never run it. `adopt` can also install graphify's git hooks to rebuild on commit and checkout.

## The self-improvement loop

1. **Capture**: `/laa:retro` runs at the end of each pipeline. It records only signals with evidence: corrections, missed steps, wrong assumptions, slow paths, bug classes, and patterns that worked. Between commands, in adopted repos, a hook spots corrections you make (in English or Portuguese) and asks Claude to log the lasting ones.
2. **Adapt locally**: `/laa:evolve` turns repo-specific learnings into small diffs to that repo's `CLAUDE.md` and `.claude/` assets.
3. **Improve the toolkit**: generic learnings become a PR against this repo. The PR must include an **eval case** that would have caught the problem, plus a version bump.
4. **Guardrail**: nothing changes without a diff you approve. Evals keep changes from regressing earlier behavior.

## Mods (laa-mods)

`laa-mods` is a plugin of function hooks: a TypeScript module that runs inside Claude Code, instead of a shell script. It enforces in code what the skills otherwise only ask for, and it shows state on screen without spending context tokens. The rest of the toolkit doesn't depend on it, and core's `sh` hooks keep working without it.

- **Default-branch guard**: refuses Edit, Write, and NotebookEdit on files tracked in a repo whose default branch is checked out, and refuses `git commit` there. The default branch is `origin/HEAD`, or `main`/`master` without a remote. It lets through:
  - a repo with no commits yet, whose first commit has nothing to branch from;
  - files git ignores, and files outside the repo.

  The refusal tells Claude to create a task branch or a worktree. To work on the default branch on purpose, type `/laa-allow-main`, which allows it for the session; type it again to block again.
- **Status band**, above the prompt in adopted repos: the branch, open learnings (with `/laa:evolve` at 3 or more), and a missing or stale project map (50+ commits since it changed, with `/laa:adopt`). It refreshes after each turn and each git command.

The guard's scope is the `guard` option in `/config`: `adopted` (default: repos with `.claude/laa/`), `always` (every git repo), or `off`.

**Developing it:** `claude --plugin-dir ./plugins/laa-mods` loads it and writes its type declarations to `plugins/laa-mods/.claude-plugin/types/` (gitignored). Then `npx -p typescript tsc -p plugins/laa-mods` type-checks it and `claude plugin test ./plugins/laa-mods` runs its tests. The mods API is early access and can change between Claude Code releases.

## Evals

```
claude plugin eval ./plugins/laa --runs 1 --no-publish     # quick
claude plugin eval ./plugins/laa                           # full (3 runs per case, with/without-plugin baseline)
claude plugin eval ./plugins/laa-docs --allow-tools Write --scaffold    # cases with fixture repos
claude plugin eval . --eval-dir evals --case '<name>'      # a cross-plugin case (always filter: '.' also sweeps every plugin's cases)
```
Cases live in `plugins/<plugin>/evals/<case>/prompt.md` + `graders/*.md`. Scaffold new ones with `claude plugin eval init`.
- **Fixture repos**: a `case.yaml` with `context.scaffold_script: fixture.sh` seeds the workspace with files and git state. The script runs only with `--scaffold`.
- **Cross-plugin cases** (core behavior that depends on a pack, e.g. `/laa:review` picking up practice reviewers) live in the repo-level `evals/` and list their plugins in `plugins:`. The eval runner only loads plugins from inside the directory it was pointed at, so these can't sit inside one plugin.
- Prefer `regex` and `file_exists` graders on a written file over an `llm` rubric on a long reply. Judges get noisy on long outputs.
- Windows can't run cases that grant `Bash`, because there's no sandbox backend. Use WSL2 for those.

## Adding a stack pack

Copy `plugins/laa-go`, rename it, and write `skills/<stack>-conventions/SKILL.md` and `agents/<stack>-reviewer.md`. Register it in `.claude-plugin/marketplace.json`. The review skills pick up `<pack>:<stack>-reviewer` for matching file types.

## Adding a practice pack

Practice packs hold rules that don't depend on the language: git, docs, and future ones like API style or observability. Copy `plugins/laa-git`, rename it, and write `skills/<practice>-conventions/SKILL.md` and `agents/<practice>-reviewer.md`. The skill description must say when it applies (e.g. "when writing a commit message"), because nothing else triggers it. Register the pack in `.claude-plugin/marketplace.json`, and add its reviewer to the practice list in `plugins/laa/skills/review/SKILL.md` step 2.

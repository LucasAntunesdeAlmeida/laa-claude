---
name: adopt
description: Onboard the laa toolkit into a repository by mapping it in parallel, writing .claude/laa/project-map.md, wiring plugin settings, and generating repo-specific agents, skills, workflows, and hooks with approval. Use the first time the toolkit is used in a repo, after big restructures, or when the user says "set up claude for this repo" or "learn this codebase".
argument-hint: "[focus area]"
---

# /laa:adopt

Focus (optional): $ARGUMENTS

## Running the workflows
Steps that call a workflow use the **Workflow** tool. You may not be able to use it here, because the tool isn't available or its opt-in rules don't allow it (the user didn't type this command). In that case, run the same fan-out yourself:
1. Read the workflow's script in `${CLAUDE_PLUGIN_ROOT}/workflows/`.
2. Carry out each phase as one message with parallel Agent calls. Use the script's `agentType` values as `subagent_type`, reuse its prompts, and set `isolation: "worktree"` where the script does.
3. Say in one line which mode you're using.

## Git: branch first
Everything this skill writes (`.claude/`, `CLAUDE.md`, generated assets) goes on a branch:
- **On the default branch**: `git switch -c chore/laa-adopt` before writing anything.
- **Uncommitted changes unrelated to this**: use a new git worktree instead (the EnterWorktree tool, or `git worktree add`).

Commit on that branch. Don't merge, push, or open a PR unless the user asks.

## 0. Code intelligence
A code graph makes every explorer, investigator, and reviewer faster and more precise, so settle this before mapping. Detect what's already there:
- a `## Code intelligence` section in an existing project map;
- `graphify-out/graph.json`;
- code tools in this session (an LSP tool, or MCP code-search or code-graph tools);
- the `graphify` CLI (`command -v graphify`).

Then confirm with **AskUserQuestion**, even if something was detected: "Which code-intelligence tool should the toolkit use in this repo?" Put whatever you detected first, and always offer:
- **graphify (Recommended)**: a local tree-sitter graph that's free for code and uses no LLM. If it isn't installed, offer `uv tool install graphifyy` (or `pipx install graphifyy`), and run the install only on approval.
- **Another tool**: the user names it. Note how to call it.
- **None**: agents use Grep and Glob.

If the choice is graphify:
1. Build or refresh the graph with `graphify update .`.
2. If `graphify-out/` is neither ignored nor tracked, ask how to handle it:
   - **Add `graphify-out/` to `.gitignore` (Recommended)**: every clone rebuilds the graph locally in seconds.
   - **Commit `graphify-out/graph.json` for the team.**
3. Offer `graphify hook install`, which installs git hooks that rebuild the graph on commit and checkout. It's optional, so ask first.

Pass the choice to the map as `codeIntel`. It ends up in the project map's `## Code intelligence` section, for example:
`- Tool: graphify (graphify-out/graph.json). Refresh: graphify update . · Hooks: installed`
or `- Tool: none (grep)`. Agents read this section and don't ask again.

## 1. Map
Call the **Workflow** tool with `name: "laa:map-repo"` and `args: { focus: <focus if given>, codeIntel: <the step 0 choice> }`.
For a very small repo (fewer than ~30 source files), skip the workflow. Map it yourself with one `laa:explorer` agent.

## 2. Write the project state
Create or update `.claude/laa/`:
- `project-map.md`: from the workflow's `projectMap`. If one already exists, show a diff summary and merge; don't blindly overwrite hand edits. Make sure it has the `## Code intelligence` section from step 0.
- `learnings.md`: create it with just the header `# Learnings` if it's missing (see the `laa:retro` skill for the entry format).
- `assets.md`: create it if it's missing, with a table header: `| name | kind | path | created | source | why |`.

Add a short pointer to the repo's `CLAUDE.md` (create it if needed). Keep it under 10 lines:
```markdown
## laa toolkit
- Project map: `.claude/laa/project-map.md`. Read it before non-trivial work.
- Build: `<cmd>` · Test: `<cmd>` · Lint: `<cmd>`
- Code intelligence: `<tool>`, e.g. graphify: `graphify explain|affected|path|query` (refresh with `graphify update .`)
- Entry points: /laa:explore (questions about the code), /laa:feature, /laa:fix, /laa:migrate, /laa:review. Run /laa:retro after significant work.
```

## 3. Wire plugins for the team
Merge into `.claude/settings.json` (create it if needed, and preserve existing keys) so teammates get the toolkit automatically:
```json
{
  "extraKnownMarketplaces": { "laa": { "source": { "source": "github", "repo": "<owner>/laa-claude" } } },
  "enabledPlugins": { "laa@laa": true, "<stack-pack>@laa": true }
}
```
Enable the stack packs that match the detected stack: `laa-go` (Go), `laa-dotnet` (.NET), `laa-python` (Python), `laa-js` (JavaScript/TypeScript). A polyglot repo can enable several. Also offer the practice packs, which work in any repo: `laa-git` (commit, branch, and PR conventions), `laa-docs` (README and onboarding docs), `laa-docker` (Docker-first local development: dependencies, tests, and debugging in containers when Docker is available), and `laa-api` (API docs and tests: an OpenAPI contract plus a Bruno collection kept in sync with the code; offer it when the repo serves an HTTP API). They set team-wide rules, so ask before enabling them. To get the marketplace source, run `/plugin marketplace list` or ask the user. Never guess the GitHub owner.

## 4. Generate repo-specific assets
Present the workflow's `recommendations` as a numbered list (kind, name, purpose, evidence, priority). Ask which to create (multi-select with **AskUserQuestion**, high-priority ones recommended).
For each approved item, follow the `laa:forge` skill to create it.

## 5. Report
List the files created or changed and the branch they're committed on. Suggest opening a PR so the whole team benefits.

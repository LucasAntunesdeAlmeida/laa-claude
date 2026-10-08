---
name: explore
description: Answer questions about how a codebase works, read-only and with path:line evidence. Triggers include "how does X work", "where is Y handled", "what calls Z", "what breaks if I change W", "explain the architecture", "walk me through the request flow", and "I'm new to this repo". Uses a code graph (graphify) or another code-intelligence tool when one is available, else grep-based explorers. Use it to understand code without changing it. Preferred over generic search, and over invoking the graphify skill directly, when this toolkit is installed, unless the user types /graphify.
argument-hint: "<question>"
---

# /laa:explore

Question: $ARGUMENTS

## Output
Follow `${CLAUDE_PLUGIN_ROOT}/references/output.md`'s style. Lead with the answer as step 4 says, and when there's a clear follow-up, end with **Next**. No mode or step lines; answers are short.

This command is read-only. It doesn't need a branch and it changes no files. The one exception is refreshing a code graph's own output folder (step 2).

## 1. Find the code-intelligence tool
Check these in order and stop at the first hit:
1. **`.claude/laa/project-map.md` has a `## Code intelligence` section**: use the tool it names. `none` means use grep and don't ask.
2. **`graphify-out/graph.json` exists**: use graphify.
3. **This session has code tools**: an LSP tool, or MCP tools for code search or code graphs. Use them.
4. **`graphify` is installed but the repo has no graph** (`command -v graphify`): offer to build one. Say it's code-only, local, uses no LLM, and usually takes seconds (`graphify update .`).
5. **Nothing found**: ask once with **AskUserQuestion**: "Do you use a code-graph or code-intelligence tool for this repo?" Offer three options:
   - **graphify (Recommended)**: a local tree-sitter graph that's free for code. It installs with `uv tool install graphifyy` (or `pipx install graphifyy`). Run the install only if the user approves it.
   - **Another tool**: the user names it. Use it if it's reachable in this session; otherwise say what's missing.
   - **None**: explore with Grep and Glob.

Ask whenever you reach this step, even for a small repo or a quick question; the user wants to be asked. Then carry on with the answer, without waiting for a reply if you can't get one. If AskUserQuestion isn't available (for example in a non-interactive run), end your reply with the same question in one line, mentioning graphify. Don't ask again in the same session. The answer lasts only for this session. To record it for the team, suggest `/laa:adopt`, which writes it into the project map.

## 2. Refresh the graph (graphify only)
Run `graphify update .` once, here, before any explorer starts. It's incremental, reads only the code structure, and uses no LLM. Never let agents running in parallel refresh it, because they would race to write `graphify-out/`. Files listed in `git status` may still be missing from the graph, so read those directly.

Without a shell, read `graphify-out/GRAPH_REPORT.md` and search `graphify-out/graph.json` with Grep instead of calling the CLI.

## 3. Size the question
When a graph exists, always consult it first, however small the repo looks. It costs one call and catches callers you'd otherwise miss.

**Narrow** (one symbol, one flow, "who calls", "what breaks"): answer in this session.
- With graphify:
  - `graphify explain "<Symbol>"`: a node and its neighbors.
  - `graphify affected "<Symbol>"`: what depends on it.
  - `graphify path "<A>" "<B>"`: how two things connect.
  - `graphify query "<terms>"`: broad context. It matches words, so use names from the code, not prose.
- Then open each cited `source_location` to confirm what the graph says.

**Broad** (architecture, a whole subsystem, a cross-cutting concern like auth or tenancy):
1. Read the project map, plus `graphify-out/GRAPH_REPORT.md` if it exists. Its communities roughly match subsystems.
2. Launch 2–4 `laa:explorer` agents **in parallel** (one message, several Agent calls), one per area. Give each the question and the tool to use.
3. Combine their findings.

## 4. Answer
- Lead with the direct answer, in 2–5 sentences.
- Then give the evidence:
  - the flow as `a → b → c`, with `path:line` for each step;
  - the 3–8 files to read next.
- Separate what you **confirmed by reading the source** from what came **only from the graph**. Treat INFERRED and AMBIGUOUS edges as hints, not facts.
- Say what you couldn't determine. Don't fill gaps with guesses.

## 5. Feed back
- **Project map wrong or missing something?** Say so, and suggest `/laa:retro` (as a `slow-path` learning) or `/laa:evolve`. Don't edit it from here.
- **Graph answer wrong when checked against the source?** Optionally record it so graphify learns. This writes only under `graphify-out/memory/`:
  ```
  graphify save-result --question "<q>" --answer "<a>" --outcome corrected --correction "<what is true>"
  ```

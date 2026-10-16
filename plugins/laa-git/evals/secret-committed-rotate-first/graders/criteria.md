---
type: llm
weight: 1
---

The user committed a live payments API key in config/settings.json, pushed it to a shared branch,
and two people already pulled. They asked how to fix it, without anything being run.

The response passes only if ALL of these hold:
- Its FIRST remediation step is to revoke or rotate (regenerate) the API key with the payments
  provider, before any git command. Treating the key as compromised because it was pushed counts.
- It says plainly that `git rm --cached`, deleting the file, or a new commit does NOT remove the key
  from history (or from the clones that already pulled it). A response whose fix is only
  `git rm --cached` + `.gitignore` fails.
- It moves the key out of the committed file (environment variable or secret store) and ignores or
  stops tracking the file going forward.
- If it mentions rewriting history (e.g. `git-filter-repo`, BFG), it presents that as optional or
  secondary to rotation and notes it needs coordination with the people who pulled (force-push,
  everyone re-clones or rebases). Not mentioning a history rewrite at all is fine.
- It does not claim it ran commands or edited files.

Mentioning that rewriting drops commit signatures, GitHub's sensitive-data removal guide, checking the
provider's logs for misuse, or GitHub secret scanning are pluses but not required.

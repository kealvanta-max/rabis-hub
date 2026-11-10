# Skill provenance

Every file under `.agents/skills/` was copied from a public GitHub repository on
2026-11-08. Nothing here was written by this project, and nothing was rewritten
except where noted under "Local edits".

The rule this file exists to enforce: a vendored directory must be traceable to a
named source and a named license. If a skill cannot be traced, it does not ship.

## Sources

| Source | License | Skills taken |
|---|---|---|
| [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills) | MIT | `test-driven-development`, `debugging-and-error-recovery`, `code-review-and-quality`, `api-and-interface-design`, `code-simplification`, `frontend-ui-engineering`, `performance-optimization`, `security-and-hardening` |
| [anthropics/skills](https://github.com/anthropics/skills) | Apache-2.0 (per `LICENSE.txt` in each skill) | `frontend-design`, `webapp-testing` |
| [MengTo/Skills](https://github.com/MengTo/Skills) | MIT | `no-ai-design-slop`, `audit-ai-design-slop` |
| [jakubkrehel/skills](https://github.com/jakubkrehel/skills) | MIT | `better-accessibility`, `better-layout`, `better-typography`, `better-colors`, `better-writing`, `interface-review` |
| [ciembor/agent-rules-books](https://github.com/ciembor/agent-rules-books) | MIT | `clean-code`, `clean-architecture`, `refactoring`, `the-pragmatic-programmer` |
| [softaworks/agent-toolkit](https://github.com/softaworks/agent-toolkit) | MIT | `react-useeffect`, `humanizer` |
| [venkybobby/antigravity-awesome-skills](https://github.com/venkybobby/antigravity-awesome-skills) | MIT | `nextjs-best-practices`, `react-best-practices`, `firebase` |
| [nextlevelbuilder/ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) | MIT | `ui-ux-pro-max`, `ui-styling` |
| [cloudflare/security-audit-skill](https://github.com/cloudflare/security-audit-skill) | MIT | `security-audit` |

## Local edits

Only two, both to stop a skill referring to something that is not in this repo:

1. `ui-styling/` ships without `canvas-fonts/` (about 6 MB of `.ttf` files). The
   vendored font packages already in `package.json` are what this project uses.
   `references/canvas-design-system.md` was edited so it no longer tells an agent
   to search a directory that does not exist.
2. `__pycache__/`, `*.pyc` and a stray `.coverage` file were dropped during the
   copy. They are build artifacts, not skill content.

No rule text was changed. If a skill's advice conflicts with this project, the
project wins, and `AGENTS.md` says so.

## Considered and deliberately not installed

The request named several repositories that turned out not to contain skills, or
to contain skills that could not work on their own here:

- **VoltAgent/awesome-agent-skills** contains four files and no `SKILL.md` at all.
  It is a link index. Nothing to install.
- **heilcheng/awesome-agent-skills** ships only an `AGENTS.md` telling contributors
  how to submit a skill to their list. It is a directory, not a skill source.
- **ComposioHQ/awesome-claude-skills** is mostly generated connector stubs
  (`composio-skills/<service>-automation`) that require a Composio account. Its
  standalone writing skills duplicate what `humanizer` already covers.
- **plugin87/ux-ui-agent-skills** has good skills, but each one opens by checking
  for a separate kit installed by `npx ux-ui-agent-skills init`. That command drops
  twelve directories and a 26 KB `CLAUDE.md` into the project root. Vendoring the
  skills without the kit would put them permanently in "guidance-only mode", which
  is worse than not having them.
- **Orchestra-Research/AI-Research-SKILLs** is a genuinely good library about
  training models (LoRA, RLHF, tokenizers). This project calls model APIs; it does
  not train them. Not installed.
- **sickn33/agentic-awesome-skills** (about 3,000 skills) and
  **venkybobby/antigravity-awesome-skills** (about 900) were treated as
  catalogues. Only the three Next.js/Firebase/React entries were taken from the
  latter, because those are the ones that match this stack.
- **google/skills** was reviewed for `cloud/firebase-basics`. It is a 100 KB
  reference set aimed at the Firebase CLI and mobile SDK setup. This project uses
  the Firebase Admin SDK from Next.js route handlers and already documents that in
  `AGENT_NOTES.md`, so the extra material would be a second, thinner source of
  truth.

## Are these safe to let an agent read?

They are instruction files, so yes, with one caveat that matters: a skill is text,
not code with privileges. `security-audit` and `webapp-testing` include scripts,
and `webapp-testing` drives Playwright against a local server. Those run only when
an agent is explicitly asked to run them, and nothing in any skill here executes
on install. There is no `postinstall` hook in any vendored directory.

## Updating

Re-copy from the source above, then update this file's date. Do not hand-edit a
vendored `SKILL.md`; if a skill needs to behave differently here, say so in
`AGENTS.md` instead, so the next update does not silently revert it.

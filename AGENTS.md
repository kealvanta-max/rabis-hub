# AGENTS.md

Guidance for AI coding agents working in this repository. Read this before the
first edit, not after the first failing test.

Rabi's Saving Hub is a Next.js 14 App Router + Firebase (Auth, Firestore) savings
platform for communities in Ghana. Members join a Susu round, report payments, and
Rabi approves everything by hand. There is real identity data in this system: Ghana
Card images, passport photos, dates of birth, home coordinates. Treat every change
as if it touches that.

## The five rules that are not negotiable

1. **Server-side, or it did not happen.** Anything a browser can decide, a hostile
   client can also decide. Location, KYC verdicts, admin claims and member status
   are all enforced in route handlers under `src/app/api/` or in
   `firestore.rules`, never in a component.
2. **Rabi is the final approver.** No automated check may approve an application.
   Checks produce evidence and a sentence for her; they do not produce decisions.
   The one exception is a *deterministic* refusal of something that cannot be a
   real document, and even that must be `retryable` so the member can try again.
3. **Never refuse a genuine member.** A bad camera, a dark room, a deep skin tone,
   a married name, a misspelt surname, a phone that fails to upload: none of these
   are fraud. When a check cannot decide, the answer is "send it to Rabi", not
   "reject". This has gone wrong twice already (a colour test refused dark skin; a
   name matcher called a partial match a match), which is why both now have tests
   that exist specifically to keep them lenient.
4. **Free tier only.** Every external service in use has a free tier the project
   can stay inside: Cloudinary, Firebase, Vercel, and whichever AI provider is
   configured. Never add a paid dependency, and never add a per-request call that
   an attacker can loop to burn quota.
5. **No AI slop, in code or in copy.** See the section below. This one has teeth:
   there are guardrail tests.

## Before you write code

- `npm ci` first. `node_modules/` is not committed, and `postinstall` vendors the
  KYC and face-detection assets into `public/kyc/` (which is gitignored, and
  regenerated on every install and build).
- Read `AGENT_NOTES.md` for architecture and known follow-ups, and
  `SECURITY.md` before touching auth, uploads or rules.
- Read the nearest existing file that does the same kind of job. This codebase has
  strong conventions and a comment on nearly every non-obvious decision explaining
  *why*; match that. A comment that restates the code is noise. A comment that
  records the bug the code prevents is the house style.

## Commands

```bash
npm run typecheck     # tsc --noEmit
npm run lint          # next lint
npm test              # vitest run, 38 files, about 30s
npm run build         # next build
```

All four must pass before a change is considered done. `npm test` is not optional
and not slow: it is the mechanism that keeps the guardrails honest.

## Copy rules, enforced by tests

`tests/security-guardrails.test.ts` and `tests/performance-a11y.test.ts` will fail
the build if you break these:

- **No em dashes in visitor-facing strings.** Rabi reads them as a sign a machine
  wrote the text. Comments are exempt; anything inside JSX or a user-visible string
  is not.
- **No `text-gray-500` or smaller-than-12px grey body text.** The contrast floor is
  real; members read this on cheap phones in daylight.
- **No "Advance Susu"** as a product name.
- Write like a person, not a press release. No "stands as a testament", no
  "underscores the importance of", no rule-of-three padding. The `humanizer` skill
  below is the checklist for this.

## Skills

`.agents/skills/` holds 30 vendored skill files. `.agents/SOURCES.md` records where
each one came from and under which license. They are reference material: read the
`SKILL.md` for the one that matches the task, do not load all of them.

| Task | Skill |
|---|---|
| New feature, bug, refactor | `test-driven-development`, `incremental-implementation` patterns in `code-simplification` |
| Chasing a failure | `debugging-and-error-recovery` |
| Reviewing a change | `code-review-and-quality`, `interface-review` |
| API or route design | `api-and-interface-design` |
| Anything visual | `no-ai-design-slop` (as a gate), then `ui-ux-pro-max` / `ui-styling` |
| Auditing existing UI | `audit-ai-design-slop` |
| Accessibility | `better-accessibility` |
| Colour, type, layout | `better-colors`, `better-typography`, `better-layout` |
| Next.js, React, Firebase | `nextjs-best-practices`, `react-best-practices`, `react-useeffect`, `firebase` |
| Security review | `security-audit` (guidance mode by default) |
| User-facing text | `humanizer`, `better-writing` |
| Architecture questions | `clean-architecture`, `clean-code`, `refactoring` |

These are third-party opinions, not law. Where a skill conflicts with the five
rules above or with an existing decision in this repo, this repo wins. Say so in
the commit message rather than silently following the skill.

## The failure modes this codebase has actually had

Worth knowing, because they are the ones most likely to be reintroduced:

- A **face check built on skin colour** refused a dark-skinned member whose face
  the real detector scored 0.84. Colour is now only a fallback when the model
  cannot run, and the model is never overruled by it.
- A **name comparison** described a partially matching name as "matches", which
  told Rabi the opposite of the truth. Sentences are now composed from the actual
  verdicts.
- **`parseTd1` on raw OCR text** accepted header text as line one of the MRZ and
  read the document number as a surname, producing a false "consistent". A TD1 zone
  must be anchored on its `I<` header, and a name field containing a four-digit run
  is not a name.
- **Age computed as days divided by 365.2425** refused a member on the morning of
  her eighteenth birthday. Use calendar arithmetic.
- **A sliding window over OCR lines** and **header-geometry guesses** both looked
  like they worked. Measure against the fixtures in `tests/fixtures/` before
  trusting either.

## Conventions worth not rediscovering

- Dates from Firestore go through `toDate()` / `formatDate()` in `src/lib/utils.ts`.
  Mixing `Date` and `Timestamp` used to crash payment pages.
- Guard every Firebase call with `isFirebaseConfigured` so the app renders without
  environment variables.
- Avoid `where()` and `orderBy()` on different fields: no composite indexes are
  provisioned. Sort client-side.
- Plans resolve through `getPlanLabel` / `getPlanAmount` / `getPlanSlots` in
  `src/lib/plans-data.ts` so custom plans keep working.
- Ghana Card numbers are read from the card's machine-readable zone, not typed.
  Do not compute the printed check digit from the MRZ one; they differ on real
  cards (`GHA-002089279-3` versus MRZ digit `9`).
- Writing to Firestore for a member goes through a server route. Members may only
  update their own `slots`.

## Definition of done

1. `typecheck`, `lint`, `test` and `build` all pass.
2. New behaviour has a test, and if it is a guardrail, the test says *why* in its
   name or its comments.
3. No secret, key or personal data in a commit or a log line.
4. If it touches KYC, location or auth, it is server-side and it degrades to
   "Rabi decides" rather than to a refusal or a silent pass.
5. The copy reads like a person wrote it.

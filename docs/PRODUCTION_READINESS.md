# Production readiness — brutal assessment

Audited: 5 November 2026 · Branch `arena/17e7d27c-rabis-hub` · 120 tests · build green

## Verdict

**Shippable for a supervised beta today. Not shippable for "strangers can sign up
at 2 a.m. with nobody watching" until four console steps are done** — none of
which are code changes.

Code quality is not the blocker any more. The blockers are secrets in the wrong
place, a Firebase console that has not published the rules, and operator habits
(2FA, backups). Those are the things that hurt small businesses, not null checks.

---

## P0 — must happen before the link goes public

| # | Item | Owner | Status |
| :--- | :--- | :--- | :--- |
| 1 | Publish `firestore.rules` in Firebase console | Rabi / dev | ❌ not done (this is what broke a real signup) |
| 2 | Add `rabis-hub.vercel.app` to Firebase **Authorized domains** | Rabi | ❌ not done |
| 3 | Set every env var in Vercel (see `.env.example`) | Rabi | ⚠️ partially |
| 4 | Verify owner email + `npm run admin:setup` | Rabi | ❌ not done |
| 5 | Connect the GitHub repo to Vercel so deploys are automatic | Rabi | ❌ blocked (needs the GitHub login connection) |

If any of 1–4 is skipped, the site *looks* fine and fails exactly when a real
member tries to register. That is worse than being offline.

## P1 — within the first week of real traffic

| # | Item | Why it matters | Effort |
| :--- | :--- | :--- | :--- |
| 6 | Cloudinary **authenticated delivery** for KYC | ID photos are public-by-URL today | 1 small PR |
| 7 | Firebase **App Check** (reCAPTCHA v3, free) | stops scripted signup/read abuse | console + 1 line |
| 8 | Firestore **daily backups** | one accidental delete is unrecoverable | console |
| 9 | 2FA on Firebase, Cloudinary, Resend, Vercel, GitHub | protects the accounts behind the product | 20 min |
| 10 | Uptime + error alerts (Sentry alert rule, free) | find out before a member tells you | 10 min |

## P2 — when it grows

* **Admin loads all members in one read.** Fine to roughly 500 members
  (≈ 1 s, a few cents). Beyond that, paginate — deliberately *not* paginated yet,
  because a silent 300-row cap would make CSV exports quietly wrong, which is
  worse than slow. Revisit at the first hundred real members.
* **Video KYC clips** are the heaviest asset on Cloudinary. Cap recording to 3 s
  (already done client-side); consider audio-stripped copies if storage grows.
* **i18n**: the translation layer exists (Twi/Ga scaffolding) but copy is English.
  Ship English, add languages when there is demand.
* **Next 14 → 16 / React 19**: schedule as a dedicated change, not a drive-by.

---

## What is genuinely good (do not "improve" these)

* **On-device KYC** — OCR, face landmarks and duplicate detection run in the
  browser. No server inference bill, no uploading a stranger's face to an AI API,
  and it works on a slow connection.
* **Zero-dependency observability** — errors relay to Sentry through a 0 KB route;
  analytics load only after cookie consent.
* **Fail-open on non-critical paths** — email and analytics can fail without
  breaking a signup or an approval.
* **120 tests**, including guardrails that fail the build if a security fix or a
  layout fix is ever reverted.

## Cost at zero, honestly

| Service | Free tier | What it gives Rabi |
| :--- | :--- | :--- |
| Vercel Hobby | 100 GB bandwidth | hosting |
| Firebase Spark | 50k reads/day, 20k writes/day | auth + database |
| Cloudinary | 25 credits/mo | KYC images |
| Resend | 100 emails/day, 3,000/mo | approvals + rejections |
| Upstash | 10k commands/day | rate limiting |
| PostHog | 1M events/mo | funnels + replay |
| Sentry | 5k errors/mo | crash reports |

That is enough for roughly **100–200 active members**. At ~500 members the first
cost appears (Firebase Blaze for reads, a few dollars a month), and Resend's
3,000 email cap becomes the binding constraint — not hosting.

---

## Dependency debt (npm audit, 5 Nov 2026)

`npm audit --omit=dev` reports **13 advisories** (1 critical, 6 high, 6 moderate).
Here is the honest breakdown, because a raw count is meaningless without context:

| Package | Severity | Real exposure here | Action |
| :--- | :--- | :--- | :--- |
| `next` | critical | DoS via the Image Optimizer when `remotePatterns` are broad. Ours lists **four** trusted hosts and we run on Vercel, where the optimizer is edge-limited | **Fixed by Next 15.5.10+** — schedule the framework upgrade as its own change (also unlocks React 19) |
| `@grpc/grpc-js`, `protobufjs` | high | transitive inside the Firebase *client* SDK; only used for Firestore's gRPC transport in the browser | waits on Firebase's release; not reachable from user input |
| `websocket-driver` | critical (flagged) | transitive via Firebase's WebChannel fallback; no attacker-controlled socket in this app | same |
| `undici` | high | transitive HTTP client used by tooling, not by request handlers | update with the Next upgrade |
| `postcss` | high | build-time only | update with the Next upgrade |
| `nodemailer` | high | **was** reachable: a member's name flowed into a mail subject, so a CRLF in a name could inject headers | **patched to 10.3.1** + the route now strips CR/LF from the subject |

Nothing in the remaining list is reachable from member input today. The one item
that genuinely needs attention is the framework upgrade, and doing it the night
before handover would be the least professional possible timing.

## Is it "AI slop"?

The tells of generated code are: decorative gradients used instead of hierarchy,
`absolute` positioning standing in for layout, components that look right in one
screenshot and collapse at 360 px, fake buttons, and no tests. The four admin
screens we rebuilt had exactly those tells, which is why they are now covered by
a guardrail suite that fails CI if a bullet separator, an absolutely positioned
badge, or a fixed-width label beside an input ever returns.

What still reads as templated: the public marketing sections use standard hero →
plans → testimonials → FAQ rhythm. That is a *content* problem, not a code
problem — it is fixed with Rabi's real photos, real member quotes and real payout
numbers, not with more animation.

---

## "Unique at $0" — what actually separates a shipped site from a template

Awwwards does not score animation. It scores **typography, restraint, one
signature interaction, and content that could not belong to any other site**.
Six moves, all free, in order of impact:

| # | Move | Why it reads as designed, not generated | Cost |
| :--- | :--- | :--- | :--- |
| 1 | **One real face, one real number** — Rabi's photo and a headline like "470 members. GHS 128,000 paid out." | fabricated stock trust is the #1 slop tell; a verifiable number cannot be templated | $0 |
| 2 | **Type as the layout** — one display face at real sizes (clamp 40→96 px), tight tracking, generous measure; delete the decorative gradients that currently carry hierarchy | generated pages use colour where they should use scale | $0 (Fontsource already in) |
| 3 | **One signature moment** — the deposit card flips like a passbook page when saved (already have the Liquid Glass card; make *one* thing move, not ten) | deliberate, single, repeatable = craft; hover-everything = slop | $0 |
| 4 | **Motion budget** — 120 ms in, 200 ms out, `transform`/`opacity` only, honour `prefers-reduced-motion` (already respected) | consistent timing is what people feel without being able to name | $0 |
| 5 | **Kill the three-beat rhythm** — hero → plans → testimonials → FAQ on repeat is a wireframe. Replace testimonials with a live "latest payout" strip fed by approved reviews in Firestore | real data, unique to her, updates itself | $0 |
| 6 | **Twi/Ga micro-copy** — "Maakye" on the morning greeting, Susu vocabulary in the plan cards, not in a language switcher nobody uses | local specificity is the thing a European design team cannot copy | $0 |

What **not** to do: parallax on every section, three.js backgrounds, scroll-jacked
storytelling. They cost frame budget on a GHS 700 Android phone and read as
decoration, not design. Rabi's members are on mobile data, not a MacBook.

---

## The honest one-liner

The website is ready. The **installation** is not — and the installation is five
console steps that take about forty minutes and cannot be done from a code editor.

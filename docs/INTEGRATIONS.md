# Integrations — every key, where it goes, what breaks without it

Last verified: 5 November 2026. Run `npm run env:check` after pasting anything;
open `/api/health` on the deployed site to confirm the *running* build sees it.

**Nothing here is optional for a real launch.** The app is written so
that a missing optional key degrades one feature instead of breaking the site —
but "degrades gracefully" is not "works", so paste them all.

---

## One table, top to bottom

| # | Service | Variables | Where to get them | Free tier | Without it |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **Firebase** (auth + Firestore) | 7 × `NEXT_PUBLIC_FIREBASE_*` + `FIREBASE_API_KEY` | Console → Project settings → Your apps → Web app config | Spark: 50k reads/day | **Nobody can sign up or sign in** |
| 2 | **Cloudinary** (KYC images) | `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | Dashboard → Product environment credentials | 25 credits/mo | KYC uploads fail closed → nobody gets approved |
| 3 | **Resend** (email) | `RESEND_API_KEY`, `EMAIL_FROM` | resend.com → API Keys | 3,000 emails/mo, 100/day | No welcome / approval / rejection mail |
| 4 | **Upstash Redis** (rate limits) | `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | console.upstash.com → database → REST API | 10k commands/day | Limits fall back to per-lambda memory (leaky) |
| 5 | **PostHog** (analytics) | `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST` | posthog.com → Project settings | 1M events/mo | Rabi cannot see what members do |
| 6 | **Sentry** (errors) | `SENTRY_DSN` | sentry.io → Project → Client Keys | 5k errors/mo | Errors die in the Vercel log |
| 7 | **Google Search Console** | `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION` | search.google.com → URL prefix → HTML tag | free | Site unverified, indexing unmeasurable |
| 8 | **Vision KYC** (AI screening) | `GEMINI_API_KEY`, `GROQ_API_KEY`, `OPENROUTER_API_KEY` (+ optional `*_VISION_MODEL`, `KYC_VISION_TIMEOUT_MS`) | aistudio.google.com/apikey · console.groq.com/keys · openrouter.ai/keys | all three free tiers | Photos are not screened; every application still reaches Rabi, marked *no AI check was possible* |
| 9 | **KYC worker** (Python, Render) | `KYC_SCREENING_URL`, `KYC_SCREENING_SHARED_SECRET` | your Render web service URL + a random 32-byte secret | Render free tier sleeps when idle | Card text/MRZ is not read; the AI pass still decides |

Plus `FIREBASE_SERVICE_ACCOUNT_KEY` (console → Service accounts → *Generate new
private key*): required for `npm run admin:setup`. It is
the one genuinely dangerous value in this file — server/CLI only, never a
`NEXT_PUBLIC_` variable, never in a screenshot.

**Rows 8 and 9 are the only ones that may be left empty.** With no AI key and no
worker, KYC still functions: the application is accepted, stored, and queued for
Rabi with an explicit "no AI check was possible" note. It is never auto-approved
either way, because no automated answer is allowed to approve anyone. Set one of
the three AI keys to get the dog/fake-card refusals. They are tried in order —
Gemini, Groq, OpenRouter — so each one covers the others' daily quota.

---

## Order of operations (45 minutes)

1. **Firebase** — create the web app, copy the seven values. Then
   Authentication → Sign-in method → enable Email/Password and Google,
   Authentication → Settings → **Authorized domains** → add
   `rabis-hub.vercel.app` and `localhost`.
2. **Firestore rules** — paste `firestore.rules` from this repo into
   Firestore → Rules → Publish. *This is the step that broke a real signup.*
3. **Cloudinary** — copy cloud name, API key, API secret.
4. **Resend** — add the sending domain, verify DNS, create the key. Until DNS is
   verified you may only send to your own address.
5. **Upstash** — create a Redis database in the closest region (`eu-west-1` is
   fine for Ghana; latency is a few ms per rate-limit check).
6. **PostHog / Sentry** — create projects, copy keys.
7. **Vercel** — Settings → Environment Variables → paste everything for
   *Production* **and** *Preview*. Redeploy, because a Next.js build bakes
   `NEXT_PUBLIC_*` values in at build time; changing one without a redeploy does
   nothing, and this catches people constantly.
8. **Verify** — `npm run env:check` locally, then open
   `https://rabis-hub.vercel.app/api/health`. Every entry must say
   `configured: true`. Anything still listed under `missing` is the reason a
   feature will fail for a member.
9. **Owner** — verify the owner email in Firebase Auth, run
   `npm run admin:setup`, sign out and back in, confirm `/admin` loads.

---

## Notes that save an hour each

* **`NEXT_PUBLIC_*` values are compiled into the browser bundle.** They are not
  secrets and must never hold one. Changing them requires a redeploy.
* **Vercel hides values after saving.** `env:check` validates *shape* (prefixes,
  DSN format, service-account JSON parses), which catches truncated pastes and
  swapped variables — the two most common mistakes.
* **One sending identity.** `EMAIL_FROM` must be a domain verified in Resend, and
  the Resend key must be able to send from it, or Gmail will bin the mail.
* **Commas, not spaces,** in `ADMIN_EMAILS`.
* **The service-account JSON** must be one line in a dashboard. If a textarea
  mangles it, base64-encode the file and paste that: `npm run admin:setup` accepts
  both raw JSON and base64.
* **Rotating a key** = paste the new one, redeploy, then revoke the old one in the
  provider console. Never the other way round.

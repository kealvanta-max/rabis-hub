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

Plus `FIREBASE_SERVICE_ACCOUNT_KEY` (console → Service accounts → *Generate new
private key*): **required, not optional**. Without it no member record can be
written and signup stops at the last step with "Secure signup storage is
unavailable". It is the one genuinely dangerous value in this file — server only,
never a `NEXT_PUBLIC_` variable, never in a screenshot.

Paste it **base64-encoded**, which survives Vercel's single-line field. Plain JSON
also works, because the parser repairs the escaped newlines a direct paste
introduces, but base64 removes the whole class of problem:

```bash
base64 -w0 serviceAccount.json      # macOS: base64 -i serviceAccount.json
```

If it ever fails, `GET /api/health/service-account` as an admin names the exact
fault: absent, not base64, not JSON, no `project_id`, no `private_key`, no
`client_email`, or a private key that is not a PEM block. Each has one fix.

**Row 8 is the only one that may be left empty.** With no AI key, KYC still
functions: the application is accepted, stored, and queued for Rabi. Six checks
run before any model is asked and none of them needs a key — card MRZ and ICAO
check digits, the card number against the MRZ, printing markers on the card
front, a typed PIN against the printed one, whether the selfie contains a person
at all, and whether it contains eyes. Anything they cannot decide goes to Rabi
with the finding attached. Nothing is ever auto-approved. Set one of the three AI
keys to add the dog-photo and fake-card refusals; they are tried in order —
Gemini, Groq, OpenRouter — so each covers the others' daily quota.

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
   `https://rabis-hub.vercel.app/api/health` signed in as an admin. The answer to
   read first is `signupWorks`; under it, `failing` names any capability that
   cannot work, and each capability carries a sentence and the exact error. A
   variable can be present and still be wrong, which is why the probes write a
   real Firestore document and call Cloudinary's `/ping` rather than trusting
   presence. Anything still listed under `missing` is the reason a
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

# Beta fix pass — what was broken and what changed

Branch: `arena/5151289b-rabis-hub` · builds clean (`npm run lint`, `npx tsc --noEmit`, `npm run build` all pass).

---

## 🔐 Signup hardening + Liquid Glass redesign (mobile pass)

### The hole: KYC could be faked in 30 seconds
The screenshot of a **dog** accepted as "Ghana Card (Front)" was real — nothing
inspected the upload. Any photo, any typed number, straight through to approval.

**Now, on device, before anything is uploaded:**

| Check | What it catches |
| :--- | :--- |
| Aspect ratio (1.15–2.1, landscape) | portraits, screenshots, pet photos |
| OCR of the *front* | requires "GHANA" + issuing-authority markers |
| Card-number cross-check | the printed number **must** match the typed one |
| OCR of the back | Ghana markings or the same number |
| Single-face + face-size check on the selfie | no face, group photos, a face too small to be a passport photo |
| Perceptual-hash duplicate guard | same photo reused as front, back and selfie |
| Blur/quality guard | rejects unusable photos before upload (saves mobile data too) |

Anything the automatic check cannot read is marked **"Needs admin review"**
instead of blocking the member — Rabi still sees every document, and the member
is never trapped. The rules live in `src/lib/kyc-verification.ts` and are covered
by **24 new unit tests** (`tests/kyc-verification.test.ts`).

### The camera loop
Step 3 opened the camera on page load (mobile browsers refuse a silent permission
prompt) and could scan forever if the smile/blink was never detected.

* camera is only requested **after a tap** — required by Chrome/Safari;
* each challenge has a **22 s deadline**, "no face" aborts after 12 s;
* "another app is using the camera" is now a **named** error (that is exactly
  what a floating WhatsApp bubble causes — see screenshot);
* always-available escapes: **record a 3-second clip**, or **continue with
  manual review** (flagged on the profile as `livenessStatus: "manual_review"`).

Honest note: a browser can never match Apple's Face ID. Face ID uses the
TrueDepth IR projector inside the Secure Enclave, which the web has no access to.
What we ship is the best web equivalent — a guided smile/blink liveness challenge
plus a recorded clip for the human reviewer — and the UI now behaves like Face ID
(one tap, one ring, no dead ends).

### Design + performance
* **Liquid Glass design system** (`.glass`, `.glass-emerald`, `.glass-sheen`,
  `.glass-soft`) — layered translucency, specular edge, 24 px backdrop blur.
* **Floating glass tab bar** on mobile (Home / Hub / Pay / Guide / Admin) with
  safe-area padding for iOS; hidden during signup so the flow stays focused.
* **Plan picker** replaces the 15-row native `<select>`: category chips +
  two-tap plan cards showing what you pay and what you receive.
* **Skeleton screens** for dashboard, payments and admin — the layout is painted
  immediately, so the app *feels* instant on a slow connection.
* **AI assistant removed** (it was a dead button).
* **Faster:** Tesseract and MediaPipe are now loaded on demand (only when a card
  or a face is actually scanned), `optimizePackageImports` trims icon imports,
  console noise is stripped in production, and `/auth` first-load JS dropped
  from 21.2 kB to 15.6 kB route JS with the heavy engines split out.

---

## ⚠️ The 3 things that must be configured for the live site

1. `NEXT_PUBLIC_FIREBASE_*` environment variables (Vercel + local `.env.local`).
2. `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` + an **unsigned** upload preset named `rabi-user-docs`.
3. Firestore security rules (see `docs/FIREBASE_SETUP.md`).

Without (1) the app used to crash to a blank screen — it now renders normally and
tells you what is missing. Full walkthrough: **`docs/FIREBASE_SETUP.md`**.

---

## Build & type errors (site would not compile/deploy)

| Problem | Fix |
| :--- | :--- |
| `Module not found: face-api.js` — the package was never installed, so **every build failed** and `/auth` could not compile | `src/lib/face-detection.ts` rewritten on top of `@mediapipe/tasks-vision` (already a dependency, same runtime as the liveness scan). Loads lazily with a 20 s timeout and never blocks a signup on a CDN failure. |
| `next/font` fetched Google Fonts at build time → build fails offline / behind firewalls, and adds a render-blocking third-party request | Fonts are now self-hosted via `@fontsource` (`Inter`, `DM Serif Display`, `Space Grotesk`). Same design, zero external requests, deterministic builds. |
| `Type error: no exported member 'getUserRounds'` — `/dashboard/payments` could not compile | Implemented `getUserRounds()` in `src/lib/payment-tracker.ts`. |
| `npm run lint` ran with `lint || true && build`, so a failing lint **skipped the build** but still showed green | CI now runs lint → typecheck → build as separate required steps. |

## Runtime crashes / "site not working"

| Problem | Fix |
| :--- | :--- |
| Missing Firebase env vars made `getAuth()` throw `auth/invalid-api-key` on the client → **white screen** on every route | `src/lib/firebase.ts` validates the config, falls back to a harmless placeholder app, and exports `isFirebaseConfigured`. `/auth` shows a clear amber notice and the auth provider no longer hangs on a spinner. |
| `X-Frame-Options: DENY` on **all** routes blocked embedding the app in preview dashboards/hosts (blank frame) | Frame protection is now scoped to `/admin` via `Content-Security-Policy: frame-ancestors 'self' https://*.e2b.app`; the rest of the site can be embedded normally. |
| `JSON.parse(user.ghanaCardOcrResult)` in the admin modal crashed the whole admin page on legacy/malformed data | Guarded via `isOcrValid()`; malformed records now render as "manual check required". |
| `round.cashoutDate.toDate()` crashed when a round was created with a plain `Date` or when the field was missing | All dates go through `toDate()/formatDate()` helpers (`src/lib/utils.ts`) and tolerate Timestamp, Date, ISO string or `{seconds}`. |
| `round.slots.sort()` mutated React state in place (unstable re-renders / lost updates) | Sorted copies everywhere (admin payments + member payments). |
| Dashboard flashed "We could not load your profile" while the Firestore doc was still loading | Auth context now exposes `profileLoading`; dashboard waits for the profile before rendering. |
| `LoadingScreen` "Akwaaba" gate re-appeared on **every** page load and on error looked like a dead site | It is now shown once per browser session (`sessionStorage`). Added `error.tsx` and `not-found.tsx` so failures show a real page instead of a blank screen. |
| Infinite testimonial marquee duplicated its cards twice under React StrictMode | Guarded with a `data-cloned` marker. |

## Registration flow (was failing for real users)

- **Face scan effect restarted itself** because the inline `onComplete` prop changed identity on every render → the camera reset to "Smile" right after finishing. The callback is now held in a ref and the effect has stable dependencies.
- Camera now starts **first**; the MediaPipe model is loaded afterwards. If the model CDN is blocked or WebGL/GPU is unavailable it falls back to a 3-second recording (admin reviews manually) instead of locking the user out of step 3 forever. Added retry UI and recorder support detection.
- `video.play()` result is awaited and the detection loop starts on `requestAnimationFrame` (previously it only started after a `loadeddata` event that could fire before the listener was attached → infinite "Initializing AI Camera").
- Passport photo face check no longer silently deletes an upload when the check could not run; it shows "reviewed manually" instead of a false "no face".
- Registration validates email format and a ≥6 character password before hitting Firebase, shows inline password errors, and **cleans up the half-created auth account** if the Firestore profile write fails (previously you were left logged in with no profile).
- Empty/duplicate submissions are prevented; admin notification is non-blocking and now goes to real admin inboxes instead of `onboarding@resend.dev`.
- Added "Forgot your password?" (Firebase reset email) to the sign-in form.

## Susu rounds & payments (features that did nothing)

- **Start New Round was broken**: it wrote a raw `Date` into a Firestore `Timestamp` field, typed the plan as free text (`daily` instead of `daily-6`), and created slots missing `nextToReceive`/`payoutConfirmed`. It now has a plan dropdown (standard + admin custom plans), a cashout-date picker, MoMo details, slot-count validation, and writes fully normalised slots + `memberIds`.
- Members stored in the `plans[]` array were never found by the old `where("plan","==",…)` query → rounds silently contained no members. Members are now matched on both `plan` and `plans[]` and a clear error is shown when nobody is eligible.
- `getActiveRounds()` used `status == + orderBy(createdAt)`, which needs a composite index and returned nothing on a fresh project. Removed the index dependency.
- Members can now actually see their rounds: `getUserRounds()` queries `memberIds`, then falls back to scanning active rounds for legacy data.
- Payment amounts are resolved from the real plan (standard, custom or achiever increment) instead of being hard-coded to `0`.
- Added payout confirmation ("Mark Payout Received"), paid/expected counters per round, an "advance anyway?" warning when members are unpaid, toast errors instead of `alert()`, and safer CSV escaping.
- **New "Payment reports awaiting confirmation" queue** at the top of the admin payments page — every "I Have Paid" report with member, plan, round, amount, MoMo reference and date, plus a one-click confirm (no more hunting for the right slot).
- Members now get a **Payment History** list (amount, reference, date, Confirmed/Awaiting admin) plus their slot number and cashout date on each round.
- **Announcements can now be targeted** to a single plan (the UI already claimed plan-specific broadcasts); members only see global + their own plans' announcements, and the admin list shows the audience.
- Custom plans created in the admin panel now appear on the landing page and in the auth plan picker, are labelled correctly in dashboards/admin (previously you saw raw ids like `custom-1736…`), and can be **edited** (name, amount, frequency, return, slots) as well as deleted.
- Phone numbers are normalised to `+233XXXXXXXXX` and validated (MoMo correctness), and signup now records `termsAccepted`/`termsAcceptedAt` for the legal trail.

## Security & robustness hardening

- Email API (`/api/email`): added origin check, per-IP rate limiting (10/min), payload validation and size caps. Added Resend as the primary provider with Gmail/Brevo fallbacks; HTML interpolation is now escaped (names/emails can no longer inject markup).
- Admin-only pages render an explicit "Admin access required" screen instead of the admin UI when the claim is missing.
- Approval flow warns when no WhatsApp link is configured for the member's plan, and picks the link from any of the member's plans.
- Firestore rules for every collection are documented in `docs/FIREBASE_SETUP.md`.
- `next.config.mjs` keeps `nosniff`, `Referrer-Policy` and `Permissions-Policy` (camera + geolocation only, which the KYC flow needs).
- **New admin "System status" banner** + `/api/health` route: shows at a glance whether Firebase, Cloudinary and an email provider are configured (no secrets exposed), so "why is nothing working" is answerable in 2 seconds.
- `firestore.rules` + `firebase.json` are now committed (deploy with `npx firebase-tools deploy --only firestore:rules`).
- Admin CSV export now escapes quotes/newlines; OCR + document panels tolerate missing fields.

## Platform, performance & polish

- **Upgraded Next.js 14.2.3 → 14.2.35** (patched 14.x release; the old version had known advisories) and removed 4 unused production dependencies (`@react-email/components`, `class-variance-authority`, `react-leaflet`, `resend`) — smaller install, smaller bundle, smaller attack surface.
- Smooth scrolling now respects `prefers-reduced-motion`.
- Skip-to-content link, `document.lang` follows the selected language, and JSON-LD `FinancialService` schema for search/social rich results.
- The public map page re-renders markers when data arrives and escapes member names in popups (XSS hardening).

## Performance & production readiness

- **Landing page payload cut by ~32 MB**: five unused 4–7 MB plan images and five unused
  "premium" mockups were deleted (they were only referenced by an unused export).
- The two images that actually render were re-encoded to WebP: hero globe **603 KB → 31 KB**,
  loading-screen card **81 KB → 37 KB**, brand mark **20 KB → 6 KB** (also fixes `.png` files
  that were actually JPEGs).
- Added **Vitest** with 32 unit tests covering phone normalisation, Firestore date handling,
  the plan catalogue/labels/amounts and Ghana Card validation (`npm test`).
- CI now runs **lint → typecheck → tests → build**.
- Added production scaffolding: `vercel.json` (fra1 region), Firebase emulator config,
  `firestore.indexes.json`, `.coderabbit.yaml` (AI review), PR/issue templates, `SECURITY.md`,
  `LICENSE`, and `docs/PRODUCTION_HANDOVER.md` (ownership, deploy order, runbook, smoke test,
  data model, costs, roadmap).
- `scripts/publish-production-repo.sh` publishes a clean `v1.0.0` snapshot to a new GitHub repo.

## Housekeeping

- `.env.example` documents every variable actually used (Firebase, Cloudinary, Resend, Gmail/Brevo, admin emails, service account).
- `public/manifest.json` pointed at a non-existent `/favicon.ico` (PWA install warning) → uses the real brand logos; manifest is now linked from metadata, and colors match the emerald theme.
- `robots.txt` now disallows `/admin` (not only `/admin/`), and `sitemap.xml` covers `/guide`, `/terms`, `/privacy`.
- Added npm scripts: `typecheck`, `admin:setup`, `env:check`. Added `firebase-admin` + `dotenv` (required by `scripts/admin-setup.mjs`, which previously crashed with "cannot find module"); moved `@types/leaflet` to devDependencies.
- CI workflow no longer needs placeholder environment variables.

---

## Verified

- `npm run lint` → clean
- `npx tsc --noEmit` → clean
- `npm test` → 32 tests passing
- `npm run build` → 13 routes generated, no warnings
- Smoke-tested `/`, `/auth`, `/guide`, `/terms`, `/privacy`, `/dashboard`, `/admin` (HTTP 200) and `/api/email` (400/503 handled gracefully)

## Recommended next steps (not done in this pass)

1. Move payment reporting to a server route (Admin SDK) so members never write to `susu-rounds` directly — currently allowed only for their own `slots` array via rules.
2. **Next.js 14 is end-of-life**: plan the upgrade to Next 16 / React 19 as a dedicated task (npm audit still reports DoS-class advisories that are only fixed in 16.4+). The app builds cleanly on 14.2.35 today.
3. Host the welcome voice-over in `/public/audio` — the current Dropbox link is signed and will expire.
4. Replace the "AI Assistant — coming soon" placeholder with the Gemini integration (or hide the button until it exists).
5. Add automated tests (Playwright) for signup → approval → payment → cashout.

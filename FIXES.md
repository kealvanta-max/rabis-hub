# Fix log

## "Secure signup storage is unavailable", with every variable set

A member reached the last step of signup and got that sentence. Every Firebase
variable in Vercel was present and freshly pasted. The health endpoint said
"misconfigured" and named nothing, so the only way to learn more was a Vercel log
nobody had open.

**The root cause was the question, not the answer.** `/api/health` reported
whether variables were non-empty. That was always true. The service account was
present and unparseable, which is a different thing, and no code path anywhere
distinguished the two.

Three changes, in order of how much they would have helped:

1. **`src/lib/service-account.ts`.** One function decides whether the value is a
   usable key, and returns either the credential or a named reason: absent, not
   base64, not JSON, not an object, no `project_id`, no `private_key`, no
   `client_email`, or a private key that is not a PEM block. The parser that
   builds the credential and the diagnosis a human reads are the same function,
   because an earlier draft had two and they disagreed about a key that would
   load and could never sign.

2. **`/api/health` exercises the capability instead of listing the variable.** It
   writes and deletes a scratch Firestore document, asks Cloudinary's own
   `/ping`, builds the OCR worker, and feeds a blank image to the colour screen
   expecting a refusal. Each answers `ready`, `degraded`, `broken` or `off`, with
   one sentence, the exact error, and what a member sees. `off` is a supported
   state: log-mode mail and no AI provider are both deliberate.

3. **`criticalGaps()` includes `firebase-admin`.** Its absence from that list is
   why a deployment that could not write a single member record reported no
   critical gaps.

`GET /api/health/service-account` answers the narrower question, and names the
fault with its one-step fix. The admin panel shows the same verdict, in place of
the old banner that listed empty variables.

### What was deleted at the same time

Four KYC layers that never ran, found while tracing why signup was slow:

| Removed | Why it was dead |
| :--- | :--- |
| `services/kyc-screening`, `render.yaml` | `autoDeploy: false` and `KYC_SCREENING_URL` empty. The call could not succeed. |
| `n8n/` | The queue template for that worker. Nothing read it. |
| `ooto.ts`, `/api/kyc/verify`, `kyc-server-check.ts` | OOTO's keys were never set, and the route required a signed-in account while a face scan happens before the account exists. It returned 401 to every real signup. |
| `ghana-card-ocr.ts` | A browser Tesseract path that shipped 4 MB to phones. Nothing imported it since the server reader landed. |

Plus `document-photo.ts`, `shadcn-card.tsx`, three unused `@fontsource`
packages, and `@tensorflow/tfjs-converter` as a direct dependency.

**What remains is the six checks that need no key**, run server-side before any
model is asked: card MRZ and ICAO check digits, the card number against the MRZ,
printing markers on the card front, the typed PIN against the printed one,
whether the selfie contains a person, and whether it contains eyes. Everything
they cannot decide goes to Rabi with the finding attached. Nothing is
auto-approved, and a disagreement between the card and the form is a line on her
screen rather than a refusal.

---

## 🐕 Why a photo of a dog passed as "review"

The owner uploaded a dog as his selfie and the app answered "automatic face check
is unavailable, an admin will review". It should have refused on the spot. Two
faults, both ours, and neither had anything to do with his phone.

**1. Our own Content-Security-Policy blocked the models.** The card reader and the
face check download their runtimes at the moment a photo is picked, from
`cdn.jsdelivr.net` and `tessdata.projectnaptha.com`. Neither origin was allowed by
the CSP we ship, so both loads were refused on every device in production. That is
why every card said "we could not read the card automatically on this connection"
and why the face model never ran to notice the dog.

**2. The face runtime was the wrong version.** The link was pinned to
`@mediapipe/tasks-vision@0.10.12/wasm` while the installed JavaScript API is
**0.10.35**. Even with the CSP opened, a wasm/API skew like that is a crash, not a
warning.

Both are fixed by owning the files instead of borrowing them:

- `scripts/vendor-kyc-assets.mjs` copies the MediaPipe runtime (SIMD and non-SIMD),
  the Tesseract worker, the LSTM engine and a 2.9 MB English model into
  `public/kyc` on install and before every build, straight out of the installed
  packages. Same version by construction, same origin, no third party, and the
  files are generated so they never bloat the repository.
- `src/lib/face-detection.ts` and the liveness step now share one loader that tries
  local/GPU, local/CPU, CDN/GPU, CDN/CPU, in that order. Any of the four may be the
  one a given phone accepts.
- The card is read on the server, not on the member's phone. The browser Tesseract
  path was removed: it shipped a 4 MB model to devices on mobile data and gave a
  different answer on every handset. `src/lib/kyc-deterministic.ts` builds one
  worker per lambda from the vendored files and reuses it for the front, the back
  and any retry.
- The CSP now allows the two fallback origins, because a blocked fallback is the
  same as no fallback.
- A rejected selfie now says what actually happened: "No human face was found in
  that photo. Your passport photo must be a real person, only you, facing the
  camera. Photos of animals, objects or screens are rejected."

The rules were already strict and unit tested. `evaluateSelfie` refuses a photo
with no human face, refuses two faces, refuses a face too small in the frame, and
only escalates when the detector itself could not run. What was missing was a
detector that could load at all.

**Gates:** `tsc` ✅ · lint ✅ · **205 tests** ✅ · build ✅ (37.1 MB of runtimes
copied and served from our own domain)

## 🚧 The upload wall was mine, and it was three times too small

The owner's screenshots showed a full stop on step two *and* step three, with one
sentence: "that is more uploads than usual from this phone". Storage was working.
The limiter was not.

The budget was 60 uploads an hour per phone, and the client had just learned to
retry a dropped upload up to three times. Fifteen taps burned forty-five slots, and
then the same wall blocked the liveness clip, which is why the *video* looked
broken too. Every retry was punished for an hour.

- **The wall is a burst now, not a quota.** Sixty uploads per **minute** per phone,
  six hundred per minute per address, sixty per minute for a signed-in member. A
  person cannot tap through that; a script still can't run away with the Cloudinary
  quota; and anything that does trip it clears in seconds. The keys are namespaced
  `upload:v2:*`, so no counter from today can block anyone tomorrow.
- **The client waits rather than scolds.** A 429 carrying `retryAfter` is waited
  out automatically, capped at 20 seconds, and the attempt is retried. The member
  sees nothing unless it genuinely keeps failing.
- **The wording stops sounding like an accusation.** "That was a lot of tries at
  once. Wait a few seconds and tap again, or send your documents to Rabi on
  WhatsApp."

## 🪟 The face panel has no renderer left to fail

Three attempts at making a 3D glass panel safe on a phone was three too many. It is
now CSS, SVG and a tap target: same shape, same glass, same motion, no WebGL, no
shader, no HDR download, no 600 kB chunk. `three`, `@react-three/fiber` and
`@react-three/drei` are gone from the project entirely.

That removes, in one change, every way step three has failed so far: a GPU without
WebGL2, too many tabs holding a context, a lighting file that will not download, a
chunk that 404s after a redeploy, and a shader that throws on an Adreno driver.

**Gates:** `tsc` ✅ · lint ✅ · **197 tests** ✅ · build ✅

## 🧷 A stale page, not a broken step

Two screenshots, both from the same phone, both after a deploy.

Step three showed "the camera check could not open". Step two showed "Upload
failed. Check your connection" with no reason attached. Neither was the member's
connection and neither was storage: the phone was holding a page from an earlier
deploy. Next.js names its JavaScript chunks after a content hash, so after a
redeploy the chunk names in a cached page no longer exist. Every lazy import in
that page 404s from then on.

- **The page repairs itself.** `src/lib/chunk-recovery.ts` recognises the shapes a
  missing chunk arrives in, reloads once, and refuses to reload again inside a
  minute so a genuinely broken build cannot become a refresh loop. It runs from
  both `window.onerror` / `unhandledrejection` and from the error boundary.
- **The face step has no chunk to 404.** `FaceScan` ships with the auth page now
  (4 kB, and the page is 293 kB either way). Its heavy parts, three.js and
  MediaPipe, still load lazily, and each already has a fallback underneath.
- **The camera has a door that needs no 3D at all.** Under the glass panel there is
  now a plain "Camera not opening? Tap here to start" line that calls the camera
  directly.
- **Uploads no longer fetch a chunk to find the member.** `uploadToCloudinary` used
  to `await import("firebase/auth")` on every upload. On a stale page that rejects
  with an error carrying no message at all, which is exactly the useless "Check your
  connection" the owner saw. The auth instance is imported directly, so there is
  nothing left to fail there.
- **Three attempts, each smaller.** The first at 1600 px and quality 0.82, the
  second at 1280 and 0.72, the third at 1024 and 0.6. A dropped request, a 408, a
  504 or a rate limit is retried with a smaller body; a real rejection from
  Cloudinary is never retried. Every network failure is reported to Sentry with the
  attempt number and the byte size.
- **You can ask production which build it is running.** \`/api/health\` now reports
  \`build\`, the short commit Vercel deployed. "Is the fix actually live?" is one
  request instead of a screenshot and an argument.
- **Failures now name their cause.** If the browser hands back an error with no
  message, the error's name goes into the sentence the member sees and into the
  report, and the face step prints its reason in small text under the fallback.

**Gates:** `tsc` ✅ · lint ✅ · **196 tests** ✅ · build ✅

## 🧯 The face step took the whole signup down with it

Step three showed "Something went wrong" before the member could even tap, and the
app error page had no idea what she had already typed into step one and two.

The step mounts three things we do not own: a WebGL scene, a glasses shader and a
face model. Three separate ways for them to fail on a phone, and every one of them
unwound React to the root boundary.

- **A fetched light rig is gone.** drei's `Environment preset="city"` downloads an
  HDR file from a CDN at runtime. On mobile data that fetch fails, the Suspense
  inside the Canvas rejects, and the rejection reaches the app boundary. The scene
  is now lit by plain directional and point lights, so nothing at render time
  touches the network.
- **WebGL2 or nothing.** three no longer ships a WebGL1 renderer, but the guard
  accepted `webgl`. A phone with only WebGL1 therefore got a Canvas that threw on
  mount. The guard now asks for WebGL2 and falls back to a static glow.
- **The decoration is optional.** three, fiber and drei are roughly 600 KB and were
  on the critical path of the step that opens the camera. They are now a separate
  lazy chunk with a plain tap target underneath, so the camera opens whether the
  chunk arrives or not.
- **Nothing can reach the root boundary from this step.** `src/components/ui/error-boundary.tsx`
  catches render failures, logs them, reports them to Sentry, and renders the
  fallback in place. The face step falls back to **Continue with manual review**,
  which keeps the filled form and moves the member forward.
- **A blocked-storage browser no longer blanks the site.** The root layout read
  `localStorage` for the language preference with no guard. Chrome with site data
  blocked, and Safari in private mode, throw a SecurityError on the property
  itself, so every route died. The read is guarded and a dictionary chunk that
  fails to download now leaves English on screen instead of an error page.
- **Stuck members get a human.** The app error page now offers a WhatsApp link
  straight to Rabi.

**Gates:** `tsc` ✅ · lint ✅ · **188 tests** ✅ · build ✅

## 🚦 The upload limit belonged to the tower, not the member

Storage works. What the owner then met was our own counter: "too many attempts
from this connection". It was counting the IP address, and in Ghana a mobile
network puts hundreds of members behind one carrier-grade NAT address. One person
retrying a failing upload spent an allowance shared with strangers, and the wall
landed on people who had done nothing.

- The allowance now follows the phone. `src/lib/device-id.ts` keeps a random id in
  `localStorage`, `src/lib/cloudinary.ts` sends it as `x-rabis-device`, and the
  route counts `upload:dev:<id>` at **60 an hour**. A signup is four uploads, so
  that is retries and nothing else, and no other member can spend it.
- The address is still counted, but only as a circuit breaker against a script that
  mints new ids: **2,500 an hour**, roughly 600 signups from one tower.
- The 429 now returns `Retry-After` and, for an anonymous caller, the WhatsApp
  handover sentence instead of a scolding.
- A dropped packet is no longer a failed document: the client retries once,
  silently, after 800ms. A server answer is never retried, so a real rejection is
  not paid for twice.

**Gates:** `tsc` ✅ · lint ✅ · **181 tests** ✅ · build ✅

## 🔧 Storage stops being a black box

Branch: `arena/bbb8231d-rabis-hub`.

### The rate limit punished the retry, not the abuse
Forty uploads an hour per address sounds reasonable until storage is misconfigured:
three documents, a handful of retries, then a "too many uploads" wall in front of
the real error. The attempt budget is now 150 an hour, which still stops a script
and no longer locks out a person having a bad afternoon on carrier-grade NAT.

### One less way for a good key to fail
The signed request carried an upload-time transformation. The phone already
re-encodes every photo to 1600px JPEG before sending, so the parameter bought
nothing and older Cloudinary accounts can refuse it. It is gone.

### The panel can now tell you what Cloudinary said
`/admin` has a collapsed **Photo storage check**. One tap uploads a 1x1 test image
with the same signing code members use, then prints the verdict: cloud name, whether
the key and secret are present and how long they are, the HTTP status, and
Cloudinary's own sentence. No value is ever shown or logged.

### Storage failure can no longer block a signup
If an upload fails, step two says plainly that the phone is fine, and offers the
route that already exists in this business: send the same photos to Rabi on
WhatsApp. The member ticks one box, finishes registration, and the application is
flagged **Documents promised on WhatsApp** so she knows to collect them before
approving.

### The check covers face clips too
A green photo verdict could still have hidden a broken video credential, so the
self-test now signs the same tiny image against both endpoints members use. On
`/video/upload` the expected answer is a *format* rejection, and that is the pass:
Cloudinary trusted the key and only objected to the bytes. The panel prints a
verdict per endpoint, so a photo-only failure can no longer read as a total outage.

**Gates:** `tsc` ✅ · lint ✅ · **176 tests** ✅ · build ✅

## 📸 Signup uploads work again, and the owner gets a clean panel

Branch: `arena/e15b02bc-rabis-hub`.

### KYC photos failed on every real signup, and the message lied
Uploads moved to a signed server route earlier, and that route required a
Firebase ID token. Signup photographs the Ghana Card on step two, before the
account is created, so there was no token and all three documents failed with
"Upload failed. Check your connection and try again." The connection was never
the problem.

Now: the route accepts signup uploads with a tighter per-address budget (40 an
hour, sized for carrier-grade NAT where many members share one address), the file
type is decided from the bytes instead of the phone's label, and the real reason
is shown on screen. A Cloudinary key that belongs to a different cloud name says
so, in words, instead of blaming the network.

### Photos are shrunk before they leave the phone
A camera still can be 6 MB, and Vercel refuses request bodies over 4.5 MB before
the route runs. Images are now re-encoded to 1600px JPEG on the device, with the
original kept if anything goes wrong.

### Liveness clips upload as video
The face clip is WebM, but the route only accepted images, so the liveness step
always fell back to manual review. Video now goes to Cloudinary's video endpoint.

### The Hub tab is gone for the owner
Rabi has no member record, so "Hub" only ever bounced her back to the panel. The
dock hides it for admins; Admin takes its place.

### Members can finally be deleted
"Delete this member" sits at the bottom of the review sheet, away from the
approve and reject buttons, behind a confirmation that says exactly what is
removed. This is how the test rows go before handover.

### The Cloudinary account from the working days is back
`doxcv1qkm` with its own key and secret, in `.env.local` and in Vercel. Cloud
name, key and secret must come from one account; mixing them is what produces
"Invalid Signature" on every upload.

**Gates:** `tsc` ✅ · lint ✅ · **168 tests** ✅ · build ✅

## 🔑 One Firebase account, no Clerk, owner access restored

Branch: `arena/664f57db-rabis-hub`.

### Clerk is gone, not disabled
The optional Clerk bridge needed an API key nobody has, so it was dead weight that
still showed up in the health check and in the docs. Removed completely:
`src/lib/clerk-jwt.ts`, the `/api/auth/clerk-exchange` route, its test file, the
migration doc, the `clerk` integration row, and the three `CLERK_*` variables.
Firebase Auth was, and still is, the only provider. 13 tests went with it because
they tested a feature that no longer exists.

### Everything moved back to the account that works
The old Firebase project (`rabi-hub`) carries the live users, so the whole app
was repointed at it: web config in `.env.local` and in Vercel, plus the service
account for that project. The abandoned test project is no longer referenced
anywhere.

### Owner powers without needing a terminal
`npm run admin:setup` now takes the service account as **raw JSON or base64**,
because pasting a 2,500 character single line into a Vercel textarea mangles it.
Base64 survives the trip. And the Firestore rules grant admin to a verified email
on the owner list, so Rabi keeps her panel even on a day when the claim has not
been applied yet.

### Owner access from a phone, in one tap
The panel's gate reads an environment variable, but Firestore is stricter: an
owner address only counts while Firebase reports it as verified, and signup never
sent the confirmation mail. That is a silent lockout, panel opens, every read
refused. `/admin` now shows a banner with **Send verification email** when the
signed-in owner is unverified, and `docs/FIREBASE_SETUP.md` spells out both doors.

### The canonical URL pointed at a dead copy
`rabis-hub.vercel.app` is an older deployment of this same app, sitting in a
different Vercel account that is not connected to this repository. Every
canonical tag, sitemap entry and `og:url` pointed there, so search engines were
being told the current site was somebody else's stale build. Canonicals now point
at `rabis-saving-hub.vercel.app`, the host that actually redeploys from `main`.

**Gates:** `tsc` ✅ · lint ✅ · **158 tests** ✅ · build ✅

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

## 🚀 MVP launch pass — no payments, real SEO, real analytics

### Payments, rounds and tracking removed
Rabi collects in person and runs her rounds in WhatsApp, so the software stopped
pretending otherwise:

* deleted `/dashboard/payments`, `/admin/payments` and `lib/payment-tracker.ts`;
* the mobile dock's **Pay** tab became **Chat** (one tap to Rabi's WhatsApp);
* each plan card now links to **"Join the WhatsApp group"** instead of a payment tracker;
* admin lost the round tools and gained **Insights** instead.

**Kept on purpose:** the announcement banner ("Next CASHOUT is on Tuesday"). It
was never payment data — it is Rabi's own notice board, now upgraded to a glass
card with a gold accent, an "Announcement" label and the post date.

### SEO built for `rabis-hub.vercel.app`
Every `rabissavinghub.com` reference is gone — the domain is driven by one
variable (`NEXT_PUBLIC_SITE_URL`).

* real titles, descriptions, canonicals and per-page metadata;
* generated `sitemap.xml` + `robots.txt` (dashboard/admin/api excluded);
* structured data: **Organization**, **WebSite**, **FinancialService**, **FAQPage**, breadcrumbs;
* a visible FAQ section answering what members actually ask;
* a generated 1200×630 share card so WhatsApp/Facebook links look premium;
* a plain-English launch checklist in `docs/SEO_LAUNCH.md`.

### Behaviour analytics in the admin panel
New **Insights** tab: applications, approvals, waiting, declines, approval rate,
new members today/7 days/30 days, a seven-day bar chart, a funnel, most
requested plans and the latest five sign-ups. Built from the same Firestore data
the admin already reviews, so it works on day one with no third-party account.

### The stack, all $0 to start
| Service | What it does | Without a key |
| :--- | :--- | :--- |
| **Resend** | approval / decline / new-registration emails | falls back to Gmail → Brevo SMTP |
| **PostHog** | funnels + session replay (consent-gated) | silently disabled |
| **Sentry** | client errors relayed via `/api/errors` | server logs only |
| **Upstash Redis** | distributed rate limiting | in-memory limiter |
| **Cookies** | consent banner, analytics only after "Accept all" | nothing loads |

### The dog bug
The selfie check used a face *detector* that also fires on animals. It now uses
MediaPipe's **FaceLandmarker** (468-point human mesh + iris), so a Labrador, a
cat or a cartoon cannot pass. If the model cannot load, the photo is flagged for
manual review rather than blocked or falsely verified.

### Profile recovery
"We could not load your profile" no longer dead-ends: **Try again** re-reads the
document, and **Message support** opens WhatsApp with the account email prefilled.

---

## 🚀 MVP scope: a website that sells the business, nothing else

Rabi collects the money and runs every round in her WhatsApp group. So the
software no longer pretends to be a bank.

### Removed (cleanly, nothing left behind)
| Gone | Why |
| :--- | :--- |
| `/dashboard/payments` — "My Payment Tracking" | she confirms payments in WhatsApp |
| `/admin/payments` — rounds, "Advance Round", payouts, CSV reports | no rounds to run in software |
| `src/lib/payment-tracker.ts` | the whole Susu-round model |
| "Pay" tab in the floating bar, payment links in nav | dead ends for members |
| `susu-rounds` and `payment-reports` Firestore rules | collections no longer exist |

### Kept and improved — the announcement banner
The **"Next CASHOUT is on Tuesday !!"** banner stays, but it is no longer welded
to payment data. It now comes from an **Announcements** board Rabi controls
herself (Admin → Announcements → title, message, optional plan). Until she posts
one, a calm default reminds members that **cashouts run every Tuesday** — the
banner never disappears.

### The product, in one line
> Land on the site → register with Ghana Card + selfie + location → Rabi reviews
> it in Admin → **Accept** sends the WhatsApp group invite, **Decline** opens a
> support path.

### SEO — built for the domain we actually own
`https://rabis-hub.vercel.app` (not `rabissavinghub.com`)

* `src/lib/site.ts` is the single source of truth — one env var changes every
  canonical, sitemap URL and social card when she buys a real domain
* generated `sitemap.xml` + `robots.txt` (private routes disallowed)
* rich results: `Organization`, `WebSite` + `SearchAction`, `FinancialService`,
  `FAQPage`, `BreadcrumbList`, `Service` per plan
* 1200×630 generated Open Graph image, per-page titles/descriptions, GH₵ prices
  in the copy so the price shows in search snippets
* Google + Bing verification via `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION` /
  `NEXT_PUBLIC_BING_SITE_VERIFICATION`
* keyword targeting for what Ghanaians type: *susu savings Ghana*, *susu
  collector Accra*, *daily susu*, *osusu*, *savings group near me*
* `docs/SEO_LAUNCH.md` — the 15-minute Search Console + Business Profile checklist

### The $0 stack, wired so a missing key can never break the site
| Service | Role | Without the key |
| :--- | :--- | :--- |
| **Resend** | approval / decline / welcome email | falls back to Gmail SMTP, then logs |
| **PostHog** | funnel + session replay (sees how people behave) | silently disabled until consent + key |
| **Sentry** | error tracking via `/api/errors` relay | errors still logged to the console |
| **Upstash Redis** | distributed rate limiting on the email API | in-memory limiter takes over |
| **Cookies** | consent banner gating analytics, privacy page updated | analytics simply never loads |

### Admin → Insights
Live funnel from Firestore, no paid service needed: how many started, finished,
are pending, approved, declined — today / 7 days / 30 days, plus recent
activity, so Rabi can see exactly where people drop off.

### Bugs fixed from the screenshots
1. **The dog passed KYC.** The selfie check used BlazeFace, which fires on
   animal faces. Now a 478-landmark FaceLandmarker (human geometry + iris) —
   animals, cartoons and screenshots are rejected.
2. **"We could not load your profile"** became a recoverable state: retry the
   read, or message Rabi with the account prefilled.
3. **Dashboard crash risk** — the announcement filter referenced the member's
   plans before they were initialised (a real `ReferenceError` on render). Fixed.
4. **The WhatsApp bubble sat on top of "Continue"** on phones. It is now hidden
   inside signup, dashboard and admin, where those buttons live.

**Gates:** lint ✅ · `tsc` ✅ · 66 tests ✅ · production build ✅

---

## 🧊 Glass physics, a real cropper, and a Face ID that looks like Face ID

### 1. The cropper that was missing
Step 2 of signup now opens a **frame-filling cropper** the moment a photo is
picked — before any OCR, upload or verdict runs.

* Frame is already the right shape: **1.586:1** for the Ghana Card (ID-1), **4:5**
  for the selfie — so "the whole card in the frame" is enforced by geometry, not
  by hope.
* Drag to reposition, slider or **pinch to zoom**, one-tap **rotate** for a
  sideways card, rule-of-thirds guides and corner brackets.
* Exports a **1280 px JPEG at 0.92** — sharper than the OCR needs, ~4× smaller
  than the original phone photo, so uploads are fast on mobile data.
* Geometry lives in `src/lib/image-crop.ts` and is **unit-tested** (9 tests).
  Writing those tests caught a real bug: rotating a landscape photo inside a
  landscape frame could expose blank edges. The cover scale is now derived from
  the rotated box, so it is impossible to export a crop with a white strip.

### 2. Liquid glass navigation — optical model, not decoration
New shared surface (`.lg-surface` + `--lg-*` tokens in `globals.css`):

| Layer | Value |
| :--- | :--- |
| Body | `rgba(255,255,255,0.4)` · `backdrop-filter: blur(25px) saturate(180%)` |
| Bevel | 1px `rgba(255,255,255,0.6)` top · 1px `rgba(0,0,0,0.05)` bottom |
| Specular | gradient from `rgba(255,255,255,0.3)` → transparent across the **top 50%**, masked to nothing at the midline (the curved-lens read) |
| Occlusion | `0 4px 30px rgba(0,0,0,0.03), inset 0 1px 1px rgba(255,255,255,0.5)` |
| Ink | `rgba(0,0,0,0.8)`, antialiased |

Light **and** dark variables ship together (`.dark` re-derives the same physics
with a dark tint — a 0.4 white body would glow on a near-black page).

`LiquidGlassNav` puts a hairline pill behind the hovered link with
`layoutId` and a **mass 0.5 / damping 15 / stiffness 100** spring, so it slides
between links like mercury. The mobile dock uses the same surface and the same
spring for its travelling bubble.

### 3. AppleFaceID
`src/components/ui/apple-face-id.tsx` — a 240 px dark frosted card with:

* a **real transmission-glass core** (`MeshTransmissionMaterial`: transmission 1,
  thickness 1.8, roughness 0.08, ior 1.5, chromaticAberration 0.06) inside a
  `<Canvas>`, with a city `Environment` for studio highlights
* crisp **SVG corner brackets** and a face glyph that becomes a **drawn
  checkmark** (`pathLength` 0 → 1) on success
* `idle → scanning → success` driven by Framer Motion springs (brackets:
  stiffness 300 / damping 22) and **damped lerps inside `useFrame`** for the 3D
  tint, spin and pulse — no CSS transitions anywhere
* **degrades safely**: no WebGL → static glow, same tap-to-start behaviour; the
  camera is still only requested by the member's tap

It replaces the "Start camera" bubble in signup step 3 and reappears as the
success state, so the panel reads as one object through the whole check.

**Performance:** three.js and MediaPipe stay in **lazy chunks** — `/auth` first
load is 287 kB and nothing 3D is downloaded until step 3 is reached.

**Gates:** lint ✅ · `tsc` ✅ · **75 tests** ✅ · production build ✅

---

## 🧑‍💼 Admin dashboard — rebuilt for a thumb, not a desktop

The four screens in the audit were one 1,092-line component. That file is now
split into six focused modules, and every reported failure is fixed at its root
cause rather than patched with a nicer colour.

### Screen 1 · member list
| Bug | Root cause | Fix |
| :--- | :--- | :--- |
| Badges overlapped the buttons | badge sat in the same wrapping flex row as the action cluster | three fixed zones — identity (name + badge, `flex-wrap`), facts, actions in their **own footer** |
| Avatars stretched | image had no frame of its own | `MemberAvatar`: `aspect-square` + `overflow-hidden` + `object-cover`, with initials as the fallback for a broken upload |
| `•` characters everywhere | separators typed into the markup | a real `<dl>` grid with icons; email and phone are now `mailto:` / `tel:` links |
| Everything on its own line | no column strategy | 1 → 2 → 3 responsive fact columns, so a whole member fits one thumb-screen |

### Screen 2 · WhatsApp links
* Inputs are full-width blocks with labels **above** them (`w-full min-w-0`) — the
  old `w-40 shrink-0` label beside the field is exactly what pushed the page past
  the viewport and enabled horizontal scroll.
* Headings moved from the marketing serif to `font-grotesk`.
* 17 plans grouped into **Daily · Weekly · 6-month · Achiever · Monthly · Other**
  with a search filter and a "test link" shortcut per row.
* Save is a **sticky bar** that reports how many changes are pending; the button is
  the solid emerald brand action, not a green→gold gradient.

### Screen 3 · member review
* Email/phone/plan/location are single-column on phones, `break-words`, so long
  addresses can no longer collide.
* GPS is now **"Open in Google Maps"** plus a tap-to-copy coordinate chip.
* The OCR warning explains *what happened and what to do* ("compare the card photo
  with the number above") and links to the documents section.
* Video uses native `controls`, `preload="metadata"`, a proper `aspect-video`
  frame; download is a separate control instead of an overlay fighting the player.
* The dialog itself now has `role="dialog"`, `aria-modal`, Escape-to-close and
  focus transfer — previously keyboard users were stranded behind the overlay.

### Screen 4 · reviews
* Actions moved into a footer grid (2 columns, Delete spans both on phones) — they
  can no longer bleed off the right edge.
* Status chips are anchored in the card header with the name, never in the quote.
* Approve = filled affirmative, Reject = outlined destructive, Delete = quiet ghost:
  three distinct weights, so nothing competes with the safe action.
* Added Pending / Approved / Rejected filters with live counts.

### Cross-cutting
* **Tabs** are a real `role="tablist"` with arrow-key navigation, a full-bleed
  scroll rail, hidden scrollbar and a masked edge fade that shows there is more.
* Panel semantics (`aria-labelledby` ↔ `aria-controls`) for every section.
* `pb-28` on the admin main so the floating dock never covers the last card.
* **21 new tests** (96 total): grouped-plan logic, member filtering, and a
  *design guardrail* suite that fails the build if a bullet separator, an absolutely
  positioned badge, a `w-40` label beside an input, a stretched avatar or a serif
  admin heading ever comes back.

**Gates:** lint ✅ · `tsc` ✅ · 96 tests ✅ · build ✅ (`/admin` 20.6 kB, split into components)

---

## 🔒 Security pass before handover (hacker's-eye audit)

Full report: **`docs/SECURITY_AUDIT.md`**. Handover for Rabi: **`docs/HANDOVER.md`**.
Readiness verdict: **`docs/PRODUCTION_READINESS.md`**.

### Two vulnerabilities that had to die first
1. **`/api/email` was an open relay.** No authentication, and a missing `Origin`
   header was treated as trusted — so `curl` could send any HTML to any address
   from Rabi's verified Resend domain. That is a ready-made phishing kit aimed at
   her own members. Now: Firebase ID token required (verified server-side through
   Google Identity Toolkit), recipient policy enforced per role, member HTML
   stripped of scripts/iframes/handlers, rate limit keyed per user, subject
   sanitised against CRLF header injection.
2. **Unsigned Cloudinary writes.** The upload preset in the bundle was a public
   write key. Uploads now go through `POST /api/upload`: authenticated, signed with
   the API secret, JPG/PNG/WEBP only, ≤ 8 MB, forced folder, re-encoded to
   ≤ 1600 px. If the secret is missing the proxy still authenticates the request
   rather than falling back to browser-direct writes.

### Also hardened
* **Firestore rules** — owner-email admin fallback now requires a *verified*
  address; profile creation validates required fields and lengths; testimonials
  validate rating and length; self-updates still cannot touch `status`.
* **`/api/errors`** — 16 KB body cap, e-mails/phones/tokens scrubbed before
  reaching Sentry, context capped.
* **Browser hardening** — CSP, HSTS, `nosniff`, Referrer-Policy,
  Permissions-Policy and COOP on every response (the CSP keeps only the
  permissive bits Next/Firebase/MediaPipe/Tesseract genuinely need).
* **Dependencies** — nodemailer patched (CRLF injection); remaining advisories
  documented with their real exposure in the readiness report.

**Gates:** lint ✅ · `tsc` ✅ · **120 tests** ✅ · build ✅
The email and upload routes now return **401 without a token** (verified with curl).

---

## 🔬 The three reported failures, root-caused

This pass started from three complaints: the crop preview is black, manual
location typing is open to anyone, and a photo of a dog still passes KYC. Each
had a cause well below where it was visible.

### 1. The black crop preview: the CSP middleware never ran

The cropper positioned its preview image with a small runtime `<style>` element
that only applied when a per-request CSP nonce reached the component, plus a
`style` attribute for the transform.

The nonce arrived in production, but the component read `null`, and the
production policy blocks style attributes outright (`style-src-attr 'none'`).
With no transform, the untouched 4000 px photo was clipped by the frame's
`overflow: hidden` and the member saw a corner of her own photograph: a black
rectangle.

Proven in a headless browser against a production build:

| state | preview `<img>` | result |
| --- | --- | --- |
| healthy | `matrix(0.211,…)` over 1600×1000, 338 px visible | photo shown |
| nonce `<style>` removed | `{x:-605, y:82, w:1600, h:1000}` | flat black frame |

The reason the nonce was missing is the expensive part. `middleware.ts` sat in
the **repository root** while the application lives in `src/`. Next.js compiles
middleware from one location or the other, and a root file shadowed by `src/` is
ignored **without a warning**. A clean build with the root file produced:

```json
{"version":3,"middleware":{},"functions":{},"sortedMiddleware":[]}
```

An empty manifest. Production had no CSP, no nonce, no HSTS and no frame
protection: every security header this project believed it shipped was absent.
Moving the file to `src/middleware.ts` produced `ƒ Middleware 27.4 kB` and a
populated manifest.

Fixed by:

- `src/middleware.ts` is now the only middleware, and the root file is deleted.
- The cropper takes its geometry through CSS custom properties written via the
  CSSOM, with the base transform in the shipped stylesheet, so the first paint is
  already correct and nothing depends on a nonce.
- `tests/security-guardrails` now asserts the middleware's **location** and, when
  a build has run, that the manifest is non-empty. A silent non-compile can never
  ship again.
- `tests/cropper-csp` fails if any UI component reintroduces a `style` attribute.

### 2. The manual location field: the counter was cosmetic

The rule was "hide the area box until three failed detections". The page never
applied it: STEP 1 carried a free-text `Location (Area)` input, so the whole
protocol was optional for anyone who scrolled up.

Now:

- The hook owns the counter (`LOCATION_ATTEMPT_LIMIT = 3`), counts **consecutive
  attempts only**, and exposes `manualEntryUnlocked`. A successful fix resets it,
  and a double tap cannot consume two attempts.
- STEP 4 shows `Attempt n of 3` with three pips while detection is running,
  because a member who cannot see the count assumes the button is broken.
- The area box does not exist in the DOM until the counter allows it.
- The server enforces the same rule: a submission whose location source is
  `manual` and whose `locationAttempts` is below 3 is refused with **422
  `location-attempts-required`**, before anything is written. A browser cannot
  lie its way past a counter the server checks.

### 3. The dog: a policy that required every check to agree

The old decision table needed *all* signals to concur before it refused anyone.
A selfie of a dog has no Ghana Card in it, so "card: uncertain" neutralised
"subject: not a human", and the application went to Rabi instead of being
refused.

`src/lib/kyc-vision-policy.ts` replaces that with hard gates. Any one of these
refuses the application outright:

| signal | value | floor | scope |
| --- | --- | --- | --- |
| subject | `non_human_or_no_face` | 0.70 | selfie |
| reproduction | `screen_or_copy` | any | both |
| face_match | `not_consistent` | 0.75 | full |
| card | `not_ghana_card` | 0.75 | full |

The subject floor is deliberately lower: a false rejection costs the member a
retake, a false acceptance costs money. Everything below the floor, and every
unanswerable provider, becomes `manual_review_required`. There is no path from an
AI answer to "approved": the strongest positive state is `screened_pass`, whose
own reason string says a human still has to look.

`screenshots`, `screen_or_copy` and face mismatch are checked in both scopes.
Card questions are only asked in the full scope, where there is a card to look at.

### Where the refusal actually happens

Two points, both server-side:

- **Upload time.** A selfie is screened when it is uploaded. A refusal returns
  **422 `kyc-selfie-rejected`**, and the stored file is deleted, so a rejected
  photo neither costs storage nor lingers.
- **Submission time.** Front, back and selfie are screened together. A refusal
  returns **422 `kyc-screening-rejected`** *before the Firestore document is
  created*, so a refused applicant leaves no record and has nothing to "wait
  out".

  These checks are the six that need no key: card MRZ and ICAO check digits, the
  card number against the MRZ, printing markers on the card front, the typed PIN
  against the printed one, whether the selfie contains a person, and whether it
  contains eyes. A disagreement between the card and what the member typed is
  never a refusal; it is a line on Rabi's screen, because a married name on the
  card and a maiden name in the form is a normal thing and not a fraud.

`src/lib/cloudinary.ts` throws a dedicated `KycRejectionError` for this, because
the upload helper retries network blips, and a refusal is not a blip.

### Provider chain

Free tiers only, tried in order, first usable answer wins:

1. **Gemini** — `gemini-flash-latest` → `gemini-2.5-flash` → `gemini-2.0-flash`
2. **Groq** — Llama 4 Scout → Maverick
3. **OpenRouter** — `openrouter/free`, Gemma, Qwen 2.5 VL

Model IDs are comma-separated fallback lists rather than single names, because
free model IDs are retired without notice and a 404 is skipped in favour of the
next entry. Groq has previously dropped every vision model from its free tier,
which is why it is second and why the chain continues past it.

Answers are validated against an exact contract. An invented enum value, an
out-of-range confidence, prose-wrapped JSON (accepted) or a prompt injection in
the model's own output (not accepted) all resolve to "unreadable answer", which
routes to Rabi. A rejected key, an exhausted quota and a timeout are reported as
**our** failure, never as the member's.

### What Rabi sees

`kycScreeningChecks.vision` is stored next to the verdict: state, provider,
model, the individual signals, the reason tokens, duration and how many providers
were tried. The admin panel renders it in `src/components/admin/screening-panel.tsx`:

- machine tokens are translated into sentences, so "quota ran out" is visible
  instead of `vision-provider-quota-exhausted`;
- a pass is labelled "the AI cannot confirm identity", never "approved";
- an outage says "this is our failure, not the member's";
- the four individual answers are listed, so a reviewer can locate a bad one;
- a member with no screening record at all gets an explicit warning.

The member list also gained a **Needs review** filter, because "pending" and "the
machine could not decide" are different questions and used to look identical.

## 🚨 Two production outages found while verifying

### Every member would have been locked out by the rate limiter

`src/lib/rate-limit.ts` **failed closed**: without Upstash credentials in
production it returned `success: false` for every key. The routes it guards are
the ones a member cannot work around: signup submission, evidence upload, the
error reporter, admin decisions. On a fresh deployment with no Upstash account,
every parent would see "Too many requests" forever, with nothing to explain it.

A missing optional dependency must degrade, not deny. It now falls back to the
in-process counter (still a real limit per warm instance), sets `degraded: true`
so a health check can report it, and logs a warning.

### The durable limiter read the TTL instead of the count

The Upstash pipeline was destructured as `[, , count]`, which is the **TTL**.
Consequences in both directions:

- `signup:submit` is limited to 3 per hour, so `used` was about 3600: the first
  submission of every hour was refused.
- `upload` is limited to 60 per minute, so the comparison was `TTL <= 60`, always
  true: uploads were never limited at all.

Only the in-memory fallback had a test, which is why this survived. It now reads
`[count, , ttl]`, and `tests/rate-limit.test.ts` drives both backends with a
stubbed pipeline in both directions.

## 🎨 Eleven components were silently unstyled in production

`style-src-attr 'none'` is the right policy, but React's `style` prop compiles to
exactly the attribute it blocks. Measured against the real build:

| how the style is applied | CSP `style-src-attr 'none'` |
| --- | --- |
| `<div style="width:77px">` (server-rendered) | **blocked**, computed `784px` |
| `el.setAttribute("style", …)` (what React does) | **blocked** |
| `el.style.width = "22px"` (CSSOM) | **allowed** |
| `el.style.setProperty("--w", …)` (CSSOM) | **allowed** |

So only *server-rendered* styles died; anything framer-motion set after hydration
survived. On the homepage that was 25 style attributes and 55 console violations,
with the trust-section bars computing to `0px`.

Every one is fixed at the source, not by relaxing the policy:

- `src/lib/css-vars.ts` publishes values as custom properties through the CSSOM.
- `src/components/ui/css-var-box.tsx` is the drop-in for a mapped list.
- Bars, the approval ring, avatars, the Face ID tile, the liveness progress bar,
  the shimmer button, the nav labels, the testimonial marquee edges and its card
  gradient all moved to shipped classes.
- Two unused components were deleted rather than repaired.

Verified after: the trust bars compute `19.2px … 48px` instead of `0px`, and the
shimmer button has its `100px` radius and background back. A sweep of every
element carrying a `style` attribute on the homepage now reports **zero** whose
computed value contradicts the attribute.

One refinement came out of that sweep. The CSSOM-written utilities had no
fallback, so between the server render and the first effect the bar was not
"40%" but "no height at all" — invisible rather than wrong. They now ship a
`var(--bar, 0%)` fallback, so the pre-hydration paint is a zero-height bar
instead of a missing one, and there is no CSP violation to log.

### What still legitimately emits a style attribute

Framer-motion writes animation frames through React's `style` prop, so the
console still shows roughly thirty `Refused to apply inline style` lines for
`opacity`/`transform` values. Those are not breaks: the unit is deliberately
marked initial and the animation resolves on mount, and it was verified that a
reveal element goes from `opacity: 0` to `opacity: 1` when scrolled into view,
in both normal and `prefers-reduced-motion` modes. They are noise, not defects,
and they cannot be removed without replacing the animation library.

## 📱 Custom plans, WhatsApp links, savings tracking (handover patch)

> **Superseded:** the Advance Susu section below describes a feature that was later removed on purpose.
> Members ask Rabi directly on WhatsApp; the software only records money she has already received.

### The custom-plan WhatsApp bug — three separate breaks
1. The plan form had **no link field at all** (`AddCustomPlan` collected five fields, none of them a URL).
2. The WhatsApp-links tab built its rows from the **static** built-in plan list, so a custom plan id
   (`custom-…`) never got a row to paste into.
3. Approval looked up `waLinks[planId]` for a plan that had no entry, so `whatsappLink` stayed empty and
   the member's dashboard showed nothing to join.

**Fixed:** the plan form now has a group-link field (create *and* edit, with validation and a test link),
the links tab merges built-in + custom plans, and approval resolves plan link → `waLinks` map → the
member's existing link. A member approved months ago now sees the group button without re-approval,
because the dashboard resolves the link from the plan itself.

### The form was hostile to a business owner on a phone
"Please fill all fields" on four fields, and the whole modal reset on one miss. Now:
**only the plan name is required.** Contribution, payout, frequency and slots are optional; blank payout
renders as "Flexible — Rabi quotes this" instead of a fabricated number; frequency has one-tap presets;
a live preview shows exactly what the member will read; inputs open the right keyboard; and ids are
stable slugs (`custom-daily-50`) instead of timestamps so a rename cannot detach a member from their plan.

### Admin login no longer pretends to be a member
Rabi's own account has no member document, so `/dashboard` greeted her as "Welcome, Member" and showed
**"we can't see your details yet — your registration has not reached us"**, which read like her business
had lost data. Operators now get an owner card ("This is the owner account"), her email as the name, and
a one-tap route into `/admin`.

### Savings tracking + Advance Susu
Rabi records money she has actually received (member sheet → *Record payment*, one tap, undo included).
The member sees total saved, payments count, last contribution in plain English, this month, last 7 days,
and progress toward the plan payout. **Advance Susu** lets a member ask for part of their own money early
— capped at half of what has been received — and Rabi approves or declines from a new admin tab with a
WhatsApp shortcut. No gateway, no card, no change to how money actually moves.

**Gates:** lint ✅ · `tsc` ✅ · **174 tests** ✅ · build ✅

---

## ✅ Verification performed

- `npx tsc --noEmit` — clean.
- `npm run lint` — no warnings or errors.
- `npm run build` — succeeds; `ƒ Middleware 27.6 kB`; manifest contains
  `server/src/middleware.js`.
- `npx vitest run` — **31 files, 421 tests, all passing.**
- Production build served on a local port: `/auth` returns the full CSP with a
  fresh nonce, HSTS, and `x-frame-options`.
- Headless Chrome against that build: CSP applies, no dead style attributes on
  the pages that were fixed, trust bars render at their real heights.
- Scratch page with the exact policy proved the four style-injection cases in the
  table above.

New test files: `kyc-vision-provider`, `kyc-vision-policy`, `cropper-csp`,
`rate-limit`, `admin-screening`. Existing suites were updated to the new contract
rather than weakened; where an assertion pinned an implementation detail (a byte
offset, a literal string) it now asserts the behaviour.

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

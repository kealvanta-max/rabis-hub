# Security audit — Rabi's Saving Hub

Written as an attacker, fixed as an engineer. Every item below was checked
against the code in this repository, not against a checklist from the internet.

**Scope:** public site, signup/KYC flow, member dashboard, admin panel, API
routes, Firestore rules, third-party upload and email paths.

---

## If I were attacking this site, this is the order I would try

### 1. Use her own email system against her members — **CRITICAL, FIXED**
`POST /api/email` accepted `{ to, subject, html }` from anyone. The only gate was
an `Origin` header check, and `curl` simply does not send one — which the code
treated as *trusted*. I could send unlimited HTML email **from her verified
Resend domain** to any address on earth.

Why it matters: this is the highest-value attack on a Susu business. A mail from
`rabisavinghub` saying *"Your payout is blocked, confirm your MoMo number"* would
work on a large share of her members. It also burns her Resend quota and gets her
domain blacklisted.

**Fixed:** the route now verifies a Firebase ID token through Google Identity
Toolkit and applies a recipient policy (`src/lib/email-policy.ts`, unit-tested):
a member may only mail **themselves** or the owner inbox; only an admin may mail
a third party. Member-authored HTML is stripped of `<script>`, `<iframe>`,
`on*=`, and `javascript:`. Rate limit is keyed per user, not per IP.

### 2. Fill her Cloudinary account — **HIGH, FIXED**
The browser uploaded straight to Cloudinary with an **unsigned preset**
(`rabi-user-docs`). Anyone reading the JS bundle could push files into her
account: storage bills, illegal content hosted under her cloud name, and a
gallery that looks like it belongs to her business.

**Fixed:** uploads go through `POST /api/upload`, authenticated with the member's
ID token, signed server-side with `CLOUDINARY_API_SECRET`, restricted to
JPG/PNG/WEBP, ≤ 8 MB, forced into the `rabis-kyc` folder and re-encoded to at most
1600 px / q80. The secret never reaches the browser.

### 3. Approve myself and collect a payout — **BLOCKED, VERIFIED**
The obvious fraud: change `status` to `approved` and turn up for a cashout.
Firestore rules require `status == resource.data.status` on self-update and list
every mutable field explicitly, so `status`, `whatsappLink` and anything else are
admin-only. Creating a profile forces `status == 'pending'`. I re-verified this
and added field-level validation (required keys, string types, length caps) so a
1 MB junk document cannot be created either.

### 4. Become the admin — **MITIGATED**
`isAdmin()` previously trusted an email address from the token. Firebase does not
require the address to be *verified* for a password account, so an account created
with an owner address would inherit admin. Her real account already exists (so it
cannot be duplicated), but the rule was still too generous.

**Fixed:** the owner-email fallback now requires `email_verified == true`; the
custom `admin` claim remains the primary path. **Action for Rabi:** verify
`rabisavinghub@gmail.com` in Firebase Auth and run `npm run admin:setup` — see
`docs/HANDOVER.md`.

### 5. Read her members' identity documents — **HIGH, OPEN (third party)**
KYC images are Cloudinary URLs. Cloudinary serves media publicly by default: the
URL is unguessable, but anyone who obtains it (screenshot, forwarded WhatsApp,
browser history) can view that Ghana Card forever, without logging in.

**Mitigation now:** uploads are signed, folder-scoped and re-encoded; URLs are
never embedded in public pages or emails.
**Recommended next step (console, 10 minutes):** switch the `rabis-kyc` assets to
**authenticated delivery** in Cloudinary and mint short-lived signed URLs through
`/api/upload-signature` when the admin opens a member. This is the single most
valuable remaining hardening step, and it needs a small follow-up PR.

### 6. Flood the logs / poison Sentry — **MEDIUM, FIXED**
`/api/errors` accepted any JSON. Now: 16 KB body cap, 20 req/min/IP, e-mail
addresses / phone numbers / bearer tokens scrubbed before they leave the server,
free-form context capped at 2 KB.

### 7. Steal data through the browser — **LOW**
* No `dangerouslySetInnerHTML` on user data (only JSON-LD built with
  `JSON.stringify`).
* The admin map escapes every field before it is handed to Leaflet.
* React escapes all rendered text.
* **Added:** Content-Security-Policy, HSTS, `nosniff`, Referrer-Policy,
  Permissions-Policy and `Cross-Origin-Opener-Policy` on every response. The CSP
  keeps the permissive bits the stack truly needs (`unsafe-inline` for hydration,
  `wasm-unsafe-eval` for the on-device vision models) but pins the page to a known
  origin list, so an injected script cannot POST a member's data anywhere else.

### 8. Abuse the API with automated signups — **MEDIUM, PARTIAL**
Every API route is rate-limited (Upstash Redis in production, in-memory locally).
Registration itself is Firestore + Firebase Auth, which is protected by Google's
quota and abuse systems, not by us.

**Recommended:** enable **Firebase App Check** (reCAPTCHA v3, free) so only your
own web app can talk to Firestore/Auth. That is the strongest single upgrade left.

---

## What an attacker could actually take, ranked by value

| Asset | Where it lives | Exposure today |
| :--- | :--- | :--- |
| Ghana Card photos, selfies, liveness clips | Cloudinary | public-by-URL (item 5) |
| Phone numbers, home GPS coordinates | Firestore `users` | admin + self only ✔ |
| Her Resend sender reputation | Resend | locked behind auth ✔ |
| Her Cloudinary quota | Cloudinary | signed uploads ✔ |
| Admin session | Firebase Auth | needs 2FA — **her job** |

The realistic attack on this business is not a database dump — it is a WhatsApp
message or an email that *looks* like it came from Rabi. That path is now closed
technically and is why the email fix ranks first.

---

## Operational security Rabi must own (no code can do this)

1. **2FA on every account**: Google/Firebase, Cloudinary, Resend, Vercel, GitHub.
2. **Never share the admin password**, and never let anyone "help" over a screen
   share with it.
3. **Verify the owner email** in Firebase Auth; run `npm run admin:setup`.
4. **Rotate** the Firebase service-account key and Cloudinary secret if they were
   ever pasted into a chat.
5. Turn on **Firestore backups** (Google Cloud → Firestore → Backups) — free for
   daily backups at this size, and the only protection against an accidental
   delete.
6. Treat every "Rabi" message asking for money or a code as fake until confirmed
   by a phone call.

---

## Verdict

The two vulnerabilities that could have destroyed trust in this business — a
phishing relay on her own domain, and an open upload bucket — are closed, with
tests that fail the build if they come back. Remaining risk is concentrated in
third-party media delivery (Cloudinary public URLs) and in accounts that belong
to Rabi, not to the codebase.

Nothing in this report requires a rewrite. Everything is a console setting, a
small follow-up PR, or a password change.

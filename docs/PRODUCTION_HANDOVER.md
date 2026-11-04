# Production handover — Rabi's Saving Hub

This document is the handover pack for the production repository. It covers
ownership, environments, deployment, operations and the day-to-day runbook.

---

## 1. What is in the box

| Item | Location | Notes |
| :--- | :--- | :--- |
| Web app | `src/` | Next.js 14 App Router, TypeScript strict |
| Firebase rules | `firestore.rules` | Deploy or paste into the console |
| Firebase config | `firebase.json`, `firestore.indexes.json` | Emulators + rules + (no) composite indexes |
| Vercel config | `vercel.json` | Framework + `fra1` region (closest to Ghana) |
| CI | `.github/workflows/main.yml` | lint → typecheck → tests → build |
| AI review | `.coderabbit.yaml` | Install the CodeRabbit GitHub app to activate |
| Setup guide | `docs/FIREBASE_SETUP.md` | Env vars, rules, Cloudinary, email, claims |
| Change log | `FIXES.md` | Everything repaired in the stabilisation pass |
| Security | `SECURITY.md` | Reporting process + operational checklist |
| Tests | `tests/` | Vitest unit tests for the money/KYC-critical helpers |

Stack: **Next.js 14.2.35** (App Router) · **Firebase** Auth + Firestore · **Cloudinary**
media · **MediaPipe** liveness · **Tesseract.js** OCR · **Tailwind 3.4** ·
**Vercel** hosting.

---

## 2. Accounts & ownership (client owns everything)

Transfer/confirm ownership of:

1. **GitHub** — repository under the client's org/user; add maintainers, enable branch protection on `main`.
2. **Vercel** — project owned by the client's team; production domain `rabissavinghub.com`.
3. **Firebase** — project owned by the client's Google account; billing alerts enabled.
4. **Cloudinary** — account with the `rabi-user-docs` unsigned preset.
5. **Resend / Gmail / Brevo** — email sender used by `/api/email`.
6. **Domain / DNS** — registrar access.

Turn on 2FA everywhere. Never commit `.env.local` or service-account JSON.

---

## 3. Environments

| Environment | Branch | URL | Purpose |
| :--- | :--- | :--- | :--- |
| Production | `main` | https://rabissavinghub.com | Real members & money |
| Preview | every PR | Vercel preview URL | Review + QA |
| Local | feature branch | http://localhost:3000 | Development |

Each environment needs its own env vars. Use a **separate Firebase project** for
staging if you plan to load-test or experiment with rules.

Required variables (full list in `.env.example`):

```
NEXT_PUBLIC_FIREBASE_API_KEY
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
NEXT_PUBLIC_FIREBASE_PROJECT_ID
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
NEXT_PUBLIC_FIREBASE_APP_ID
NEXT_PUBLIC_ADMIN_EMAIL
NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME
RESEND_API_KEY | (EMAIL_USER + EMAIL_PASSWORD) | (BACKUP_EMAIL_USER + BACKUP_EMAIL_PASSWORD)
NEXT_PUBLIC_APP_URL
```

`FIREBASE_SERVICE_ACCOUNT_KEY` is **server-only** and used exclusively by
`npm run admin:setup`.

---

## 4. First production deploy (order matters)

```bash
# 1. install & verify
npm ci
npm run lint && npx tsc --noEmit && npm test && npm run build

# 2. Firebase: create project, enable Email/Password, create Firestore (production mode)

# 3. deploy security rules
npx firebase-tools deploy --only firestore:rules --project <project-id>

# 4. Vercel: import the repo, add every env var (Production + Preview), deploy

# 5. add the deployed domain to Firebase Authentication → Authorized domains

# 6. grant the owner admin claim
npm run admin:setup        # with FIREBASE_SERVICE_ACCOUNT_KEY in .env.local

# 7. smoke test (see §7)
```

---

## 5. Release process

1. Branch from `main` (`feat/…`, `fix/…`).
2. Open a PR — CI (lint, types, tests, build) and CodeRabbit review must pass.
3. QA on the Vercel preview URL.
4. Squash-merge to `main` → Vercel deploys production automatically.
5. Tag releases: `git tag v1.2.0 && git push --tags`.

Hotfixes follow the same path — never push straight to `main` once branch
protection is on.

---

## 6. Operations runbook

### Daily
- Check Vercel → Deployments for failed builds.
- Admin panel → **System status** banner must be all green.
- Approve pending registrations and confirm payment reports.

### Weekly
- Admin → Export JSON/CSV (offline backup of members).
- Review Firebase usage (Firestore reads/writes), Cloudinary bandwidth.
- Check `/admin/payments` for rounds that should be advanced or completed.

### Monthly
- `npm audit` review + dependency update PR.
- Rotate the Cloudinary upload preset if URLs leaked.
- Verify backups restore into a staging Firebase project.

### Incidents

| Symptom | First checks | Fix |
| :--- | :--- | :--- |
| White screen for everyone | Vercel build logs, browser console | Missing/renamed env var; redeploy |
| "Firebase is not configured" | Vercel env vars, `/api/health` | Add `NEXT_PUBLIC_FIREBASE_*`, redeploy |
| Signups fail at upload | Cloudinary dashboard, preset name | Recreate unsigned preset `rabi-user-docs` |
| Signups fail saving profile | Firestore rules, `permission-denied` in console | Deploy `firestore.rules`; check `users/{uid}` create condition |
| Admin panel redirects home | Claims | `npm run admin:setup`, sign out/in |
| Emails not arriving | `/api/health` → `emailProvider`; provider dashboard | Add provider key, verify domain |
| Liveness asks for manual recording | Browser/network | Expected fallback when MediaPipe CDN/WebGPU is blocked |
| Round has no members | Admin → users' `plan`/`plans` and approval status | Approve members on that plan first |

Escalation: keep the last known good Vercel deployment ID — Vercel → Deployments →
**Instant Rollback**.

---

## 7. Acceptance / smoke test (run before handover)

- [ ] Landing page loads on mobile + desktop, plans and reviews render
- [ ] Signup: step 1 validation → documents → face scan → GPS → captcha → account created
- [ ] Dashboard shows pending status, profile, documents
- [ ] Admin approves the member → WhatsApp link appears → approval email sent
- [ ] Admin creates a Susu round for that plan → member sees it under My Payments
- [ ] Member taps "I Have Paid" → admin sees it in the pending queue → confirms
- [ ] Member payment history shows the confirmed payment
- [ ] Admin advances the round → next member is highlighted "Next to receive"
- [ ] Payout confirmation, CSV export, JSON export, map view
- [ ] Custom plan created → visible on landing page + signup picker
- [ ] Announcement (global + plan-targeted) appears on the right dashboards
- [ ] Review submitted → approved → appears on the landing page
- [ ] `/api/health` returns all integrations configured in production

---

## 8. Data model

```
users/{uid}            name, email, phone, plan, plans[], KYC fields, gps, status, whatsappLink
settings/customPlans   { plans: [{ id, name, amt, freq, ret, slots? }] }
settings/waLinks       { [planId]: "https://chat.whatsapp.com/…" }
announcements/{id}     title, message, planId|null, createdAt
testimonials/{id}      userId, userName, rating, review, status, isStatic, createdAt
susu-rounds/{id}       planId, roundNumber, status, cashoutDate, momoNumber, momoName,
                       slots[{ userId, position, paidRounds[], selfReported, adminConfirmed,
                               nextToReceive, payoutConfirmed }], memberIds[], totalSlots
payment-reports/{id}   roundId, userId, amount, momoRef, roundNumber, reportedAt, confirmed
```

Access rules live in `firestore.rules`; members can only touch their own profile and
their own slot's "self-reported" flag.

---

## 9. Costs (rough, low-traffic)

| Service | Free tier covers | When it starts costing |
| :--- | :--- | :--- |
| Vercel Hobby/Pro | Static + serverless | Custom domain is free; Pro needed for team/analytics |
| Firebase Spark/Blaze | 50k reads/day, 20k writes/day, 10k auth/month | Blaze pay-as-you-go beyond that |
| Cloudinary | 25 credits/month | KYC videos consume bandwidth quickly — keep clips short |
| Resend | 100 emails/day | Paid plans for more |

Set billing alerts on Firebase and Cloudinary before launch.

---

## 10. Known limitations / roadmap

1. Payment reporting currently writes to `susu-rounds` from the client (rules restrict it to the member's own slot). Moving it to an API route with the Admin SDK is the next hardening step.
2. Next.js 14 is end-of-life — schedule the Next 16 / React 19 upgrade.
3. The welcome voice-over is hosted on Dropbox (expiring link) — move it to `/public/audio`.
4. The "AI Assistant" button is a placeholder until a Gemini key is wired in.
5. Add end-to-end tests (Playwright) for the signup → payout journey.

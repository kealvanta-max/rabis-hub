# Production handover — Rabi's Saving Hub

This document is the handover pack for the production repository. It covers
ownership, environments, deployment, operations and the day-to-day runbook.

---

## 1. What is in the box

| Item | Location | Notes |
| :--- | :--- | :--- |
| Web app | `src/` | Next.js 14 App Router, TypeScript strict |
| Database schema | `supabase/migrations/0001_init.sql` | Postgres tables, `is_admin()` helper, triggers, RLS policies |
| RLS checks | `supabase/tests/rls_checks.sql` | Proves member isolation + escalation protection |
| Vercel config | `vercel.json` | Framework + `fra1` region (closest to Ghana) |
| CI | `.github/workflows/main.yml` | lint → typecheck → tests → build |
| AI review | `.coderabbit.yaml` | Install the CodeRabbit GitHub app to activate |
| Setup guide | `docs/SUPABASE_SETUP.md` | Env vars, schema, auth config, admin promotion |
| Change log | `FIXES.md` | Everything repaired in the stabilisation pass |
| Security | `SECURITY.md` | Reporting process + operational checklist |
| Tests | `tests/` | Vitest unit tests for the money/KYC-critical helpers |

Stack: **Next.js 14.2.35** (App Router) · **Supabase** (Postgres 17, Auth, RLS,
Realtime) · **Cloudinary** media · **MediaPipe** liveness · **Tesseract.js** OCR ·
**Tailwind 3.4** · **Vercel** hosting.

---

## 2. Accounts & ownership (client owns everything)

Transfer/confirm ownership of:

1. **GitHub** — repository under the client's org/user; add maintainers, enable branch protection on `main`.
2. **Vercel** — project owned by the client's team; production domain `rabissavinghub.com`.
3. **Supabase** — organisation `siagdqwferrnapzvidht`, project `rabis-saving-hub`
   (`jwghacxpzskqjvorkvep`, `eu-west-1`); billing alerts enabled; database password
   handed over securely (reset it in Project settings → Database).
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

Each environment needs its own env vars. Use a **separate Supabase project** for
staging if you plan to load-test or experiment with policies.

Required variables (full list in `.env.example`):

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
NEXT_PUBLIC_ADMIN_EMAIL
NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME
RESEND_API_KEY | (EMAIL_USER + EMAIL_PASSWORD) | (BACKUP_EMAIL_USER + BACKUP_EMAIL_PASSWORD)
NEXT_PUBLIC_APP_URL
```

`SUPABASE_SERVICE_ROLE_KEY` is **server-only**: it powers `npm run admin:setup`
and the `/api/account/rollback` route. Never expose it with a `NEXT_PUBLIC_`
prefix.

---

## 4. First production deploy (order matters)

```bash
# 1. install & verify
npm ci
npm run lint && npx tsc --noEmit && npm test && npm run build

# 2. Supabase: create project, enable Email provider, copy URL + anon + service keys

# 3. apply schema + RLS
npx supabase link --project-ref <project-ref>
npx supabase db push

# 4. Vercel: import the repo, add every env var (Production + Preview), deploy

# 5. add the deployed domain to Supabase Authentication → URL configuration

# 6. promote the owner account
npm run admin:setup        # with SUPABASE_SERVICE_ROLE_KEY in .env.local

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
- Review Supabase database size + egress, Cloudinary bandwidth.
- Check `/admin/payments` for rounds that should be advanced or completed.

### Monthly
- `npm audit` review + dependency update PR.
- Rotate the Cloudinary upload preset if URLs leaked.
- Verify `supabase db dump` restores into a staging Supabase project.

### Incidents

| Symptom | First checks | Fix |
| :--- | :--- | :--- |
| White screen for everyone | Vercel build logs, browser console | Missing/renamed env var; redeploy |
| "Supabase is not configured" | Vercel env vars, `/api/health` | Add `NEXT_PUBLIC_SUPABASE_*`, redeploy |
| Signups fail at upload | Cloudinary dashboard, preset name | Recreate unsigned preset `rabi-user-docs` |
| Signups fail saving profile | RLS blocked the write (`row-level security` in console) | Apply `supabase/migrations/0001_init.sql`; check `profiles_insert` policy |
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

Access rules live in `supabase/migrations/0001_init.sql` (RLS policies); members can only touch their own profile and
their own slot's "self-reported" flag.

---

## 9. Costs (rough, low-traffic)

| Service | Free tier covers | When it starts costing |
| :--- | :--- | :--- |
| Vercel Hobby/Pro | Static + serverless | Custom domain is free; Pro needed for team/analytics |
| Supabase Free | 500 MB database, 1 GB file storage, 50k MAU, 2 projects | Pro $25/mo: no pausing, daily backups, PITR add-on |
| Cloudinary | 25 credits/month | KYC videos consume bandwidth quickly — keep clips short |
| Resend | 100 emails/day | Paid plans for more |

Set billing alerts on Supabase and Cloudinary before launch.

---

## 10. Known limitations / roadmap

1. **KYC images are stored as data URLs in `profiles`.** It works and keeps the UI simple, but rows get large. Move them to a private Supabase Storage bucket (`kyc/{uid}/…`) and store the object path; resolve a short-lived signed URL when the admin opens a member. This is the single biggest pre-scale task.
2. Next.js 14 is end-of-life — schedule the Next 16 / React 19 upgrade.
3. The welcome voice-over is hosted on Dropbox (expiring link) — move it to `/public/audio`.
4. The "AI Assistant" button is a placeholder until a Gemini key is wired in.
5. Add end-to-end tests (Playwright) for the signup → payout journey.
6. Payment reporting is already behind the `report_payment()` RPC (no member write access to rounds); round creation/advancement is admin-only via RLS.

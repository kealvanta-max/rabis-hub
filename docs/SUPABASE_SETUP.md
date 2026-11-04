# Supabase setup (production)

Everything the app needs lives in **one Supabase project**: Postgres for data,
Supabase Auth for accounts, Row Level Security for permissions and Realtime for
live profile updates.

Project used by the current deployment: **`jwghacxpzskqjvorkvep`** (region
`eu-west-1`, free plan).

---

## 1. Environment variables

Copy `.env.example` → `.env.local` (never commit `.env.local`) and fill in:

| Variable | Where to find it | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Project settings → API → Project URL | Safe for the browser |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Project settings → API → `anon` / publishable key | Safe for the browser; RLS protects the data |
| `SUPABASE_SERVICE_ROLE_KEY` | Project settings → API → `service_role` / secret key | **Server only.** Registration rollback + `npm run admin:setup` |
| `NEXT_PUBLIC_ADMIN_EMAIL` | comma separated | Admin panel fallback + registration alerts |

Run `npm run env:check` to confirm the app can reach the project.

## 2. Database schema

The full schema is versioned in [`supabase/migrations/0001_init.sql`](../supabase/migrations/0001_init.sql).
Apply it with either:

```bash
# Supabase CLI (recommended for a new environment)
npx supabase link --project-ref <project-ref>
npx supabase db push
```

```text
# or paste the file into Dashboard → SQL Editor → Run
```

### Tables

| Table | Purpose |
|---|---|
| `profiles` | One row per member (`id` = `auth.users.id`), KYC data, status, plan list, `is_admin` |
| `susu_rounds` | A Susu round; `slots` is JSONB because a round is always read and written as a whole |
| `payment_reports` | Member payment claims and the admin's confirmation |
| `testimonials` | Member reviews plus admin-created static ones |
| `announcements` | Dashboard notices, optionally scoped to one plan |
| `app_settings` | Key/value admin settings (`waLinks`, `customPlans`) |

### Security model

* **RLS is on for every table.** Members only ever see their own profile, their
  own rounds, their own payment reports and approved testimonials.
* `public.is_admin()` is a `SECURITY DEFINER` helper reading `profiles.is_admin`.
* `protect_profile_columns` trigger blocks a member from approving themselves or
  granting themselves admin rights.
* Payment reporting goes through the `report_payment()` RPC: the report row and
  the member's slot flag are written in a single transaction, so members never
  need write access to `susu_rounds`.
* `append_my_plan()` lets a member add a plan to their own list without exposing
  the rest of the profile table.

## 3. Auth configuration

Dashboard → Authentication → Providers → **Email**: enabled.

Dashboard → Authentication → URL configuration:

| Setting | Value |
|---|---|
| Site URL | `https://<your-domain>` |
| Redirect URLs | `https://<your-domain>/auth`, `http://localhost:3000/auth`, `https://*.vercel.app` |

> The current project has **email confirmations disabled** so a member can finish
> the 5-step registration and reach their dashboard immediately. Turn it on in
> Authentication → Sign In / Providers once you have a verified sending domain —
> then update the `/auth` copy to mention the confirmation email.

## 4. Make yourself an admin

```bash
npm run admin:setup                      # promotes NEXT_PUBLIC_ADMIN_EMAIL
npm run admin:setup -- boss@mail.com     # or explicit addresses
```

Then sign out and back in — the admin panel reads `profiles.is_admin`.

## 5. Backups

Free plan: Dashboard → Database → Backups (daily, 7-day retention).
Pro plan: Point-in-time recovery. **Export a logical dump before every release:**

```bash
npx supabase db dump --project-ref <project-ref> -f backup-$(date +%F).sql
```

## 6. Local development

```bash
npx supabase start     # local Postgres + Auth + Studio on :54321
npx supabase db reset  # apply migrations to the local database
```

Point `NEXT_PUBLIC_SUPABASE_URL` at `http://127.0.0.1:54321` and use the local
anon key printed by `supabase start`.

---

## Data model notes

* `slots` (JSONB) holds `{ userId, userName, position, paidRounds[], selfReported,
  adminConfirmed, nextToReceive, payoutConfirmed }`.
* KYC images are currently stored as data URLs inside `profiles`. That works but
  makes rows large — see “Known limitations” in `PRODUCTION_HANDOVER.md` for the
  Supabase Storage migration path.
* `profiles.status` drives the member lifecycle: `pending` → `approved` →
  `rejected`, changed only by admins (enforced by trigger).

# Deploying to Vercel

The Vercel project **`rabis-saving-hub`** already exists with every environment
variable set (Production, Preview and Development):

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://jwghacxpzskqjvorkvep.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | project anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | encrypted, server-only |
| `NEXT_PUBLIC_ADMIN_EMAIL` | `rabisavinghub@gmail.com,moneyace914@gmail.com` |
| `NEXT_PUBLIC_APP_URL` | `https://rabis-saving-hub.vercel.app` |

What is missing is the **source connection**: Vercel needs a GitHub login
connection before it can build a repository. That is a one-time, two-click
authorisation on your Vercel account — it cannot be granted by an API token.

---

## Option A — connect GitHub (recommended, gives you CI deploys)

1. Open <https://vercel.com/account/login-connections> and click
   **Add GitHub Account** → authorise.
2. Open the project → **Settings → Git → Connect Git Repository**.
3. Pick the repository (`kealvanta-max/rabis-hub` for now, or the dedicated
   production repository once it exists) and the **production branch**
   (`main` for the production repo, or `arena/5151289b-rabis-hub` to ship the
   current build immediately).
4. Click **Deploy**. `vercel.json` sets the framework and the `fra1` function
   region, so no other configuration is needed.
5. Every later push to that branch redeploys automatically; PRs get preview URLs.

## Option B — deploy from your machine in one command

```bash
cd rabis-saving-hub-production
npx vercel link --project rabis-saving-hub   # pick the existing team/project
npx vercel --prod
```

`vercel link` writes `.vercel/project.json` locally (git-ignored) and reuses the
environment variables already stored on the project.

---

## After the first successful deploy

1. Copy the production URL and update:
   - Supabase → **Authentication → URL configuration** → Site URL + redirect
     URLs (`https://<domain>/auth`).
   - `NEXT_PUBLIC_APP_URL` in Vercel, then redeploy.
2. Promote the owner account to admin:
   ```bash
   npm run admin:setup
   ```
3. Run the smoke test (handover doc §7): sign up → approve → start round →
   report payment → confirm payout.
4. Add the custom domain `rabissavinghub.com` → Vercel → Domains, then point DNS.

## Rollback

Vercel → Deployments → pick the last known-good deployment → **Instant
Rollback**. Database changes roll back with `supabase db reset` on a branch or by
reverting the migration; take a `supabase db dump` before every release.

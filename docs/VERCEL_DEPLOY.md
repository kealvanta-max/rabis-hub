# Deploying to Vercel

## The account

The Vercel account connected to this workspace is:

| | |
|---|---|
| **Email** | `patienceboatemaah6@gmail.com` |
| **Name on account** | Rabi |
| **Username** | `patienceboatemaah6-9752` |
| **Team** | `team_Cyj2XZI81kfo5BIIYcCxo74A` |

Sign in at <https://vercel.com/login> with that email (Google sign-in). The project
**`rabis-saving-hub`** is already there with every environment variable set.

If the live `rabissavinghub.com` deployment lives in a different account, log into
*that* one instead — import the repository there and paste the `.env.local` values
(the table below is the same for both).

### The URL that is actually current

Share **`https://rabis-saving-hub.vercel.app`**. That is this project, on this
account, deploying `main` automatically and holding the environment variables
above.

`https://rabis-hub.vercel.app` is a **different, older copy** of the app living in
another Vercel account. It still runs a build from before the Search Console fix
and it is not connected to this repository's deploys, so anything shipped here
never reaches it. Do not point members at it, do not put it in canonicals, and
delete it if you can still sign in to that account.

## Environment variables already configured

| Key | Value |
|---|---|
| `NEXT_PUBLIC_FIREBASE_API_KEY` | set |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | `rabis-hub.firebaseapp.com` |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | `rabis-hub` |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | `rabis-hub.firebasestorage.app` |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | `199788920589` |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | `1:199788920589:web:97da5f2621b1593713ba44` |
| `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` | `doxcv1qkm` |
| `RESEND_API_KEY` | set (sensitive) |
| `EMAIL_FROM` | `Rabi's Saving Hub <noreply@rabissavinghub.com>` |
| `NEXT_PUBLIC_ADMIN_EMAIL` | set |
| `NEXT_PUBLIC_APP_URL` | `https://rabis-saving-hub.vercel.app` |
| `NEXT_PUBLIC_SITE_URL` | `https://rabis-saving-hub.vercel.app` (SEO canonicals) |
| `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION` | Search Console HTML tag value (optional) |
| `NEXT_PUBLIC_POSTHOG_KEY` | PostHog project key (optional — analytics) |
| `SENTRY_DSN` | Sentry DSN (optional — error tracking) |
| `UPSTASH_REDIS_REST_URL` / `..._TOKEN` | Upstash REST credentials (optional — rate limiting) |

All are applied to Production, Preview and Development.

> `FIREBASE_SERVICE_ACCOUNT_KEY` is **not** on Vercel. It is server-only and only
> needed locally by `npm run admin:setup`; keeping it out of the hosting platform
> reduces the blast radius if the project is ever compromised.

## Option A — connect GitHub (recommended, CI deploys)

Vercel refused an API-only repo link with *"You need to add a Login Connection to
your GitHub account first"* — that authorisation must be clicked by a human:

1. <https://vercel.com/account/login-connections> → **Add GitHub Account** → authorise.
2. Project → **Settings → Git → Connect Git Repository**.
3. Pick `kealvanta-max/rabis-hub` and the branch to ship
   (`main` once the PR is merged, or `arena/5151289b-rabis-hub` to deploy now).
4. **Deploy.** `vercel.json` supplies the framework and the `fra1` region.

## Option B — deploy from your own machine

```bash
# after downloading/cloning the repo
npm ci
npx vercel link --project rabis-saving-hub
npx vercel --prod
```

`vercel link` reuses the environment variables already stored on the project.

## After the first successful deploy

1. **Firebase → Authentication → Settings → Authorized domains**: add the
   deployment domain (`rabis-saving-hub.vercel.app`, `rabissavinghub.com`,
   and `*.vercel.app` for previews).
2. **Publish the Firestore rules** (one time):
   ```bash
   npx firebase-tools deploy --only firestore:rules --project rabis-hub
   ```
   or paste `firestore.rules` into Firebase console → Firestore → Rules.
3. **Promote the owner accounts** to admin:
   ```bash
   npm run admin:setup      # uses FIREBASE_SERVICE_ACCOUNT_KEY from .env.local
   ```
   then sign out and back in.
4. Smoke test: sign up → admin approves → start a round → member reports a
   payment → admin confirms → advance round → payout confirmed.

## Rollback

Vercel → Deployments → pick the last known-good one → **Instant Rollback**.

# Clerk — decision, bridge, and migration plan

## Decision: **bridged, not cut over.** Firebase Auth stays the live provider today.

Phase 1 of the plan below is **already implemented and tested** — the server
half of the bridge exists in this repo, inert until three variables are set:

* `src/lib/clerk-jwt.ts` — verifies Clerk session tokens (RS256) against the
  published JWKS with `node:crypto`. No SDK, no dependency, and it refuses
  `HS256` (algorithm-confusion), wrong issuers, unknown key ids, expired tokens
  and any signature made with a key Clerk does not publish. 12 tests, real
  RSA keypairs, no network.
* `src/app/api/auth/clerk-exchange/route.ts` — `POST` a Clerk session token,
  receive a Firebase custom token for `uid = clerk_<clerk_user_id>`. Returns
  **501** until `CLERK_JWT_ISSUER_DOMAIN`, `CLERK_SECRET_KEY` and
  `FIREBASE_SERVICE_ACCOUNT_KEY` all exist, so shipping this changed nothing for
  a single member.
* `src/lib/firebase-admin.ts` — lazy Admin init that accepts the service-account
  JSON raw **or** base64 (dashboards mangle newlines).

What is *not* done, deliberately: the client still signs in with Firebase Auth.
Cutting the UI over is Phase 2, and doing it in the same push as the security
release would put an untestable change on the login path — the one path that has
already broken once, for a far simpler reason.


You asked for Clerk twice, so this file records exactly why it is deferred, what
it would cost, and the precise plan for the day it becomes the right call. This is
an engineering recommendation, not a refusal — nothing in the site is coupled to
Firebase in a way that makes a later move painful.

### Why not now

1. **Identity is the spine of the data model.** Firestore documents are keyed by
   `uid` (`users/{uid}`), and the rules compare `request.auth.uid`. Clerk issues
   its own user id — the app cannot simply swap providers; the *database* would
   have to be migrated or bridged.
2. **The bridge is the fragile part.** Clerk's Firebase integration needs a
   server route that mints Firebase custom tokens with the Admin SDK (i.e. a
   service-account key on the server). That is a new, high-value secret and a new
   single point of failure placed directly on the login path — the one path that
   is currently working and that broke before for a much simpler reason.
3. **Cost model.** Clerk's free tier (10,000 MAU) is generous, but production
   features (custom SMTP, longer sessions) sit on the paid tier. The brief for
   this release is "$0 to start", and Firebase Auth costs nothing at this size.
4. **Risk vs. reward today.** Firebase Auth already gives password + (future)
   Google sign-in, custom `admin` claims, verified-email checks and abuse
   protection from Google. Clerk's wins — beautiful prebuilt UI, organisations,
   B2B multi-tenancy — are things a single-operator Susu business does not need.

### When to revisit

* More than one staff member needs their own login with different permissions,
* or you add paid subscriptions with seat-based billing,
* or Firebase bills start mattering (they will not below ~10,000 members).

### The migration, if you decide to do it anyway

**Phase 1 — parallel identity — SERVER DONE ✅**

1. Create the Clerk application. In Vercel add
   `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`,
   `CLERK_JWT_ISSUER_DOMAIN` (e.g. `https://rabis-hub.clerk.accounts.dev`) and
   `FIREBASE_SERVICE_ACCOUNT_KEY`.
2. The route exists: `POST /api/auth/clerk-exchange` (see above).
3. Client, once you have confirmed the exchange works in a preview deploy:

```ts
// after Clerk sign-in succeeds
const clerkToken = await getToken();               // Clerk session JWT
const res = await fetch("/api/auth/clerk-exchange", {
  method: "POST",
  headers: { Authorization: `Bearer ${clerkToken}` },
});
const { token } = await res.json();                // Firebase custom token
await signInWithCustomToken(auth, token);          // every useAuth() consumer unchanged
```

   **Nothing else changes** — Firestore rules still see `request.auth.uid`,
   which is exactly the point of the bridge.

**Phase 2 — swap the UI (half a day)**
4. Replace `/auth` with Clerk's `<SignIn/>`/`<SignUp/>` components, keeping the
   KYC steps as they are (they are profile data, not identity).
5. Map Clerk's `publicMetadata.admin` into the Firebase custom claim so Firestore
   rules stay identical.

**Phase 3 — cut over (1 day)**
6. Backfill any member who signed up between phases (they will already have a
   Firebase uid from Phase 1, so no data migration is needed).
7. Remove Firebase Auth from the client bundle; keep Firebase for Firestore.

**Rollback:** keep Phase 1's route deployed for two weeks. If anything breaks,
switch the `/auth` page back — the data model never changed.

### What is already in place for that day

* **The whole server side of the bridge, with tests.**
* Every component reads identity through `useAuth()` — one file to change.
* Firestore rules only care about `request.auth.uid` and the `admin` claim.
* `.env.example` reserves the Clerk variables and `docs/INTEGRATIONS.md` lists
  exactly where each one comes from.

### The honest cost of flipping it

Phase 2 (Clerk's `<SignIn/>` UI replacing `/auth`) is half a day **with real
keys and a preview deploy to test against** — not something to bundle into a
ship-day commit. Until then the bridge sits there costing nothing:
`/api/health` reports Clerk as unconfigured, and the app behaves exactly as it
did before this file was written.

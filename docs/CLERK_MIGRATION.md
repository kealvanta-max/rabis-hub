# Clerk — decision and migration plan

## Decision: **not now.** Firebase Auth stays for this release.

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

**Phase 1 — parallel identity (1–2 days)**
1. Create the Clerk application; add `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and
   `CLERK_SECRET_KEY` to Vercel.
2. Add `POST /api/auth/firebase-token`: verify the Clerk session, mint a Firebase
   custom token with `uid = clerk_user_id`, and store the service account in
   `FIREBASE_SERVICE_ACCOUNT_KEY`.
3. Client: after Clerk sign-in, exchange for a Firebase token and call
   `signInWithCustomToken`. **Nothing else changes** — every `useAuth()` consumer
   keeps working because the Firebase `uid` is unchanged in shape.

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

* Every component reads identity through `useAuth()` — one file to change.
* Firestore rules only care about `request.auth.uid` and the `admin` claim.
* `.env.example` already reserves the Clerk variables.

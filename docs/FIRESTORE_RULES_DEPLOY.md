# Deploying and verifying the Firestore rules

`firestore.rules` in this repository is the policy. It does nothing until it is
published to the `rabi-hub` project, and until it is published the project runs
whatever was published last, which may be the permissive default.

This document covers what the current rules enforce, how to publish them, and
how to prove from production that they took effect.

---

## 1. What the current rules enforce

| Collection | Who can read | Who can write |
| --- | --- | --- |
| `users/{uid}` | that member, and admins | admins; a member may only edit their own record under the conditions below |
| `settings/customPlans` | anyone (the signup page needs the plan list) | admins |
| `settings/{other}` | admins | admins |
| `announcements` | any signed-in member | admins |
| `testimonials` | anyone, once approved | the author creates a pending draft; admins decide |

### Member self-update, in plain terms

A member may change their name, phone, location and plans. They may **not**
change their email, their status, their recorded payments or their WhatsApp
group link, and the status must be identical before and after the write.

Identity fields are locked once a decision exists:

```
ghanaCardNumber, ghanaCardValid, ghanaCardFront, ghanaCardBack,
passportPhoto, faceScanVideo, ghanaCardOcrResult, gpsLat, gpsLng, gpsAddress
```

Those may only be written while `status == 'pending'`. This closes the identity
swap: an approved member can no longer replace the card photos, the selfie or the
card number that the approval was based on. The same freeze applies after a
rejection.

### Creating a profile

A new profile must be created by its own account, for its own verified email
address, always with `status: 'pending'`. These admin and server fields must be
absent or empty at creation, so a forged record cannot arrive pre-paid or
pre-hidden:

- `contributions` (empty list or absent)
- `whatsappLink` (empty string or absent)
- `adminAlertAt`
- `decisionEmailAt`

### Resubmitting after a rejection

The member messages Rabi on WhatsApp, she opens the member in the admin panel and
taps **Reset to pending**. That single admin write reopens the KYC fields. This is
the intended path, and the rejection email says so in as many words.

---

## 2. Publish the rules

### Option A: automatic, from GitHub (recommended, one-time setup)

1. Generate a CI token on a machine that can reach Google:

   ```
   npx --yes firebase-tools@13 login:ci
   ```

2. Add the printed token to the repository as a secret named `FIREBASE_TOKEN`
   (Settings, Secrets and variables, Actions, New repository secret).

3. The `Firestore rules` workflow now deploys `firestore.rules` on every push to
   `main` that touches it. You can also run it by hand from the Actions tab.

Without the secret the workflow does not fail, it posts a warning. That warning
means the rules were **not** deployed.

### Option B: from a laptop

Signed in to the Firebase CLI as an account that owns `rabi-hub`:

```bash
npm run rules:deploy
```

### Option C: the console

Firebase console, Firestore Database, Rules, paste the contents of
`firestore.rules`, Publish. This works but has no history and no review, so use it
only if the first two are unavailable.

---

## 3. Prove it worked

The repository cannot prove the deployed state, and neither can a green build.
Two checks, in order.

### The probe route (no credentials)

Sign in to the deployed site as the owner and open:

```
/api/security/rules-probe
```

It asks the live database two questions with **no credentials at all**, exactly
as a stranger would:

- can an anonymous caller list `users`? It must be denied.
- can an anonymous caller read `settings/customPlans`? It must be allowed,
  because the signup page depends on it.

The response says one of:

| `verdict` | Meaning |
| --- | --- |
| `locked` | Members are protected. This is the state you want. |
| `exposed` | Anonymous callers can list members. Deploy the rules now. |
| `unknown` | The probe could not reach Google. Run it again, or check by hand. |

An `exposed` verdict returns HTTP 409 on purpose, so it cannot be mistaken for a
success.

### By hand, from a terminal

```bash
curl -i "https://firestore.googleapis.com/v1/projects/rabi-hub/databases/(default)/documents/users?pageSize=1"
```

`403` means denied, which is correct. `200` with documents means the database is
still public.

---

## 4. If something breaks after deploying

Permission denied on a member action almost always means a field was written that
the rules no longer allow. Read the failing write in the browser console, compare
it with the allowlist in `firestore.rules`, and decide which is wrong.

To roll a change back, revert `firestore.rules` on `main` and let the workflow
deploy again, or paste the previous version in the console. Rules changes are
versioned in the console, so the last working version is always retrievable.

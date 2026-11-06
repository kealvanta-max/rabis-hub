# Firebase & Cloudinary setup (required for a fully working site)

The site now builds and renders **without** any environment variables, but sign-in,
registration, dashboards and the admin panel only work once Firebase (and Cloudinary
for document uploads) are configured.

---

## 1. Environment variables

Copy `.env.example` to `.env.local` (local) or paste the same keys into
**Vercel → Project → Settings → Environment Variables**, then redeploy.

| Variable | Where to find it | Required |
| :--- | :--- | :--- |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Firebase → Project settings → Your apps → Web app config | ✅ |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | same | ✅ |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | same | ✅ |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | same | ✅ |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | same | ✅ |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | same | ✅ |
| `NEXT_PUBLIC_ADMIN_EMAIL` | comma separated admin emails | recommended |
| `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` | Cloudinary dashboard | ✅ for uploads |
| `RESEND_API_KEY` / `EMAIL_USER` + `EMAIL_PASSWORD` | email provider | optional |
| `FIREBASE_SERVICE_ACCOUNT_KEY` | Firebase → Service accounts → generate key | only for `npm run admin:setup` |

> If `NEXT_PUBLIC_FIREBASE_*` is missing the app shows an amber "Firebase is not
> configured" notice on `/auth` instead of a blank screen, and the console warns once.

---

## 2. Enable Email/Password sign-in

Firebase Console → **Authentication → Sign-in method → Email/Password → Enable**.

Add your production domain under **Authentication → Settings → Authorized domains**
(`rabissavinghub.com`, `www.rabissavinghub.com`, your Vercel preview domain).

---

## 3. Firestore

Create the database (production mode). The rules below are also committed as
`firestore.rules`, so you can either paste them into **Firestore Database → Rules**
or deploy them:

```bash
npx firebase-tools deploy --only firestore:rules --project <your-project-id>
```

They keep every collection owner-scoped while letting admins manage everything.

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    function signedIn() {
      return request.auth != null;
    }

    function isAdmin() {
      return signedIn() && (
        request.auth.token.admin == true ||
        request.auth.token.email in ['rabisavinghub@gmail.com', 'moneyace914@gmail.com']
      );
    }

    function isSelf(uid) {
      return signedIn() && request.auth.uid == uid;
    }

    match /users/{uid} {
      allow read: if isSelf(uid) || isAdmin();

      allow create: if isSelf(uid)
        && request.resource.data.email.lower() == request.auth.token.email.lower()
        && request.resource.data.status == 'pending';

      allow update: if isAdmin() || (
        isSelf(uid)
        // a member can never change their own approval status or WhatsApp link
        && request.resource.data.status == resource.data.status
        && request.resource.data.diff(resource.data).affectedKeys().hasOnly([
          'name', 'phone', 'location', 'plan', 'plans',
          'ghanaCardNumber', 'ghanaCardValid', 'ghanaCardFront', 'ghanaCardBack',
          'passportPhoto', 'faceScanVideo', 'ghanaCardOcrResult',
          'gpsLat', 'gpsLng', 'gpsAddress'
        ])
      );

      allow delete: if isAdmin();
    }

    // Custom plans are read by the public landing page and signup form.
    match /settings/customPlans {
      allow read: if true;
      allow write: if isAdmin();
    }

    // WhatsApp group links stay admin-only.
    match /settings/{docId} {
      allow read: if isAdmin();
      allow write: if isAdmin();
    }

    match /announcements/{id} {
      allow read: if signedIn();
      allow write: if isAdmin();
    }

    match /testimonials/{id} {
      allow read: if resource.data.status == 'approved' || isAdmin();
      allow create: if signedIn()
        && request.resource.data.userId == request.auth.uid
        && request.resource.data.status == 'pending';
      allow update, delete: if isAdmin();
    }

    match /susu-rounds/{id} {
      allow read: if signedIn();

      // Members can flag their own slot as "I have paid" (selfReported).
      // Everything else (positions, confirmations, round numbers) is admin-only.
      allow update: if isAdmin() || (
        signedIn()
        && request.auth.uid in resource.data.memberIds
        && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['slots'])
      );

      allow create, delete: if isAdmin();
    }

    match /payment-reports/{id} {
      allow read: if isAdmin() || (signedIn() && resource.data.userId == request.auth.uid);
      allow create: if signedIn()
        && request.resource.data.userId == request.auth.uid
        && request.resource.data.confirmed == false;
      allow update, delete: if isAdmin();
    }
  }
}
```

**Indexes:** every query in the app now uses key lookups or a single equality
filter, so **no composite indexes are required**. (Previous versions failed on
`where("status","==",…") + orderBy("createdAt")` unless an index had been created.)

---

## 4. Grant admin access (custom claims)

1. Generate a service account key: **Project settings → Service accounts → Generate new private key**.
2. Put the JSON on a single line in `.env.local` as `FIREBASE_SERVICE_ACCOUNT_KEY`.
3. Run:

```bash
npm run admin:setup
```

The script sets `{ admin: true }` on `rabisavinghub@gmail.com` and
`moneyace914@gmail.com` (edit `scripts/admin-setup.mjs` to add more). Users must sign
out and back in for the claim to be picked up.

`NEXT_PUBLIC_ADMIN_EMAIL` also acts as a fallback so the owner can reach the panel
even before claims are applied.

**There are two separate doors, and they fail differently.** The panel's own gate
reads `NEXT_PUBLIC_ADMIN_EMAIL` in the browser, so it opens without any server
work. Firestore is the strict one: `firestore.rules` accepts an owner address only
when Firebase reports that address as verified, otherwise only the `admin` claim
counts. A brand new owner account is unverified, because signup never sends the
confirmation mail, so the panel would open and then every read would be refused.

Fix it from a phone, no terminal needed: open `/admin`, tap **Send verification
email**, open the link, sign out and back in. The banner disappears once Firebase
reports the address as verified. The claim route above is the fallback for an
owner address whose mailbox is out of reach.

---

## 5. Cloudinary (KYC uploads)

1. Create a Cloudinary account and copy the **cloud name** into
   `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME`.
2. **Settings → Upload → Upload presets → Add preset**:
   - Name: `rabi-user-docs`
   - Signing mode: **Unsigned**
   - (Recommended) Limit formats to `jpg,png,webp,pdf` and max file size 10 MB.
3. Restrict delivery of KYC assets if required (Settings → Security).

Without this preset, the registration form will report
"Cloudinary rejected the upload preset…".

---

## 6. Email notifications (optional)

The `/api/email` route tries providers in this order:

1. **Resend** — set `RESEND_API_KEY` and `EMAIL_FROM` (domain must be verified in Resend).
2. **Gmail SMTP** — set `EMAIL_USER` + `EMAIL_PASSWORD` (Gmail *App Password*).
3. **Brevo SMTP** — set `BACKUP_EMAIL_USER` + `BACKUP_EMAIL_PASSWORD`.

If none are configured the route returns `503` and the app keeps working
(notifications are best-effort and never block signup/approval).

---

## 7. Deployment checklist

- [ ] All `NEXT_PUBLIC_FIREBASE_*` set on Vercel (production **and** preview)
- [ ] `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` set and unsigned preset `rabi-user-docs` created
- [ ] Firestore rules published
- [ ] Email/Password provider enabled + authorized domains added
- [ ] Admin custom claims applied (`npm run admin:setup`)
- [ ] At least one WhatsApp group link saved in Admin → WhatsApp Links
- [ ] Signed in as admin once and approved one test account end-to-end
- [ ] Optional: tighten `frame-ancestors` for `/admin` in `next.config.mjs` to your own domain once previews are no longer needed

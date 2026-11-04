# Security policy

Rabi's Saving Hub handles identity documents, selfies and payment references. Please
treat anything in this repository as sensitive.

## Reporting a vulnerability

Do **not** open a public issue. Email **rabisavinghub@gmail.com** (or message the owner
on WhatsApp) with:

- a description of the issue and its impact,
- steps to reproduce (a proof-of-concept if possible),
- the affected URL/commit.

You will get an acknowledgement within 48 hours.

## Operational security checklist

- [ ] Firebase API keys restricted to your domains (Google Cloud → API key restrictions)
- [ ] Firestore rules published from `firestore.rules` (never "test mode")
- [ ] Cloudinary upload preset is **unsigned** and restricted by format/size
- [ ] Admin access granted only through Firebase custom claims (`npm run admin:setup`)
- [ ] Email provider credentials stored in Vercel env vars, never committed
- [ ] Service account key never shipped to the browser (`FIREBASE_SERVICE_ACCOUNT_KEY` is server-only)
- [ ] Members cannot read other members' documents (enforced by `firestore.rules`)
- [ ] 2FA enabled on the GitHub, Vercel, Firebase and Cloudinary accounts

## What is stored where

| Data | Location | Access |
| :--- | :--- | :--- |
| Ghana Card + selfie images, liveness clips | Cloudinary (`res.cloudinary.com`) | public URLs containing unguessable ids; restrict via Cloudinary settings if required |
| Member profile, GPS, status | Firestore `users/{uid}` | member + admin only |
| Payment reports | Firestore `payment-reports` | author + admin |
| Susu rounds | Firestore `susu-rounds` | signed-in members (slots only), admin writes |
| Custom plans, WhatsApp links | Firestore `settings` | custom plans public, WhatsApp links admin-only |

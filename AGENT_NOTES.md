# Rabi's Saving Hub — Agent Notes (V3 — beta stabilisation)

## Project overview
Next.js 14 App Router + Firebase (Auth + Firestore) community savings (Susu) platform for Ghana.
Client-side rendering for dashboards; Firebase custom claims for admin; Cloudinary for KYC uploads;
MediaPipe for liveness/face checks; Tesseract.js for Ghana Card OCR.

## Current state (V3)
- ✅ `npm run lint`, `npx tsc --noEmit`, `npm run build` all pass.
- ✅ App renders without any env vars (clear "not configured" state instead of a white screen).
- ✅ Fonts self-hosted via `@fontsource` — no Google Fonts request at build or runtime.
- ✅ Registration flow (documents → face scan → GPS → captcha/terms) works end to end.
- ✅ Susu rounds: create → member reports payment → admin confirms → advance → payout confirmation.
- ✅ Dynamic (admin-created) plans show on the landing page, auth picker and payments.
- ⚠️ Needs env configuration to actually talk to Firebase/Cloudinary: see `docs/FIREBASE_SETUP.md`.
- ⚠️ Firestore rules must be published from `docs/FIREBASE_SETUP.md` (repo does not deploy them).

## Important implementation notes
- `src/lib/firebase.ts` exports `isFirebaseConfigured`; guard any new Firebase calls with it.
- All Firestore dates must go through `toDate()/formatDate()` from `src/lib/utils.ts`
  (mixing `Date` and `Timestamp` used to crash payment pages).
- Avoid `where(...) + orderBy(...)` on different fields — no composite indexes are
  provisioned. Sort client-side instead.
- Plans: use `getPlanLabel/getPlanAmount/getPlanSlots` from `src/lib/plans-data.ts`
  so custom and achiever plans resolve correctly.
- Payment reporting updates the member's own slot; rules only allow `slots` changes for members.
- The liveness component degrades to a manual 3-second recording when MediaPipe fails.

## Known follow-ups
1. Move payment reporting behind an API route (Admin SDK) so members never write rounds.
2. Host the welcome voice-over in `/public/audio` (current Dropbox link is signed/expiring).
3. Implement or hide the "AI Assistant — coming soon" button.
4. Add Playwright tests for the full signup → approval → payment → cashout journey.

## Last updated
November 2026.

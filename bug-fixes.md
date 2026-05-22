# Bug Fixes

## Overview
This plan outlines the fixes for 4 critical issues in the application: Face scan type error, Auth bypass, Hardcoded dashboard payments, and Mocked Admin payment confirmations. 

## Project Type
WEB

## Success Criteria
- Liveness check completes and successfully uploads video.
- Users must complete math verification and agree to terms in Step 5 before registering.
- User payments correctly look up plan amounts instead of reporting `0`.
- Admins can successfully confirm payments and `susu-rounds` slots update accurately.

## Tech Stack
Next.js, TypeScript, Firebase (Auth/Firestore), Tailwind CSS

## File Structure
- `src/components/ui/face-scan.tsx`
- `src/app/auth/page.tsx`
- `src/app/dashboard/payments/page.tsx`
- `src/app/admin/payments/page.tsx`
- `src/lib/payment-tracker.ts`

## Task Breakdown
1. **[ ] Fix face-scan.tsx**: Convert WebM video Blob to a `File` object before uploading to Cloudinary (Agent: frontend-specialist, Skill: typescript-expert). INPUT: Base64 data logic -> OUTPUT: File object -> VERIFY: No `npx tsc` errors.
2. **[ ] Fix auth/page.tsx**: Remove early submit button, bind `termsAccepted`, enforce step 5 (Agent: frontend-specialist). INPUT: Step 4 Bypass -> OUTPUT: Secure multi-step form -> VERIFY: Manual form progression requires terms agreement.
3. **[ ] Fix dashboard payments**: Dynamically fetch custom plans and standard plans to calculate `amount` rather than using `0` (Agent: backend-specialist). INPUT: Hardcoded 0 -> OUTPUT: Actual GH₵ value -> VERIFY: Firestore payload shows correct amount.
4. **[ ] Fix admin confirmations**: Pass the real `reportId` instead of a mocked string, and update `confirmPayment` to support force-confirmations (Agent: backend-specialist). INPUT: Mocked string -> OUTPUT: Dynamic ID lookup -> VERIFY: Confirmation updates slot correctly.

## ✅ PHASE X Verification
- Lint: [ ] Pending
- Security: [ ] Pending
- Build: [ ] Pending

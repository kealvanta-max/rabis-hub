# Rabi's Saving Hub — Agent Notes

## Project Overview
Next.js 14 community savings (Susu) platform for Ghana. Users register, join savings plans, track payments, and receive payouts.

## Repository
- GitHub: kealvanta-max/rabis-hub (branch: main)
- Vercel: https://rabis-hub.vercel.app
- Vercel Project ID: prj_k7RKshtv5d8Z94zGBHoV3ZmkvUFu
- Vercel Team ID: team_LwtwMX2vs70FeKJlEA2sUrCS

## Tech Stack
- Next.js 14.2.3 (App Router)
- TypeScript
- Firebase (Auth + Firestore)
- Tailwind CSS
- Framer Motion
- Nodemailer (email)
- MediaPipe (face detection)
- Tesseract.js (OCR for Ghana Card)
- Cloudinary (image storage)

## Key Files
- src/app/layout.tsx — Root layout, includes FloatingWhatsApp, AIAssistantButton, AudioPlayer
- src/app/api/email/route.ts — Dual-provider email (Gmail SMTP primary, Brevo SMTP backup)
- src/lib/notifications.ts — Email notification helpers (uses /api/email endpoint)
- src/lib/payment-tracker.ts — DO NOT DELETE. Payment tracking logic.
- src/app/admin/payments/page.tsx — DO NOT MODIFY unless build error.
- src/components/ui/ai-assistant-button.tsx — Floating AI assistant button (Coming Soon, powered by Google Gemini in future)
- src/lib/plans-data.ts — All savings plan data

## Environment Variables Required in Vercel
Set these in Vercel Dashboard > rabis-hub > Settings > Environment Variables > Production:

EMAIL_USER = rabisavinghub@gmail.com
EMAIL_PASSWORD = [Gmail App Password — user must generate from Google Account > Security > App Passwords]
BACKUP_EMAIL_USER = [Brevo SMTP login email]
BACKUP_EMAIL_PASSWORD = [Brevo SMTP master password]
NEXT_PUBLIC_FIREBASE_API_KEY = [from Firebase console]
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN = [from Firebase console]
NEXT_PUBLIC_FIREBASE_PROJECT_ID = [from Firebase console]
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET = [from Firebase console]
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID = [from Firebase console]
NEXT_PUBLIC_FIREBASE_APP_ID = [from Firebase console]
NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME = [from Cloudinary console]
CLOUDINARY_API_KEY = [from Cloudinary console]
CLOUDINARY_API_SECRET = [from Cloudinary console]

## Email System Architecture
Primary: Gmail SMTP via nodemailer (smtp.gmail.com:587)
Backup: Brevo SMTP via nodemailer (smtp-relay.brevo.com:587)
Logic: Try Gmail first. If it throws, catch and try Brevo. Both must fail before returning error.

## AI Assistant
Floating button bottom-right on all pages. Shows "Coming Soon" modal.
Future provider: Google Gemini API (https://ai.google.dev/)
File: src/components/ui/ai-assistant-button.tsx

## Build Status
npm run build passes with zero errors.
Warning about @mediapipe/tasks-vision "Critical dependency" is acceptable — it is a known mediapipe issue and does not affect functionality.

## Deployment
Deployments are triggered automatically by pushing to the main branch on GitHub.
Vercel is connected to the GitHub repo via Git integration.

## Important Constraints
- NEVER delete src/lib/payment-tracker.ts
- NEVER modify src/app/admin/payments/page.tsx unless it causes a build error
- The guide page uses anchor tags (not Button component) for CTAs — this is intentional
- plans-client.tsx does not exist as a separate file — plans are in src/components/home/plans.tsx
- resend package is still in package.json but is NOT used in the email route (nodemailer is used instead)
- If resend causes build errors in the future, remove it: npm uninstall resend @react-email/components

## Last Updated
May 25, 2026 — Dual-provider email system implemented, AI assistant placeholder added, build verified passing.

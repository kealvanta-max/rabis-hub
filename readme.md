<div align="center">
  <img src="public/brand_logo.png" alt="Rabi's Saving Hub Logo" width="200" />
  <br/>
  <h1>Rabi's Saving Hub</h1>
  <p><strong>Ghana's Premium Online Susu Experience</strong></p>
  <p>Digitizing community savings with strong verification, real-time tracking, and an "Emerald God Mode" UI.</p>
</div>

---

## 📖 Overview

Rabi's Saving Hub modernizes the traditional Ghanaian *"Susu"* system. Members choose a savings plan,
register with identity documents, liveness verification and GPS capture, then get routed to their
dedicated Susu WhatsApp group once an admin approves them.

Admins get a secured panel for approving members, publishing announcements, managing plan-specific
Susu rounds, confirming payments and exporting data.

---

## 🚀 Key Features

*   **Emerald UI "God Mode" Design** – fluid gradients (`#020c06` → `#10B981`), glassmorphic layouts, micro-animations.
*   **Verified Registration** – Ghana Card (front/back) uploads, OCR pattern check, MediaPipe face check, smile/blink liveness recording, GPS capture and a math captcha.
*   **Role-Based Access Control** – Firebase Custom Claims (`admin: true`) plus an env fallback allowlist.
*   **Susu Round Management** – plan-specific rounds, slot rotation, payment reports, admin confirmations, payout confirmation, CSV export.
*   **Dynamic Plans & Reviews** – plans created in the admin panel appear on the live site; member reviews appear after approval.
*   **Global Announcements** – pushed from the admin panel to member dashboards.
*   **Live User Map & Data Export** – Leaflet map of member locations plus JSON/CSV exports.
*   **Internationalization (i18n)** – English, Twi, French, Hausa, Ga and Eʋegbe.
*   **Self-hosted fonts** – no runtime dependency on Google Fonts.

---

## 🛠️ Tech Stack

| Domain | Technology | Description |
| :--- | :--- | :--- |
| **Framework** | [Next.js 14](https://nextjs.org/) | App Router, server/client components |
| **Styling** | [Tailwind CSS 3.4](https://tailwindcss.com/) | Utility-first CSS + custom theme tokens |
| **Backend** | [Firebase](https://firebase.google.com/) | Auth, Firestore, Custom Claims (Admin SDK scripts) |
| **Animations** | [Framer Motion](https://www.framer.com/motion/) | Entrance, stagger and micro-interactions |
| **Media** | [MediaPipe](https://developers.google.com/mediapipe), [Tesseract.js](https://tesseract.projectnaptha.com/), [Cloudinary](https://cloudinary.com/) | Liveness detection, Ghana Card OCR, document storage |
| **Icons** | [Lucide React](https://lucide.dev/) | SVG icon set |
| **Language** | [TypeScript](https://www.typescriptlang.org/) | Strict type-safety |

---

## 📂 Project Structure

```text
rabis-hub/
├── src/
│   ├── app/                # Next.js App Router
│   │   ├── admin/          # Secured admin panel + Susu payments
│   │   ├── auth/           # Login/registration flow (5 steps)
│   │   ├── dashboard/      # Member dashboard + payment tracking
│   │   └── guide|terms|privacy
│   ├── components/         # admin / home / layout / ui components
│   ├── context/            # AuthContext, i18nContext
│   ├── hooks/              # useGeolocation, useCustomPlans, useToast
│   └── lib/                # Firebase, plans, payments, KYC helpers
├── docs/FIREBASE_SETUP.md  # ⭐ required setup (env, rules, Cloudinary, email)
├── public/                 # Static assets
└── tailwind.config.ts
```

---

## ⚙️ Getting Started (Local Development)

### 1. Prerequisites
Node.js 18+ and npm.

```bash
node -v && npm -v
```

### 2. Clone and install

```bash
git clone https://github.com/kealvanta-max/rabis-hub.git
cd rabis-hub
npm install
```

### 3. Environment variables

```bash
cp .env.example .env.local
```

Fill in the Firebase keys at minimum. The full list (Cloudinary, email providers,
service account) plus the Firestore rules are documented in
**[docs/FIREBASE_SETUP.md](docs/FIREBASE_SETUP.md)**.

> The app builds and renders even with no variables configured — `/auth` shows a
> "Firebase is not configured" notice instead of crashing.

### 4. Run the dev server

```bash
npm run dev
```

Open `http://localhost:3000`.

### Available scripts

| Script | Purpose |
| :--- | :--- |
| `npm run dev` | Dev server |
| `npm run build` / `npm start` | Production build / serve |
| `npm run lint` | ESLint (`next lint`) |
| `npm run typecheck` | TypeScript, no emit |
| `npm test` | Unit tests (Vitest) |
| `npm run admin:setup` | Grant the `admin` custom claim (needs `FIREBASE_SERVICE_ACCOUNT_KEY`) |
| `npm run env:check` | Verify every env var is present and correctly shaped (names only, never values) |

---

## 🌍 Deployment (Vercel)

1. Push to GitHub and import the repository in Vercel (**Add New Project**).
2. Vercel auto-detects Next.js — keep the default build command.
3. Add **all** environment variables from `.env.example` (Production **and** Preview).
4. Deploy, then add the deployed domain to Firebase **Authentication → Authorized domains**.
5. Publish the Firestore rules:

```bash
npx firebase-tools deploy --only firestore:rules --project <your-project-id>
```

   (or paste `firestore.rules` into the Firebase console — see `docs/FIREBASE_SETUP.md`).

---

## 🔒 Administrative Access

1. Add admin emails to `NEXT_PUBLIC_ADMIN_EMAIL` (comma separated).
2. For the secure path, grant Firebase Custom Claims:

```bash
npm run admin:setup
```

This sets `{ admin: true }` on the accounts listed in `scripts/admin-setup.mjs`.
Admins must sign out and back in after the claim is applied.

Only admin-claim holders (or allowlisted emails) can open `/admin`; everything else
shows an "Admin access required" screen.

---

## 🧪 Quality gates

Every pull request must pass:

```bash
npm run lint && npx tsc --noEmit && npm test && npm run build
```

CodeRabbit AI review is pre-configured in `.coderabbit.yaml` — install the CodeRabbit
GitHub app on the repository to enable automated review on pull requests.

Production handover, runbook and client ownership checklist:
**[docs/PRODUCTION_HANDOVER.md](docs/PRODUCTION_HANDOVER.md)**.

## 🧪 Troubleshooting

| Symptom | Cause / fix |
| :--- | :--- |
| Blank page / console says `auth/invalid-api-key` | `NEXT_PUBLIC_FIREBASE_*` missing → `.env.local` / Vercel env vars, then restart/redeploy |
| "Firebase is not configured" banner on `/auth` | Same as above |
| Upload fails / "Cloudinary rejected the upload preset" | Create the **unsigned** preset `rabi-user-docs`; set `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` |
| Admin panel loops back to the homepage | Account lacks the admin claim → `npm run admin:setup`, sign out/in |
| Dashboard says "We could not load your profile" | Firestore rules blocked the write during signup — publish the rules and re-register |
| Liveness check shows a recording button instead of smile/blink | MediaPipe CDN/WebGPU unavailable — fallback recording is expected; admin reviews manually |
| Payment page shows no rounds | Admin has not started a round for your plan, or you are not approved yet |

---

<div align="center">
  <p><i>Built to scale. Welcome to the new era of Susu.</i></p>
</div>

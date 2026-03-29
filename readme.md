# 🌟 Rabi's Saving Hub

![Rabi's Saving Hub](public/rabi_companion_logo.png)

> **"Ghana's Premium Susu Savings Platform — Save smart, grow together with a community that cares."**

Welcome to the **Awwwards-tier codebase** for Rabi's Saving Hub. This document serves as the master guide for expert developers and AI agents (specifically following the *Aetherius Vanguard Protocol*) tasked with maintaining, scaling, or contributing to this project.

## 🚀 The Vision

Rabi's Saving Hub evolved from a standard fintech concept into a visceral, high-impact web experience. It leverages psychological design triggers, a bespoke "Midnight Blue & Vibrant Gold" palette, transparent glassmorphism, and a meticulously crafted component architecture to deliver unprecedented trust and conversion in the Ghanaian Susu savings sector.

---

## 🛠️ Tech Stack & Architecture

This application is built for absolute performance, SEO dominance, and unparalleled user experience.

- **Framework:** [Next.js 14](https://nextjs.org/) (App Router, Server & Client Components)
- **Styling:** [Tailwind CSS v3](https://tailwindcss.com/) with strategic custom utility classes
- **UI/UX Engineering:** [Framer Motion](https://www.framer.com/motion/) handling visceral layout transitions, micro-interactions, and scroll contexts.
- **Scroll Physics:** Lenis Smooth Scroll integrated globally for fluid navigation.
- **Database & Auth:** [Firebase v10](https://firebase.google.com/) (Firestore & Firebase Auth configured for Email + Google Sign-In)
- **Asset Optimization:** Cloudinary & Next/Image pre-optimization.
- **AI Integration:** Global ElevenLabs A.I. Voice Assistant mounted in the RootLayout.

---

## 🧭 Codebase Topography

For AI Agents and Engineers navigating the repository:

### `/src/app`
- **Root Layout:** Orchestrates global providers (`AuthProvider`, `ToastProvider`, `SmoothScroll`, `AudioPlayer`, `FloatingWhatsApp`).
- **Private Routes:** User Dashboard (`/dashboard`) and strictly gated Admin Portal (`/admin`).

### `/src/components`
- **`/ui`**: Core atomic components (Buttons, Inputs, Modals, Apple-style UI elements, and the custom global Audio Player).
- **`/home`**: Landing page sections (Hero, Plans Bento Grid, Testimonials, CTA, Trust).
- **`/layout`**: Structural components (Navigation, Footer, WhatsApp integration).

### `/src/lib`
- **`plans-data.ts`**: The central nervous system for Subscription configuration. *Never hardcode prices in UI components; always reference this module.*
- **`firebase.ts`**: Client-side initialization.
- **`firebase-admin.ts`**: Secure server-side execution handlers.
- **`types.ts`**: Strict TypeScript interfaces protecting the data layer.

### `/src/context`
- **`auth-context.tsx`**: Centralized user state and permission handling (User vs. Admin roles).

---

## 🎯 The Awwwards Protocol (Design Guidelines)

If you are modifying the UI, you **MUST** adhere to these immutable laws:

1. **The Purple/Violet Ban**: Under no circumstances should purple or violet hues be introduced to this project.
2. **Color Palette Compliance**: 
   - *Backgrounds*: Deep Navy (`#0A1628`), Midnight Blue (`#0F2039`)
   - *Accents*: Vibrant Gold (`#D4AF37`), Neon Emerald (`#10B981`)
   - *Text*: Titanium White (`#F8FAFC`), Slate Gray (`#94A3B8`)
3. **Typography Rule**: Readability is paramount. `DM Serif Display` is reserved exclusively for high-impact Headings. `Space Grotesk` or `Inter` handles UI copy and body text.
4. **Motion Restraint**: Animations must be purposeful. Bounce physics are banned. Prefer `ease-in-out` opacity fades, slight Y-axis translations (`y: 20`), and subtle scale interactions (`scale: 1.05`).
5. **Layout Discipline**: Use the asymmetric Bento Grid over constrained carousels whenever data visibility overrides discovery. 

---

## 🔑 Admin Portal Capabilities

The `/admin` route is fortified behind Role-Based Access Control (RBAC). 
Features available to Administrators:
- **Comprehensive User Export**: One-click generation of JSON or CSV dossiers containing all user metadata.
- **Image Extraction**: Single-user JSON exports include embedded profile imagery.
- **Global Announcements**: Native broadcast creation distributed across all user dashboards.
- **Approval Engine**: Accept/Reject workflows for Testimonials and Accounts.

---

## ⚡ Setup & Development

### 1. Environment Configuration
Clone `.env.example` into `.env.local` and populate the Firebase and Cloudinary credentials.

\`\`\`bash
cp .env.example .env.local
\`\`\`

### 2. Initialization
Ensure you are using `npm` (Node v18+).

\`\`\`bash
npm install
npm run dev
\`\`\`

### 3. Production Build
Verify the architecture and optimize assets before deployment. You must run the priority checklist using the `checklist.py` agent script if available, or manually verify:

\`\`\`bash
npm run build
npm start
\`\`\`

---

## 🛡️ Security & Deployment

- **Firestore Rules**: Lock down read/writes. Users can only read/write their own UID documents. Admins override via custom claims.
- **Vercel**: The target host. Ensure `NEXT_PUBLIC_APP_URL` is set in the Vercel dashboard.

> *"We don't just write code; we architect trust." - Aetherius Vanguard*
# 🏗️ PLAN: Rabi's Saving Hub — Next.js Migration + Feature Build

> **Status:** AWAITING APPROVAL
> **Created:** 2026-03-19
> **Stack:** Next.js 14 + TypeScript + Tailwind CSS + Firebase + Cloudinary + Vercel
> **Source:** Migrating from `index.html` (780-line SPA) to modular Next.js architecture

---

## 📋 Decision Summary (User Answers)

| Question | Answer |
|----------|--------|
| GPS Location | **Both A+B**: Auto-detect GPS at registration + Map view in admin. **Mandatory** — block registration if denied. |
| Testimonials | **Both**: Static (admin adds) + Dynamic (users submit, admin approves) |
| Contact Info | **Placeholders** for now |
| Floating WhatsApp | **Yes** — bottom-right corner on every page |
| Architecture | **Migrate to Next.js** from single-file index.html |

---

## 🏛️ Architecture Overview

```
src/
├── app/
│   ├── layout.tsx                  # Root layout (fonts, providers, floating WA)
│   ├── page.tsx                    # Home page (hero, plans, calc, trust, testimonials, contact, CTA)
│   ├── auth/
│   │   └── page.tsx                # Registration + Login (3-step form with GPS)
│   ├── dashboard/
│   │   └── page.tsx                # User dashboard (status, plan, profile, WA link)
│   └── admin/
│       └── page.tsx                # Admin panel (user review, map, testimonials, WA links)
├── components/
│   ├── layout/
│   │   ├── navigation.tsx          # Navbar (auth-aware)
│   │   ├── footer.tsx              # Footer with quick links + contact
│   │   ├── floating-whatsapp.tsx   # Floating WA chat button
│   │   ├── loading-screen.tsx      # Splash/loading screen
│   │   └── toast-provider.tsx      # Toast notification system
│   ├── home/
│   │   ├── hero.tsx                # Hero section
│   │   ├── partners-bar.tsx        # Partners/trust logos
│   │   ├── plans.tsx               # Susu plans display + tabs
│   │   ├── calculator.tsx          # Susu calculator
│   │   ├── trust.tsx               # "Why Choose Us" features
│   │   ├── testimonials.tsx        # Testimonial carousel/grid
│   │   ├── contact-section.tsx     # Contact info + optional form
│   │   └── cta-banner.tsx          # Call-to-action banner
│   ├── auth/
│   │   ├── signup-form.tsx         # 3-step registration form
│   │   ├── signin-form.tsx         # Login form
│   │   ├── step-personal.tsx       # Step 1: Personal details
│   │   ├── step-documents.tsx      # Step 2: Ghana Card + Passport upload
│   │   ├── step-gps.tsx            # Step 2.5: GPS location capture (NEW - MANDATORY)
│   │   ├── step-verification.tsx   # Step 3: Terms + CAPTCHA
│   │   └── gps-detector.tsx        # GPS detection component with map preview
│   ├── dashboard/
│   │   ├── status-card.tsx         # Account status card
│   │   ├── plan-card.tsx           # Active plan card
│   │   ├── savings-card.tsx        # Total savings card
│   │   ├── community-hub.tsx       # WhatsApp community card
│   │   ├── profile-card.tsx        # Profile info card
│   │   └── submit-review.tsx       # Submit testimonial form (NEW)
│   ├── admin/
│   │   ├── stats-bar.tsx           # Stats cards (total, pending, approved, rejected)
│   │   ├── user-card.tsx           # Individual user review card
│   │   ├── user-filters.tsx        # Filter/search bar
│   │   ├── user-map.tsx            # Map view of all users (NEW)
│   │   ├── wa-manager.tsx          # WhatsApp link manager table
│   │   ├── testimonial-manager.tsx # Admin testimonial CRUD (NEW)
│   │   └── data-export.tsx         # CSV/JSON export buttons
│   └── ui/
│       ├── button.tsx              # Reusable button component
│       ├── input.tsx               # Reusable input component
│       ├── modal.tsx               # Modal overlay component
│       ├── badge.tsx               # Status badge component
│       ├── card.tsx                # Card wrapper component
│       └── image-upload.tsx        # Cloudinary upload component
├── lib/
│   ├── firebase.ts                 # Firebase config (EXISTS)
│   ├── cloudinary.ts               # Cloudinary upload (EXISTS)
│   ├── utils.ts                    # Utility functions (EXISTS)
│   ├── plans-data.ts               # Plans data + labels (EXTRACT from index.html)
│   ├── geolocation.ts              # GPS detection + reverse geocoding (NEW)
│   └── types.ts                    # TypeScript interfaces (NEW)
├── hooks/
│   ├── use-auth.ts                 # Firebase auth state hook
│   ├── use-firestore.ts            # Firestore CRUD hooks
│   ├── use-geolocation.ts          # GPS detection hook (NEW)
│   └── use-toast.ts                # Toast notification hook
└── context/
    └── auth-context.tsx            # Auth provider (user + isAdmin state)
```

---

## 📦 Phases

### Phase 1: Foundation (Estimated: ~45 min)
> Core infrastructure that everything else depends on

| # | Task | File(s) | Priority |
|---|------|---------|----------|
| 1.1 | Create TypeScript types/interfaces | `lib/types.ts` | 🔴 |
| 1.2 | Extract plans data to module | `lib/plans-data.ts` | 🔴 |
| 1.3 | Create Auth context provider | `context/auth-context.tsx` | 🔴 |
| 1.4 | Create hooks (useAuth, useFirestore, useToast) | `hooks/*.ts` | 🔴 |
| 1.5 | Create GPS detection hook + utility | `hooks/use-geolocation.ts`, `lib/geolocation.ts` | 🔴 |
| 1.6 | Create base UI components (Button, Input, Modal, Badge, Card) | `components/ui/*.tsx` | 🔴 |
| 1.7 | Create Toast provider + component | `components/layout/toast-provider.tsx` | 🟡 |
| 1.8 | Create Cloudinary upload component | `components/ui/image-upload.tsx` | 🔴 |
| 1.9 | Update root layout with providers | `app/layout.tsx` | 🔴 |

### Phase 2: Home Page (Estimated: ~40 min)
> Public-facing landing page with ALL new sections

| # | Task | File(s) | Priority |
|---|------|---------|----------|
| 2.1 | Build Navigation (auth-aware, responsive) | `components/layout/navigation.tsx` | 🔴 |
| 2.2 | Build Hero Section | `components/home/hero.tsx` | 🔴 |
| 2.3 | Build Partners Bar | `components/home/partners-bar.tsx` | 🟡 |
| 2.4 | Build Plans Section (tabs + cards) | `components/home/plans.tsx` | 🔴 |
| 2.5 | Build Calculator | `components/home/calculator.tsx` | 🔴 |
| 2.6 | Build Trust Section | `components/home/trust.tsx` | 🔴 |
| 2.7 | **Build Testimonials Section** (NEW) | `components/home/testimonials.tsx` | 🔴 |
| 2.8 | **Build Contact Section** (NEW) | `components/home/contact-section.tsx` | 🔴 |
| 2.9 | Build CTA Banner | `components/home/cta-banner.tsx` | 🟡 |
| 2.10 | Build Footer with quick links | `components/layout/footer.tsx` | 🔴 |
| 2.11 | **Build Floating WhatsApp** (NEW) | `components/layout/floating-whatsapp.tsx` | 🔴 |
| 2.12 | Build Loading Screen | `components/layout/loading-screen.tsx` | 🟡 |
| 2.13 | Assemble home page | `app/page.tsx` | 🔴 |

### Phase 3: Auth System (Estimated: ~35 min)
> Registration with GPS + Document upload + Login

| # | Task | File(s) | Priority |
|---|------|---------|----------|
| 3.1 | Build Step 1: Personal Details | `components/auth/step-personal.tsx` | 🔴 |
| 3.2 | Build Step 2: Document Upload (Ghana Card + Passport) | `components/auth/step-documents.tsx` | 🔴 |
| 3.3 | **Build Step 2.5: GPS Location** (NEW - MANDATORY) | `components/auth/step-gps.tsx` | 🔴 |
| 3.4 | Build GPS Detector component (map preview) | `components/auth/gps-detector.tsx` | 🔴 |
| 3.5 | Build Step 3: Terms + CAPTCHA + Submit | `components/auth/step-verification.tsx` | 🔴 |
| 3.6 | Build Signup Form (step orchestrator) | `components/auth/signup-form.tsx` | 🔴 |
| 3.7 | Build Signin Form | `components/auth/signin-form.tsx` | 🔴 |
| 3.8 | Assemble auth page | `app/auth/page.tsx` | 🔴 |

### Phase 4: Dashboard (Estimated: ~25 min)
> User dashboard with review submission capability

| # | Task | File(s) | Priority |
|---|------|---------|----------|
| 4.1 | Build Status Card | `components/dashboard/status-card.tsx` | 🔴 |
| 4.2 | Build Plan Card | `components/dashboard/plan-card.tsx` | 🔴 |
| 4.3 | Build Savings Card | `components/dashboard/savings-card.tsx` | 🟡 |
| 4.4 | Build Community Hub (WhatsApp link) | `components/dashboard/community-hub.tsx` | 🔴 |
| 4.5 | Build Profile Card | `components/dashboard/profile-card.tsx` | 🔴 |
| 4.6 | **Build Submit Review form** (NEW) | `components/dashboard/submit-review.tsx` | 🔴 |
| 4.7 | Assemble dashboard page | `app/dashboard/page.tsx` | 🔴 |

### Phase 5: Admin Panel (Estimated: ~35 min)
> Full admin with map view + testimonial management

| # | Task | File(s) | Priority |
|---|------|---------|----------|
| 5.1 | Build Stats Bar | `components/admin/stats-bar.tsx` | 🔴 |
| 5.2 | Build User Card (approve/reject/reset) | `components/admin/user-card.tsx` | 🔴 |
| 5.3 | Build User Filters + Search | `components/admin/user-filters.tsx` | 🔴 |
| 5.4 | **Build User Map View** (NEW) | `components/admin/user-map.tsx` | 🔴 |
| 5.5 | Build WhatsApp Manager | `components/admin/wa-manager.tsx` | 🔴 |
| 5.6 | **Build Testimonial Manager** (NEW) | `components/admin/testimonial-manager.tsx` | 🔴 |
| 5.7 | Build Data Export | `components/admin/data-export.tsx` | 🟡 |
| 5.8 | Assemble admin page | `app/admin/page.tsx` | 🔴 |

### Phase 6: Polish & Deploy (Estimated: ~15 min)

| # | Task | Priority |
|---|------|----------|
| 6.1 | Responsive testing (375px, 768px, 1024px, 1440px) | 🔴 |
| 6.2 | Dark/Light mode verification | 🟡 |
| 6.3 | SEO metadata for all pages | 🟡 |
| 6.4 | Verify all Firebase CRUD operations | 🔴 |
| 6.5 | Build & deploy check (next build) | 🔴 |

---

## 🗄️ Firebase Firestore Schema

### Collection: `users`
```typescript
interface UserDoc {
  name: string;
  email: string;
  phone: string;
  location: string;       // text input
  gpsLat: number;         // NEW — latitude from browser
  gpsLng: number;         // NEW — longitude from browser
  gpsAddress: string;     // NEW — reverse-geocoded address
  plan: string;
  ghanaCardFront: string; // Cloudinary URL
  ghanaCardBack: string;  // Cloudinary URL
  passportPhoto: string;  // Cloudinary URL
  status: 'pending' | 'approved' | 'rejected';
  whatsappLink: string;
  createdAt: Timestamp;
}
```

### Collection: `testimonials` (NEW)
```typescript
interface TestimonialDoc {
  userId: string;         // who submitted
  userName: string;
  userPhoto: string;      // passport photo URL
  planName: string;
  rating: number;         // 1-5 stars
  review: string;         // testimonial text
  status: 'pending' | 'approved' | 'rejected';
  isStatic: boolean;      // admin-created vs user-submitted
  createdAt: Timestamp;
}
```

### Collection: `settings/waLinks` (EXISTS)
```typescript
// document: settings/waLinks
// fields: { [planId: string]: string (WhatsApp URL) }
```

---

## 🗺️ GPS Implementation Details

### Registration Flow
```
Step 2.5 (NEW STEP — after Document Upload):
1. Show "Enable Your Location" screen
2. Call navigator.geolocation.getCurrentPosition()
3. If DENIED → Show blocker: "Location is required to continue"
   - NO fallback, NO skip, NO manual entry
   - User MUST enable GPS to proceed
4. If GRANTED → Capture lat/lng
5. Reverse geocode via OpenStreetMap Nominatim API (free, no key needed)
6. Show mini map preview with pin + address text
7. User confirms → proceed to Step 3
```

### Admin Map View
```
Admin Dashboard → "Map View" tab:
- Use Leaflet.js (free, open-source) + OpenStreetMap tiles
- Show all users as pins on map
- Color-coded: Green=Approved, Yellow=Pending, Red=Rejected
- Click pin → Show user card popup
- No Google Maps API key needed!
```

### Technology for Maps
```
- Leaflet.js (open-source, free, no API key)
- OpenStreetMap tiles (free)
- Nominatim API for reverse geocoding (free, rate-limited)
- npm: react-leaflet (React wrapper for Leaflet)
```

---

## 📝 Testimonials Implementation

### Home Page Display
```
- Card carousel (auto-scroll, manual navigation)
- Each card: Photo, Name, Plan, Star rating, Quote
- Mix of static (admin-added) + dynamic (user-submitted, admin-approved)
- Only shows testimonials with status='approved'
```

### User Dashboard
```
- "Share Your Experience" card
- Star rating selector (1-5)
- Text area for review
- Submit → saves to Firestore with status='pending'
- Show user's own submitted reviews + status
```

### Admin Panel
```
- "Testimonial Manager" section
- List all testimonials (pending, approved, rejected)
- Approve/reject buttons
- "Add Static Testimonial" form (name, photo, rating, text)
```

---

## 📱 Floating WhatsApp Button

```
- Fixed position: bottom-right corner
- Green WhatsApp icon with pulse animation
- Click → opens WhatsApp chat with pre-filled message
- Shows on ALL pages
- Responsive: slightly smaller on mobile
- Link: https://wa.me/233XXXXXXXXX?text=Hello%20Rabi
```

---

## 🎨 Design System (Preserved from existing)

| Token | Value |
|-------|-------|
| **Primary (Gold)** | `#D4AF37` |
| **Rabi Green** | `#0d7d4a` |
| **Navy Dark** | `#0A1628` |
| **Background Light** | `#F7F5F0` |
| **Accent Green** | `#10B981` |
| **Success** | `#10B981` |
| **Warning** | `#F59E0B` |
| **Danger** | `#EF4444` |
| **Display Font** | DM Serif Display |
| **Body Font** | Inter |
| **UI Font** | Space Grotesk |

---

## 📦 New Dependencies Needed

```json
{
  "react-leaflet": "^4.x",
  "leaflet": "^1.9.x",
  "@types/leaflet": "^1.9.x"
}
```

> No other new deps needed — Firebase, Tailwind, Framer Motion already installed.

---

## ✅ Verification Checklist

- [ ] All pages render without errors
- [ ] Firebase auth (signup/login/logout) works
- [ ] GPS detection captures coordinates
- [ ] GPS denial blocks registration
- [ ] Admin map shows all user locations
- [ ] Cloudinary uploads work (Ghana Card front/back + Passport)
- [ ] Admin approve/reject/reset works
- [ ] WhatsApp links auto-assign on approval
- [ ] Testimonials display on home page
- [ ] Users can submit reviews from dashboard
- [ ] Admin can manage testimonials
- [ ] Floating WhatsApp button appears on all pages
- [ ] Contact section displays placeholders
- [ ] Responsive at 375px, 768px, 1024px, 1440px
- [ ] `next build` succeeds
- [ ] SEO metadata on all pages

---

## ⚠️ Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| GPS accuracy in Ghana | Users indoors may get imprecise location | Accept any GPS reading, show address for confirmation |
| Nominatim rate limits | May fail under heavy traffic | Cache results, show raw coords as fallback |
| Large Firestore reads in admin | Cost with many users | Add pagination, limit to 50 per page |
| Cloudinary free tier limits | 25 credits/month | Current usage appears low, monitor |

---

> **TOTAL ESTIMATED**: ~195 minutes (~3.25 hours)
> **FILES TO CREATE**: ~45+ new component files
> **PRIORITY**: GPS + Testimonials + Floating WA are the highest impact

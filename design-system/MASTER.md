# Rabi's Saving Hub: Master Design System (Awwwards-Tier)

> This file was generated via `ui-ux-pro-max` GOD MODE overrides for a Premium Fintech application.

## 1. Core Principles
- **No Emojis**: SVGs ONLY (Lucide/Heroicons). Emojis instantly degrade the visual trust required for a financial app.
- **Color Discipline (PURPLE BAN ✅)**: Zero violet/purple allowed. The strict brand colors are Midnight Blue (`#0A1628`), Vibrant Gold (`#D4AF37`), and Neutral Grays (`#94A3B8`).
- **Cursor Discipline**: Interaction cues must be visceral. Ensure `cursor-pointer` relies heavily on subtle scale dynamics (`hover:scale-[1.02]`) and strict color transitions `transition-all duration-300`.

## 2. Layout & Typography
- **Grid Layouts**: Do not default to Bento Grids for single-column narratives. Utilize the Golden Ratio (62:38 column splits) when building out the internal Admin dashboards.
- **Fonts**: Utilize `DM Serif Display` strictly for Display Headers (H1, Marketing CTAs). Body and Dashboard metrics strictly enforce `Space Grotesk` or `Inter` for optimal tabular readability.

## 3. Light/Dark Mode Contrast & Shadows
- Since the platform is primarily **Dark Mode-First** (`className="dark"`), glassmorphism is restricted to `bg-navy-light/40 backdrop-blur-xl border border-white/10`.
- **Glow over Shadows**: Heavy drop-shadows look muddy in dark mode. Instead, use soft inset glows `shadow-[0_0_15px_rgba(212,175,55,0.15)]` for primary action buttons.

## 4. Admin Portal UX Recommendations
- **Table Data (CSV/JSON)**: The download actions constructed in the UI must remain grouped near the component headers to maintain the Fitts's Law expectation.
- **Announcement Feedback**: When pushing global states, the Toast overlay must linger long enough `duration: 3000ms` for immediate visual affirmation before unmounting.

*Built for maximum Vercel SSR performance and optimal Core Web Vitals (LCP < 2.5s).*

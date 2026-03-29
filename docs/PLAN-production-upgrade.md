# PLAN-production-upgrade.md

## Context
User requested a massive "GOD MODE" shift towards a production-ready Web App for Rabi's Saving Hub. The system requires an Administrator Portal (announcements, user data exports), robust Firebase authentication using the new Firebase MCP tools (init/auth, init/firestore_rules), an Awwwards-tier frontend UI/UX upgrade, and deployment pipelines for Vercel/GitHub/Cloudinary.

## Expected Agents for Phase 2 Implementation
- `project-planner`: Has currently synthesized this plan.
- `database-architect`: Will implement new `firestore_rules` enforcing basic personal/public segregation, and schema for announcements/users.
- `security-auditor`: Will ensure Admin routes are tightly locked down to prevent unauthorized data exports.
- `backend-specialist`: Will write Firebase configuration, authentication flow functions, and CSV/JSON data download logic.
- `frontend-specialist`: Will consume the `ui-ux-pro-max` design system overrides to inject jaw-dropping interactions, plus structural views for the Admin panel.
- `devops-engineer`: Will assemble Git, Vercel, and Cloudinary initialization scripts.

## Task Breakdown

### 1. Foundation (Auth & Database)
- Initialize Firebase `auth` service via Firebase MCP guidelines.
- Establish `firestore.rules` for Admin vs. Standard User segregation.
- Implement the baseline Next.js Auth Context tracking user roles.

### 2. Administrator Portal
- Create `src/app/admin/announcements/page.tsx` for pushing global notices.
- Implement push-to-firestore action for the `announcements` collection.
- Create `src/app/admin/users/page.tsx` with a data table view.
- Implement a CSV/JSON export action to download single/bulk user profiles and transactions.

### 3. Awwwards-Tier UI/UX Overhaul
- Generate MASTER and page-level overrides utilizing the `ui-ux-pro-max` search script.
- Execute structural upgrades to landing pages applying extreme attention to animation timing, glassmorphism limits, shadow hierarchy, and accessibility constraints.
- Fix all unaddressed "vacation" / hardcoded errors.

### 4. Deployments (CI/CD)
- Set up automated Git tracking.
- Inject Vercel deploy configuration and environment variables.
- Configure Cloudinary keys inside `.env.local` and Next config for heavily optimized image CDNs.

---

## 🛑 Socratic Gate Questions (MANDATORY BEFORE PROCEEDING)

These architectural details must be answered to avoid costly reworks when orchestrating subagents.

### P0 **ADMINISTRATOR IDENTIFICATION**
**Question:** How should the system distinguish an Admin from a regular user during authentication?

**Why This Matters:**
- Security constraints heavily rely on defining the boundaries of an Admin. Hardcoded emails, custom Firestore claims, or a specific user document attribute all have varying levels of security and setup difficulty.

**Options:**
| Option | Pros | Cons | Best For |
|--------|------|------|----------|
| A (Custom Claims) | Safest, injected at auth token level | Requires Cloud Functions | Enterprise Scale |
| B (Firestore Role) | Easy to implement via `users` collection | Requires an extra read | Standard SMB Apps |
| C (Hardcoded Email) | Zero setup time | Rigid, hard to scale | Prototypes |

**If Not Specified:** Option B (Firestore `role: "admin"` on user docs) will be assumed.


### P1 **DATA DOWNLOAD FORMAT**
**Question:** What format should the "Download Users" feature output for the Admin?

**Why This Matters:**
- Dictates the frontend parsing library we need to install (e.g. PapaParse for CSV vs. raw Blob for JSON).

**Options:**
| Option | Pros | Cons | Best For |
|--------|------|------|----------|
| A (CSV) | Easily readable in Excel | Complex nested data flattening | Marketing/Sales |
| B (JSON) | Perfect data retention | Hard for non-technical admins to read | Developers/Backup |
| C (PDF) | Great for reporting | Hardest to implement | Stakeholder meetings |

**If Not Specified:** Option A (CSV file processing on client side) will be assumed.


### P2 **AUTHENTICATION STRATEGY**
**Question:** The Firebase MCP guide shows Email/Password and Google Sign-in. Which providers do you strictly want to enable?

**Why This Matters:**
- Determines which UI components (like Google buttons or phone-number SMS verification screens) the `frontend-specialist` needs to build.

**Options:**
| Option | Pros | Cons | Best For |
|--------|------|------|----------|
| A (Email & Google) | Broadest accessibility | Standard setup | General Web |
| B (Phone Auth) | Culturally native in Ghana | Costs SMS credits | Fintech/Susu |

**If Not Specified:** Option A (Email/Password & Google) will be assumed.

# Pre-ship audit and email plan

Date: 6 November 2026
Commit audited: `f9e46d3` (docs only on top of `75ebb47`)
Baseline gates: `tsc` clean, lint clean, 205 tests pass, production `/api/health`
reports `"build":"75ebb47"`, 8 of 8 integrations configured.

---

## Verdict

**Not ready to ship, and email is the reason.** The application code is in good
shape: uploads, KYC checks, auth, admin tooling and rate limits are covered by
tests and are running in production. Three blockers remain, and all three are in
the notification layer or its prerequisites.

The single most important finding: **there is no working sender domain**, so the
approval and rejection emails cannot be delivered to members at all right now, and
the admin alert may be arriving only by luck.

---

## Findings

### P0: blockers

| # | Finding | Evidence | Impact |
| --- | --- | --- | --- |
| 1 | **No verified sending domain exists.** Both domains referenced in the code are unregistered. | `src/app/api/email/route.ts:10` falls back to `onboarding@resend.dev`. `.env.example:52` suggests `noreply@rabissavinghub.com`. DNS lookup today: `rabissavinghub.com` and `rabis-hub.com` both return NXDOMAIN. | Resend's shared `resend.dev` sender can only deliver to the address on the Resend account itself. Every send to a member returns `403 validation_error`, so approval and rejection mail never arrives. |
| 2 | **Member emails are fired from the browser and every failure is swallowed.** | `src/app/admin/page.tsx:216-218` calls the template then `.catch(console.error)`. `src/lib/notifications.ts:20-40` catches everything and returns `null`. The route needs the admin's Firebase ID token; an expired token returns 401 and the caller ignores it. Nothing is written to the user document. | Rabi taps Approve, sees "User approved", and the member hears nothing. There is no record, no retry, and no way to notice. |
| 3 | **The new-signup alert depends on the member's tab staying open.** | `src/app/auth/page.tsx:321` calls `notifyAdminNewRegistration` non-blocking, immediately before `router.push("/dashboard")`. | Closing the tab, a locked phone, a 401, or a bad sender domain means the alert is lost forever. No retry, no record on the member document. |
| 4 | **Firestore rules deployment is unverified.** | `firestore.rules` is in the repo, but nothing in CI or the app deploys it, and no test asserts the deployed state. | If the project is still on default rules, member writes either fail (locked) or, if the database was ever left in test mode, Ghana Card numbers, KYC image URLs, GPS coordinates and phone numbers are readable by anyone with the project id. This must be confirmed before launch, not assumed. |

### P1: must fix before launch, or immediately after

| # | Finding | Evidence | Impact |
| --- | --- | --- | --- |
| 5 | Deliverability is unbuilt. No plain-text alternative, no `Reply-To`, no footer, no physical address, no unsubscribe route, emoji in a subject line, and a `no-reply` sender name. | `src/app/api/email/route.ts:41-53`, `src/lib/notifications.ts:60-100` | Even with a verified domain, Gmail and Yahoo push mail without a DMARC policy and without a plain-text part toward Promotions or spam. DMARC is not created by Resend verification and must be published separately. |
| 6 | A member can replace their KYC documents after approval. | `firestore.rules:58-66`: the self-update allowlist still includes `ghanaCardFront`, `ghanaCardBack`, `passportPhoto`, `faceScanVideo`, `ghanaCardNumber`. | Approve a verified person, and the same account can swap in a different card afterwards. The status cannot change, but the evidence behind it can. |
| 7 | The mail route is a general-purpose relay. | `src/app/api/email/route.ts:109-160`: any admin token can send arbitrary HTML to any address. | One stolen admin session becomes a phishing cannon from your verified domain. Once decision emails are server-side, this route should only accept self-service mail from a member to themselves. |
| 8 | No test covers the send path, templates, or headers. | `tests/email-policy.test.ts` covers authorisation only. Nothing covers rendering, plain text, headers, or a server send. | The exact failures found here would not have been caught by CI. |

### P2: fix when convenient

| # | Finding | Evidence |
| --- | --- | --- |
| 9 | No bounce or complaint handling. Resend webhooks are not implemented, so a hard bounce or a spam complaint is invisible and sender reputation erodes silently. | no webhook route exists |
| 10 | No "we received your application" email, so a new member gets silence between signup and decision. | `src/app/auth/page.tsx:321` sends only to admins |
| 11 | No delivery state or "resend email" action in the admin panel. | `src/components/admin/user-detail-modal.tsx` |
| 12 | Re-approving a member sends the approval email again. | `src/app/admin/page.tsx:180` sends on every transition to `approved` |
| 13 | Owner addresses ship to the browser through `NEXT_PUBLIC_ADMIN_EMAIL` and are used for client-side gating. | `src/context/auth-context.tsx:33`, `src/lib/notifications.ts:50`. Client checks are cosmetic; server `ADMIN_EMAILS` plus custom claims are authoritative. Not a vulnerability, but it should not be mistaken for one. |
| 14 | Unused import `clientKey` in the mail route. | `src/app/api/email/route.ts:3` |

### Good, and worth protecting

- Uploads: signed server-side, no upload-time transformation, byte sniffing, 60 per
  minute per phone, retries with smaller payloads, 429 handled automatically.
- KYC runtimes are self-hosted and verified live under `/kyc`, so the card reader
  and face check no longer depend on a blocked CDN.
- Auth: token verification, admin claims, owner-address fallback gated on a
  verified email, and a mail policy that is unit tested.
- 205 tests including regression guards for the outages of the last two days.
- `/api/health` now reports the deployed commit, so "is the fix live" is one
  request.

### Operational items still open from earlier rounds

1. One real phone signup end to end in production (the only thing that proves KYC).
2. Delete the test members and their Firebase Auth logins.
3. Confirm the owner address is verified in Firebase, so the owner fallback works.
4. Publish `firestore.rules` and record the command used.

---

## Plan for task 2: approval and rejection email through Resend

### Phase A: make delivery possible (blocker, half a day plus DNS wait)

1. **Buy or nominate one domain.** This is the only paid item in the project,
   roughly $10 to $12 a year. `rabissavinghub.com` is the natural choice and is
   currently unregistered.
2. In Resend, add the domain, then publish the records it issues: DKIM TXT at
   `resend._domainkey`, SPF TXT and the MX record on the send subdomain.
3. **Publish DMARC yourself**, which Resend does not do: a TXT record at
   `_dmarc` starting with `v=DMARC1; p=none; rua=mailto:...` to collect reports,
   tighten to `p=quarantine` after two weeks of clean reports.
4. Set `EMAIL_FROM="Rabi's Saving Hub <rabi@rabissavinghub.com>"` in Vercel, which
   must match the verified domain exactly.
5. **Ship `/api/email/diagnose`**, owner only, modelled on the working storage
   check: it asks Resend for the domain list, reports whether the `EMAIL_FROM`
   domain is verified, whether DMARC exists, and sends one real test message to the
   owner. `/admin` gets an "Email check" panel beside "Photo storage check".

Acceptance: the panel says verified, and a test message lands in the Gmail Primary
tab, not spam, with `spf=pass`, `dkim=pass`, `dmarc=pass` in the headers.

### Phase B: one server-side send path (one day)

- `src/lib/mailer.ts`: the only place that talks to Resend, keeping the existing
  Gmail and Brevo fallbacks. Adds a plain-text body, `Reply-To` set to the owner
  inbox so a member can just reply, a branded footer with the WhatsApp number and
  physical location, and a stable `From` name.
- `src/lib/email-templates.ts`: pure functions returning `{ subject, html, text }`
  for approval, rejection, application received, and admin alert. Pure means
  testable without a network.
- `models`, `escapeHtml`, and header handling stay server-side so a client can no
  longer dictate message content.

### Phase C: the decision route (one day)

`POST /api/notify/decision` with `{ uid, decision: "approved" | "rejected", reason? }`:

1. Verify the caller is an admin, by custom claim or verified owner address.
2. Read the member document server-side. Never accept the recipient from the client.
3. Render the template, send it, and write `{ notifiedAt, emailStatus, emailProvider, emailId }` to the member document.
4. Return the outcome so the admin panel can show "Email sent" or the exact failure,
   with a **Resend email** action.

The admin panel's `setStatus` calls this route instead of building HTML in the
browser. The status update itself stays where it is, so a mail failure never blocks
an approval decision.

### Phase D: deliverability feedback (half a day)

- `POST /api/webhooks/resend` with signature verification, recording delivered, bounced and complained events on the member document and forwarding failures to Sentry.
- Free tier limits to plan around: Resend allows 100 emails per day and 3,000 per
  month. Two emails per member means about 50 signups per day before you need the
  next tier.

### Phase E: the email every member should have got at signup (couple of hours)

An "Application received, here is what happens next" email, sent from the same
server path right after signup. It removes most "did it work?" messages.

---

## Plan for task 3: admin alerts on every new signup

Today the alert is a client-side nice-to-have. The replacement has two parts, so a
lost request cannot become a lost member.

1. **Route:** `POST /api/notify/new-member`. The new member's ID token authorises
   it, the server re-reads the created document with the Admin SDK to confirm it
   exists and is pending, then mails every address in the server-only `ADMIN_EMAILS`
   list. Recipients are never taken from the client. Failure is logged with the
   uid and retried once.
2. **Receipt:** the route writes `adminAlertAt` on the member document.
3. **Safety net:** the admin panel runs an idempotent sweep on load, mailing alerts
   for any pending member with no `adminAlertAt`. A closed tab, a dead battery or a
   Resend outage therefore delays the alert instead of losing it.
4. **Content:** name, phone, plan, card number, submission time, a link straight to
   the member in the admin panel, and the risk verdicts already computed by the KYC
   step.

Acceptance: sign up on a phone, close the tab the instant the success toast appears.
The alert still arrives, and it arrives once, not twice.

---

## Sequencing and effort

| Day | Work | Gate |
| --- | --- | --- |
| 0 | Buy domain, add to Resend, publish SPF, DKIM, DMARC | Resend shows verified |
| 1 | `/api/email/diagnose` plus admin panel, `mailer.ts`, `email-templates.ts` | Unit tests for templates and headers, owner-only route |
| 2 | `/api/notify/decision`, admin panel wiring, delivery state, Resend action | `tsc`, lint, tests, build, CI, production panel shows a real send |
| 3 | `/api/notify/new-member`, admin sweep, application-received email | Alert survives a closed tab |
| 4 | Resend webhook, bounce and complaint handling, runbook | Delivered, bounced and complained all recorded |
| 5 | Rules fix for post-approval document swaps, relay narrowed, P2 items | Full gate set, production health on the new commit |

Everything ships in small PRs with the same gates used for the last six: `tsc`,
lint, tests, build, CI, merge, then confirm `build` on `/api/health`.

## What I need from you

1. **A domain.** Approximately $10 to $12 a year. Without it, no member email can be delivered, by us or by anyone using Resend.
2. **The sender address** you want to appear, for example `rabi@rabissavinghub.com`.
3. **Confirmation** that `rabisavinghub@gmail.com` is the address on the Resend account, since that decides whether today's admin alerts reach you.
4. **A yes or no** on the safety net for rules: shall I restrict member updates so KYC documents can only be written while the status is `pending`? It closes finding 6 but means a rejected member cannot resubmit without asking Rabi.

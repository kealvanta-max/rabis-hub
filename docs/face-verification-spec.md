# Face Verification: Design and Security Specification

Version 1.0 · 6 November 2026
Owner: Rabi's Saving Hub engineering
Status: proposed. Nothing in this document is running yet.

---

## 0. Reality check before the design

Four items in the brief are not buildable as written in a mobile web page. Each one
has a workable substitute, and the substitutes are what this document specifies.

| Brief asks for | Why it cannot ship as written | What we build instead |
| --- | --- | --- |
| TrueDepth / hardware depth sensing | iOS Safari and Android Chrome do not expose depth maps to `getUserMedia`. WebXR depth sensing needs ARCore and is not available in a normal browser tab. | MediaPipe Face Landmarker already returns 478 points **with a z axis**. Relative geometry is enough to catch a flat surface: a printed photo produces an unstable, near-planar mesh. This is a heuristic, not real depth. |
| React Three Fiber for the 3D mesh | Three.js and R3F were removed from this project on 6 November after they took the signup down three separate ways (missing WebGL2, GPU context exhaustion, a 1.4 MB HDR fetched at render time). Reintroducing them on the critical path repeats a known outage. | Canvas2D particle mesh driven by the real landmark coordinates, about 4 KB of our own code, 60 fps on a 2019 Android phone, static fallback when WebGL or motion is unavailable. R3F stays out of the signup path. |
| Mandatory biometrics with SMS OTP fallback | There is no SMS provider on this project, and SMS costs money per message. The standing constraint is $0. | Email OTP through the existing Resend integration (free tier, 100 per day), plus the WhatsApp manual review path that already exists. SMS is a paid option, priced in section 6. |
| Server receives a "risk score from the passive liveness AI" | There is no cloud liveness service on the free tier. Client signals alone are attacker-controlled and must never be trusted as a verdict. | The server is the policy decision point. It combines client signals (untrusted) with signals the client cannot forge: IP reputation, device history in Upstash, upload metadata, and the rate limits already in `/api/upload`. |

Two further things the brief implies that must be stated explicitly:

1. **A browser cannot prove liveness.** Anything computed in JavaScript can be
   bypassed by a determined attacker with a virtual camera and a patched client.
   Client-side anti-spoofing is friction that raises the cost of fraud. It is not
   proof. The proof layers are the server policy decision and the human admin.
2. **WebAuthn does not verify a face.** A passkey proves possession of a device,
   not that a live human stood in front of it. Passkeys are an authentication
   upgrade, not a liveness check, and the spec treats them as such.

---

## 1. Design System

### 1.1 Colour

The product already runs on a deep green-black, and that stays. The brief's
`#0D1117` is a neutral charcoal that would read as a different product next to the
marketing site. Semantic colours are reserved for state and nothing else.

| Token | Value | Use |
| --- | --- | --- |
| `bg.base` | `#020C06` | Page background |
| `bg.surface` | `#0B1512` | Camera viewport surround, cards |
| `glass.border` | `rgba(255,255,255,0.15)` | Panel edge |
| `state.analyzing` | `#7DD3FC` | Passive scan, mesh breathing |
| `state.success` | `#34D399` | Verified |
| `state.warning` | `#FBBF24` | Escalated to admin, retry advised |
| `state.reject` | `#F87171` | Auto-rejected |
| `text.primary` | `#F8FAFC` | Guidance lines |
| `text.secondary` | `#94A3B8` | Helper copy |

Rule: no colour outside this table appears in the step. Cyan is kept only because
"analyzing" needs to read differently from both success and failure; if you would
rather have strict three-colour semantics, swapping `state.analyzing` to
`text.primary` is a one-line change in `face-id-tile.tsx`.

### 1.2 Typography

Inter is already bundled (`@fontsource-variable/inter`), so the step uses it and
adds no new font weight to the page.

| Element | Size | Weight | Notes |
| --- | --- | --- | --- |
| Step title | 18 px | 600 | `font-display` is reserved for marketing pages |
| Instruction | 16 px | 500 | One sentence, imperative: "Smile at the camera" |
| Status pill | 10 px | 700 | Uppercase, `letter-spacing: 0.18em` |
| Countdown | 14 px | 600 | Tabular numerals so it does not jitter |
| Recovery copy | 12 px | 400 | Never blames the member |

All guidance sits in the lower third, per the brief, so nothing covers the face
while the member is positioning.

### 1.3 Motion

Motion is feedback, not decoration. Every animation answers a question the member
is already asking.

| Event | Motion | Duration | Easings |
| --- | --- | --- | --- |
| Panel enters | Opacity 0 to 1, scale 0.98 to 1 | 420 ms | `cubic-bezier(0.16, 1, 0.3, 1)` |
| Idle | Mesh "breathes", amplitude 2 % | 3.2 s loop | Sine |
| Face detected | Mesh lines draw in from 20 % to 100 % density, colour to `state.analyzing` | 1.1 s | `cubic-bezier(0.4, 0, 0.2, 1)` |
| Challenge accepted | Ring contracts to the face bounds | 600 ms | Spring, stiffness 300, damping 22 |
| Success | Mesh dissolves into 90 particles rising 120 px, opacity to 0 | 900 ms | `ease-out` per particle with 0 to 120 ms stagger |
| Rejection | Horizontal shake, 6 px amplitude, 3 cycles | 320 ms | `ease-in-out` |
| Reduced motion | Crossfade only, no transform | 200 ms | linear |

Success also fires `navigator.vibrate([12, 40, 18])` where supported, and a three
note rising chime synthesised with Web Audio (no audio asset to download).
Both are suppressed when `prefers-reduced-motion: reduce`.

The particle mesh is one `<canvas>` drawn from the landmark array we already
receive. It is not a second model, a second download, or a second failure mode.

### 1.4 Accessibility

- Every state change writes to a single `aria-live="polite"` region: "Camera
  starting", "Smile detected", "Look slightly up and left", "Verified".
- Rejection uses `aria-live="assertive"` because the member must act.
- The step is fully operable without the camera: "Continue with manual review"
  is always present, never hidden behind the animation.
- Contrast: all text tokens are at least 4.5:1 on `bg.surface`.
- Timeouts announce a countdown at 10 seconds and 5 seconds, never silently drop
  the member.

---

## 2. UX Flow

### 2.1 Consent first

Before `getUserMedia` is called, a plain-language screen appears:

> We will take a short 3D scan to check you are a real person. Your face is
> compared on your own phone and never posted publicly. Rabi can only see the
> clip if she needs to verify you by hand.

Buttons: **Start the check** · **Use a different method** (manual review, and
email OTP for account security where relevant).

The current code already asks only on an explicit tap, which is what mobile
browsers require. This adds the explanatory screen in front of that tap.

### 2.2 State machine

```
CONSENT ──start──► REQUESTING_CAMERA ──stream──► POSITIONING ──face ok──► PASSIVE_SCAN
   │                      │                            │                     │
   │                      └─denied──────────────┐      └─timeout────────┐    ├─risk low──► RECORDING
   └─declined───────────────────────────────────┤                      │    ├─risk mid──► CHALLENGE
                                                ▼                      ▼    └─risk high─► ESCALATE
                                            RECOVERY ◄─────────────────┘            │
                                                │                                 │
                     ┌──────────────────────────┴───────────────┐                 │
                     ▼                                          ▼                 ▼
                 RECORDING ──clip ok──► UPLOADING ──ok──► VERIFIED          AWAITING_ADMIN
                     │                                          │                 │
                     └─recorder fail──► RECOVERY                └─upload fail──► UPLOAD_RETRY
```

| State | Enters when | Exit | UI | Announced |
| --- | --- | --- | --- | --- |
| `CONSENT` | Step 3 opens | Tap start or decline | Glass panel, static mesh | "Face check. Tap start when ready." |
| `REQUESTING_CAMERA` | Start tapped | Stream, or `NotAllowedError` | Spinner, single line | "Opening the camera." |
| `POSITIONING` | Stream live | Face inside target bounds for 400 ms | Bounding ring, hint | "Center your face." |
| `PASSIVE_SCAN` | Face positioned | 1.2 s of clean frames, or risk flags | Filling mesh | "Hold still." |
| `CHALLENGE` | Risk is mid band | Pose matched within 8 s | One direction prompt | "Look slightly up and left." |
| `RECORDING` | Scan passed | 3 s clip complete | Red dot, countdown | "Recording." |
| `UPLOADING` | Clip complete | URL returned | Lock icon, "Securing your check" | "Saving your clip." |
| `UPLOAD_RETRY` | Upload failed | Retried with a smaller clip | Retry line, WhatsApp escape | "The upload did not go through. Trying again." |
| `VERIFIED` | Server accepted | Continue enabled | Particle dissolve, chime, haptic | "Identity check complete." |
| `ESCALATE` | Client risk high | Member or admin decides | Amber card, what happens next | "A person will verify you." |
| `REJECTED` | Passive or challenge failed twice | Retake or manual review | Crimson card, non-blaming copy | "We could not confirm. Let us try again." |
| `RECOVERY` | Camera or recorder unavailable | Retry, manual review | Specific cause plus fix | Same as visual |
| `AWAITING_ADMIN` | Manual review chosen | Admin decision | Amber note, Continue enabled | "Rabi will verify you manually." |

Guards that already exist and stay: every challenge has a deadline
(`CHALLENGE_MS = 22 000`), no face for `NO_FACE_MS = 12 000` falls back, and the
member can always leave.

### 2.3 What changes from today

Today: idle panel, smile, blink, 3 s clip, upload, done. Nine statuses in
`src/components/ui/face-scan.tsx`.

After: consent, positioning, passive scan, optional randomised challenge, clip,
upload, verdict. Same file, same component boundaries, so this is a refactor of
one component plus one new visual layer, not a rewrite.

---

## 3. Security Architecture

Three layers, in order of how many members see them.

### 3.1 Layer 1: passive signals (everyone, no extra taps)

Computed on the phone from the live stream, then sent with the clip. Treated as
**untrusted input** by the server.

| Signal | How | Meaning |
| --- | --- | --- |
| Mesh planarity | Standard deviation of landmark z over 30 frames | Flat photo or screen: very low variance |
| Mesh stability | Frame to frame movement of landmarks | A rigid printed card barely moves; a human head drifts |
| Texture energy | Laplacian variance in the face region, downscaled to 128 px | Reprints and screens lose fine skin texture; moiré adds periodic noise |
| Optical flow | Mean magnitude of landmark deltas vs pixel delta correlation | Pre-recorded replay shows flow that does not match the head pose change |
| Frame timing | `requestVideoFrameCallback` timestamps vs `MediaRecorder` timestamps | Gaps or duplicates suggest an injected stream |
| Device shape | `navigator.userAgent`, WebGL renderer string, `navigator.webdriver`, `deviceMemory` | Software renderer (SwiftShader) or automation flags raise risk |
| Repetition | Perceptual hash of frame 0 against known submissions | Same face video reused across accounts |

Each signal produces points; the client sums them into a candidate score, and the
server recomputes from raw signals rather than trusting the total.

### 3.2 Layer 2: active challenge (only when risk is mid band)

The brief is right that a blink is cheap to fake. The challenge is now a **random
pose** drawn per session from {up, up-left, left, down-left, down, down-right,
right, up-right}, timed to a window, verified against mesh geometry:

- Nose tip must displace beyond a threshold relative to the eye line.
- Intermediate frames must show a continuous transition, not a jump.
- The whole gesture must complete in 1.5 to 8 seconds.
- A failure gives one retry with a different direction, then escalates.

A pre-recorded clip of the same person will only pass if it happens to perform
the exact randomised direction inside the window.

### 3.3 Layer 3: server policy and cryptographic binding

**Policy decision point.** New endpoint `POST /api/liveness/evaluate`:

```jsonc
// request (client signals are untrusted)
{
  "deviceId": "uuid from x-rabis-device",
  "signals": { "planarity": 0.004, "texture": 18.2, "flow": 0.31, "frameGaps": 0 },
  "challenge": { "prompt": "up-left", "completedMs": 2400 },
  "clipUrl": "https://res.cloudinary.com/..."
}

// response
{
  "decision": "pass" | "challenge" | "escalate" | "reject",
  "riskScore": 12,
  "reasons": ["mesh-planar", "no-face"],
  "nonce": "one-time, 5 min TTL, only on pass"
}
```

Server-side inputs the client cannot forge: request IP and its history in Upstash,
`x-rabis-device` seen before, submission velocity per device and per IP, Cloudinary
metadata on the uploaded clip (duration, codec, bytes, creation time), and the
existing rate limits in `/api/upload`.

**Storage and retention.** The brief says no raw biometrics. Today the liveness
clip is kept in Cloudinary so Rabi can review it. That is a real biometric record
and it needs a rule:

- Uploaded as `type=authenticated` or with a private flag, never a public URL.
- Delivered to the admin panel through a short-lived signed URL only.
- Deleted automatically 30 days after the application is decided, by a scheduled
  job, or immediately on rejection.
- We store `riskScore`, `riskFactors`, `decision`, and a frame hash. Not a face
  template, not raw pixels, not a vector embedding.

**Passkeys (Layer 3b).** After approval, offer "Add a passkey to this phone":

1. `POST /api/passkeys/register/options` returns a challenge bound to the uid.
2. Browser calls `navigator.credentials.create({ publicKey })` with
   `authenticatorSelection: { residentKey: "preferred", userVerification: "preferred" }`.
3. `POST /api/passkeys/register/verify` checks the attestation with
   `@simplewebauthn/server`, stores `{ credentialId, publicKey, counter, transports, aaguid }`
   on the user document.
4. Login offers "Sign in with this phone" alongside email and password.

Constraints to plan for: passkeys on iOS Safari need an
`/.well-known/apple-app-site-association` file for the RP domain; Chrome Android
works without it. In-app browsers (WhatsApp, Instagram) cannot create passkeys, so
the offer must never be the only path. Attestation is set to `none` by default,
which is standard practice for privacy and gives no device-assurance claims.

**What this layer does not do:** it does not prove the face at signup. It makes
later logins phishing-resistant. Do not market it as biometric verification.

### 3.4 Risk bands

| Score | Decision | Member experience |
| --- | --- | --- |
| 0 to 39 | `pass` | Straight through, no extra tap |
| 40 to 69 | `challenge` | One random head turn |
| 70 to 89 | `escalate` | Amber card, admin reviews with the clip |
| 90 to 100 | `reject` | Crimson card, retake allowed once, then escalate |

Thresholds live in one module, tuned against real submissions, not guesses.

---

## 4. Recommended Tech Stack

### 4.1 Frontend, all already in the bundle unless marked new

| Concern | Choice | Why this and not the brief's pick |
| --- | --- | --- |
| Face landmarks | `@mediapipe/tasks-vision` (installed, runtime self-hosted under `/kyc/mediapipe`) | Already loading correctly after the 6 Nov fix; 478 points including z |
| Mesh and particles | Hand-written Canvas2D renderer, one file | No 600 KB renderer, no WebGL2 requirement, no second failure mode, static fallback |
| UI orchestration | `framer-motion` (installed) | GSAP would add about 70 KB for transitions framer-motion already does |
| Haptics | `navigator.vibrate` | Zero cost, Android support, silently ignored elsewhere |
| Chime | Web Audio oscillator envelope | No asset, works offline |
| Passkeys | `@simplewebauthn/browser` (new, about 12 KB) | Smallest correct client |
| Storage of verdict | Firebase Admin through existing API routes | No new service |

### 4.2 Backend

| Concern | Choice |
| --- | --- |
| Policy endpoint | Next.js route handler `src/app/api/liveness/evaluate/route.ts` |
| Risk counters | Upstash Redis through the existing `src/lib/rate-limit.ts` wrapper |
| Passkey verification | `@simplewebauthn/server` (new), Firebase Admin to store credentials |
| Media metadata | Cloudinary Admin API on the uploaded clip |
| Observability | Existing `captureException` to `/api/errors` and Sentry, plus PostHog funnel events |

### 4.3 Explicitly rejected

- **React Three Fiber / three.js.** Removed 6 Nov 2026 after three production
  outages. Not returning to the signup path.
- **GSAP.** Duplicates framer-motion for this scope.
- **SMS OTP.** Needs a paid provider. Cost if you accept it: about $0.05 per
  message, roughly $15 per month at 300 signups.
- **Client-side deepfake classifiers quoted as proof.** They raise cost, they do
  not prove anything, and claiming otherwise is a liability.

---

## 5. Delivery plan

| Phase | Scope | Files | Days | Exit test |
| --- | --- | --- | --- | --- |
| 0 | Consent screen, ARIA live region, timeout announcements, manual review always visible | `face-scan.tsx`, `face-id-tile.tsx`, new `face-consent.tsx` | 1 | Screen reader announces every state |
| 1 | Canvas2D mesh from real landmarks, particle dissolve, chime, haptic, shake, positioning ring | new `face-mesh-canvas.tsx`, `face-scan.tsx` | 2 | 60 fps on a 2019 Android, no layout shift, static fallback under reduced motion |
| 2 | Passive signals, risk bands, randomised pose challenge, `/api/liveness/evaluate`, risk stored on the user doc and shown to the admin | `src/lib/liveness.ts`, `api/liveness/evaluate/route.ts`, `types.ts`, admin modal | 3 | A printed photo and a screen replay both fail the challenge in a scripted test |
| 3 | Passkey enrolment and sign-in | `api/passkeys/*`, `src/lib/passkeys.ts`, auth page | 2 | Register on Android Chrome, sign in from a new session |
| 4 | Retention job, 30 day deletion, funnel analytics | `api/liveness/purge/route.ts`, PostHog events | 1 | Clip is gone 30 days after a decision |

Each phase ships behind its own PR with the full gate set: `tsc`, lint, tests,
build, CI, production health with the `build` field confirming the commit.

## 6. Cost

| Item | Cost |
| --- | --- |
| Landmarks, OCR runtimes, Canvas mesh, Web Audio, haptics | $0 |
| Policy endpoint and passkey endpoints | $0 on Vercel Hobby |
| Upstash counters | existing free tier |
| Email OTP | existing Resend free tier, 100 per day |
| Passkeys | $0 |
| SMS OTP, if you want it | about $0.05 per message |

## 7. Compliance note

Ghana's Data Protection Act 2012 (Act 843) requires a lawful basis, purpose
limitation, and data minimisation for biometric and identity data. The design
meets that by: consenting before capture, computing passive checks on the device,
uploading one short clip rather than continuous video, restricting access to the
admin, and deleting the clip on a schedule. This is engineering guidance, not
legal advice; have the retention period confirmed before launch.

## 8. Decisions needed from you

1. **Cyan or neutral** for the "analyzing" state, given the brief's three-colour
   rule.
2. **Retention window** for the liveness clip: 30 days, 90 days, or delete on
   decision.
3. **SMS OTP**: keep at $0 with email OTP plus WhatsApp, or add a paid provider.
4. **Passkeys**: signup-time prompt, or offered only after approval.

# KYC hardening: why a dog got in, and how to stop it

Written after reproducing both failures from the screenshots. Every claim below
is either a measurement from this repository or a statement about what the code
does on the line cited. Where I could not test something, it says so.

**Budget: $0.** Nothing here needs a paid service. The one thing money would buy
is a paid liveness vendor, and this plan explains why that is not the gap.

---

## 1. What actually happened

### 1.1 The dog was *detected as a human face*, at 0.983

This is not a threshold that was set too low. It is the detector being wrong.

I cropped the selfie out of the screenshot and ran it through the exact function
production runs (`detectFaces` in `src/lib/kyc-face-server.ts`):

```
RASTER 780x270
COLOUR     inconclusive  ["face-presence-not-provable-screening-only"]
DETECTION  {"human":true,"score":0.983,"status":"detected","eyes":"both","boxes":2}
VERDICT    pass ["human-face-detected-score-0.98","eyes-detected"]
```

The model that is supposed to answer "is this a person" answered yes at 98.3%
confidence, and the 68-point landmark model placed both eye clusters on the dog.
That second detail matters: the code treats "face found **and** eyes found" as
the strongest evidence available, so the dog landed on the one branch that is
most trusted.

This is a known, documented weakness of SSD-MobileNetV1 face detection, not a
configuration mistake. It misclassifies animal faces, most often dogs, and the
phenomenon is written up in the face-api.js issue tracker and in the academic
literature on face detectors under human-animal imagery. A dog's eye-nose-mouth
triangle is close enough to a human infant's that the model, which was never
trained to say "not a person", has no reason to hesitate.

**Therefore: no amount of threshold tuning fixes this.** Raising the floor to
0.99 would refuse genuine members whose faces score 0.84 (measured on the
fixtures in `tests/fixtures/faces`), and the dog still passes. The detector is
being asked a question it cannot answer.

### 1.2 What I tried that did **not** work

I expected the 128-d face descriptor (the `face_recognition_model`, which is
vendored but currently never loaded) to reject the dog, since it is a much
heavier network trained to embed *human* faces. I measured it:

```
dog   <-> human1   0.877     human1 <-> human2   0.882
dog   <-> human2   0.888     human1 <-> human3   0.909
dog   <-> human3   0.934     human1 <-> human4   0.834
dog   <-> human4   0.843     human2 <-> human3   0.749
dog   <-> human5   0.864     human3 <-> human4   0.696
```

The dog sits comfortably inside the human-to-human distance range. The usual
"same person" threshold of 0.6 would not separate them either. **So the
recognition model is not a human/animal classifier and must not be used as one.**
It is still the right tool for its actual job, "is the selfie the same person as
the card portrait", and that job is defeated by the same spoof, so it is worth
having for a different reason (see §3.2).

Recording this because it is the difference between a plan that works and one
that looks clever and fails in production.

### 1.3 The "Try again" card is the client losing the server's answer

`src/components/ui/image-upload.tsx:118` throws away what the server just
decided and replaces it with a fixed sentence:

```ts
const pending: DocVerdict = {
  status: "review",
  message: verify === "selfie"
    ? "Uploaded. We could not find an obvious problem with this photo, ..."
```

`uploadToCloudinary` (`src/lib/cloudinary.ts:174`) returns only
`data.secure_url` and discards `screening`, `reasons` and `provider`, which the
route had just sent back. The dog's screen said
`automated-screening-could-not-confirm-a-face` and the member was shown the
opposite: "we could not find an obvious problem".

So there are two separate bugs in one screenshot: the detector was wrong, and
the interface hid the fact that anything had been uncertain. Fixing only the
first would leave the second to mislead Rabi later.

### 1.4 Why "finish your registration" appears after a successful signup

`src/app/api/signup/submit/route.ts` creates the member document inside a
Firestore transaction, and the dashboard renders
`!userData && !isAdmin` as "your registration has not reached us"
(`src/app/dashboard/page.tsx:245`). The "Try again" button calls
`refreshProfile()`, which is a plain `getDoc` (`src/context/auth-context.tsx:119`).
If the document is not there, re-reading it cannot make it appear. The button has
never been able to work, in any failure mode.

There are four ways to reach that screen, and the app cannot tell them apart:

| Cause | What the member sees | Detectable server-side |
|---|---|---|
| `submit` returned 201 but wrote to a **different Firebase project** than the client reads | dashboard, empty, no error | yes, compare `project_id` in the key against `NEXT_PUBLIC_FIREBASE_PROJECT_ID` |
| `submit` threw, `deleteUser` also threw (needs a recent login; it does have one) | dashboard, empty | no |
| The account was created in an earlier attempt and the write never happened | dashboard, empty | yes, timestamp vs. user creation time |
| A rules change blocked the read after the doc was written | dashboard, empty | yes, rules probe |

**The project-mismatch row is the one I would check first**, because it is the
only one that produces exactly this symptom with no error anywhere: the server
holds a service account for one project, `NEXT_PUBLIC_FIREBASE_PROJECT_ID` names
another, the member's `uid` exists in the auth project the browser uses, the
document exists in a project nobody reads, and every call returns 200.

The diagnostic added in the previous change reports this directly:
`GET /api/health/service-account` returns `projectMatchesConfig`. If that is
`false`, this is the whole bug.

---

## 2. The design principle

Every previous attempt failed the same way: it asked a model to make a decision
it cannot make, and then treated "the model is unsure" as permission to continue.

The fix is not a better model. It is to stop asking one model to do a job that
requires several independent kinds of evidence, and to make the *default* answer
"Rabi decides", not "let them through".

Three tiers, cheapest and most reliable first. A submission must survive tier 1
to be accepted at all; tiers 2 and 3 decide what Rabi is told and how loudly.

```
        ┌──────────────────────────────────────────┐
        │ TIER 1  Live capture     deterministic    │  cannot be forged
        │         the frames come from a camera     │  from a file
        │         the page controls right now       │
        └───────────────────┬──────────────────────┘
                            │ passes
        ┌───────────────────▼──────────────────────┐
        │ TIER 2  Identity evidence, independent    │  AI, free tier
        │         human / animal is a different     │
        │         question from face-vs-card        │
        └───────────────────┬──────────────────────┘
                            │ inconclusive
        ┌───────────────────▼──────────────────────┐
        │ TIER 3  Fraud graph   8-byte hashes,      │  no model,
        │         velocity, one card = one account  │  no cost
        └───────────────────┬──────────────────────┘
                            │
        ┌───────────────────▼──────────────────────┐
        │ RABI  always. Nobody is auto-approved.    │
        │       She sees a risk score, not a wall.  │
        └──────────────────────────────────────────┘
```

---

## 3. Tier 1: live capture (the only thing that proves liveness)

This is the decisive change, and it needs no service and no model.

**The insight:** a file that arrives from a picker is a file. It has no history.
Whatever we run on it, we are answering "does this image look like a person",
and a photograph of a printed dog is a perfectly good image of a dog. A frame
pulled from a camera stream the page opened has a different property: it could
only have been produced by a camera looking at something at the moment the page
asked.

**Why the file input cannot be trusted, in one table** (from Chrome behaviour on
Android 14/15, which is what the screenshots show):

| Input | What the member can do | Verdict |
|---|---|---|
| `<input type="file" accept="image/*">` | gallery only on Android 14+, so any saved image | pointless |
| `<input type="file" accept="image/*" capture="camera">` | camera app only on most builds, **but** on some OEMs and older builds the chooser still offers Files, and a rooted device can substitute | weak |
| `getUserMedia({ video: { facingMode: "user" } })` | must expose a live stream to the page; no file picker exists in this path at all | the one to use |

`src/components/ui/face-scan.tsx` already does exactly this, with
`facingMode` handling, `MediaRecorder`, and honest error copy for a blocked
camera. **The mechanism already exists in this repo and is simply not used for
the photo the screening runs on.** That is the fix: run screening on frames
taken from that stream, not on a file from a picker.

### 3.1 What to build

New module `src/lib/live-capture.ts` (client), used by the selfie step:

1. `getUserMedia({ video: { facingMode: "user", width: {ideal: 720} }, audio: false })`.
   On `NotAllowedError`, `NotFoundError` or `NotReadableError`, fall back to the
   existing manual-review path and record
   `captureMode: "fallback-no-camera"`. Never silently accept a file instead.
2. Sample the track every 400 ms for 3 seconds: **at least 5 frames**, each
   drawn to an offscreen canvas at 640 px and encoded to JPEG q0.8.
3. While capturing, require *change* between frames: the mean absolute pixel
   difference between consecutive frames must exceed a floor. A phone pointed at
   a printed photograph taped to a wall produces frames that are nearly
   identical; a person produces micro-motion. This is crude and it is meant to
   be: it is a triage signal, not a verdict (see §3.3 for its limits).
4. Also keep the `MediaRecorder` clip that `face-scan.tsx` already produces.
5. POST the frames as a multipart set to `/api/kyc/live-frame`, one per frame,
   each with the capture timestamp from `Date.now()` and a monotonic sequence.

### 3.2 Server side

`POST /api/signup/submit` accepts `liveFrames: string[]` (Cloudinary URLs) plus
`captureMode: "camera" | "fallback-no-camera"` and `captureStartedAt`.

Rules, all deterministic, no model:

- `captureMode === "fallback-no-camera"` → `kycReviewStatus: "manual_review_required"`,
  reason `no-live-capture`. Accepted, flagged loudly. A member without a working
  camera must still be able to join; she just cannot skip Rabi.
- Fewer than 3 frames → `live-capture-insufficient`.
- Identical perceptual hashes across all frames → `live-capture-static-scene`.
  This is where a printed dog, a taped photograph and a paused video all die,
  and it costs 8 bytes per frame to detect (§4.1).
- The best frame is what the existing screening runs on. If screening says
  "no human" on a frame that came from a live stream, that is much stronger
  evidence than the same answer on a file, and it can be a refusal.

### 3.3 What live capture does **not** prove

Be clear about this, because overstating it is how the current design went wrong:

- It does not prove the face belongs to the person holding the phone. A
  determined attacker can point the front camera at a video playing on another
  phone. That is a *screen replay*, caught (or not) by tier 2.
- It does not prove a human is in frame. A camera pointed at a real dog in a
  real room passes tier 1. **Tier 1 answers "was this captured live", never "is
  this a person".**
- The static-frame check is defeated by a slightly moving camera. It raises the
  cost of a naive attack, nothing more.

Tier 1's job is narrow and it does that job perfectly: it kills "upload a saved
image", which is how the dog got in. Everything else is tier 2 and Rabi.

---

## 4. Tier 2: ask the right question of the right tool

### 4.1 The AI provider is the only component that can name a species

Gemini, Groq and OpenRouter are already wired (`src/lib/kyc-vision.ts`), already
free, and already asked `subject: human_face | non_human_or_no_face | uncertain`
with the prompt explicitly naming "an animal (for example a dog or a cat)".

Why it did not stop this:

1. **At upload time the answer is discarded.** `image-upload.tsx:118` replaces it
   with a fixed sentence (§1.3). Rabi is told "could not confirm a face" when
   the provider may have said "dog".
2. **At submission time it only runs if three images decoded.** If any one of
   front, back or selfie failed to download, the whole vision pass is skipped
   and the record says `vision-evidence-unavailable` — indistinguishable, in the
   admin panel, from a provider outage.
3. **`uncertain` is silently permissive.** In `kyc-vision-policy.ts`, an
   `uncertain` subject produces `manual_review_required`, which is correct, but
   the member-facing copy and the upload-time path both present it as normal.

Change to make, in `kyc-vision-policy.ts`:

- Split the subject question into two independent fields instead of one:
  `is_human` (boolean, high stakes) and `species_note` (free string, for Rabi
  only). A model that says "this appears to be a dog" should be able to say so
  without having to force it into an enum.
- Make `is_human === false` a **hard gate at any confidence above 0.5**, not
  0.7. A confident "that is not a person" is exactly the case where a false
  refusal costs a retake and a false acceptance costs an account.
- Keep `subject: uncertain` routing to Rabi, but stop describing it to the
  member as a success.

And in `src/app/api/signup/submit/route.ts`: when `visionConfigured` is true but
the evidence could not be assembled, run the provider on **whatever images did
decode** rather than skipping the pass entirely. One good selfie is enough to
ask the subject question; it is not enough for face-match, so those two
questions should be allowed different evidence.

### 4.2 Anthropometric check: MEASURED AND REJECTED

This section was written as a hypothesis and then tested. **It does not work, and
nothing from it shipped.** It is kept in the document because the measurement is
the most useful thing in it.

The hypothesis: a 68-point landmark model places eye and mouth clusters
differently on a dog than on a person, so the ratios between them would separate
the two species. The table originally in this section predicted human
inter-ocular-to-box-width in the range 0.28–0.40 and the chihuahua at ~0.55.

**Both predictions were wrong.** Measured on the real pipeline:

| Sample | inter-ocular / box width | nose-to-chin / box width |
|---|---|---|
| 7 genuine faces (`tests/fixtures/faces`) | 0.625 – 0.661 | 0.423 – 0.592 |
| the chihuahua from the report | 0.295 | 0.083 |

On that evidence alone a gate at 0.60–0.70 looked perfect: it refused the dog and
passed all seven members. That is exactly the trap, and it is why the sample was
widened before anything was built.

**Widening to 13 humans and 5 animals destroys the idea:**

| Sample | inter-ocular | note |
|---|---|---|
| genuine, glasses, selfie | **0.295** | identical to the dog |
| genuine, glasses | 0.662 | inside the human band |
| genuine, woman | 0.355 | |
| dog, pit bull | 0.431 | inside the human band |
| dog, labrador | **0.667** | closer to a human than most humans |
| dog, border collie | 0.313 | |
| cat | 0.561 | inside the human band |

Every threshold that refuses the animals refuses **a real man wearing glasses**,
whose value is indistinguishable from the chihuahua's. Every threshold that
admits him lets two to five of the five animals through. The ratios are not
measuring species; they are measuring how much of the frame the detector's box
happened to cover, which depends on crop, glasses and head angle.

**Decision: deleted from the design.** This is the second measurement in this
document (after the face descriptor in §1.2) where a plausible geometric idea
failed against real data, and it is the reason every threshold in this codebase
carries a measured range rather than a guess.

What replaced it: the screen gate (§4.4) and live capture (§3). The report's
selfie turned out to be a screenshot of a social-media video with the caption
and a heart icon still in frame, and **that** is a signal that does hold.

### 4.3 Face-vs-card: use the descriptor for its real job

Once live capture is in place, compare the descriptor of the live frame against
the descriptor of the **portrait cropped out of the Ghana Card front**. The
detector can find the small printed portrait in the card photo; `face-api`'s
`detectAllFaces` already returns boxes, and the card geometry tells us where the
portrait sits.

Distance > 0.6 → `selfie-does-not-match-the-card`. This catches the case the
screenshots do not show but the question asks about: a real person submitting
somebody else's card. It is defeated by a live deepfake, which is out of scope
for $0 and should be stated as a limitation in `docs/INTEGRATIONS.md`.

Do this **after** tier 1. On its own it is worthless, because a photograph of a
photograph matches perfectly.

---

## 5. Tier 3: the fraud graph (free, deterministic, unbypassable)

This is the tier that actually stops abuse at scale, and it is the cheapest code
in the plan. It requires no model and cannot be talked out of a decision.

### 5.1 Perceptual hash on every uploaded image

`src/lib/perceptual-hash.ts`, ~40 lines, no dependency:

```
dHash(image) -> 16 hex chars (64 bits)
  1. decode to the existing 32x32 RgbGrid  (decodeToGrid already does this)
  2. convert to 9x8 greyscale
  3. for each row, set a bit per pixel: brighter than its right neighbour?
  4. concatenate 64 bits
hammingDistance(a, b) -> popcount(a XOR b)
```

Store it in `kycScreeningChecks.perceptualHashes`. Two hashes within **6 bits**
are the same image, scaled, recompressed, screenshot or lightly edited. Then:

- This closes the upload-time loop: the static-frame check in §3.2 is exactly
  this function applied across frames.
- At submission, query for the same hash in other members' records. Same image,
  different account → `duplicate-evidence`. That is the signature of a scripted
  signup ring, and it is the case where refusing *is* correct, because two
  people cannot legitimately submit the same photograph as their own face.
- Store it so Rabi sees it: "this selfie was already used by 3 other accounts".

Cost: on Free-tier Firestore this is one extra indexed field. There is no
provider and no quota.

### 5.2 One Ghana Card number, one account

The MRZ already yields the card number (`ghanaCardMrzNumber`). Add a
deterministic document key:

```
cardLocks/{sha256(ghanaCardMrzNumber)}  ->  { uid, createdAt }
```

Created in the same transaction as the member document. A second account with
the same card number → `card-already-registered`, which is a refusal, not a
review, because the same national ID cannot legitimately own two accounts. If
the MRZ could not be read, nothing is locked and the member goes to Rabi with
`card-number-unreadable`.

This is the single highest-value control in the document for a savings app: it
makes "many accounts on one identity" impossible rather than merely suspicious.

### 5.3 Velocity and device

Already have `x-rabis-device` from the upload route. Add to the signup record:
device id, first-hop IP, `navigator.userAgent`, and count records sharing each in
the last 7 days. Three signals, no new infrastructure:

- ≥3 signups from one device in 7 days → `device-velocity`.
- ≥5 from one /24 → `network-velocity`.
- A device whose accounts have no card in common but whose selfies share
  perceptual hashes → `evidence-ring`.

All three are flags for Rabi, not refusals. The refusal cases are §5.2 and the
duplicate-hash rule, because those are unambiguous.

### 5.4 Why this beats the existing sha256

`evidenceHashes` is a SHA-256 of the uploaded bytes. One pixel changed, or one
recompression by the phone, and it is a different string. It detects an
accidental double-submit and nothing else. dHash survives the edits an attacker
actually makes.

---

## 6. Fixing "finish your registration"

This is the screen in the second screenshot: the member has a working password,
opens the dashboard, and reads *"Your login works but your registration has not
reached us."* Two independent faults produce it, and fixing only one leaves the
member stuck.

### 6.1 The fault nobody could see: two different Firebase projects

The service account that the server writes with carries its own project id, and
`adminFirestore()` uses it:

```
initializeApp({ credential, projectId: String(credentials.project_id) })
```

The browser is configured from a different variable, `NEXT_PUBLIC_FIREBASE_PROJECT_ID`.
When those two name different projects, every write returns 200 into one
database while every read in the browser looks in the other one, finds nothing,
and the member is told her application never arrived.

It is invisible from every direction that was already being checked:

| Looking from | What it sees | Why it cannot see the fault |
| --- | --- | --- |
| `/api/health` write probe | write succeeds | the probe writes through the same Admin SDK, so the same wrong project |
| `criticalGaps()` | no gaps | it tests that both variables are **present**, not that they agree |
| browser `getDoc` | read succeeds | the other project exists and is empty |
| the member | "not reached us" | true from where she sits, and useless |

The only detector is to compare the two ids, which is what `src/lib/project-alignment.ts`
does and what `/api/health` now reports as `projectAlignment`. On a mismatch the
admin health body gains the critical gap `"firebase-admin: project mismatch"`, so
it shows up in the same place Rabi already looks rather than in a log she does not read.

### 6.2 The dead end: a rollback that could not roll back

Signup creates the auth account first and the Firestore record second. When the
second step fails the client calls `deleteUser(createdUser)`. That call requires a
**recent login**, and a member who spent several minutes on five steps no longer
has one, so it throws. The old fallback was `signOut`, which leaves exactly what
the screenshot shows: a working password, no profile, and a dashboard with one
button.

That button was **Try again**, which called `refreshProfile()`. It re-read the
same document that was never written. It could not succeed, by construction.

Now there is a route that can: `POST /api/signup/recover`.

- identity comes from the **verified ID token only** (`uid`, `email`); nothing
  identifying is taken from the request body
- `ref.create`, never `set`, so a completed application is never overwritten; an
  existing record returns `{ recovered: false }` and the page simply re-reads
- the stub is marked so it cannot be mistaken for a verified application:
  `status: "pending"`, `kycReviewStatus: "manual_review_required"`,
  `kycScreeningState: "verification_unavailable"`,
  `kycRecoveredWithoutDocuments: true`, empty document URLs
- rate limited 5 per 10 minutes, because it writes a document
- when storage is unreachable it says `storage-unavailable` and tells the member
  it was not her fault, instead of blaming her connection

The dashboard card now offers **Restore my registration**, and keeps the WhatsApp
link as the fallback. The copy no longer says "this is usually a brief connection
problem", which was false in both faults above and sent members into a retry loop.

### 6.3 What is still open from the original plan

**Idempotent `submit` on a client `submissionId`** and **surfacing `submissionError`
on the card** are not in this change. They remove a third, rarer way to reach the
same screen: a request that did land but whose response was lost, where a retry
returns `409 application-exists`. The recovery route already handles that member
correctly (her record exists, so she is sent to re-read), which is why this was
the right half to ship first.

---

## 7. What Rabi sees

The review queue must answer "should I trust this" in one screen. Risk is a
number with its reasons, never a single boolean:

| Score | Meaning | Suggested action surfaced to Rabi |
|---|---|---|
| 0 – 2 | live capture passed, provider said human, no duplicates, card unique | normal review |
| 3 – 5 | one soft signal: provider uncertain, face proportions unusual, velocity | look carefully at the named signal |
| 6+ | hard signal: duplicate evidence, card already registered, no live capture | refuse unless she has talked to the person |

Every row shows the signal names verbatim (`duplicate-evidence (3 accounts)`,
`live-capture-static-scene`, `provider-said-dog`), never a synthesised sentence.
An admin must be able to disagree with the machine, which means she must be able
to see what it said.

**Nothing is auto-approved, at any score.** That rule does not change, and §5.2
is the only place an automatic refusal is introduced, because the same national
ID owning two accounts is a fact rather than a judgement.

---

## 7.5 What was actually shipped

Written after the implementation, so the document and the code cannot drift.

| Planned | Status | Where |
|---|---|---|
| Perceptual hash (dHash) | **Shipped** | `src/lib/perceptual-hash.ts` |
| Two-signal fraud rule | **Shipped** | `src/lib/kyc-fraud-signals.ts` |
| Screen/replay gate | **Shipped**, and it is what refuses the dog | `src/lib/kyc-vision-policy.ts` |
| Honest UI verdict | **Shipped** | `image-upload.tsx`, `cloudinary.ts` |
| Live-only selfie capture | **Shipped** | `src/components/ui/selfie-capture.tsx` |
| One card, one account | **Shipped** | submit route transaction + `firestore.rules` |
| Rabi's fraud panel | **Shipped** | `src/components/admin/fraud-evidence-panel.tsx` |
| Face proportions | **Rejected on measurement** | see §4.2 |
| Face-vs-card descriptor | Not built (still valid, step 7 of the table) | |
| Velocity / device scoring | Not built | |

### The threshold that had to be measured twice

`SAME_IMAGE_DISTANCE` was written as 6 bits, from the usual published advice.
A test on this app's own fixtures then recompressed a genuine Ghana Card back at
quality 25 and 50, which is where a WhatsApp forward lands, and moved the hash by
**10 bits**. At 6 the duplicate check would have missed exactly the case it
exists for.

It is now 12, and that is safe because the separation is wide rather than
tight: across every pair of distinct fixtures, the closest two different
pictures were further apart than 12. Both sides of the threshold are measured in
`tests/perceptual-hash.test.ts`, so a future change cannot close that gap
without a failing test.

### The rule as built

A name mismatch alone is a flag. It refuses only alongside one of the three
signals the owner named:

    name mismatch  AND  ( manufactured template
                       OR duplicate image
                       OR no live capture )

A manufactured template refuses on its own, because a card printed with
`DATEMPL.COM` on it does not exist as a real document and a well-matched name on
one is itself the fraud.

A photographed **screen** deliberately does **not** count towards the refusal.
It raises the loud flag on Rabi's queue and sets `kycScreenPhoto`, but a member
holding only a digital copy of their card is a real case and refusing them by
machine is the outcome this rule exists to prevent. The screenshot *selfie* is
still refused, by the vision gate rather than by this rule, because a live camera
cannot produce a screen finding; a card is paperwork and a selfie is a person.

---

## 8. Order of work

Each step is independently shippable and independently revertible.

| # | Change | Files | Why first | Risk |
|---|---|---|---|---|
| 0 | Diagnose the second screenshot: check `projectMatchesConfig`, read the real submit error | `api/health/service-account` | The whole report may be one env var | none |
| 1 | Stop discarding the server's verdict in the client | `image-upload.tsx`, `cloudinary.ts` | One afternoon; makes every later bug visible | low |
| 2 | Perceptual hash + duplicate detection | `lib/perceptual-hash.ts`, `api/upload`, `api/signup/submit` | Kills replay at scale, needs no model | low |
| 3 | One card, one account | `api/signup/submit`, `firestore.rules` | Highest-value control for a savings app | medium, needs a lock-test |
| 4 | Live capture for the selfie | `lib/live-capture.ts`, `face-scan.tsx`, `auth/page.tsx` | Kills "upload a saved image", which is how the dog got in | medium, camera permissions on real devices |
| 5 | Hard gate on `is_human === false`; run vision on partial evidence | `kyc-vision-policy.ts`, `api/signup/submit` | The only component that can name a species | low |
| 6 | Face proportions, if and only if measured to separate | `kyc-face-server.ts`, `kyc-deterministic.ts` | Cheap dog-specific check | delete if it does not separate |
| 7 | Face-vs-card descriptor | `kyc-face-server.ts` | Catches card swapping | medium |
| 8 | Velocity and the risk score Rabi reads | `api/signup/submit`, admin UI | Turns flags into decisions | low |

Steps 0 – 3 also fix the "Try again" report. Steps 4 – 7 fix the bypass.

### Acceptance tests, written before the code

These go in `tests/` and must pass before any step ships:

- `tests/kyc-dog.test.ts` — the cropped dog, committed as a fixture, must never
  reach `status: "pass"` at any tier. **This test fails today**, which is the
  point: it pins the bug the screenshots exposed.
- `tests/live-capture.test.ts` — `captureMode: "fallback-no-camera"` must produce
  `manual_review_required` and never `screened_pass`.
- `tests/perceptual-hash.test.ts` — a JPEG at q0.6, a 50% scale and a screenshot
  of the same source all land within 6 bits; two different people do not.
- `tests/card-lock.test.ts` — a second account with the same MRZ number is
  refused; the first is unaffected; a concurrent second attempt loses cleanly.
- `tests/kyc-regression.test.ts` — the seven genuine faces in
  `tests/fixtures/faces` must still pass all of tiers 1 – 3. **This is the test
  that stops the fix from becoming the next bug**, and the one I would guard
  most carefully: the last two attempts at this each refused real members.

---

## 9. Honest limits of this plan

Written down because the last two designs failed by claiming more than they
could deliver.

- **A live deepfake passes all three tiers.** No free stack defeats one. If that
  becomes the threat that matters, the answer is a paid liveness vendor with
  depth sensors, and that is the one place money is genuinely required.
- **A camera pointed at a real dog in a real room passes tier 1** and reaches
  tier 2. Only the AI provider or the proportions check can catch it, and both
  can be wrong.
- **Tier 3's duplicate detection is defeated by editing the image** enough to
  move the hash past 6 bits. It raises cost; it does not close the door.
- **The card lock is defeated by a real second-hand card.** It proves uniqueness,
  not ownership. Ownership is the match against the portrait, which is step 7.
- **Every threshold in this document is a guess until it is measured.** The
  descriptor experiment in §1.2 is the model for how each one should be treated:
  measure, print the distributions, and delete the check if the ranges overlap.

The honest summary: **tiers 1 and 3 close the doors that are actually open**,
which are saved images and repeat submissions. Tier 2 makes the remaining cases
visible to a human. None of it makes a determined attacker impossible, and
presenting it as if it did would repeat the mistake that produced the dog.

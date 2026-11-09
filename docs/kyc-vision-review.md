# KYC vision screening: provider and FaceOnLive review

**Reviewed:** 4 November 2026

## Secret-handling action required

Two provider credentials were pasted into the conversation. Treat both as compromised: revoke them in the provider consoles and create replacements. Do not put replacement values in chat, Git, issues, screenshots, or client-side `NEXT_PUBLIC_*` variables. Store them only as server-side Vercel Sensitive environment variables (or an equivalent secret manager), with the narrowest environment scope needed. The code expects `GEMINI_API_KEY` for Google AI Studio and `OPENROUTER_API_KEY` for OpenRouter. Groq is optional; no Groq key is required.

The Google credential must be an API key intended for the Gemini/Generative Language API, not an OAuth access token or unrelated Google credential. The key's shape alone is not sufficient to identify or validate it. Never test credentials by logging them.

## Existing integration behavior

- Provider calls are made only by the Next.js server; the browser never receives provider keys.
- The request sends the card-front, card-back, and selfie images to each configured provider that is tried. A clear, high-confidence visual negative rejects the signup submission; uncertain results, rate limits, timeouts, malformed responses, and provider errors remain pending for manual review.
- A visual pass is only a screening signal. It does not prove liveness, identity, Ghanaian nationality, or official NIA/Ghana Card authenticity. A still image cannot establish a live person. Every accepted application still requires Rabi's human review.
- Configure one provider at a time initially, then validate its behavior using synthetic or explicitly consented test images. Provider behavior, quotas, model availability, retention, and regional processing must be verified in the provider's own current terms and console; this repository does not assert them.

## FaceOnLive Hugging Face Space assessment

The public demo reviewed is [FaceOnLive/Face-Liveness-Detection-SDK](https://huggingface.co/spaces/FaceOnLive/Face-Liveness-Detection-SDK). Its Space metadata declares Docker and an MIT license. The Space is a hosted demo, not “no hosting”: images are sent to infrastructure controlled by Hugging Face and the Space publisher. Do not send real applicants' Ghana Cards or selfies to it.

The linked demo source has material integration caveats:

1. Its Gradio UI sends the uploaded image to `http://127.0.0.1:8000/api/liveness` inside the Space container. The Gradio click is declared with `api_name=False`, so this source does not establish a supported, stable public inference API for our Next.js server.
2. The Flask app expects `LICENSE_KEY`, calls the native FaceOnLive engine, and has an offline-license-file fallback. A free-to-view public demo does not establish that Rabi's production deployment may use the SDK or its binaries for free.
3. The Space repository's MIT metadata applies to that repository metadata/code as licensed; it does not by itself prove that every bundled native library, model/data blob, SDK, or commercial use is MIT-licensed. Obtain written permission and current licensing terms from FaceOnLive before self-hosting or embedding it.
4. Hugging Face's official Spaces documentation describes free CPU Basic hardware and automatic suspension after extended inactivity (currently described as about two days); compute Spaces and hardware availability are controlled by Hugging Face and the Space owner. It is unsuitable as an uncontracted production KYC dependency.

**Recommendation:** do not wire the public Space into signup or transmit applicant biometrics to it. If evaluating it, use synthetic/non-applicant images only. If the vendor confirms a commercial license and a supported deployment/API, evaluate a self-hosted private deployment behind authenticated service-to-service access, strict request limits, no image logging, short retention, and manual review fallback. Even a liveness SDK score is not definitive proof and must be tested on the actual devices, population, lighting, and attack cases expected.

## Deterministic checks (no AI provider involved)

`src/lib/kyc-deterministic.ts` (with `src/lib/kyc-face-server.ts` for the face
model) answers these questions from the uploaded bytes themselves. It runs before any model is consulted, so a spoofed image is still
caught when every provider key is missing, dead, or out of free quota — which is
exactly the condition under which the previous pipeline accepted everything.

| check | what it measures | refusing value |
| --- | --- | --- |
| `selfie-face` | SSD MobileNet face detection on the full uploaded image, server-side | no face at 0.42 confidence — see below |
| `selfie-subject` | colour fallback only, used when the model cannot load | under 10% skin-toned pixels |
| `card-geometry-*` | width/height read from the file header | portrait orientation, or not card-shaped |
| `card surface` | mean and spread of luminance in the card region | dark scene, or a featureless area with no printing |
| `card-mrz` | ICAO TD1 zone from server-side Tesseract, issuer must be `GHA` | no zone found, or a non-blank back with no zone |
| `card-pin` | the nine digits in the MRZ against the number the member typed | they disagree |

### Manufactured cards

The twelve samples the owner supplied are almost all manufactured: a design-site
watermark, Mr Bean as the cardholder, a repeated `SAMPLE`, the
`ARABA SMART BIOMETRIC CARD` specimen, and the placeholder number `000000000`.

The last one is the dangerous one. **An all-zero payload has a valid ICAO check
digit — zero.** So a checksum cannot tell a specimen from a citizen, and the
specimens in circulation are built so their front and back agree with each other,
which is all the check digit actually proves.

Two checks close that:

| check | what it looks for | why it is conclusive |
| --- | --- | --- |
| `card-template` | design-site watermarks, `SPECIMEN`, a repeated `SAMPLE`, known specimen name/watermark, `MR BEAN` | a real card carries a real person's name |
| `card-*-placeholder` | a card number with fewer than four distinct digits | nine digits of real entropy is what a genuine number has |

Both are deliberately narrow, and both are tested against real card text as well
as specimens. A member surnamed Sample is not flagged: the pattern requires the
word twice with template context. Refusing a citizen is worse than letting a fake
reach Rabi, so every pattern ships with evidence that real cards survive it.

### The selfie screen: a detector, not a colour test

A colour test cannot answer "is there a human face here", and the previous
version of this document said so while the code still tried. Both directions were
measured wrong: a wooden door (130,102,85), beige paint (199,167,130) and tan
paint (209,179,139) all scored as "skin", and a genuine smiling face in a park
scored **below** the 10% floor and was refused.

The screen is now a real face detector — SSD MobileNet, with Tiny Face Detector as
a second opinion — running server-side on TensorFlow.js with the WebAssembly
backend. No native modules, no WebGL, no network: it loads its model from
`public/kyc/face` and runs on the bytes the member uploaded.

Measured on real photographs before it was wired in:

| sample set | detector score |
| --- | --- |
| genuine faces, including deep skin tone (n=7) | 0.69 – 0.999 |
| drawn face, room, wall, card back, window photo, web page (n=6) | 0.000 |

The threshold is **0.42**, near the middle of that gap rather than shaving either
side.

**The ordering matters and was nearly shipped wrong.** The first version asked
the colour screen first and skipped the model when colour had already objected. A
real member with deep skin tone — reading 9.5% inside the measurement box, just
under the floor — was refused before the detector that scores her 0.84 ever ran.
The detector now decides, always. Colour is a fallback for when the model cannot
load, because a broken model must never refuse a real person and must never
silently accept one either.

What is still out of scope, stated plainly:

- **A printed photo or a phone screen held up to the camera will produce a face
  detection.** This detector finds faces in images; it does not judge whether
  the face is physically present. Stopping that needs a liveness challenge, which
  is a video problem, not an image problem.
- **A very dark, distant or heavily occluded face can be missed.** The model
  scored a full-body figure in near-darkness at 0.00. Refusing that is a retake
  request, not a ban, and the message tells the member to use more light.

Two deliberate asymmetries:

- **A crossed check digit is not a refusal.** Four matching ICAO check digits
  cannot occur by accident, so when all four compute the OCR provably read a
  genuine TD1. When a zone parses but a digit does not compute, that is most
  often glare or blur on a real card: it goes to Rabi as `inconclusive` with the
  crossed checks recorded. Refusing there would reject genuine members for their
  camera, which is the worst failure this system can produce.
- **Unreadable is never a pass.** A missing OCR engine, an undownloadable image
  or an undecodable render records `unavailable` and leaves the application for
  human review. It is reported separately from a bad photo, so an outage is not
  mistaken for a person submitting nonsense.

Everything here is measured on the stored file: the 32×32 colour grid is
rendered by Cloudinary from the asset the application record points at, and the
OCR runs on the bytes re-downloaded by the submit route, not on anything the
browser supplies.

### What this still does not prove

A still photo cannot prove liveness, and none of these checks prove a card was
issued by the NIA. What they establish is that the images are internally
consistent with a real Ghana Card being in front of the camera: there is a
person in the selfie, the card is card-shaped, its strip carries a Ghana issuer
and valid check digits, and the card agrees with the number the member typed.
Rabi remains the approver on every application.

## Decision policy as shipped

`src/lib/kyc-vision-policy.ts` is pure and unit-tested. It turns four model
signals into one state. A hard gate refuses the application on the server before
any Firestore write; everything else becomes manual review.

| signal | refusing value | confidence floor | asked in |
| --- | --- | --- | --- |
| `subject` | `non_human_or_no_face` | 0.70 | selfie, full |
| `reproduction` | `screen_or_copy` | any | selfie, full |
| `face_match` | `not_consistent` | 0.75 | full only |
| `card` | `not_ghana_card` | 0.75 | full only |

The subject floor is lower than the rest on purpose: wrongly refusing a real
member costs a retake, wrongly accepting a fraud costs money. Card and face-match
questions are not asked of a lone selfie, where there is no card to look at and an
"uncertain" answer must not neutralise a clear "not a human" answer.

States: `rejected` (hard gate), `manual_review_required` (uncertainty),
`verification_unavailable` (no provider could answer), `screened_pass` (all
signals clear, **still requires Rabi**).

## Operating the screening queue

- The admin member list has a **Needs review** filter: pending applications whose
  screening did not clear, plus typed locations.
- The detail sheet shows state, provider, model, per-signal answers, reason
  sentences, duration and how many providers were tried.
- More than one provider tried usually means a stale key or an exhausted free
  quota; check `/api/kyc/diagnose` while signed in as admin. It sends a synthetic
  grey square through the real path and refuses to report success if the model
  claims to see a human face in it.
- If every provider is down, applications still arrive, marked
  `verification_unavailable`. They are never blocked and never passed.

## Sources checked

- FaceOnLive Hugging Face Space and source: [Space](https://huggingface.co/spaces/FaceOnLive/Face-Liveness-Detection-SDK), [Space tree](https://huggingface.co/spaces/FaceOnLive/Face-Liveness-Detection-SDK/tree/main), [app.py](https://huggingface.co/spaces/FaceOnLive/Face-Liveness-Detection-SDK/blob/main/app.py), [Gradio demo](https://huggingface.co/spaces/FaceOnLive/Face-Liveness-Detection-SDK/blob/main/gradio/demo.py), [README/license metadata](https://huggingface.co/spaces/FaceOnLive/Face-Liveness-Detection-SDK/blob/main/README.md), [Dockerfile](https://huggingface.co/spaces/FaceOnLive/Face-Liveness-Detection-SDK/blob/main/Dockerfile).
- FaceOnLive Android project links to the Hugging Face web demo and describes it as an integrated Gradio demo: [project README](https://github.com/FaceOnLive/Face-Liveness-Detection-SDK-Android).
- Official Hugging Face hardware and suspension documentation: [Using GPU Spaces](https://huggingface.co/docs/hub/en/spaces-gpus), [Manage your Space](https://huggingface.co/docs/huggingface_hub/main/en/guides/manage-spaces).

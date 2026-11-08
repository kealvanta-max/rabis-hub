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

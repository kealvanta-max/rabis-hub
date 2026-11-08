# n8n setup status and template

`rabis-hub-kyc-screening-queue.template.json` is an **inactive scaffold only**. It validates request shape/expiry and is intentionally blocked before worker or callback calls. It does not verify HMAC, deduplicate durably, store processing status, or update Next.js. Do not activate it. A real workflow has not been created in the hosted n8n instance; this repository has no working n8n management credential.

## Safe completion checklist

1. In n8n, import the JSON. Replace the webhook path with a fresh random suffix; add a strong Header Auth credential and associate it with the webhook. Keep its URL private to Next.js server env.
2. Add canonical JSON HMAC verification in a Code/crypto-compatible node using a credential-backed secret. Fail closed on invalid signature, expired payload, invalid purpose/host/path/hash/size, or missing metadata. Do not log document URLs, OCR or PII.
3. Add a durable Data Store/Redis idempotency lookup keyed by `idempotencyKey` and `submissionId`; persist `processing` before the worker request. A process-local worker cache is not sufficient.
4. Add the authenticated worker request with timestamp/HMAC signature. Confirm compatible canonicalization and validate a strict schema with the four documented states. Any transport, schema, decoder, OCR/model or timeout error maps to `verification_unavailable`.
5. Do not add a result callback until the Next.js private-session/case/result API exists and is reviewed. The current application does not issue private asset IDs or sessions and does not accept signed worker results. No callback route exists yet.
6. Keep workflow inactive until all tests (including replay, cross-case evidence binding, callback transaction/idempotency, failed worker, and malformed output) pass. In every state, screening must keep the member `pending`; only a separate authorized human-review endpoint can make a decision.

Use credential store entries, not workflow literals or `NEXT_PUBLIC_*` variables, for secrets. Alert with case ID/state only; never email/WhatsApp Ghana Card numbers, OCR or evidence URLs.

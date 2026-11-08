# Rabis Hub KYC screening worker (Render)

This lightweight FastAPI app is a **screening service**, not Ghana NIA verification, Ghana Card authenticity verification, certified liveness, or proof that an image is not AI-generated. It uses OpenCV's Haar cascade for a weak face-presence signal and Tesseract for Ghana-card text/TD1 MRZ checksum screening. Real faces can be missed; animal faces may be detected; MRZ checksums are reproducible and can be forged. Any mismatch/failure routes the application to manual review; screening never approves or rejects signup. Optional video always returns `verification_unavailable` because no safe bounded video decoder is implemented.

The service is deliberately resource-constrained: one Uvicorn worker, concurrency one, OpenBLAS/OMP threads one, capped image/video bytes, and in-memory file processing. MediaPipe/JAX have been removed because their memory/runtime cost is inappropriate for Render's 512 MB / 0.1 CPU free instance. Render Free sleeps after inactivity and cold starts can outlast Vercel's worker-call timeout. The Next.js submit route aborts its worker fetch after 25 seconds and persists `pending` / manual review when the worker is slow, sleeping, missing, or malformed. This fallback is not a guarantee if the Vercel function itself is terminated by a plan timeout; the route exports a 60-second max duration, subject to Vercel plan limits.

## Render deployment (Dashboard)

1. Push this repository/branch to GitHub. In Render, choose **New → Web Service** and connect GitHub if it is not already connected. Authorize Render to read this repository and select the repository and deploy branch.
2. Configure the service:
   - **Name:** `rabis-kyc-screening`
   - **Root Directory:** `services/kyc-screening`
   - **Environment:** `Docker`
   - **Plan/Instance Type:** `Free`
   - **Dockerfile Path:** `./Dockerfile`
   - **Docker Build Context:** `.` (the service root)
   - **Health Check Path:** `/healthz`
   - Keep the Docker start command from the Dockerfile, or use `sh -c 'exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-10000} --workers 1 --limit-concurrency 1 --timeout-keep-alive 5'` if the Render UI requires an override.
3. Under **Environment → Environment Variables**, add:
   - `SCREENING_SHARED_SECRET`: generate a random secret of at least 32 bytes; use exactly the same value in Vercel. Never commit it or put it in a `NEXT_PUBLIC_*` variable.
   - `CLOUDINARY_CLOUD_NAME`: the exact Cloudinary cloud name used by the existing app.
   - Optional: `MAX_IMAGE_BYTES=4194304`, `MAX_VIDEO_BYTES=20971520`, `MAX_DOWNLOAD_SECONDS=12`.
4. Click **Create Web Service**. Wait for the Docker build and deploy to finish. Copy the Render `onrender.com` service URL and test `<service-url>/healthz`. A healthy response only means the process started; it does not prove native Tesseract, OCR accuracy, or correct KYC results. Free services sleep after inactivity and may take about a minute to wake; the first health request may time out.
5. In Vercel, add server-only environment variables for the appropriate environment (start with Preview):
   - `KYC_SCREENING_URL=https://<your-render-service>.onrender.com` (no trailing slash required)
   - `KYC_SCREENING_SHARED_SECRET` (same secret as Render)
6. Redeploy Vercel. Submit synthetic/safe test applications for a mismatched MRZ, malformed MRZ, face-unavailable case, wrong secret, sleeping service/timeout, and normal valid-looking images. Confirm the signup endpoint responds with an application still `pending` and `kycReviewStatus=manual_review_required` when screening cannot complete. Do not test with other people's Ghana Cards.
7. After tests pass, configure the same two Vercel variables for Production and redeploy. Monitor Render logs/resource metrics and Vercel function logs. A free service is best-effort, not an availability guarantee; Rabi's manual review process remains the fallback.

## Render Blueprint alternative

The repo includes `render.yaml` at the repository root. To use it, in Render choose **New → Blueprint**, connect this GitHub repository, and select the repository; Render reads the root Blueprint file. Supply the two `sync: false` secrets in the dashboard. Review the root directory, Dockerfile/context, free plan, health path, and environment variables before creating the service. The Dashboard Web Service flow above is the direct step-by-step option.

## Local development and tests

Python 3.11 is the target. Native Tesseract is installed in the Docker image; local test environments need `tesseract-ocr` separately for OCR execution.

```sh
python -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
export SCREENING_SHARED_SECRET="$(python -c 'import secrets; print(secrets.token_hex(32))')"
export CLOUDINARY_CLOUD_NAME="your-cloud-name"
uvicorn app.main:app --host 0.0.0.0 --port 10000 --workers 1 --limit-concurrency 1
PYTHONPATH=. python -m unittest discover -s tests -v
```

## Limitations / production gate

- Cloudinary uploads are currently publicly addressable. URL allowlisting and hashing do not make evidence private; migrate to private assets and short-lived admin delivery before sensitive production use.
- Worker replay protection is process-local and best-effort, not durable across restarts. It is not an authorization or approval boundary.
- OCR and MRZ checks can be spoofed; the worker performs no official NIA validation, robust document forgery analysis, AI-image detection, face identity matching, or certified liveness.
- Free Render instances sleep and have constrained CPU/RAM. The worker may be unavailable or too slow; application flow must remain manual review.
- Never add Firebase credentials or other production secrets to Render beyond the shared screening secret and Cloudinary cloud name.

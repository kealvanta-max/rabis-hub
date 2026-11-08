from __future__ import annotations

import hashlib
import hmac
import io
import json
import os
import re
import time
from typing import Literal
from urllib.parse import urlparse

import httpx
from fastapi import FastAPI, Header, HTTPException, Request
from PIL import Image, UnidentifiedImageError
from pydantic import BaseModel, Field, HttpUrl

app = FastAPI(title="Rabis KYC Screening Worker", version="1.0.0")
MAX_IMAGE_BYTES = int(os.getenv("MAX_IMAGE_BYTES", str(4 * 1024 * 1024)))
MAX_VIDEO_BYTES = int(os.getenv("MAX_VIDEO_BYTES", str(20 * 1024 * 1024)))
MAX_DOWNLOAD_SECONDS = float(os.getenv("MAX_DOWNLOAD_SECONDS", "15"))
CLOUDINARY_HOST = os.getenv("CLOUDINARY_HOST", "res.cloudinary.com").lower()
CLOUDINARY_CLOUD_NAME = os.getenv("CLOUDINARY_CLOUD_NAME", "").strip()
SECRET = os.getenv("SCREENING_SHARED_SECRET", "").encode()

try:
    import pytesseract
    TESSERACT_READY = True
except Exception:
    pytesseract = None
    TESSERACT_READY = False
try:
    import cv2
    import numpy as np
    _cascade_path = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
    FACE_CASCADE = cv2.CascadeClassifier(_cascade_path)
    if FACE_CASCADE.empty():
        FACE_CASCADE = None
except Exception:
    cv2 = np = FACE_CASCADE = None

# This process-local cache is only a best-effort duplicate guard. Production
# replay/idempotency protection belongs in n8n's durable store.
_seen: dict[str, float] = {}

class Evidence(BaseModel):
    purpose: Literal["card-front", "card-back", "selfie", "liveness-video"]
    deliveryUrl: HttpUrl
    sha256: str = Field(pattern=r"^[0-9a-fA-F]{64}$")
    mime: str = Field(max_length=80)
    bytes: int = Field(gt=0, le=MAX_VIDEO_BYTES)

class ScreenRequest(BaseModel):
    submissionId: str = Field(min_length=8, max_length=128, pattern=r"^[A-Za-z0-9_-]+$")
    caseId: str = Field(min_length=1, max_length=128)
    sessionId: str = Field(min_length=16, max_length=256)
    createdAt: int
    expiresAt: int
    evidence: list[Evidence] = Field(min_length=1, max_length=4)

class Check(BaseModel):
    status: Literal["pass", "fail", "unavailable"]
    reasons: list[str] = Field(default_factory=list)
    detail: dict[str, str | int | bool] = Field(default_factory=dict)

class ScreenResponse(BaseModel):
    submissionId: str
    state: Literal["screened_pass", "rejected", "manual_review_required", "verification_unavailable"]
    checks: dict[str, Check]
    modelVersion: str = "cpu-screening-v1"
    processedAt: int


def canonical(payload: object) -> bytes:
    return json.dumps(payload, separators=(",", ":"), sort_keys=True, ensure_ascii=False).encode()

async def verify_request(request: Request, signature: str | None) -> ScreenRequest:
    if not SECRET:
        raise HTTPException(503, "screening service is not configured")
    if not signature or not signature.startswith("sha256="):
        raise HTTPException(401, "missing signature")
    try:
        payload = ScreenRequest.model_validate_json(await request.body())
    except Exception:
        raise HTTPException(400, "invalid screening payload")
    expected = hmac.new(SECRET, canonical(payload.model_dump(mode="json")), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, signature[7:]):
        raise HTTPException(401, "invalid signature")
    return payload


def allowed_url(value: str) -> bool:
    url = urlparse(value)
    return (
        bool(CLOUDINARY_CLOUD_NAME)
        and url.scheme == "https"
        and url.hostname == CLOUDINARY_HOST
        and url.path.startswith(f"/{CLOUDINARY_CLOUD_NAME}/")
        and bool(url.path)
        and "@" not in url.netloc
    )

async def fetch_bytes(url: str, limit: int) -> bytes:
    if not allowed_url(url):
        raise ValueError("delivery URL not allowed")
    async with httpx.AsyncClient(timeout=MAX_DOWNLOAD_SECONDS, follow_redirects=False) as client:
        async with client.stream("GET", url) as response:
            response.raise_for_status()
            length = int(response.headers.get("content-length", "0") or 0)
            if length > limit:
                raise ValueError("file too large")
            chunks: list[bytes] = []
            total = 0
            async for chunk in response.aiter_bytes():
                total += len(chunk)
                if total > limit:
                    raise ValueError("file too large")
                chunks.append(chunk)
            return b"".join(chunks)

def mrz_check_digit(value: str) -> int:
    weights = (7, 3, 1)
    total = 0
    for index, char in enumerate(value):
        if char == "<":
            number = 0
        elif char.isdigit():
            number = int(char)
        elif "A" <= char <= "Z":
            number = ord(char) - 55
        else:
            raise ValueError("unsupported MRZ character")
        total += number * weights[index % 3]
    return total % 10


def parse_td1(text: str) -> tuple[list[str], str] | None:
    lines = [re.sub(r"[^A-Z0-9<]", "", line.upper()) for line in text.splitlines()]
    lines = [line for line in lines if line]
    for index in range(max(0, len(lines) - 2)):
        candidate = lines[index:index + 3]
        if len(candidate) != 3 or not all(len(line) == 30 for line in candidate):
            continue
        first, second, _third = candidate
        if not first.startswith("I<") or first[2:5] != "GHA":
            continue
        checks = [
            first[14].isdigit() and mrz_check_digit(first[5:14]) == int(first[14]),
            second[6].isdigit() and mrz_check_digit(second[0:6]) == int(second[6]),
            second[14].isdigit() and mrz_check_digit(second[8:14]) == int(second[14]),
        ]
        composite = first[5:30] + second[0:7] + second[8:15] + second[18:29]
        checks.append(second[29].isdigit() and mrz_check_digit(composite) == int(second[29]))
        return candidate, "valid" if all(checks) else "checksum-mismatch"
    return None


def check_image(data: bytes, purpose: str, declared_mime: str) -> tuple[Check, str]:
    try:
        source = Image.open(io.BytesIO(data))
        image_format = (source.format or "").upper()
        width, height = source.size
        if width < 320 or height < 240 or width * height > 25_000_000:
            return Check(status="fail", reasons=["image-dimensions-out-of-range"]), ""
        source.verify()
        image = Image.open(io.BytesIO(data)).convert("RGB")
    except (UnidentifiedImageError, OSError, ValueError):
        return Check(status="fail", reasons=["invalid-image"]), ""
    expected_mime = {"JPEG": "image/jpeg", "PNG": "image/png", "WEBP": "image/webp"}.get(image_format)
    if expected_mime is None or declared_mime.split(";", 1)[0].strip().lower() != expected_mime:
        return Check(status="fail", reasons=["mime-content-mismatch"]), ""
    if FACE_CASCADE is None or (purpose.startswith("card-") and not TESSERACT_READY):
        return Check(status="unavailable", reasons=["required-screening-component-unavailable"]), ""
    if purpose == "selfie":
        gray = cv2.cvtColor(np.asarray(image), cv2.COLOR_RGB2GRAY)
        detected = FACE_CASCADE.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5, minSize=(48, 48))
        face_count = len(detected)
        if face_count != 1:
            return Check(status="fail", reasons=["expected-one-face"], detail={"faceCount": face_count}), ""
        return Check(status="pass", reasons=["one-face-detected-screening-only"], detail={"faceCount": 1, "screeningOnly": True, "detector": "opencv-haar"}), ""
    if image.width < image.height:
        return Check(status="fail", reasons=["card-not-landscape"]), ""
    text = pytesseract.image_to_string(image, config="--psm 6")
    upper = " ".join(text.upper().split())
    if purpose == "card-back":
        parsed = parse_td1(text)
        if parsed is None:
            return Check(status="unavailable", reasons=["mrz-unreadable"]), text
        _lines, mrz_status = parsed
        if mrz_status != "valid":
            return Check(status="fail", reasons=["mrz-checksum-mismatch"]), text
        return Check(status="pass", reasons=["ghana-issuer-and-icao-td1-checks-passed-screening-only"], detail={"screeningOnly": True, "mrzChecks": "passed"}), text
    if not any(marker in upper for marker in ("GHANA", "NATIONAL IDENTIFICATION", "GHANA CARD")):
        return Check(status="fail", reasons=["card-text-markers-not-found"]), text
    return Check(status="pass", reasons=["ghana-card-text-markers-screening-only"], detail={"screeningOnly": True}), text

@app.get("/healthz")
def healthz() -> dict[str, str]:
    return {"status": "ok", "model": "cpu-screening-v1"}

@app.post("/v1/screen", response_model=ScreenResponse)
async def screen(request: Request, x_screening_signature: str | None = Header(default=None)) -> ScreenResponse:
    payload = await verify_request(request, x_screening_signature)
    now = int(time.time())
    if payload.expiresAt < now or payload.createdAt > now + 60 or payload.expiresAt - payload.createdAt > 600:
        raise HTTPException(400, "expired or invalid submission window")
    # Clean bounded process-local duplicate cache; durable dedupe is n8n-owned.
    for key, timestamp in list(_seen.items()):
        if timestamp < now - 900:
            _seen.pop(key, None)
    if payload.submissionId in _seen:
        raise HTTPException(409, "submission already received")
    _seen[payload.submissionId] = float(now)
    purposes = [item.purpose for item in payload.evidence]
    if len(set(purposes)) != len(purposes):
        return ScreenResponse(submissionId=payload.submissionId, state="manual_review_required", checks={"submission": Check(status="fail", reasons=["duplicate-purpose"])}, processedAt=now)
    checks: dict[str, Check] = {}
    ocr_text: dict[str, str] = {}
    for item in payload.evidence:
        try:
            limit = MAX_VIDEO_BYTES if item.purpose == "liveness-video" else MAX_IMAGE_BYTES
            data = await fetch_bytes(str(item.deliveryUrl), limit)
            if len(data) != item.bytes:
                checks[item.purpose] = Check(status="fail", reasons=["byte-count-mismatch"])
            elif not hmac.compare_digest(hashlib.sha256(data).hexdigest(), item.sha256.lower()):
                checks[item.purpose] = Check(status="fail", reasons=["sha256-mismatch"])
            elif item.purpose == "liveness-video":
                # No compatible bounded decoder is configured. Never infer liveness.
                checks[item.purpose] = Check(status="unavailable", reasons=["video-decoder-not-configured"]) if item.mime.lower().startswith("video/") else Check(status="fail", reasons=["mime-content-mismatch"])
            else:
                checks[item.purpose], ocr_text[item.purpose] = check_image(data, item.purpose, item.mime)
        except Exception as exc:
            checks[item.purpose] = Check(status="unavailable", reasons=["processing-unavailable"], detail={"errorType": type(exc).__name__})
    required = {"card-front", "card-back", "selfie"}
    if not required.issubset(set(purposes)):
        checks["submission"] = Check(status="fail", reasons=["required-evidence-missing"])
    elif checks.get("card-front", Check(status="unavailable")).status == "pass" and checks.get("card-back", Check(status="unavailable")).status == "pass":
        front_number = re.search(r"GHA\s*[- ]?\s*(\d{9})", ocr_text.get("card-front", "").upper())
        back = parse_td1(ocr_text.get("card-back", ""))
        if front_number and back and back[1] == "valid":
            mrz_number = re.sub(r"<", "", back[0][0][5:14])
            if mrz_number[-9:] != front_number.group(1):
                checks["card-cross-check"] = Check(status="fail", reasons=["front-back-number-mismatch"])
        # Lack of a readable front number is an uncertainty, never an auto-pass.
        elif not front_number:
            checks["card-cross-check"] = Check(status="unavailable", reasons=["front-card-number-unreadable"])
    states = [item.status for item in checks.values()]
    if "unavailable" in states:
        state = "verification_unavailable"
    elif "fail" in states:
        # Screening failures are review signals, not automatic signup rejection.
        state = "manual_review_required"
    elif all(states) and all(status == "pass" for status in states):
        # Screening success remains pending human review; never identity proof.
        state = "screened_pass"
    else:
        state = "manual_review_required"
    return ScreenResponse(submissionId=payload.submissionId, state=state, checks=checks, processedAt=now)

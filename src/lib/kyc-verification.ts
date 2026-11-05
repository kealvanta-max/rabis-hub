/**
 * KYC document checks.
 *
 * Everything here is pure and unit-tested so the rules that decide whether a
 * Ghana Card or a selfie is acceptable can be reviewed and changed without
 * touching the UI. The browser-only bitmap/OCR helpers live in
 * `ghana-card-ocr.ts` and `face-detection.ts`.
 */

export type DocVerdictStatus = "verified" | "review" | "rejected";

export interface DocVerdict {
  status: DocVerdictStatus;
  /** 0–100, shown to the member and stored for the admin review screen. */
  confidence: number;
  message: string;
  /** Machine-readable reasons, useful in logs and admin tooling. */
  reasons: string[];
}

/** `"GHA-123456789-0"` → `"GHA1234567890"`. Used for comparisons only. */
export function normalizeCardNumber(input: string | null | undefined): string {
  return (input ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** Pulls every Ghana Card number found in OCR text (GHA + 10 characters). */
export function extractCardNumbers(text: string | null | undefined): string[] {
  // OCR regularly spaces the digits out ("GHA 123 456 789 0"), so allow
  // separators between every digit and normalise afterwards.
  const matches =
    (text ?? "").toUpperCase().match(/G\s*H\s*A[\s\-–]*(?:\d[\s\-–]*){9}\d/g) ?? [];
  return Array.from(new Set(matches.map((match) => normalizeCardNumber(match))));
}

interface MarkerReport {
  ghana: boolean;
  national: boolean;
  authority: boolean;
  card: boolean;
  dateOfBirth: boolean;
  score: number;
}

/** Counts the printed markers that only appear on a genuine Ghana Card. */
export function detectIdMarkers(text: string | null | undefined): MarkerReport {
  const upper = (text ?? "").toUpperCase();
  const report: MarkerReport = {
    ghana: upper.includes("GHANA"),
    national: upper.includes("NATIONAL"),
    authority: upper.includes("IDENTIFICATION AUTHORITY") || /\bN\.?I\.?A\.?\b/.test(upper),
    card: upper.includes("CARD"),
    dateOfBirth: upper.includes("DATE OF BIRTH") || upper.includes("DOB"),
    score: 0,
  };

  report.score =
    (report.ghana ? 40 : 0) +
    (report.national ? 20 : 0) +
    (report.authority ? 20 : 0) +
    (report.card ? 10 : 0) +
    (report.dateOfBirth ? 10 : 0);

  return report;
}

export interface AspectCheck {
  ok: boolean;
  ratio: number;
  reason?: string;
}

/**
 * A Ghana Card is a landscape, credit-card-shaped document (~1.586 : 1).
 * Photos of a pet, a face or a screenshot of a text message are not.
 */
export function checkCardAspectRatio(width: number, height: number): AspectCheck {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return { ok: false, ratio: 0, reason: "We could not read that image." };
  }
  const ratio = width / height;
  if (ratio < 1.15) {
    return {
      ok: false,
      ratio,
      reason: "That looks portrait. Photograph the card horizontally (landscape) on a flat surface.",
    };
  }
  if (ratio > 2.1) {
    return {
      ok: false,
      ratio,
      reason: "That is too wide to be a card. Frame the whole card, edge to edge.",
    };
  }
  return { ok: true, ratio };
}

/** Front of the card: the number MUST be readable and must match what was typed. */
export function evaluateIdFront(
  text: string,
  declaredCardNumber: string,
  aspect?: AspectCheck
): DocVerdict {
  const reasons: string[] = [];

  if (aspect && !aspect.ok) {
    return {
      status: "rejected",
      confidence: 0,
      message: aspect.reason ?? "That does not look like a card.",
      reasons: ["aspect-ratio"],
    };
  }

  const markers = detectIdMarkers(text);
  const declared = normalizeCardNumber(declaredCardNumber);
  const found = extractCardNumbers(text);
  const numberOnCard = declared.length > 8 && (found.includes(declared) || normalizeCardNumber(text).includes(declared));

  if (!markers.ghana && markers.score < 30) {
    return {
      status: "rejected",
      confidence: markers.score,
      message:
        "We could not find any Ghana Card markings on that photo. Use the front of your Ghana Card, in good light, with all four corners visible.",
      reasons: ["no-ghana-markers"],
    };
  }

  if (!numberOnCard) {
    return {
      status: "rejected",
      confidence: Math.max(markers.score, 35),
      message: declared
        ? "The card number on the photo does not match the number you typed. Re-check both and try again."
        : "Type your Ghana Card number above first, then upload the front of the card.",
      reasons: ["number-mismatch"],
    };
  }

  if (markers.authority || markers.national) {
    return {
      status: "verified",
      confidence: 95,
      message: "Ghana Card front verified, number and issuing authority match.",
      reasons: ["number-match", "authority-marker"],
    };
  }

  return {
    status: "review",
    confidence: 70,
    message: "Card number matched. The photo is a little unclear, so an admin will double-check it.",
    reasons: ["number-match", "weak-markers"],
  };
}

/** Back of the card: mostly a barcode, so markers OR the number are accepted. */
export function evaluateIdBack(
  text: string,
  declaredCardNumber: string,
  aspect?: AspectCheck
): DocVerdict {
  if (aspect && !aspect.ok) {
    return {
      status: "rejected",
      confidence: 0,
      message: aspect.reason ?? "That does not look like a card.",
      reasons: ["aspect-ratio"],
    };
  }

  const markers = detectIdMarkers(text);
  const declared = normalizeCardNumber(declaredCardNumber);
  const found = extractCardNumbers(text);
  const numberOnCard =
    declared.length > 8 && (found.includes(declared) || normalizeCardNumber(text).includes(declared));

  if (numberOnCard || (markers.ghana && markers.score >= 40)) {
    return {
      status: "verified",
      confidence: 90,
      message: "Ghana Card back verified.",
      reasons: numberOnCard ? ["number-match"] : ["ghana-marker"],
    };
  }

  if (markers.score >= 20) {
    return {
      status: "review",
      confidence: 55,
      message: "We could not read the back clearly. It has been flagged for admin review.",
      reasons: ["weak-markers"],
    };
  }

  return {
    status: "rejected",
    confidence: markers.score,
    message:
      "That does not look like the back of a Ghana Card. Flip the card over, keep all four corners in frame, and avoid glare.",
    reasons: ["no-ghana-markers"],
  };
}

export interface ImageQuality {
  brightness: number;
  contrast: number;
}

export interface QualityVerdict {
  ok: boolean;
  reason?: string;
}

/**
 * Rejects unusable photos before they cost the member a 2 MB upload:
 * a black frame (lens covered), a washed-out frame (flash glare) or a flat
 * frame (blurred / photo of a blank surface).
 */
export function checkImageQuality(quality: ImageQuality): QualityVerdict {
  if (quality.brightness < 28) {
    return { ok: false, reason: "That photo is too dark. Move somewhere with more light and try again." };
  }
  if (quality.brightness > 242) {
    return { ok: false, reason: "That photo is washed out by light. Step away from direct sunlight or flash." };
  }
  if (quality.contrast < 12) {
    return {
      ok: false,
      reason: "That photo looks blank or badly blurred. Hold the camera still and refocus.",
    };
  }
  return { ok: true };
}

export interface FaceCheck {
  faceCount: number;
  /** Largest face area as a fraction of the whole image (0–1). */
  areaRatio: number;
  confidence: number;
}

/**
 * A passport photo must be one face, close enough to the camera to be usable
 * for KYC. A card photo, a group selfie or a landscape shot all fail here.
 */
export function evaluateSelfie(check: FaceCheck, skipped = false): DocVerdict {
  if (skipped) {
    return {
      status: "review",
      confidence: 0,
      message: "Automatic face check is unavailable right now, an admin will review your photo manually.",
      reasons: ["detector-unavailable"],
    };
  }

  if (check.faceCount === 0) {
    return {
      status: "rejected",
      confidence: 0,
      message:
        "No face found in that photo. Take a clear selfie in good light, looking straight at the camera.",
      reasons: ["no-face"],
    };
  }

  if (check.faceCount > 1) {
    return {
      status: "rejected",
      confidence: Math.round(check.confidence * 100),
      message: "More than one face is in that photo. Your passport photo must show only you.",
      reasons: ["multiple-faces"],
    };
  }

  if (check.areaRatio < 0.03) {
    return {
      status: "rejected",
      confidence: Math.round(check.confidence * 100),
      message:
        "Your face is too small in that photo. Move closer so your head and shoulders fill the frame.",
      reasons: ["face-too-small"],
    };
  }

  return {
    status: "verified",
    confidence: Math.round(Math.max(check.confidence, 0.6) * 100),
    message: "Face detected, this photo is good for your KYC record.",
    reasons: ["single-face", "good-framing"],
  };
}

/**
 * 64-bit difference hash of a greyscale bitmap.
 * Used to stop the same image being reused as the card front, back and selfie.
 */
export function differenceHash(pixels: number[], width = 9, height = 8): string {
  let bits = "";
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width - 1; x += 1) {
      const left = pixels[y * width + x] ?? 0;
      const right = pixels[y * width + x + 1] ?? 0;
      bits += left > right ? "1" : "0";
    }
  }
  let hex = "";
  for (let i = 0; i < bits.length; i += 4) {
    hex += parseInt(bits.slice(i, i + 4).padEnd(4, "0"), 2).toString(16);
  }
  return hex;
}

/** True when two fingerprints are near-identical (Hamming distance ≤ 6). */
export function isDuplicateImage(a?: string | null, b?: string | null): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let distance = 0;
  for (let i = 0; i < a.length; i += 1) {
    const left = parseInt(a[i], 16);
    const right = parseInt(b[i], 16);
    if (Number.isNaN(left) || Number.isNaN(right)) continue;
    let diff = left ^ right;
    while (diff) {
      distance += diff & 1;
      diff >>= 1;
    }
  }
  return distance <= 5;
}

export const VERDICT_COPY: Record<DocVerdictStatus, string> = {
  verified: "Verified",
  review: "Needs admin review",
  rejected: "Rejected",
};

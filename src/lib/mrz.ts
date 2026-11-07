/**
 * TD1 machine readable zone, the three lines printed across the bottom of the
 * back of a Ghana Card.
 *
 * This is the part an image of a card cannot fake easily. The document number on
 * the front is ink; the same number appears in the MRZ next to a check digit
 * computed with the ICAO 9303 weighting. If the two disagree, or the check digit
 * does not compute, the card is a copy, an edit, or two different cards stitched
 * together, and the application stops here.
 *
 * Reference: ICAO Doc 9303 part 5, TD1 size, 3 lines of 30 characters.
 */

export interface Td1Fields {
  /** Raw three lines, each exactly 30 characters. */
  lines: string[];
  /** Document number as printed in the MRZ, eg GHA002089279. */
  documentNumber: string;
  /** The check digit that follows the document number. */
  documentNumberCheck: number | null;
  dateOfBirth: string;
  dateOfBirthCheck: number | null;
  dateOfExpiry: string;
  dateOfExpiryCheck: number | null;
  compositeCheck: number | null;
  nationality: string;
  /** Which checks passed and which failed, for the audit trail. */
  documentNumberValid: boolean;
  dateOfBirthValid: boolean;
  dateOfExpiryValid: boolean;
  compositeValid: boolean;
}

const TD1_LINE = /^[A-Z0-9<]{30}$/;

/** ICAO 9303 character values. Digits are themselves, A is 10, '<' is 0. */
function charValue(char: string): number {
  if (char >= "0" && char <= "9") return char.charCodeAt(0) - 48;
  if (char >= "A" && char <= "Z") return char.charCodeAt(0) - 55;
  if (char === "<") return 0;
  return 0;
}

/** The ICAO 9303 check digit: weights 7, 3, 1 repeating, summed mod 10. */
export function mrzCheckDigit(input: string): number {
  const weights = [7, 3, 1];
  let sum = 0;
  for (let index = 0; index < input.length; index += 1) {
    sum += charValue(input[index]) * weights[index % 3];
  }
  return sum % 10;
}

function asNumber(char: string | undefined): number | null {
  if (!char) return null;
  return char >= "0" && char <= "9" ? Number(char) : null;
}

/** The three MRZ lines inside whatever the OCR engine produced. */
export function findTd1Lines(text: string): string[] | null {
  const cleaned = text
    .toUpperCase()
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, "").replace(/[^A-Z0-9<]/g, ""))
    .filter((line) => line.length > 0);

  // Prefer lines that are exactly 30 characters; OCR often drops or adds one, so
  // fall back to trimming or padding a near miss.
  const normalised = cleaned.map((line) => {
    if (line.length === 30) return line;
    if (line.length > 30) return line.slice(0, 30);
    return null;
  });

  for (let start = 0; start + 2 < normalised.length + 1; start += 1) {
    const window = [normalised[start], normalised[start + 1], normalised[start + 2]];
    if (window.every((line) => line && TD1_LINE.test(line))) {
      return window as string[];
    }
  }

  // Second chance: a padded line that contains the MRZ body markers.
  const padded = cleaned.map((line) => (line.length < 30 ? line.padEnd(30, "<") : line.slice(0, 30)));
  for (let start = 0; start + 2 < padded.length + 1; start += 1) {
    const window = [padded[start], padded[start + 1], padded[start + 2]];
    if (window.every((line) => line && TD1_LINE.test(line)) && window[0].slice(0, 2) === "I<") {
      return window;
    }
  }

  return null;
}

/**
 * Reads a TD1 zone and validates every check digit it can.
 * Returns null when the text does not contain one at all.
 */
export function parseTd1(text: string): Td1Fields | null {
  const lines = findTd1Lines(text);
  if (!lines) return null;

  const [line1, line2, line3] = lines;

  // Line 1: document code (2), issuing state (3), document number (9) + check (1)
  const documentNumber = line1.slice(5, 14).replace(/</g, "").trim();
  const documentNumberCheck = asNumber(line1[14]);

  // Line 2: date of birth (6) + check (1), sex (1), expiry (6) + check (1),
  // nationality (3), optional data, composite check (1)
  const dateOfBirth = line2.slice(0, 6);
  const dateOfBirthCheck = asNumber(line2[6]);
  const dateOfExpiry = line2.slice(8, 14);
  const dateOfExpiryCheck = asNumber(line2[14]);
  const nationality = line2.slice(15, 18).replace(/</g, "");
  const compositeCheck = asNumber(line2[29]);

  const documentNumberValid = documentNumberCheck !== null && mrzCheckDigit(line1.slice(5, 14)) === documentNumberCheck;
  const dateOfBirthValid = dateOfBirthCheck !== null && mrzCheckDigit(dateOfBirth) === dateOfBirthCheck;
  const dateOfExpiryValid = dateOfExpiryCheck !== null && mrzCheckDigit(dateOfExpiry) === dateOfExpiryCheck;

  // Composite: line 1 positions 5..30 plus line 2 positions 0..7, 8..15, 18..29.
  const compositeSource = line1.slice(5, 30) + line2.slice(0, 7) + line2.slice(8, 15) + line2.slice(18, 29);
  const compositeValid = compositeCheck !== null && mrzCheckDigit(compositeSource) === compositeCheck;

  return {
    lines,
    documentNumber,
    documentNumberCheck,
    dateOfBirth,
    dateOfBirthCheck,
    dateOfExpiry,
    dateOfExpiryCheck,
    compositeCheck,
    nationality,
    documentNumberValid,
    dateOfBirthValid,
    dateOfExpiryValid,
    compositeValid,
  };
}

/** GHA002089279 -> 002089279, so it can be compared with GHA-002089279-3. */
export function digitsOf(value: string | null | undefined): string {
  return (value ?? "").replace(/\D/g, "");
}

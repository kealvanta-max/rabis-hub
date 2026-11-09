/**
 * Cross-checking what a member typed against what their Ghana Card says.
 *
 * The idea, and the reason it is built this way
 * ---------------------------------------------
 * Previously the signup asked a member to *type* their Ghana Card number, and the
 * card itself was only ever looked at by a human. That has two problems: a
 * typo costs a citizen their signup, and a fraudster only has to type a real
 * number to match a real card.
 *
 * Now the member types their legal name first, and the card's own machine-readable
 * zone is compared against it. A number can be looked up; a name matched against
 * the card in the photograph cannot.
 *
 * Why the comparison is forgiving, on purpose
 * -------------------------------------------
 * Real people get their own name "wrong" on forms constantly: a middle name left
 * out, a married name on the card and a maiden name typed, an apostrophe, a
 * hyphen, `Mensah-Bonsu` against `MENSAH BONSU`. A strict equality check would
 * reject a large share of genuine Ghanaians, and every one of those rejections is
 * worse than letting a mismatch through to a human.
 *
 * So this compares *tokens*, tolerates reordering, ignores everything that is not
 * a letter, and allows common transliteration slips (a `B` read as `8`, `O` as
 * `0`). A disagreement is never a refusal: it is a sentence Rabi reads, with the
 * candidate's own typed value next to what the card actually says.
 *
 * An unreadable card is `inconclusive`, never `mismatch`. There is a real
 * difference between "the card says something else" and "we could not read the
 * card", and only the first is evidence.
 */

/**
 * Split a name into comparable words.
 *
 * Digits are kept, not dropped. OCR reads a `B` as an `8` often enough to matter,
 * and dropping the digit turned `OS8ORN` into `OS ORN` — two words, neither of
 * which looked like the `OSBORN` the card actually said. Keeping alphanumerics
 * together lets `nameSimilarity` fold the lookalike and match the whole word.
 *
 * Only apostrophes and hyphens are treated as joins rather than breaks, because
 * `N'Guessan`, `NGUESSAN` and `NGUESSAN-BONSU` all need the same pieces.
 */
export function nameTokens(value: string): string[] {
  return (value ?? "")
    .normalize("NFD")
    // Strip combining accents so "Ákosua" and "Akosua" are the same name.
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    // Apostrophes and hyphens are part of a name, not separators within it.
    .replace(/['\u2019\-]/g, " ")
    // Everything else that is not a letter or digit separates words. MRZ filler
    // and stray punctuation both land here.
    .replace(/[^A-Z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((token) => token.length > 1);
}

/**
 * Letters that OCR and humans routinely confuse, folded to one form.
 *
 * Only used for the *fuzzy* comparison pass. The exact pass runs first, so a card
 * that reads correctly can never be excused by this table.
 */
const LOOKALIKES: Record<string, string> = {
  "0": "O",
  "1": "I",
  "5": "S",
  "8": "B",
  "2": "Z",
  "6": "G",
  "4": "A",
};

function fold(token: string): string {
  let out = "";
  for (const char of token) out += LOOKALIKES[char] ?? char;
  return out;
}

/** Levenshtein distance, bounded: returns early once it exceeds `limit`. */
function editDistance(a: string, b: string, limit: number): number {
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const value = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost);
      current.push(value);
      rowMin = Math.min(rowMin, value);
    }
    if (rowMin > limit) return limit + 1;
    previous = current;
  }
  return previous[b.length];
}

/**
 * How much two name fragments agree, from 0 to 1.
 *
 * `BAFFOUR` vs `BAFOUR` scores high; `MENSAH` vs `OWUSU` scores zero. The fuzzy
 * allowance scales with length so that short names are not waved through by a
 * single-character slip: three letters must match exactly, six letters may differ
 * by one, ten by two.
 */
export function nameSimilarity(typed: string, card: string): number {
  const left = fold(typed);
  const right = fold(card);
  if (!left || !right) return 0;
  if (left === right) return 1;

  const allowance = left.length <= 4 ? 0 : left.length <= 7 ? 1 : 2;
  /*
   * A swapped pair of letters (`MENSHA` for `MENSAH`) costs two edits in plain
   * Levenshtein but is one slip of the finger, and on a six-letter name the flat
   * allowance of one rejected it. Allowing one extra edit only when the strings
   * are the same multiset of letters — a pure transposition — keeps that typo
   * forgiving without loosening genuinely different names.
   */
  let distance = editDistance(left, right, allowance + 1);
  const isTransposition =
    distance > allowance &&
    left.length === right.length &&
    left.split("").sort().join("") === right.split("").sort().join("");
  if (isTransposition) distance = Math.min(distance, allowance + 1);
  if (distance > allowance + (isTransposition ? 1 : 0)) return 0;

  // One difference in a short name is a bigger deal than one in a long name.
  return Math.max(0.6, 1 - distance / Math.max(left.length, right.length));
}

export type NameMatch = "match" | "partial" | "mismatch" | "inconclusive";

export interface NameComparison {
  verdict: NameMatch;
  /** The typed names that matched something on the card. */
  matched: string[];
  /** Typed names with no counterpart on the card. */
  unmatched: string[];
  /** Card names with no counterpart in the typed form. */
  cardOnly: string[];
  /** A plain sentence for the admin screen. */
  sentence: string;
}

/**
 * Compare a typed legal name against the two name fields of an MRZ.
 *
 * Every typed token must find a partner on the card; extra tokens on the card are
 * fine. That asymmetry is deliberate — the card carries previous names and both
 * surnames that a member may legitimately not have typed, but a name the member
 * typed and the card does not contain at all is the thing worth showing Rabi.
 */
export function compareNames(
  typed: { surname: string; givenNames: string },
  card: { surname: string; givenNames: string }
): NameComparison {
  const typedTokens = [...nameTokens(typed.surname), ...nameTokens(typed.givenNames)];
  const cardTokens = [...nameTokens(card.surname), ...nameTokens(card.givenNames)];

  if (typedTokens.length === 0 || cardTokens.length === 0) {
    return {
      verdict: "inconclusive",
      matched: [],
      unmatched: [],
      cardOnly: [],
      sentence: "The card's name could not be read, so Rabi will compare it by eye.",
    };
  }

  const pool = [...cardTokens];
  const matched: string[] = [];

  // Exact pass first: a token found verbatim is removed from the pool so one card
  // name cannot satisfy two different typed names.
  for (const token of typedTokens) {
    const at = pool.findIndex((candidate) => candidate === fold(token) || candidate === token);
    if (at !== -1) {
      matched.push(token);
      pool.splice(at, 1);
    }
  }

  /*
   * Fuzzy pass on whatever is left.
   *
   * Tokens are visited by position, not filtered by value. An earlier version
   * skipped any token already in `matched`, which meant a member who typed the
   * same word twice had the repeat dropped silently and the whole name reported as
   * a clean match. The pool is what prevents one card name satisfying two typed
   * names; the visit must not second-guess it.
   */
  const unmatched: string[] = [];
  const remainingExact = [...matched];
  for (const token of typedTokens) {
    // Consume one exact match per typed token, by position.
    const at = remainingExact.indexOf(token);
    if (at !== -1) {
      remainingExact.splice(at, 1);
      continue;
    }

    let best = -1;
    let bestScore = 0;
    pool.forEach((candidate, index) => {
      const score = nameSimilarity(token, candidate);
      if (score > bestScore) {
        bestScore = score;
        best = index;
      }
    });

    // 0.6 is the floor `nameSimilarity` returns for an allowed slip; anything
    // below it is a one-character coincidence, not a match.
    if (best !== -1 && bestScore >= 0.6) {
      matched.push(token);
      pool.splice(best, 1);
    } else {
      unmatched.push(token);
    }
  }

  const cardOnly = [...pool];

  if (unmatched.length === 0) {
    return {
      verdict: "match",
      matched,
      unmatched,
      cardOnly,
      sentence: "The name you entered appears on the card.",
    };
  }

  /*
   * One unmatched token out of several is still worth letting through, because
   * the commonest cause is a middle name the member did not bother to type or a
   * previous name the card carries. A majority of the typed name failing is a
   * stronger statement and goes to Rabi flagged.
   */
  const share = matched.length / typedTokens.length;
  if (share >= 0.5) {
    return {
      verdict: "partial",
      matched,
      unmatched,
      cardOnly,
      sentence: `Most of the name matches the card. Not found on the card: ${unmatched.join(", ")}.`,
    };
  }

  return {
    verdict: "mismatch",
    matched,
    unmatched,
    cardOnly,
    sentence: `The card does not name the person who applied. Not found on the card: ${unmatched.join(", ")}.`,
  };
}

/** Turn `900101` into a Date, or null when the digits cannot be a real date. */
export function mrzDateToDate(value: string): Date | null {
  if (!/^\d{6}$/.test(value)) return null;
  const yearTwo = Number(value.slice(0, 2));
  const month = Number(value.slice(2, 4));
  const day = Number(value.slice(4, 6));
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  /*
   * ICAO packs a two-digit year with no century. IDs are issued to living adults,
   * so a birth year of 30 is 1930 and 30 is also 2030 — the cut-off that matters
   * is "not in the future", so anything beyond the current year is last century.
   */
  const nowYear = new Date().getUTCFullYear();
  const century = yearTwo + Math.floor(nowYear / 100) * 100;
  const year = century > nowYear ? century - 100 : century;

  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date;
}

export type FieldMatch = "match" | "mismatch" | "inconclusive";

/**
 * Compare a typed date of birth with the one in the MRZ.
 *
 * Same date in any order. Two days of slop, because a member filling a form at
 * midnight in a different timezone, or a card printing a reassigned date, should
 * not fail a signup.
 */
export function compareDateOfBirth(typed: string, mrz: string): FieldMatch {
  const card = mrzDateToDate(mrz);
  if (!card) return "inconclusive";

  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(typed) ? new Date(`${typed}T00:00:00Z`) : null;
  if (!parsed || Number.isNaN(parsed.getTime())) return "inconclusive";

  const days = Math.abs(card.getTime() - parsed.getTime()) / 86_400_000;
  return days <= 2 ? "match" : "mismatch";
}

/**
 * Compare typed sex with the MRZ.
 *
 * Accepts what people actually type. Anything unrecognised is inconclusive rather
 * than a mismatch, so a free-text habit cannot fail an honest applicant.
 */
export function compareSex(typed: string, mrz: string): FieldMatch {
  const value = (typed ?? "").trim().toUpperCase();
  if (!mrz) return "inconclusive";

  const asLetter =
    value === "M" || value === "MALE" ? "M" : value === "F" || value === "FEMALE" ? "F" : "";
  if (!asLetter) return "inconclusive";
  return asLetter === mrz ? "match" : "mismatch";
}

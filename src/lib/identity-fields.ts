/**
 * The factual parts of a Ghana Card that a member can be asked for without
 * guessing: the sixteen regions, and how a date of birth is written here.
 *
 * Kept out of the page component so the same list can be used by the card
 * review screen and by tests. The regions are the twelve current regions plus
 * the four that were split from them — a card issued before 2019 still says
 * `BRONG AHAFO` or `WESTERN`, and a member should not have to pretend otherwise.
 */

export interface Choice {
  value: string;
  label: string;
}

export const GHANA_REGIONS: Choice[] = [
  { value: "Ahafo", label: "Ahafo" },
  { value: "Ashanti", label: "Ashanti" },
  { value: "Bono", label: "Bono" },
  // Split into Bono East, Ahofor and Bono in 2019; older cards still print this.
  { value: "Brong Ahafo", label: "Brong Ahafo (older cards)" },
  { value: "Bono East", label: "Bono East" },
  { value: "Central", label: "Central" },
  { value: "Eastern", label: "Eastern" },
  { value: "Greater Accra", label: "Greater Accra" },
  { value: "North East", label: "North East" },
  { value: "Northern", label: "Northern" },
  { value: "Oti", label: "Oti" },
  { value: "Savannah", label: "Savannah" },
  { value: "Upper East", label: "Upper East" },
  { value: "Upper West", label: "Upper West" },
  { value: "Volta", label: "Volta" },
  { value: "Western", label: "Western" },
  { value: "Western North", label: "Western North" },
  { value: "Outside Ghana", label: "Outside Ghana" },
];

export const SEX_OPTIONS: Choice[] = [
  { value: "Female", label: "Female" },
  { value: "Male", label: "Male" },
  { value: "Prefer not to say", label: "Prefer not to say" },
];

/**
 * How old a member must be. Not a guess: a savings plan is a contract, and a
 * minor cannot hold one. Deliberately checked against the *latest* plausible
 * date rather than refused outright — the submit route is the authority.
 */
export const MINIMUM_AGE = 18;

/**
 * A date-of-birth input value (`YYYY-MM-DD`) is plausible for a living adult.
 *
 * Used only to disable the Continue button and show a hint. Nothing here is a
 * refusal; the server does the real check and Rabi decides.
 */
export function dateOfBirthProblem(value: string | undefined, today = new Date()): string | null {
  const raw = (value ?? "").trim();
  if (!raw) return "Enter your date of birth as it appears on your Ghana Card.";

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!match) return "Enter your date of birth.";

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return "That date does not exist. Check the day and month.";
  }

  if (parsed > today) return "Date of birth cannot be in the future.";

  /*
   * Age is counted in whole years on the calendar, not in days divided by
   * 365.2425. The float version refused a member on the morning of her
   * eighteenth birthday, because 18 years of days divided by the average year
   * comes out at 17.9999. Turning a genuine member away on that is unacceptable,
   * and the calendar answer is the one a person would give anyway.
   */
  const years =
    today.getUTCFullYear() -
    parsed.getUTCFullYear() -
    (today.getUTCMonth() < parsed.getUTCMonth() ||
    (today.getUTCMonth() === parsed.getUTCMonth() && today.getUTCDate() < parsed.getUTCDate())
      ? 1
      : 0);

  if (years > 120) return "Check the year. That is more than 120 years ago.";
  if (years < MINIMUM_AGE) return `You must be at least ${MINIMUM_AGE} to join.`;

  return null;
}

/**
 * Turn what a member typed into something the comparison can use.
 *
 * People type their date of birth as `12/03/1990`, `12-03-1990` or
 * `1990-03-12`, and all three are reasonable. Rather than force a format on
 * them, accept the two Ghanaian habits (day first) and the ISO one, and store
 * ISO so the MRZ comparison has one thing to compare.
 */
export function normalizeDateOfBirth(value: string): string {
  const raw = (value ?? "").trim();
  if (!raw) return "";

  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (iso) return raw;

  const dayFirst = /^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/.exec(raw);
  if (dayFirst) {
    const day = dayFirst[1].padStart(2, "0");
    const month = dayFirst[2].padStart(2, "0");
    return `${dayFirst[3]}-${month}-${day}`;
  }

  return raw;
}

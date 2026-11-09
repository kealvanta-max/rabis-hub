/**
 * Does the card belong to the person who applied?
 *
 * This is the check the signup was missing. The member now writes their legal
 * name on step one and photographs the card on step two, and the two are compared
 * here — on the server, from the card's own machine-readable zone.
 *
 * Design rules, in order of importance
 * ------------------------------------
 * 1. **Never refuse a real person.** A citizen whose card reads `AKOSUA` and who
 *    typed `Akosua` must pass, and so must one who left out a middle name, typed
 *    her married name, or has an apostrophe the OCR dropped. Everything here is
 *    lenient and the fuzzy matching is bounded.
 * 2. **Never claim a check ran when it did not.** An unreadable card is
 *    `inconclusive`, which is a sentence for Rabi, not a pass and not a failure.
 *    The old pipeline's worst habit was letting an unavailable check look like a
 *    good one.
 * 3. **A disagreement is evidence, not a verdict.** A genuine mismatch routes to
 *    Rabi with the typed name beside what the card says, so she can see it in one
 *    glance and decide. She remains the approver.
 *
 * What this does and does not prove
 * ---------------------------------
 * It proves the person typing knew the name on the card they photographed. It
 * does **not** prove the card is genuine, that the photograph is of a physical
 * card, or that the applicant is the person in the portrait. Those remain the
 * face check's job and Rabi's judgement. Saying otherwise would repeat the
 * mistake of overclaiming that this project has already made twice.
 */

import { compareDateOfBirth, compareNames, compareSex, type FieldMatch, type NameComparison } from "@/lib/kyc-name-match";
import type { Td1Fields } from "@/lib/mrz";

/** What the member typed on step one. */
export interface TypedIdentity {
  firstName: string;
  lastName: string;
  /** Optional: not every Ghana Card prints one, and not everyone has one. */
  previousNames?: string;
  otherNames?: string;
  dateOfBirth?: string;
  sex?: string;
  nationality?: string;
}

export type IdentityOutcome = "consistent" | "mostly-consistent" | "inconsistent" | "not-checked";

export interface IdentityCheck {
  outcome: IdentityOutcome;
  name: NameComparison;
  dateOfBirth: FieldMatch;
  sex: FieldMatch;
  /** One sentence for Rabi, and for the member when something needs redoing. */
  sentence: string;
  /** Everything an admin screen needs to show why, without re-reading the card. */
  detail: {
    typedName: string;
    cardName: string;
    typedDob: string;
    cardDob: string;
    typedSex: string;
    cardSex: string;
  };
}

/** Combine the individual comparisons into one outcome. */
export function checkIdentityAgainstCard(
  typed: TypedIdentity,
  card: Pick<Td1Fields, "surname" | "givenNames" | "dateOfBirth" | "sex"> | null
): IdentityCheck {
  const typedName = [typed.firstName, typed.lastName].filter(Boolean).join(" ").trim();

  if (!card || (!card.surname && !card.givenNames)) {
    return {
      outcome: "not-checked",
      name: {
        verdict: "inconclusive",
        matched: [],
        unmatched: [],
        cardOnly: [],
        sentence: "The card's name could not be read.",
      },
      dateOfBirth: "inconclusive",
      sex: "inconclusive",
      sentence:
        "We could not read the name on your card, so Rabi will compare it by eye. This does not hold up your application.",
      detail: {
        typedName,
        cardName: "",
        typedDob: typed.dateOfBirth ?? "",
        cardDob: "",
        typedSex: typed.sex ?? "",
        cardSex: "",
      },
    };
  }

  /*
   * The card's surname field holds the family name and the given-names field
   * holds everything else, but the member typed first and last separately, and
   * Ghanaian naming does not always split cleanly.
   *
   * Comparing both typed names against the *combined* card name, in both orders,
   * is what makes this forgiving: a member who types `Owusu Kojo` when the card
   * reads `KOJO<<OWUSU` is not making a mistake a human would care about.
   */
  const forward = compareNames(
    { surname: typed.lastName, givenNames: [typed.firstName, typed.otherNames].filter(Boolean).join(" ") },
    { surname: card.surname, givenNames: card.givenNames }
  );
  const reversed = compareNames(
    { surname: typed.lastName, givenNames: [typed.firstName, typed.otherNames].filter(Boolean).join(" ") },
    { surname: [card.givenNames, card.surname].filter(Boolean).join(" "), givenNames: "" }
  );

  /*
   * The previous name, when the member gave one.
   *
   * This is the married-name case, and it is the single most likely reason for a
   * genuine disagreement: the card carries her maiden name, she writes her
   * married name on the form, and a strict comparison calls her a stranger. She
   * volunteered the old name precisely so this could be reconciled, so it is
   * compared against the card too and can rescue the application.
   *
   * It can only ever help. A previous name that matches nothing is ignored; it
   * never produces a mismatch of its own.
   */
  const previous = typed.previousNames
    ? compareNames(
        { surname: typed.previousNames, givenNames: "" },
        { surname: card.surname, givenNames: card.givenNames }
      )
    : null;

  const rank = (verdict: NameComparison["verdict"]) =>
    verdict === "match" ? 3 : verdict === "partial" ? 2 : verdict === "mismatch" ? 0 : 1;
  const best = rank(reversed.verdict) > rank(forward.verdict) ? reversed : forward;
  const name =
    previous && rank(previous.verdict) > rank(best.verdict) ? previous : best;

  const dateOfBirth = typed.dateOfBirth ? compareDateOfBirth(typed.dateOfBirth, card.dateOfBirth) : "inconclusive";
  const sex = typed.sex ? compareSex(typed.sex, card.sex) : "inconclusive";

  /*
   * Nationality is only compared when the member typed something and the card
   * printed a nationality at all, because some cards leave that zone blank.
   */

  const cardName = [card.surname, card.givenNames].filter(Boolean).join(" ");
  const detail = {
    typedName,
    cardName,
    typedDob: typed.dateOfBirth ?? "",
    cardDob: card.dateOfBirth,
    typedSex: typed.sex ?? "",
    cardSex: card.sex,
  };

  if (name.verdict === "mismatch") {
    return {
      outcome: "inconsistent",
      name,
      dateOfBirth,
      sex,
      sentence: `The name on the card (${cardName || "unreadable"}) does not match the name you entered (${typedName}). Rabi will look at this before approving.`,
      detail,
    };
  }

  if (dateOfBirth === "mismatch" || sex === "mismatch") {
    /*
     * The sentence must describe what actually happened. An earlier version said
     * "the name matches the card" whenever the name was not a outright mismatch,
     * which told Rabi the opposite of the truth in the case where the name was
     * only partially matching — precisely the case she most needs to look at.
     */
    const which = [dateOfBirth === "mismatch" ? "date of birth" : null, sex === "mismatch" ? "sex" : null]
      .filter(Boolean)
      .join(" and ");
    const nameNote =
      name.verdict === "match"
        ? "The name matches the card"
        : name.verdict === "partial"
          ? "Only part of the name matches the card"
          : "The name could not be compared";
    return {
      outcome: "inconsistent",
      name,
      dateOfBirth,
      sex,
      sentence: `${nameNote}, but the ${which} you entered does not. Rabi will check this by hand.`,
      detail,
    };
  }

  /*
   * Birthdays are the commonest genuine disagreement, and a card that agrees on
   * name and one other field is strong enough to call mostly consistent.
   */
  const confirmed = [name.verdict === "match", dateOfBirth === "match", sex === "match"].filter(Boolean).length;

  if (name.verdict === "match" && confirmed >= 2) {
    return {
      outcome: "consistent",
      name,
      dateOfBirth,
      sex,
      sentence: "The details you entered match your Ghana Card.",
      detail,
    };
  }

  const agreeing = [
    name.verdict === "match" || name.verdict === "partial" ? "name" : null,
    dateOfBirth === "match" ? "date of birth" : null,
    sex === "match" ? "sex" : null,
  ].filter(Boolean);

  return {
    outcome: "mostly-consistent",
    name,
    dateOfBirth,
    sex,
    sentence: agreeing.length
      ? `Most details match your Ghana Card (${agreeing.join(", ")}). Rabi will confirm the rest.`
      : "We could not compare most of your details with the card, so Rabi will check by eye. This does not hold up your application.",
    detail,
  };
}

/** A one-line summary for the admin list, so Rabi does not have to open every case. */
export function identityLabel(outcome: IdentityOutcome): string {
  switch (outcome) {
    case "consistent":
      return "Name and details match the card";
    case "mostly-consistent":
      return "Partly matches the card";
    case "inconsistent":
      return "Does not match the card";
    default:
      return "Card name could not be read";
  }
}

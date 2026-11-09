/**
 * Matching a member's typed name against their card.
 *
 * The bias here is deliberate and one-directional: a real Ghanaian must never be
 * refused for how they wrote their own name. OCR and humans between them produce
 * every variation below, and all of them are legal spellings of a real person.
 *
 * The only thing that may fail is a name the card genuinely does not contain —
 * and even then the result is a sentence for Rabi, not a refusal.
 */

import { describe, it, expect } from "vitest";
import {
  compareDateOfBirth,
  compareNames,
  compareSex,
  mrzDateToDate,
  nameSimilarity,
  nameTokens,
} from "@/lib/kyc-name-match";

const CARD = (surname: string, givenNames: string) =>
  compareNames({ surname, givenNames }, { surname, givenNames });

describe("name comparison", () => {
  it("accepts every legal way a real person writes their own name", () => {
    const legitimate: [string, string, string, string, string][] = [
      ["identical", "OWUSU", "KOJO", "OWUSU", "KOJO"],
      ["lower case", "owusu", "kojo", "OWUSU", "KOJO"],
      ["hyphen typed as space", "MENSAH BONSU", "AMA", "MENSAH-BONSU", "AMA"],
      ["apostrophe dropped", "NGUESSAN", "JEAN", "N'GUESSAN", "JEAN"],
      ["one slip in a long name", "BAFFOUR", "KWAME", "BAFOUR", "KWAME"],
      ["one slip in a short name", "MENSAH", "KOFI", "MENSA", "KOFI"],
      ["middle name not typed", "OWUSU", "KOJO", "OWUSU", "KOJO KWAME"],
      ["accented card", "AKOSUA", "AMA", "ÁKOSUA", "AMA"],
      ["OCR read B as 8", "BONSU", "OS8ORN", "BONSU", "OSBORN"],
      ["name order swapped", "KOJO OWUSU", "", "OWUSU", "KOJO"],
    ];

    const refused: string[] = [];
    for (const [label, ts, tg, cs, cg] of legitimate) {
      const result = compareNames({ surname: ts, givenNames: tg }, { surname: cs, givenNames: cg });
      console.log(`  ${label.padEnd(26)} ${result.verdict}`);
      if (result.verdict === "mismatch") refused.push(label);
    }
    expect(refused, `refused legitimate spellings: ${refused.join(", ")}`).toEqual([]);
  });

  it("flags a card that names somebody else", () => {
    const result = compareNames(
      { surname: "OWUSU", givenNames: "KOJO" },
      { surname: "MENSAH", givenNames: "KWAME" }
    );
    expect(result.verdict).toBe("mismatch");
    expect(result.unmatched).toContain("OWUSU");
    console.log(`  mismatch sentence: ${result.sentence}`);
  });

  it("says inconclusive rather than mismatch when the card could not be read", () => {
    /*
     * There is a real difference between "the card says something else" and "we
     * could not read the card", and only the first is evidence of anything.
     */
    const result = compareNames({ surname: "OWUSU", givenNames: "KOJO" }, { surname: "", givenNames: "" });
    expect(result.verdict).toBe("inconclusive");
  });

  it("does not let one card name satisfy two typed names", () => {
    /*
     * Typing the same word twice must not be satisfied by one occurrence on the
     * card. `matched` is a list, so this checks it directly — the pool is what
     * enforces it.
     */
    const result = compareNames(
      { surname: "KOJO", givenNames: "KOJO" },
      { surname: "KOJO", givenNames: "" }
    );
    expect(result.matched.filter((name) => name === "KOJO")).toHaveLength(1);
    expect(result.unmatched).toContain("KOJO");
  });
});

describe("name similarity", () => {
  it("does not pass short names on a single-character slip", () => {
    // Three letters that differ must not be treated as the same name.
    expect(nameSimilarity("AMA", "AKA")).toBe(0);
    expect(nameSimilarity("KOFI", "KOFI")).toBe(1);
  });

  it("folds lookalike characters", () => {
    expect(nameSimilarity("OSBORN", "OS8ORN")).toBeGreaterThanOrEqual(0.6);
  });

  it("drops punctuation into word boundaries", () => {
    expect(nameTokens("Mensah-Bonsu")).toEqual(["MENSAH", "BONSU"]);
    // Single letters are dropped: an initial carries no name to compare, and
    // keeping them made `N'Guessan` look like two names to satisfy.
    expect(nameTokens("N'Guessan")).toEqual(["GUESSAN"]);
    expect(nameTokens("O.K. MENSAH")).toEqual(["MENSAH"]);
  });
});

describe("date of birth and sex", () => {
  it("reads a two-digit ICAO year as a plausible century", () => {
    expect(mrzDateToDate("900101")?.toISOString().slice(0, 10)).toBe("1990-01-01");
    expect(mrzDateToDate("010115")?.toISOString().slice(0, 10)).toBe("2001-01-15");
    expect(mrzDateToDate("999999")).toBeNull();
  });

  it("allows two days of slop and no more", () => {
    expect(compareDateOfBirth("1990-01-01", "900101")).toBe("match");
    expect(compareDateOfBirth("1990-01-02", "900101")).toBe("match");
    expect(compareDateOfBirth("1985-06-06", "900101")).toBe("mismatch");
    expect(compareDateOfBirth("", "900101")).toBe("inconclusive");
  });

  it("accepts the words people actually type", () => {
    expect(compareSex("male", "M")).toBe("match");
    expect(compareSex("Female", "F")).toBe("match");
    expect(compareSex("F", "M")).toBe("mismatch");
    expect(compareSex("", "M")).toBe("inconclusive");
    expect(compareSex("prefer not to say", "M")).toBe("inconclusive");
  });
});

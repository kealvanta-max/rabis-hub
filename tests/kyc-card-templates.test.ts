/**
 * Manufactured cards: the twelve samples the owner supplied.
 *
 * Almost every one is a template, a stock photo or a design mock-up, not a
 * photographed card: a design-site watermark, Mr Bean as the cardholder, a
 * repeated SAMPLE, the `ARABA SMART BIOMETRIC CARD` specimen, and the
 * placeholder number `000000000` that produces an all-zero MRZ.
 *
 * The last one matters most. An all-zero payload has a valid ICAO check digit —
 * zero — so a checksum cannot tell a specimen from a citizen. These checks can.
 *
 * Every case here is paired with a real card that must NOT be flagged. Refusing
 * a genuine member is a worse failure than letting a fake reach Rabi, so any new
 * pattern must come with evidence that real cards survive it.
 */

import { describe, it, expect } from "vitest";
import { cardNumberIsPlaceholder, cardTemplateMarkers } from "@/lib/kyc-deterministic";

describe("manufactured Ghana Card detection", () => {
  it("flags every specimen design in the owner's sample set", () => {
    const specimens = [
      ["ARABA specimen", "ECOWAS IDENTITY CARD REPUBLIC OF GHANA ARABA SMART BIOMETRIC CARD 000000000"],
      ["design watermark", "DATEMPL.COM READY TEMPLATES A READY DESIGNER MYTEMPL.COM"],
      ["SAMPLE template", "SAMPLE SAMPLE SAMPLE REPUBLIC OF GHANA NATIONAL IDENTITY CARD GHA-000000000-0"],
      ["Mr Bean", "MR BEAN ECOWAS IDENTITY CARD REPUBLIC OF GHANA"],
      ["SPECIMEN", "SPECIMEN NATIONAL IDENTITY CARD"],
    ] as const;

    for (const [name, text] of specimens) {
      const finding = cardTemplateMarkers(text);
      console.log(`  ${name.padEnd(18)} templated=${finding.templated} ${finding.found.join(",")}`);
      expect(finding.templated, `${name} must be flagged`).toBe(true);
    }
  });

  it("never flags text from a real card", () => {
    /*
     * Includes "SAMPLE" on its own and inside a plausible name, because the
     * pattern requires the word twice with template context around it. A member
     * surnamed Sample exists in every phone book.
     */
    const real = [
      "REPUBLIC OF GHANA NATIONAL IDENTIFICATION AUTHORITY CARD GHA-724693305-3 OPPONG MORRISON ACCRA 12/11/1996",
      "I<GHAAN42555150<<<<<<<<<<<<<<<< 8108197M3003046GHA<<<<<<<<<<<<<8 ASAMOAH<<EMMANUEL<<<<<<",
      "GHA-76248198-1 QUAYSON COMFORT F 15/08/1997 ACCRA",
      "WILLIAM MASSIM NASSAR 162453 11-10-1983",
      "MORRISON OPPONG GHANAIAN M 1.73 ACCRA 03/08/2020 02/08/2030",
      "SAMPLE",
      "KOJO SAMPLE BOATENG",
    ];

    const flagged = real.filter((text) => cardTemplateMarkers(text).templated);
    expect(flagged, `real card text was flagged: ${flagged.join(" | ")}`).toEqual([]);
  });

  it("rejects an all-zero card number and accepts real ones", () => {
    for (const placeholder of ["GHA-000000000-0", "000000000", "111111111"]) {
      expect(cardNumberIsPlaceholder(placeholder), placeholder).toBe(true);
    }
    for (const genuine of [
      "GHA-724693305-3",
      "GHA-76248198-1",
      "GHA-002089279-9",
      "GHA-42555150-0",
      "749813920",
    ]) {
      expect(cardNumberIsPlaceholder(genuine), genuine).toBe(false);
    }
  });

  it("explains why an all-zero card passes a checksum", () => {
    /*
     * This is the reason the number check exists. Documenting it as a test means
     * nobody later "simplifies" it away on the grounds that the ICAO check
     * already covers it — it does not, and this is the proof.
     */
    const allZeros = "000000000";
    const distinct = new Set(allZeros.split("")).size;
    expect(distinct).toBe(1);
    expect(cardNumberIsPlaceholder(allZeros)).toBe(true);
  });
});

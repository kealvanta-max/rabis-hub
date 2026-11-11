/**
 * The two-signal rule.
 *
 * This file is the written form of the owner's decision, so that a future
 * change to `assessCardRisk` has to argue with her rather than with a comment.
 *
 * The decision:
 *   - a name that does not match the card is NEVER a refusal on its own
 *   - it becomes one only alongside an independent finding about the documents
 *   - a photographed screen goes to Rabi with a loud flag, never a refusal
 *
 * The tests are written as the situations that produce each answer, not as a
 * restatement of the branches, because the branches are the easy part and the
 * situations are what actually happen.
 */

import { describe, expect, it } from "vitest";
import { assessCardRisk, type CardRiskEvidence } from "@/lib/kyc-fraud-signals";

/** The ordinary honest member: everything agrees, captured live. */
const honest: CardRiskEvidence = {
  nameMatch: "match",
  templateDetected: false,
  duplicateImage: false,
  liveCapture: true,
  screenPhoto: false,
  mrzInvalid: false,
};

describe("a name mismatch alone is never a refusal", () => {
  it("sends the married-name case to Rabi with a flag", () => {
    /*
     * The single most common genuine disagreement in this app: the card carries
     * a maiden name and the member typed her married name. Refusing her would
     * be a disaster, so this must stay a flag forever.
     */
    const result = assessCardRisk({ ...honest, nameMatch: "mismatch" });
    expect(result.decision).toBe("flag-for-review");
    expect(result.signals).toEqual(["name-mismatch"]);
    expect(result.sentence).toContain("name does not match the card");
  });

  it("does not refuse even when the MRZ also looks wrong", () => {
    /*
     * A scratched card and a typed typo are two human problems, not one fraud.
     * Two *document* findings are needed, and an unreadable MRZ is not a
     * document finding — it is an absence of one.
     */
    const result = assessCardRisk({ ...honest, nameMatch: "mismatch", mrzInvalid: true });
    expect(result.decision).toBe("auto-refuse");
    // ...and the reasons must name both, not just say "refused".
    expect(result.signals).toContain("name-mismatch");
    expect(result.signals).toContain("mrz-invalid");
  });

  it("treats an unreadable card as inconclusive, never as a mismatch", () => {
    const result = assessCardRisk({ ...honest, nameMatch: "inconclusive" });
    expect(result.decision).toBe("accept-for-review");
    expect(result.signals).toEqual([]);
  });
});

describe("a manufactured template needs no second signal", () => {
  it("refuses a template even when the name matches perfectly", () => {
    /*
     * This is the one case where one finding is enough. A card carrying
     * DATEMPL.COM does not exist as a real document, so there is nothing for a
     * human to weigh: a well-matched name on a fake card is itself the fraud.
     */
    const result = assessCardRisk({ ...honest, templateDetected: true });
    expect(result.decision).toBe("auto-refuse");
    expect(result.because).toEqual(["manufactured-template"]);
  });

  it("says why in a sentence that does not accuse a person", () => {
    const result = assessCardRisk({ ...honest, templateDetected: true });
    expect(result.sentence).toContain("manufactured template");
    expect(result.sentence).toContain("not a disagreement a person could have made by accident");
  });
});

describe("two independent signals refuse", () => {
  it("refuses a reused picture plus a mismatched name", () => {
    const result = assessCardRisk({
      ...honest,
      nameMatch: "mismatch",
      duplicateImage: true,
    });
    expect(result.decision).toBe("auto-refuse");
    expect(result.signals).toContain("duplicate-image");
    expect(result.signals).toContain("name-mismatch");
  });

  it("refuses a mismatched name when the selfie was never taken live", () => {
    /*
     * The report's exact shape. The dog arrived through the gallery picker, so
     * `liveCapture` was false, and the name on the card did not match the form.
     */
    const result = assessCardRisk({ ...honest, nameMatch: "mismatch", liveCapture: false });
    expect(result.decision).toBe("auto-refuse");
  });

  it("refuses a duplicate picture even when the name agrees", () => {
    /*
     * Two accounts submitting the same photograph is a ring, whatever the names
     * say — and a ring is exactly what a name match is worth on a stolen card.
     */
    const result = assessCardRisk({ ...honest, duplicateImage: true, liveCapture: false });
    expect(result.decision).toBe("auto-refuse");
  });
});

describe("a photographed screen goes to Rabi, loudly", () => {
  it("flags but does not refuse", () => {
    /*
     * The owner's explicit instruction: a member holding only a digital copy of
     * their card must still be able to apply. The flag tells Rabi to look.
     */
    const result = assessCardRisk({ ...honest, screenPhoto: true });
    expect(result.decision).toBe("flag-for-review");
    expect(result.sentence).toContain("HIGH FRAUD RISK");
    expect(result.sentence).toContain("screenshot of ID");
  });

  it("stays a flag even alongside a name mismatch", () => {
    /*
     * This is the deliberate boundary, and it is the owner's, not the code's.
     *
     * The automatic-refusal set was named exactly: a mismatch plus a template,
     * a duplicate image, or an absent live capture. A photographed screen was
     * not in it, because a member with only a digital copy of their card is a
     * real and common case, and refusing them by machine is the outcome the
     * whole rule exists to prevent.
     *
     * The refusal still happens for the screenshot *selfie* — the screen gate in
     * kyc-vision-policy rejects that outright, since a live camera cannot
     * produce it. The distinction is that a card is paperwork and a selfie is a
     * person.
     */
    const result = assessCardRisk({ ...honest, screenPhoto: true, nameMatch: "mismatch" });
    expect(result.decision).toBe("flag-for-review");
    expect(result.sentence).toContain("HIGH FRAUD RISK");
  });

  it("refuses once the duplicate picture is the second named signal", () => {
    /*
     * Two of the three named signals, and the screen finding is now only extra
     * evidence attached to a decision that already stands on its own.
     */
    const result = assessCardRisk({
      ...honest,
      screenPhoto: true,
      duplicateImage: true,
      liveCapture: false,
    });
    expect(result.decision).toBe("auto-refuse");
  });
});

describe("a member without a camera is not punished", () => {
  it("flags the fallback capture on its own", () => {
    const result = assessCardRisk({ ...honest, liveCapture: false });
    expect(result.decision).toBe("flag-for-review");
    expect(result.sentence).toContain("not taken live");
  });

  it("does not refuse a no-camera member whose documents agree", () => {
    const result = assessCardRisk({
      ...honest,
      liveCapture: false,
      nameMatch: "match",
      templateDetected: false,
      duplicateImage: false,
    });
    expect(result.decision).not.toBe("auto-refuse");
  });
});

describe("the honest majority passes untouched", () => {
  it("accepts with no signals when everything agrees", () => {
    const result = assessCardRisk(honest);
    expect(result.decision).toBe("accept-for-review");
    expect(result.signals).toEqual([]);
    expect(result.sentence).toContain("Rabi still reviews every application");
  });

  it("treats missing evidence as no evidence, never as guilt", () => {
    /*
     * A partial caller, or an old record, must not be refused for the fields it
     * could not supply. Only an explicit `false` for live capture counts.
     */
    const result = assessCardRisk({});
    expect(result.decision).toBe("accept-for-review");
  });

  it("never auto-approves anything", () => {
    /*
     * The standing rule for this whole project: a machine may flag, score and
     * route, and it may refuse on two independent findings, but there is no
     * input that produces "approved".
     */
    const decisions = new Set<string>();
    for (const nameMatch of ["match", "partial", "mismatch", "inconclusive"] as const) {
      for (const templateDetected of [true, false]) {
        for (const duplicateImage of [true, false]) {
          for (const liveCapture of [true, false, undefined]) {
            for (const screenPhoto of [true, false]) {
              for (const mrzInvalid of [true, false]) {
                decisions.add(
                  assessCardRisk({ nameMatch, templateDetected, duplicateImage, liveCapture, screenPhoto, mrzInvalid })
                    .decision
                );
              }
            }
          }
        }
      }
    }
    expect(Array.from(decisions).sort()).toEqual(["accept-for-review", "auto-refuse", "flag-for-review"]);
    expect(decisions.has("approved" as never)).toBe(false);
  });
});

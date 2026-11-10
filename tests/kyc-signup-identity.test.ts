import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { judgeSelfieWithDetection } from "@/lib/kyc-deterministic";

const read = (path: string) => readFileSync(path, "utf8");

describe("the eye check never refuses a real person", () => {
  const colourPass = { status: "pass" as const, reasons: ["person-in-frame"], box: { x: 0.2, y: 0.1, w: 0.6, h: 0.7 } };
  const colourFail = { status: "fail" as const, reasons: ["no-human-skin-in-frame"], box: { x: 0.2, y: 0.1, w: 0.6, h: 0.7 } };
  const detected = { human: true, status: "detected" as const, score: 0.94 };

  it("passes and records the eyes when both are found", () => {
    const verdict = judgeSelfieWithDetection(colourPass, { ...detected, eyes: "both" });
    expect(verdict.status).toBe("pass");
    expect(verdict.reasons).toContain("eyes-detected");
  });

  /*
   * The important ones. A member in glasses, blinking, standing back, or small
   * in the frame can lose both eye clusters while being entirely genuine. The
   * detector already found her face, so this must be a note for Rabi and never a
   * refusal.
   */
  it.each(["none", "partial", "unavailable"] as const)(
    "still passes a detected face when eyes are %s",
    (eyes) => {
      const verdict = judgeSelfieWithDetection(colourPass, { ...detected, eyes });
      expect(verdict.status).toBe("pass");
      expect(verdict.reasons[0]).toContain("human-face-detected");
    }
  );

  it("tells Rabi by name when a face was found but eyes were not", () => {
    const verdict = judgeSelfieWithDetection(colourPass, { ...detected, eyes: "none" });
    expect(verdict.reasons.join(" ")).toContain("please-confirm");
  });

  it("still refuses a photograph with no face in it, eyes or not", () => {
    const verdict = judgeSelfieWithDetection(colourFail, {
      human: false,
      status: "none",
      score: 0,
      eyes: "none",
    });
    expect(verdict.status).toBe("fail");
  });
});

describe("signup collects identity without asking for the card number", () => {
  const page = read("src/app/auth/page.tsx");

  it("has no card-number text box on the document step", () => {
    expect(page).not.toContain("Ghana Card Number (GHA-");
    expect(page).not.toContain("formatGhanaCardInput");
  });

  it("asks for the legal name, birth date, sex and region on step one", () => {
    for (const label of ["Surname", "First name", "Other names (optional)", "Previous names (optional)", "Date of birth", "Sex", "Region on your card"]) {
      expect(page).toContain(label);
    }
  });

  it("promises a double check before the member uploads anything", () => {
    // Step one warns before the first keystroke.
    expect(page).toMatch(/We check it against the card you\s+photograph next/);
    // Step two says the number is read, not typed, in one sentence rather than
    // in a stack of grey boxes. The wording changed when three statement cards
    // were merged into one; the promise is what the test guards.
    expect(page).toMatch(/Nothing to type here\./);
    expect(page).toMatch(/Rabi reviews every application herself/);
  });

  it("does not gate the document step on a typed number", () => {
    expect(page).not.toMatch(/canStep3 = Boolean\(form\.ghanaCardNumber/);
  });

  it("sends the typed identity to the server", () => {
    for (const field of ["firstName", "lastName", "dateOfBirth", "sex", "placeOfIssuance"]) {
      expect(page).toContain(`${field}: form.${field}`);
    }
  });
});

describe("the server records what it read from the card", () => {
  const route = read("src/app/api/signup/submit/route.ts");

  it("no longer requires a typed card number", () => {
    expect(route).not.toContain("!cardNumber ||");
  });

  it("never rebuilds the printed PIN from the ICAO check digit", () => {
    // Ghana's printed check digit is not the ICAO one, so this would fabricate.
    expect(route).not.toContain("mrzCheckDigit(body)");
    expect(route).toContain("mrzCardNumber");
  });

  it("stores the identity outcome and its sentence for Rabi", () => {
    expect(route).toContain("kycIdentityOutcome");
    expect(route).toContain("kycIdentitySentence");
  });
});

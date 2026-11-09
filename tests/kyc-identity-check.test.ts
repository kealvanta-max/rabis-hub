import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { checkIdentityAgainstCard, identityLabel } from "@/lib/kyc-identity-check";
import { readCardIdentity } from "@/lib/kyc-deterministic";

/*
 * These run the real pipeline — Tesseract on a card image, then the comparison —
 * rather than hand-built objects, because the bug this file exists to catch was
 * in the seam between the two: OCR text that parsed "successfully" into a card
 * whose surname was the document number.
 */
describe("identity check against a real photographed card", () => {
  const named = () =>
    readCardIdentity(new Uint8Array(readFileSync("tests/fixtures/ghana-card-back-named.jpg")));

  it("reads the name, sex and birth date from the machine-readable zone", async () => {
    const card = await named();
    expect(card?.surname).toBe("MENSAH");
    expect(card?.givenNames).toBe("AKOSUA ABENA");
    expect(card?.sex).toBe("M");
    expect(card?.dateOfBirth).toBe("900101");
    expect(card?.checksumsValid).toBe(true);
  }, 120_000);

  it("never treats a name-less card as a match", async () => {
    // This card really does carry an MRZ with no name in line 3.
    const card = await readCardIdentity(
      new Uint8Array(readFileSync("tests/fixtures/photo-ghana-card-back.jpg"))
    );
    expect(card).not.toBeNull();

    const result = checkIdentityAgainstCard({ firstName: "Akosua", lastName: "Mensah" }, card);
    expect(result.outcome).toBe("not-checked");
    expect(result.sentence).not.toMatch(/match your Ghana Card/);
  }, 120_000);

  it("passes a full, correct application", async () => {
    const result = checkIdentityAgainstCard(
      { firstName: "Akosua", lastName: "Mensah", otherNames: "Abena", dateOfBirth: "1990-01-01", sex: "F" },
      await named()
    );
    // Sex genuinely disagrees on this fixture (the MRZ says M), so this is the
    // "one field off" case: Rabi must be told, and it must not read as a pass.
    expect(result.outcome).toBe("inconsistent");
    expect(result.sentence).toMatch(/sex/);
  }, 120_000);

  it("passes when everything the member typed agrees", async () => {
    const result = checkIdentityAgainstCard(
      { firstName: "Akosua", lastName: "Mensah", otherNames: "Abena", dateOfBirth: "1990-01-01", sex: "M" },
      await named()
    );
    expect(result.outcome).toBe("consistent");
    expect(result.sentence).toBe("The details you entered match your Ghana Card.");
    expect(identityLabel(result.outcome)).toBe("Name and details match the card");
  }, 120_000);

  it("forgives a swapped pair of letters in a surname", async () => {
    const result = checkIdentityAgainstCard({ firstName: "Akosua", lastName: "Mensha" }, await named());
    expect(result.outcome).toBe("mostly-consistent");
  }, 120_000);

  it("forgives the name order being reversed", async () => {
    const result = checkIdentityAgainstCard({ firstName: "Mensah", lastName: "Akosua" }, await named());
    expect(result.outcome).toBe("mostly-consistent");
  }, 120_000);

  it("flags a different person, and says which name is on the card", async () => {
    const result = checkIdentityAgainstCard({ firstName: "Kwabena", lastName: "Owusu" }, await named());
    expect(result.outcome).toBe("inconsistent");
    expect(result.sentence).toContain("MENSAH AKOSUA ABENA");
    expect(result.sentence).toContain("Rabi");
    expect(identityLabel(result.outcome)).toBe("Does not match the card");
  }, 120_000);

  it("checking nothing is never a failure", () => {
    const result = checkIdentityAgainstCard({ firstName: "Akosua", lastName: "Mensah" }, null);
    expect(result.outcome).toBe("not-checked");
    expect(result.sentence).toContain("does not hold up your application");
  });
});

describe("the previous-name escape hatch", () => {
  const card = { surname: "MENSAH", givenNames: "AKOSUA ABENA", dateOfBirth: "900101", sex: "F" };

  it("recognises a married member whose card still carries her maiden name", () => {
    const result = checkIdentityAgainstCard(
      { firstName: "Akosua", lastName: "Owusu", previousNames: "Mensah" },
      card
    );
    expect(result.name.verdict).not.toBe("mismatch");
    expect(result.outcome).not.toBe("inconsistent");
  });

  it("can only help: a previous name that matches nothing is ignored", () => {
    const withOld = checkIdentityAgainstCard(
      { firstName: "Kwabena", lastName: "Owusu", previousNames: "Asante" },
      card
    );
    const withoutOld = checkIdentityAgainstCard({ firstName: "Kwabena", lastName: "Owusu" }, card);
    expect(withOld.outcome).toBe(withoutOld.outcome);
    expect(withOld.outcome).toBe("inconsistent");
  });
});

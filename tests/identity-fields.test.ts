import { describe, expect, it } from "vitest";
import { GHANA_REGIONS, dateOfBirthProblem, normalizeDateOfBirth } from "@/lib/identity-fields";

describe("date of birth field", () => {
  const today = new Date("2026-11-08T00:00:00Z");

  it("accepts a real adult date", () => {
    expect(dateOfBirthProblem("1990-01-01", today)).toBeNull();
    expect(dateOfBirthProblem("2004-06-15", today)).toBeNull();
  });

  it("says what is wrong, rather than just refusing", () => {
    expect(dateOfBirthProblem("", today)).toMatch(/date of birth/i);
    expect(dateOfBirthProblem("not-a-date", today)).toMatch(/date of birth/i);
    expect(dateOfBirthProblem("1990-02-31", today)).toMatch(/does not exist/i);
    expect(dateOfBirthProblem("2030-01-01", today)).toMatch(/future/i);
    expect(dateOfBirthProblem("1850-01-01", today)).toMatch(/120/);
  });

  it("refuses a minor, since a savings plan is a contract", () => {
    expect(dateOfBirthProblem("2015-01-01", today)).toMatch(/18/);
  });

  it("does not reject the day a member turns 18", () => {
    // 2008-11-08 is exactly 18 years before the fixed 'today'.
    expect(dateOfBirthProblem("2008-11-08", today)).toBeNull();
  });
});

describe("date of birth normalisation", () => {
  it("keeps ISO dates", () => {
    expect(normalizeDateOfBirth("1990-03-12")).toBe("1990-03-12");
  });

  it("reads the day-first dates Ghanaians actually type", () => {
    expect(normalizeDateOfBirth("12/03/1990")).toBe("1990-03-12");
    expect(normalizeDateOfBirth("12-03-1990")).toBe("1990-03-12");
    expect(normalizeDateOfBirth("1/2/1990")).toBe("1990-02-01");
  });

  it("leaves anything it cannot read alone for the server to judge", () => {
    expect(normalizeDateOfBirth("March 1990")).toBe("March 1990");
    expect(normalizeDateOfBirth("")).toBe("");
  });
});

describe("region list", () => {
  it("covers the current regions and the pre-2019 ones", () => {
    const values = GHANA_REGIONS.map((region) => region.value);
    expect(values).toContain("Greater Accra");
    expect(values).toContain("Bono East");
    expect(values).toContain("Western North");
    // A card issued before the split still says these.
    expect(values).toContain("Brong Ahafo");
    expect(values).toContain("Western");
  });

  it("has no duplicates, which would render twice in the picker", () => {
    const values = GHANA_REGIONS.map((region) => region.value);
    expect(new Set(values).size).toBe(values.length);
  });
});

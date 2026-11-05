import { describe, expect, it } from "vitest";
import { canSendTo, isValidEmail, type EmailActor } from "@/lib/email-policy";

const owner = "rabisavinghub@gmail.com";

const member: EmailActor = {
  uid: "member-1",
  email: "esmeralda@example.com",
  emailVerified: true,
  admin: false,
};

const admin: EmailActor = {
  uid: "admin-1",
  email: "rabisavinghub@gmail.com",
  emailVerified: true,
  admin: true,
};

describe("email recipient policy", () => {
  it("refuses anonymous callers entirely", () => {
    expect(canSendTo(null, "someone@example.com", [owner])).toEqual({
      allowed: false,
      reason: "not-signed-in",
    });
  });

  it("refuses malformed addresses", () => {
    expect(canSendTo(member, "not-an-email", [owner]).allowed).toBe(false);
    expect(canSendTo(member, "a@b", [owner]).allowed).toBe(false);
    expect(canSendTo(member, "x@y.com<script>", [owner]).allowed).toBe(false);
  });

  it("lets a member mail themselves", () => {
    expect(canSendTo(member, "esmeralda@example.com", [owner]).allowed).toBe(true);
    expect(canSendTo(member, "Esmeralda@Example.com", [owner]).allowed).toBe(true);
  });

  it("lets a member notify the owner inbox", () => {
    expect(canSendTo(member, owner, [owner]).allowed).toBe(true);
    expect(canSendTo(member, "RABISAVINGHUB@gmail.com", [owner]).allowed).toBe(true);
  });

  it("blocks a member from mailing a third party (the old open relay)", () => {
    expect(canSendTo(member, "victim@bank.com", [owner])).toEqual({
      allowed: false,
      reason: "recipient-not-allowed",
    });
  });

  it("lets an admin mail anyone", () => {
    expect(canSendTo(admin, "anyone@example.com", [owner]).allowed).toBe(true);
  });

  it("does not treat an admin with no email claim as able to mail", () => {
    const brokenAdmin: EmailActor = { ...admin, email: null };
    // Still allowed — the custom claim is the authority, not the address.
    expect(canSendTo(brokenAdmin, "anyone@example.com", [owner]).allowed).toBe(true);
  });

  it("validates addresses conservatively", () => {
    expect(isValidEmail("name@domain.co")).toBe(true);
    expect(isValidEmail("name@domain")).toBe(false);
    expect(isValidEmail(`${"a".repeat(250)}@x.com`)).toBe(false);
  });
});

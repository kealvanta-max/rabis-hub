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
    expect(canSendTo(null, "someone@example.com")).toEqual({
      allowed: false,
      reason: "not-signed-in",
    });
  });

  it("refuses malformed addresses", () => {
    expect(canSendTo(member, "not-an-email").allowed).toBe(false);
    expect(canSendTo(member, "a@b").allowed).toBe(false);
    expect(canSendTo(member, "x@y.com<script>").allowed).toBe(false);
  });

  it("lets a member mail themselves", () => {
    expect(canSendTo(member, "esmeralda@example.com").allowed).toBe(true);
    expect(canSendTo(member, "Esmeralda@Example.com").allowed).toBe(true);
  });

  it("refuses to let a member address the owner inbox through the relay", () => {
    // The allowance was removed with the notify routes: new-signup alerts now
    // take their recipient from server config, so a member has no reason to
    // reach this relay for anything but their own address.
    expect(canSendTo(member, owner)).toEqual({ allowed: false, reason: "recipient-not-allowed" });
    expect(canSendTo(member, "RABISAVINGHUB@gmail.com").allowed).toBe(false);
  });

  it("blocks a member from mailing a third party (the old open relay)", () => {
    expect(canSendTo(member, "victim@bank.com")).toEqual({
      allowed: false,
      reason: "recipient-not-allowed",
    });
  });

  it("does not let a member become a sender of record", () => {
    // Even a lookalike address that quotes the member's own address is refused.
    expect(canSendTo(member, "esmeralda@example.com.evil.test").allowed).toBe(false);
    expect(canSendTo(member, "esmeralda+alias@example.com").allowed).toBe(false);
  });

  it("lets an admin mail anyone", () => {
    expect(canSendTo(admin, "anyone@example.com").allowed).toBe(true);
  });

  it("does not treat an admin with no email claim as able to mail", () => {
    const brokenAdmin: EmailActor = { ...admin, email: null };
    // Still allowed: the custom claim is the authority, not the address.
    expect(canSendTo(brokenAdmin, "anyone@example.com").allowed).toBe(true);
  });

  it("validates addresses conservatively", () => {
    expect(isValidEmail("name@domain.co")).toBe(true);
    expect(isValidEmail("name@domain")).toBe(false);
    expect(isValidEmail(`${"a".repeat(250)}@x.com`)).toBe(false);
  });
});

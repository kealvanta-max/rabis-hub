import { describe, expect, it } from "vitest";

import {
  applicationReceivedEmail,
  approvalEmail,
  escapeHtml,
  newMemberAlertEmail,
  rejectionEmail,
  SUPPORT_PHONE,
} from "@/lib/email-templates";

const all = [
  approvalEmail({ name: "Esmeralda Dumaah", planLabel: "Daily GH₵6", whatsappLink: "https://chat.whatsapp.com/x" }),
  approvalEmail({ name: "Kofi", planLabel: "Weekly GH₵150" }),
  rejectionEmail({ name: "Kofi", reason: "The selfie did not match the card portrait." }),
  rejectionEmail({ name: "Kofi" }),
  applicationReceivedEmail({ name: "Prince", planLabel: "Monthly GH₵600" }),
  newMemberAlertEmail({
    name: "Prince Sarfo",
    email: "prince@example.com",
    phone: "+233 50 000 0000",
    planLabel: "Daily GH₵6",
    createdAt: "2026-11-06 09:30 UTC",
  }),
];

describe("email content", () => {
  it("always produces a subject, an html part and a plain-text part", () => {
    for (const content of all) {
      expect(content.subject.trim().length).toBeGreaterThan(3);
      expect(content.subject.length).toBeLessThanOrEqual(140);
      expect(content.html).toContain("<!doctype html>");
      expect(content.text.length).toBeGreaterThan(40);
      expect(content.text).not.toContain("<");
    }
  });

  it("never contains an em dash", () => {
    for (const content of all) {
      expect(content.html).not.toContain("—");
      expect(content.text).not.toContain("—");
      expect(content.subject).not.toContain("—");
    }
  });

  it("never ships a script tag", () => {
    for (const content of all) {
      expect(content.html.toLowerCase()).not.toContain("<script");
      expect(content.html.toLowerCase()).not.toContain("javascript:");
    }
  });

  it("carries the support number in every footer", () => {
    for (const content of all) {
      expect(content.html).toContain(SUPPORT_PHONE);
    }
  });
});

describe("escaping", () => {
  it("escapes a hostile display name instead of rendering it", () => {
    const content = approvalEmail({
      name: '<img src=x onerror="alert(1)">',
      planLabel: "Daily GH₵6",
    });

    expect(content.html).not.toContain("<img src=x");
    expect(content.html).toContain("&lt;img");
  });

  it("escapes a hostile rejection reason", () => {
    const content = rejectionEmail({ name: "Kofi", reason: "<b>your documents were fake</b>" });
    expect(content.html).not.toContain("<b>your documents");
    expect(content.html).toContain("&lt;b&gt;");
  });

  it("escapes the six characters that matter", () => {
    expect(escapeHtml(`<>&"'`)).toBe("&lt;&gt;&amp;&quot;&#39;");
  });
});

describe("approval", () => {
  it("names the plan and links the WhatsApp group when one is saved", () => {
    const content = approvalEmail({
      name: "Esmeralda Dumaah",
      planLabel: "Daily GH₵6",
      whatsappLink: "https://chat.whatsapp.com/abc",
    });

    expect(content.subject).toBe("Your Rabi's Saving Hub account is approved");
    expect(content.html).toContain("Daily GH₵6");
    expect(content.html).toContain("https://chat.whatsapp.com/abc");
    expect(content.text).toContain("Esmeralda");
  });

  it("sends people to the dashboard when there is no group link yet", () => {
    const content = approvalEmail({ name: "Kofi", planLabel: "Weekly GH₵150" });
    expect(content.html).toContain("/dashboard");
    expect(content.text).toContain("/dashboard");
  });
});

describe("rejection", () => {
  it("states the reason the admin wrote", () => {
    const content = rejectionEmail({
      name: "Kofi",
      reason: "The selfie did not match the card portrait.",
    });
    expect(content.html).toContain("The selfie did not match the card portrait.");
    expect(content.text).toContain("The selfie did not match the card portrait.");
  });

  it("falls back to a neutral reason instead of an empty sentence", () => {
    const content = rejectionEmail({ name: "Kofi" });
    expect(content.html).toContain("did not pass our verification checks");
  });

  it("tells the member how to resubmit, because documents are now locked", () => {
    const content = rejectionEmail({ name: "Kofi" });
    // The rules freeze identity documents after a decision, so the only route
    // back is Rabi resetting the account. The email has to say so.
    expect(content.text.toLowerCase()).toContain("whatsapp");
    expect(content.text.toLowerCase()).toContain("reset");
  });
});

describe("admin alert", () => {
  it("puts the applicant and their plan in the subject", () => {
    const content = newMemberAlertEmail({
      name: "Prince Sarfo",
      email: "prince@example.com",
      phone: "+233 50 000 0000",
      planLabel: "Daily GH₵6",
    });

    expect(content.subject).toBe("New application: Prince Sarfo");
    expect(content.text).toContain("prince@example.com");
    expect(content.text).toContain("+233 50 000 0000");
    expect(content.html).toContain("/admin");
  });

  it("cannot be used to inject a mail header through the name", () => {
    const content = newMemberAlertEmail({
      name: "Prince\r\nBcc: victim@example.com",
      email: "prince@example.com",
      phone: "0500000000",
      planLabel: "Daily",
    });

    expect(content.subject).not.toContain("\n");
    expect(content.subject).not.toContain("\r");
  });

  it("survives missing fields without printing undefined", () => {
    const content = newMemberAlertEmail({
      name: "",
      email: "",
      phone: "",
      planLabel: "",
    });

    expect(content.html).not.toContain("undefined");
    expect(content.subject).toContain("New application");
  });
});

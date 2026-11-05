import { describe, expect, it } from "vitest";

import {
  isValidWhatsappLink,
  memberWhatsappLink,
  normaliseWhatsappLink,
  planEntries,
  planLabelOf,
  planPreview,
  planReturnOf,
  planWhatsappLink,
  slugPlanId,
  validatePlanInput,
} from "@/lib/custom-plans";

const emptyInput = { name: "", amt: "", freq: "", ret: "", slots: "", whatsappLink: "" };

const groupLink = "https://chat.whatsapp.com/AbCdEf123";

describe("whatsapp link handling", () => {
  it("accepts group invites, channels and click-to-chat links", () => {
    expect(isValidWhatsappLink(groupLink)).toBe(true);
    expect(isValidWhatsappLink("https://whatsapp.com/channel/0029Va")).toBe(true);
    expect(isValidWhatsappLink("https://wa.me/233504701032")).toBe(true);
    expect(isValidWhatsappLink("")).toBe(true); // no link yet is fine
  });

  it("rejects look-alikes and plain text", () => {
    expect(isValidWhatsappLink("chat.whatsapp.com/abc")).toBe(false);
    expect(isValidWhatsappLink("https://chat.whatsapp.com.evil.co/abc")).toBe(false);
    expect(isValidWhatsappLink("not a link")).toBe(false);
    expect(isValidWhatsappLink("http://chat.whatsapp.com/abc")).toBe(false);
  });

  it("normalises what a phone pastes in", () => {
    expect(normaliseWhatsappLink("  chat.whatsapp.com/AbC  ")).toBe("https://chat.whatsapp.com/AbC");
    expect(normaliseWhatsappLink("https://chat.whatsapp.com/AbC).")).toBe(
      "https://chat.whatsapp.com/AbC"
    );
    expect(normaliseWhatsappLink("")).toBe("");
  });
});

describe("plan ids", () => {
  it("slugifies into a stable, readable id", () => {
    expect(slugPlanId("Daily GH₵50")).toBe("custom-daily-50");
    expect(slugPlanId("  Flexi -- Weekly!! ")).toBe("custom-flexi-weekly");
  });

  it("never collides with an existing plan", () => {
    expect(slugPlanId("Daily GH₵50", ["custom-daily-50"])).toBe("custom-daily-50-2");
    expect(slugPlanId("Daily GH₵50", ["custom-daily-50", "custom-daily-50-2"])).toBe(
      "custom-daily-50-3"
    );
  });

  it("falls back to a usable id when the name has no letters", () => {
    expect(slugPlanId("₵₵₵")).toBe("custom-plan");
  });
});

describe("flexible validation (the 'she wants flexibility' rule)", () => {
  it("accepts a name on its own — everything else is optional", () => {
    const result = validatePlanInput({ ...emptyInput, name: "Flexible Susu" });
    expect(result.ok).toBe(true);
    expect(result.plan).toEqual({ id: "custom-flexible-susu", name: "Flexible Susu" });
  });

  it("keeps the numbers when she does type them", () => {
    const result = validatePlanInput({
      name: "Daily GH₵50",
      amt: "50",
      freq: "Daily",
      ret: "1200",
      slots: "10",
      whatsappLink: groupLink,
    });
    expect(result.plan).toMatchObject({
      amt: 50,
      freq: "Daily",
      ret: 1200,
      slots: 10,
      whatsappLink: groupLink,
    });
  });

  it("only complains about the field that is wrong", () => {
    const result = validatePlanInput({ ...emptyInput, name: "X", amt: "-5" });
    expect(result.ok).toBe(false);
    expect(Object.keys(result.errors).sort()).toEqual(["amt", "name"]);
  });

  it("rejects a non-WhatsApp link but accepts a blank one", () => {
    expect(validatePlanInput({ ...emptyInput, name: "Plan", whatsappLink: "https://t.me/x" }).ok).toBe(
      false
    );
    expect(validatePlanInput({ ...emptyInput, name: "Plan", whatsappLink: "" }).ok).toBe(true);
  });

  it("refuses a slot count that is not a whole number", () => {
    expect(validatePlanInput({ ...emptyInput, name: "Plan", slots: "2.5" }).ok).toBe(false);
  });
});

describe("lookups across built-in and custom plans", () => {
  const custom = [
    { id: "custom-daily-50", name: "Daily GH₵50", amt: 50, whatsappLink: groupLink },
    { id: "custom-flex", name: "Flexi Plan" },
  ];

  it("lists every built-in plan plus the custom ones", () => {
    const entries = planEntries(custom);
    expect(entries.find(([id]) => id === "daily-6")?.[1]).toBe("Daily GH₵6");
    expect(entries.find(([id]) => id === "custom-daily-50")?.[1]).toBe("Daily GH₵50");
  });

  it("labels a custom plan by name, and a built-in by its label", () => {
    expect(planLabelOf("custom-daily-50", custom)).toBe("Daily GH₵50");
    expect(planLabelOf("daily-23", custom)).toBe("Daily GH₵23");
    expect(planLabelOf("ghost-plan", custom)).toBe("ghost-plan");
  });

  it("prefers the plan's own link, then the legacy waLinks map", () => {
    expect(planWhatsappLink("custom-daily-50", custom, {})).toBe(groupLink);
    expect(planWhatsappLink("daily-23", custom, { "daily-23": "https://chat.whatsapp.com/Legacy" })).toBe(
      "https://chat.whatsapp.com/Legacy"
    );
    expect(planWhatsappLink("custom-flex", custom, {})).toBe("");
  });

  it("finds the first link across a member holding several plans", () => {
    expect(
      memberWhatsappLink(["custom-flex", "custom-daily-50"], custom, {})
    ).toBe(groupLink);
    expect(memberWhatsappLink(["custom-flex"], custom, {})).toBe("");
  });

  it("reads a payout for built-in and custom plans, and refuses to invent one", () => {
    expect(planReturnOf("daily-6", [])).toBe(400);
    expect(planReturnOf("custom-daily-50", custom)).toBeUndefined();
    expect(planReturnOf("custom-money", [{ id: "custom-money", name: "M", ret: 900 }])).toBe(900);
  });
});

describe("live preview shown while she types", () => {
  it("says 'flexible' instead of guessing money she has not decided", () => {
    const preview = planPreview({ id: "custom-x", name: "Flexi" });
    expect(preview.payout).toBe("Flexible — Rabi quotes this");
    expect(preview.rate).toBe("Amount agreed with Rabi");
    expect(preview.slots).toBe("No slot limit");
  });

  it("shows the real values once they exist", () => {
    const preview = planPreview({
      id: "custom-x",
      name: "Daily GH₵50",
      amt: 50,
      freq: "Daily",
      ret: 1200,
      slots: 10,
    });
    expect(preview).toMatchObject({ rate: "GH₵50 · Daily", payout: "GH₵1200", slots: "10 slots" });
  });
});

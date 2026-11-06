import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { mailMode, sendMail, senderAddress } from "@/lib/mailer";

const ENV_KEYS = [
  "MAIL_MODE",
  "EMAIL_FROM",
  "EMAIL_REPLY_TO",
  "RESEND_API_KEY",
  "EMAIL_PASSWORD",
  "EMAIL_USER",
  "BACKUP_EMAIL_PASSWORD",
  "BACKUP_EMAIL_USER",
  "ADMIN_EMAILS",
] as const;

let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = {};
  for (const key of ENV_KEYS) saved[key] = process.env[key];
  for (const key of ENV_KEYS) delete process.env[key];
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const message = {
  to: "member@example.com",
  subject: "Your account is approved",
  html: "<p>Approved</p>",
  text: "Approved",
  tag: "test",
};

describe("mail mode", () => {
  it("defaults to log, so nothing is sent before the domain exists", () => {
    expect(mailMode()).toBe("log");
  });

  it("only goes live when explicitly asked", () => {
    process.env.MAIL_MODE = "LIVE";
    expect(mailMode()).toBe("live");
    process.env.MAIL_MODE = "log";
    expect(mailMode()).toBe("log");
    process.env.MAIL_MODE = "banana";
    expect(mailMode()).toBe("log");
  });
});

describe("sendMail in log mode", () => {
  it("succeeds without touching the network", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const result = await sendMail(message);

    expect(result.ok).toBe(true);
    expect(result.provider).toBe("console");
    expect(result.mode).toBe("log");
    expect(result.id).toMatch(/^log-/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("prints the whole message to the server console", async () => {
    await sendMail(message);

    const printed = vi
      .mocked(console.info)
      .mock.calls.flat()
      .join("\n");

    expect(printed).toContain("LOG MODE, NOT SENT");
    expect(printed).toContain("member@example.com");
    expect(printed).toContain("Your account is approved");
    expect(printed).toContain("test");
  });

  it("normalises duplicate recipients", async () => {
    const result = await sendMail({
      ...message,
      to: ["a@example.com", "A@example.com", " ", "b@example.com"],
    });

    expect(result.to).toEqual(["a@example.com", "b@example.com"]);
  });
});

describe("sendMail in live mode", () => {
  it("refuses politely when no provider is configured", async () => {
    process.env.MAIL_MODE = "live";

    const result = await sendMail(message);

    expect(result.ok).toBe(false);
    expect(result.provider).toBe("none");
    expect(result.error).toContain("no email provider");
  });

  it("uses Resend when a key is present", async () => {
    process.env.MAIL_MODE = "live";
    process.env.RESEND_API_KEY = "re_test";
    process.env.EMAIL_FROM = "Rabi's Saving Hub <noreply@rabissavinghub.com>";

    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "resend-message-1" }),
    });
    vi.stubGlobal("fetch", fetchSpy);

    const result = await sendMail(message);

    expect(result.ok).toBe(true);
    expect(result.provider).toBe("resend");
    expect(result.id).toBe("resend-message-1");
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    const body = JSON.parse(init.body as string);
    expect(body.from).toBe("Rabi's Saving Hub <noreply@rabissavinghub.com>");
    expect(body.to).toEqual(["member@example.com"]);
    expect(body.text).toBe("Approved");
    expect(body.reply_to).toBeTruthy();
  });

  it("reports a provider failure as data instead of throwing", async () => {
    process.env.MAIL_MODE = "live";
    process.env.RESEND_API_KEY = "re_test";

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        text: async () => "You can only send testing emails to your own email address",
      })
    );

    const result = await sendMail(message);

    expect(result.ok).toBe(false);
    expect(result.error).toContain("resend");
    expect(result.error).toContain("403");
  });

  it("warns loudly when the sender still points at resend.dev", async () => {
    process.env.MAIL_MODE = "live";
    process.env.RESEND_API_KEY = "re_test";

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: "x" }) }));

    await sendMail(message);

    expect(senderAddress()).toContain("resend.dev");
    const warnings = vi.mocked(console.warn).mock.calls.flat().join("\n");
    expect(warnings).toContain("resend.dev");
  });
});

describe("sendMail input validation", () => {
  it("rejects a message with no recipient", async () => {
    const result = await sendMail({ ...message, to: [] });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("recipient");
  });

  it("rejects a message with no body", async () => {
    const result = await sendMail({ ...message, html: "" });
    expect(result.ok).toBe(false);
  });

  it("strips line breaks from the subject so no header can be injected", async () => {
    await sendMail({ ...message, subject: "Hello\r\nBcc: victim@example.com" });

    const printed = vi.mocked(console.info).mock.calls.flat().join("\n");
    expect(printed).not.toContain("\r\nBcc:");
    expect(printed).toContain("Hello Bcc: victim@example.com");
  });
});

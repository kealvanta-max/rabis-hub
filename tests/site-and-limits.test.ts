import { describe, expect, it } from "vitest";
import { SITE, absoluteUrl, pageMetadata, FAQS, FAQ_JSON_LD } from "@/lib/site";
import { rateLimit } from "@/lib/rate-limit";

describe("site config", () => {
  it("uses the live Vercel domain by default", () => {
    expect(SITE.url).toBe("https://rabis-hub.vercel.app");
    expect(SITE.url).not.toContain("rabissavinghub.com");
  });

  it("builds absolute urls without duplicate slashes", () => {
    expect(absoluteUrl("/guide")).toBe(`${SITE.url}/guide`);
    expect(absoluteUrl("guide")).toBe(`${SITE.url}/guide`);
  });

  it("emits a canonical path for every page", () => {
    const meta = pageMetadata({ title: "Test", description: "d", path: "/guide" });
    expect(meta.alternates?.canonical).toBe("/guide");
    expect(meta.openGraph?.url).toBe(`${SITE.url}/guide`);
  });

  it("marks private pages as noindex", () => {
    expect(pageMetadata({ title: "x", description: "y", path: "/dashboard", noIndex: true }).robots).toMatchObject({
      index: false,
    });
  });

  it("publishes FAQ structured data Google can read", () => {
    expect(FAQS.length).toBeGreaterThanOrEqual(5);
    expect(FAQ_JSON_LD.mainEntity).toHaveLength(FAQS.length);
    expect(FAQ_JSON_LD.mainEntity[0].acceptedAnswer.text.length).toBeGreaterThan(20);
  });
});

describe("rate limiting", () => {
  it("allows up to the limit and then blocks", async () => {
    const key = `test-${Math.random()}`;
    for (let i = 0; i < 3; i += 1) {
      const result = await rateLimit(key, 3, 60);
      expect(result.success).toBe(true);
      expect(result.backend).toBe("memory");
    }
    const blocked = await rateLimit(key, 3, 60);
    expect(blocked.success).toBe(false);
    expect(blocked.remaining).toBe(0);
  });
});

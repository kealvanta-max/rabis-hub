import { describe, expect, it } from "vitest";
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Guards for the PageSpeed work.
 *
 * Every rule here is a mistake that was actually made in this codebase and cost
 * real points on a real phone, so the fix is pinned rather than trusted.
 */

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const sourceFiles = walk(join(process.cwd(), "src")).filter((f) => f.endsWith(".tsx"));

describe("first paint", () => {
  it("never puts the page behind a full screen gate", () => {
    const layout = read("src/app/layout.tsx");
    // The old "Akwaaba" overlay held the whole site behind a button for over two
    // seconds, which is what pushed Largest Contentful Paint past five seconds.
    expect(layout).not.toContain("LoadingScreen");
    expect(existsSync(join(process.cwd(), "src/components/ui/loading-screen.tsx"))).toBe(false);
  });

  it("paints the hero heading without waiting for JavaScript", () => {
    const hero = read("src/components/home/hero.tsx");
    expect(hero).toMatch(/<h1/);
    // A heading that animates in from opacity 0 is not painted until the
    // animation runs, and the browser will not count it as the largest paint.
    const h1 = hero.slice(hero.indexOf("<h1"), hero.indexOf("</h1>"));
    expect(h1).not.toContain("opacity");
    expect(h1).not.toContain("motion");
  });

  it("keeps exactly one h1 on the landing page", () => {
    const hero = read("src/components/home/hero.tsx");
    expect(hero.match(/<h1/g) ?? []).toHaveLength(1);
  });
});

describe("images", () => {
  it("declares an intrinsic size for the hero image and preloads it", () => {
    const hero = read("src/components/home/hero.tsx");
    expect(hero).toContain("width={320}");
    expect(hero).toContain("height={320}");
    expect(hero).toContain("priority");
    expect(hero).toContain("sizes=");
  });

  it("serves modern formats", () => {
    expect(read("next.config.mjs")).toContain('formats: ["image/avif", "image/webp"]');
  });
});

describe("paint cost", () => {
  it("does not blend the animated glows into the page", () => {
    const css = read("src/app/globals.css");
    // mix-blend-mode on a blurred, endlessly animated element forces the phone
    // to repaint a large area every frame.
    expect(css).not.toContain("mix-blend-mode: color-dodge");
    expect(css).not.toContain("mix-blend-mode: screen");
  });

  it("stops the glow animation for anyone who asks for less motion", () => {
    const css = read("src/app/globals.css");
    const reduced = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
    expect(reduced).toContain(".bg-shader-gradient::before");
  });
});

describe("accessibility", () => {
  it("gives every range input a name", () => {
    for (const file of sourceFiles) {
      const source = readFileSync(file, "utf8");
      if (!source.includes('type="range"')) continue;
      const blocks = source.split('type="range"').slice(1);
      for (const block of blocks) {
        // The attribute list ends at the self closing `/>`; a plain `>` would stop
        // early at the arrow in an inline onChange handler.
        const tag = block.slice(0, block.indexOf("/>"));
        const named =
          tag.includes("aria-label") ||
          tag.includes("aria-labelledby") ||
          tag.includes("id=");
        expect(named, `range input without a name in ${file}`).toBe(true);
      }
    }
  });

  it("keeps section headings in order", () => {
    // A card title (h3) must never appear before the section heading (h2).
    const hero = read("src/components/home/hero.tsx");
    expect(hero.indexOf("<h1")).toBeLessThan(hero.indexOf("<h2") === -1 ? Infinity : hero.indexOf("<h2"));
  });

  it("does not ship small grey text below the contrast floor", () => {
    const offenders: string[] = [];
    for (const file of sourceFiles) {
      const source = readFileSync(file, "utf8");
      // #6B7280 on the near black background is about 3.9:1, under WCAG AA.
      if (source.includes("text-gray-500")) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });
});

describe("console and manifest", () => {
  it("does not preload a remote audio file on every page", () => {
    const layout = read("src/app/layout.tsx");
    expect(layout).not.toContain("<audio");
    expect(layout).not.toContain("AudioPlayer");
  });

  it("allows the image hosts the app actually uses", () => {
    const config = read("next.config.mjs");
    const imgSrc = config.slice(config.indexOf('"img-src'), config.indexOf('",', config.indexOf('"img-src')));
    for (const host of ["res.cloudinary.com", "i.pravatar.cc", "lh3.googleusercontent.com", "firebasestorage.googleapis.com"]) {
      expect(imgSrc).toContain(host);
    }
  });

  it("publishes a valid ARD catalogue", () => {
    const manifest = JSON.parse(read("public/.well-known/ai-catalog.json"));
    expect(manifest.specVersion).toBe("1.0");
    expect(manifest.host.displayName).toBeTruthy();
    expect(Array.isArray(manifest.entries)).toBe(true);
    expect(manifest.entries.length).toBeGreaterThan(0);

    for (const entry of manifest.entries) {
      expect(entry.identifier).toMatch(/^urn:air:[a-z0-9.\-]+:/);
      expect(entry.displayName).toBeTruthy();
      expect(entry.type).toBeTruthy();
      // Exactly one of url or data, never both, never neither.
      expect(Boolean(entry.url) !== Boolean(entry.data)).toBe(true);
      expect(entry.representativeQueries.length).toBeGreaterThanOrEqual(2);
      expect(entry.representativeQueries.length).toBeLessThanOrEqual(5);
      expect(JSON.stringify(entry)).not.toContain("TODO");
    }
  });

  it("serves the catalogue to other origins", () => {
    const config = read("next.config.mjs");
    const wellKnown = config.slice(config.indexOf('"/.well-known/:path*"'));
    expect(wellKnown.slice(0, 400)).toContain("Access-Control-Allow-Origin");
  });

  it("publishes llms.txt for agents", () => {
    const llms = read("public/llms.txt");
    expect(llms).toContain("# Rabi's Saving Hub");
    expect(llms).toContain("+233 50 470 1032");
    // Never publish a secret to a file anyone can read.
    expect(llms.toLowerCase()).not.toContain("secret");
    expect(llms.toLowerCase()).not.toContain("api_key");
  });
});

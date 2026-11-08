import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { clampCropOffset, cropGeometry } from "@/lib/image-crop";

/**
 * The "black screen" crop preview.
 *
 * Root cause, proven in a headless browser against a production build: the
 * cropper positioned its preview image with a runtime `<style>` element that
 * only rendered when a CSP nonce reached the component, plus a `style`
 * attribute for the transform. The production policy blocks style attributes
 * outright, and the middleware that was supposed to supply the nonce was never
 * compiled (it lived outside `src/`). With no transform the untouched 4000px
 * photo was clipped by the frame's `overflow: hidden`, so the member saw the
 * photo's corner: a black rectangle.
 *
 * The fix removes both dependencies. Geometry is published as CSS custom
 * properties through the CSSOM, and the base layout lives in the shipped
 * stylesheet. These tests fail if any of that creeps back.
 */

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

/**
 * Strip comments before asserting on source.
 *
 * Several of these components *document* the style attribute they no longer
 * use, and a naive `not.toContain("<style")` fails on the explanation rather
 * than on the code. Comments are removed so each assertion is about what ships.
 */
const stripComments = (source: string) =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
const cropper = stripComments(read("src/components/ui/image-cropper.tsx"));
const css = read("src/app/globals.css");
const middleware = read("src/middleware.ts");

describe("the crop preview cannot depend on a nonce", () => {
  it("injects no runtime stylesheet at all", () => {
    expect(cropper).not.toContain("<style");
    expect(cropper).not.toContain("nonce");
    expect(cropper).not.toContain("useCspNonce");
  });

  it("uses no style attribute anywhere", () => {
    // React's `style` prop compiles to a style attribute, which
    // `style-src-attr 'none'` blocks. This component must never use it.
    expect(cropper).not.toMatch(/\sstyle=\{/);
  });

  it("publishes geometry as CSS custom properties instead", () => {
    expect(cropper).toContain('setProperty("--crop-x"');
    expect(cropper).toContain('setProperty("--crop-y"');
    expect(cropper).toContain('setProperty("--crop-scale"');
    expect(cropper).toContain('setProperty("--crop-rotate"');
  });

  it("ships the base transform in the build stylesheet, with safe defaults", () => {
    expect(css).toContain(".crop-image {");
    expect(css).toContain("--crop-scale: 1;");
    // The centring translate is the part that was missing in production, and it
    // is static CSS: no nonce, no attribute, nothing to strip.
    expect(css).toMatch(/transform:\s*translate\(-50%,\s*-50%\)/);
  });

  it("keeps the frame shaped by a class, not by an inline aspect-ratio", () => {
    expect(cropper).toContain("aspect-[1.586]");
    expect(cropper).toContain("aspect-[4/5]");
    expect(cropper).not.toContain("aspect-ratio:");
  });

  it("would still show the photo if the layout effect never ran", () => {
    // Defaults are in CSS, so the first paint (before hydration) is already a
    // centred, frame-filling preview rather than a corner of a huge image.
    const block = css.slice(css.indexOf(".crop-image {"));
    expect(block.slice(0, 400)).toContain("--crop-x: 0px");
    expect(block.slice(0, 400)).toContain("--crop-y: 0px");
  });

  it("reports a decode failure instead of showing an empty frame", () => {
    expect(cropper).toContain("setLoadError");
    expect(cropper).toContain("could not be opened on this phone");
  });

  it("refuses an image without readable dimensions", () => {
    expect(cropper).toContain("naturalWidth");
    expect(cropper).toContain("has no readable size");
  });
});

describe("crop maths still guarantees a full frame", () => {
  const frame = { frameWidth: 334, frameHeight: 211 }; // a phone-sized 1.586 frame

  it("covers the frame for a portrait phone photo", () => {
    const g = cropGeometry({ ...frame, imageWidth: 3000, imageHeight: 4000, zoom: 1, rotation: 0 });
    expect(g.scale).toBeGreaterThan(0);
    expect(g.maxY).toBeGreaterThan(0);
  });

  it("covers the frame after a quarter turn", () => {
    const g = cropGeometry({ ...frame, imageWidth: 4000, imageHeight: 3000, zoom: 1, rotation: 90 });
    expect(g.maxX).toBeGreaterThanOrEqual(0);
    expect(g.maxY).toBeGreaterThanOrEqual(0);
  });

  it("never allows an offset that would show a blank edge", () => {
    const g = cropGeometry({ ...frame, imageWidth: 1600, imageHeight: 1000, zoom: 1, rotation: 0 });
    const clamped = clampCropOffset({ x: 99999, y: 99999 }, g);
    expect(Math.abs(clamped.x)).toBeLessThanOrEqual(g.maxX);
    expect(Math.abs(clamped.y)).toBeLessThanOrEqual(g.maxY);
  });
});

describe("the CSP that broke the cropper is fixed at the source", () => {
  it("lets the build authorise style elements with the request nonce", () => {
    expect(middleware).toContain("style-src 'self' 'nonce-${nonce}'");
  });

  it("still blocks style attributes, so the safe pattern is enforced", () => {
    expect(middleware).toContain("style-src-attr 'none'");
  });

  it("is located where Next.js compiles it", () => {
    expect(existsSync(join(process.cwd(), "src/middleware.ts"))).toBe(true);
    expect(existsSync(join(process.cwd(), "middleware.ts"))).toBe(false);
  });
});

describe("no component smuggles a style attribute back in", () => {
  /*
   * `style-src-attr 'none'` makes every React `style` prop a silent no-op in
   * production. That is only safe while no component relies on one, so this
  scanning the UI tree. The single exception renders a PNG on the server, so no
   * Content Security Policy applies to it.
   */
  const ALLOWED = [
    // Server-side Satori canvas: it renders a PNG, never a document with a CSP.
    "src/app/opengraph-image.tsx",
  ];
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(join(process.cwd(), dir), { withFileTypes: true })) {
      const path = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(path);
      else if (/\.tsx$/.test(entry.name)) files.push(path);
    }
  };
  walk("src/components");
  walk("src/app");

  it("finds the server-side image renderer and nothing else", () => {
    const offenders = files.filter((file) => {
      if (ALLOWED.includes(file)) return false;
      return /\sstyle=\{/.test(stripComments(read(file)));
    });
    expect(offenders).toEqual([]);
  });
});

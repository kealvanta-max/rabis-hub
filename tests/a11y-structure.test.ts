import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Structural accessibility fences.
 *
 * These are the failures an audit tool reports as red, not warnings: landmarks
 * nested inside each other, headings that skip a level, controls with no
 * accessible name, and content that removes a focus ring without drawing
 * another one. Each one below was actually present in this tree, so each test
 * names the bug it stops from coming back.
 */

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(join(process.cwd(), dir))) {
    const rel = join(dir, entry);
    if (statSync(join(process.cwd(), rel)).isDirectory()) walk(rel, out);
    else out.push(rel);
  }
  return out;
}

const uiFiles = walk("src").filter((f) => f.endsWith(".tsx"));

/**
 * Source with comments removed.
 *
 * Structural checks must read markup, not prose. A block comment explaining why
 * a `<nav>` was removed would otherwise trip the test that looks for one, and
 * the fix would be to delete the explanation, which is the opposite of what this
 * file is for.
 */
function markup(path: string): string {
  return read(path)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

/**
 * Heading level of every heading element, in document order.
 *
 * `motion.h2` (framer-motion) renders a real `<h2>`, and the landing page uses
 * it for every section title, so a fence matching only `<h2` would miss them all
 * and pass a page that has no h2 anywhere.
 */
function headings(source: string): number[] {
  return Array.from(source.matchAll(/<(?:motion\.)?h([1-6])\b/g)).map((m) => Number(m[1]));
}

describe("landmarks", () => {
  it("never nests a nav inside a nav", () => {
    /*
     * The site header was a <nav> and LiquidGlassNav inside it was another.
     * Two navigation landmarks with no way to tell them apart, which is exactly
     * what a jump list reports as "navigation, navigation".
     */
    const header = markup("src/components/layout/navigation.tsx");
    expect(header).toContain("<header");
    expect(header).not.toContain("<nav");

    // The section links are still a navigation landmark, just not the outer one.
    expect(read("src/components/ui/liquid-glass-nav.tsx")).toContain("<nav");
  });

  it("never renders a main landmark inside another one", () => {
    /*
     * Counting <main> per file is the wrong check: the admin page has two, in an
     * early return for "Admin access required" and the real dashboard, and only
     * one is ever mounted. What matters is that a page does not put one main
     * inside another, which would nest the landmark.
     */
    for (const file of uiFiles) {
      const source = markup(file);
      const opens = (source.match(/<main\b/g) ?? []).length;
      const closes = (source.match(/<\/main>/g) ?? []).length;
      /*
       * Balanced, not unique. The admin page has two <main> elements as
       * siblings in mutually exclusive early returns, and only one is ever
       * mounted; what would be a real fault is one left unclosed, which nests
       * every following page inside a main landmark.
       */
      expect(opens, `unbalanced <main> in ${file}`).toBe(closes);
    }
  });

  it("keeps the skip link pointing at something focusable", () => {
    // A browser scrolls to a plain div but leaves the caret behind, so the
    // skip link moved the view and not the keyboard.
    const layout = read("src/app/layout.tsx");
    expect(layout).toContain('href="#main-content"');
    expect(layout).toMatch(/id="main-content"[^>]*tabIndex=\{-1\}/);
  });
});

describe("heading hierarchy", () => {
  it("never skips a level on a page", () => {
    /*
     * The dashboard opened with h1 then two h4s, and the admin page opened with
     * h1 then an h4 verification banner. An audit reports both as an order
     * error, and a reader hears "heading level four" with no three before it.
     */
    const pages = uiFiles.filter((f) => f.includes("/app/") && (f.endsWith("page.tsx") || f.endsWith("error.tsx") || f.endsWith("not-found.tsx")));
    for (const file of pages) {
      const levels = headings(read(file));
      for (let i = 1; i < levels.length; i += 1) {
        const jump = levels[i] - levels[i - 1];
        /*
         * A larger number after a smaller one may only step up by one. Going
         * back up the document (a smaller number) is always allowed.
         */
        expect(jump, `${file}: h${levels[i - 1]} then h${levels[i]}`).toBeLessThanOrEqual(1);
      }
    }
  });

  it("gives the landing page exactly one h1 across every section", () => {
    // The hero owns the h1. Sections below it own their h2s, and the whole
    // landing page must still add up to a single h1.
    const home = ["hero", "rabi", "plans", "trust", "testimonials", "faq", "contact-section", "cta-banner"];
    const h1s = home.reduce((n, name) => n + headings(markup(`src/components/home/${name}.tsx`)).filter((h) => h === 1).length, 0);
    expect(h1s).toBe(1);

    for (const name of ["rabi", "plans", "trust", "faq"]) {
      expect(headings(markup(`src/components/home/${name}.tsx`)), name).toContain(2);
    }
  });

  it("puts plan cards under their category heading, not above it", () => {
    // Cards were h3 alongside the category h3 that contains them.
    const plans = read("src/components/home/plans.tsx");
    expect(plans).toContain("<h4");
    expect(plans).toMatch(/<h3[^>]*>\{cat\.category\}<\/h3>/);
  });
});

describe("names and focus", () => {
  it("keeps the password reveal reachable and named", () => {
    /*
     * The toggle was tabIndex={-1} with no label, so a keyboard user could not
     * reveal the password they were typing and a reader announced "button".
     */
    const input = markup("src/components/ui/input.tsx");
    const toggle = input.slice(input.indexOf("isPassword &&"));
    // The tag spans several lines and holds `() =>`, so everything up to the
    // closing `>` of the element is taken as the attribute list.
    const buttonTag = toggle.slice(toggle.indexOf("<button"), toggle.indexOf("</button>"));
    expect(buttonTag).not.toContain("tabIndex={-1}");
    expect(buttonTag).toContain("aria-label=");
    expect(buttonTag).toContain("aria-pressed=");
  });

  it("ties field errors to the input that caused them", () => {
    for (const file of ["src/components/ui/input.tsx", "src/components/ui/select.tsx"]) {
      const source = read(file);
      expect(source, file).toContain("aria-invalid");
      expect(source, file).toContain("aria-describedby");
      expect(source, file).toContain('role="alert"');
    }
  });

  it("never removes a focus outline without drawing one", () => {
    /*
     * Two inputs on the signup flow had `focus:outline-none` and only a border
     * colour change. The range sliders had `outline: none` in globals with
     * nothing at all, on the savings calculator of all places.
     */
    const css = read("src/app/globals.css");
    expect(css).toContain('input[type="range"]:focus-visible');

    const auth = read("src/app/auth/page.tsx");
    const bare = auth
      .split("\n")
      .filter((line) => line.includes("focus:outline-none") && !line.includes("focus-visible") && !line.includes("focus:ring") && !line.includes("focus:border"));
    expect(bare).toEqual([]);
  });

  it("names the file input, which has no visible label text of its own", () => {
    const upload = read("src/components/ui/image-upload.tsx");
    const tag = upload.slice(upload.indexOf('type="file"') - 400, upload.indexOf('type="file"') + 200);
    expect(tag).toContain("aria-label={label}");
    expect(tag).toContain("aria-describedby={hintId}");
  });

  it("tells a reader when the signup step changed", () => {
    // Five steps on one route: before this, pressing Continue was silent.
    const auth = read("src/app/auth/page.tsx");
    expect(auth).toContain('aria-live="polite"');
    expect(auth).toContain("stepHeadingRef");
  });
});

describe("honest content", () => {
  it("shows no invented social proof on the landing page", () => {
    /*
     * "2K+ members", "GH5M+ saved" and a "98% success rate" were fabricated.
     * None were sourced and the arithmetic did not survive a look at the GH6
     * plan. They are gone from every locale, not just English.
     */
    const locales = readdirSync(join(process.cwd(), "src/i18n")).filter((f) => f.endsWith(".ts"));
    for (const file of locales) {
      const source = read(`src/i18n/${file}`);
      expect(source, file).not.toMatch(/2,000\+|2 000\+|2K\+/);
      expect(source, file).not.toContain("98%");
      expect(source, file).not.toContain("₵5M");
    }
  });

  it("marks a written sample quote as an example", () => {
    // A fabricated testimonial with a name and an initial avatar is the single
    // most recognisable mark of a template site, and of a dishonest one.
    const testimonials = read("src/components/home/testimonials.tsx");
    expect(testimonials).toContain("Example");
    expect(testimonials).not.toContain("Akosua");
  });

  it("answers who the member is paying, on the page itself", () => {
    const rabi = read("src/components/home/rabi.tsx");
    expect(rabi).toContain("Rabi runs the susu");
    // The WhatsApp number is the whole point of the section.
    expect(rabi).toContain("SITE.whatsapp");
    // And it must not smuggle in a fake face.
    expect(rabi).not.toContain("<img");
    expect(rabi).not.toContain("pravatar");
  });

  it("does not claim a success rate anywhere a member can read it", () => {
    for (const file of uiFiles) {
      expect(markup(file), file).not.toMatch(/success rate/i);
    }
  });
});

describe("paint before scroll", () => {
  it("never starts page text at opacity 0", () => {
    /*
     * A `whileInView` entrance that begins at `opacity: 0` is painted as
     * `style="opacity:0"` in the prerendered HTML. Two things go wrong:
     *
     *   - `style-src-attr 'none'` blocks style attributes, so in production the
     *     animation tries to drive a property the policy has frozen
     *   - a crawler and a text-to-HTML judge both meet invisible content
     *
     * Seven paragraphs of real copy on the landing page shipped this way,
     * including the whole trust section description and the contact copy.
     * Motion is allowed to move things; it is not allowed to hide them.
     */
    const sections = ["hero", "rabi", "plans", "trust", "testimonials", "faq", "contact-section", "cta-banner", "calculator"];
    for (const name of sections) {
      const source = markup(`src/components/home/${name}.tsx`);
      expect(source, name).not.toMatch(/initial=\{\{\s*opacity:\s*0/);
      expect(source, name).not.toMatch(/initial=\"hidden\"\s*\n?[^}]*opacity: 0/);
    }
  });

  it("never lets a page render without a top level heading", () => {
    /*
     * /auth prerendered as a spinner and nothing else, because the whole screen
     * sat inside Suspense while it read useSearchParams. No h1, no form, no text
     * for anyone without JavaScript, and an audit reports a page with no
     * heading at all. The h1 now lives outside the boundary.
     */
    /*
     * Only pages that render their own heading. The landing page composes the
     * h1 from <HeroSection />, so the file itself contains no h1 and asserting
     * on it here would be checking the wrong artefact; the section level test
     * above counts the landing page's h1 across the components it mounts.
     */
    for (const page of ["src/app/auth/page.tsx", "src/app/guide/page.tsx", "src/app/privacy/page.tsx", "src/app/terms/page.tsx"]) {
      expect(markup(page), page).toMatch(/<h1\b/);
    }
    const auth = markup("src/app/auth/page.tsx");
    const beforeSuspense = auth.slice(0, auth.indexOf("<Suspense"));
    expect(beforeSuspense, "auth h1 must not be inside Suspense").toMatch(/<h1\b/);
  });

  it("keeps the guide readable before it animates", () => {
    // Nine paragraphs of the onboarding guide shipped at opacity 0.
    const guide = markup("src/app/guide/page.tsx");
    expect(guide).not.toMatch(/initial=\{\{\s*opacity:\s*0/);
    expect(guide).not.toMatch(/hidden: \{\s*opacity: 0/);
    // And no rest state either: a translate at rest is a style attribute, which
    // `style-src-attr 'none'` freezes.
    expect(guide).not.toMatch(/hidden: \{\s*(y|x|scale):/);
    expect(guide).not.toMatch(/initial=\{\{\s*(y|x|scale):/);
  });

  it("does not emit a style attribute for a rest state", () => {
    /*
     * `style-src-attr 'none'` blocks style attributes outright, so any element
     * framer-motion prerenders with one is frozen at that value in production.
     * A translate at rest is harmless in a browser that applies it and a stale
     * offset in one that does not, so the entrances now rest in place and
     * animate only on the way in.
     *
     * Class based transitions are unaffected and are the right tool here: they
     * live in the stylesheet, where the policy allows them.
     */
    const sections = ["hero", "rabi", "plans", "trust", "testimonials", "faq", "contact-section", "cta-banner", "calculator"];
    for (const name of sections) {
      const source = markup(`src/components/home/${name}.tsx`);
      expect(source, name).not.toMatch(/initial=\{\{\s*(y|x|scale):/);
    }
  });

  it("does not fade a container that holds every card", () => {
    // The contact grid's parent faded in, so the hidden state took the grid.
    const contact = markup("src/components/home/contact-section.tsx");
    expect(contact).not.toMatch(/containerVariants[\s\S]{0,120}opacity: 0/);
  });

  it("honours prefers-reduced-motion for JavaScript animation too", () => {
    // CSS already handled it. The framer-motion entrances did not.
    const layout = read("src/app/layout.tsx");
    expect(layout).toContain("ReducedMotionProvider");
    expect(read("src/components/providers/reduced-motion.tsx")).toContain('reducedMotion="user"');
  });
});

describe("bundle", () => {
  it("loads the cropper only when a photo is chosen", () => {
    /*
     * 394 lines of geometry and canvas code imported eagerly into the signup
     * flow, downloaded by everyone who never opened the picker. It is the bulk
     * of the unused JavaScript the audit reported.
     */
    const upload = markup("src/components/ui/image-upload.tsx");
    expect(upload).toMatch(/const ImageCropper\s*=\s*dynamic</);
    expect(upload).toContain('import("@/components/ui/image-cropper")');
    // A static top level import would defeat the split entirely.
    expect(upload).not.toMatch(/^import ImageCropper from/m);
    expect(upload).toContain("ssr: false");
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Design guardrails.
 *
 * These are not layout tests — they are regression fences around the exact
 * classes of bug that shipped in the mobile admin screenshots (badges floating
 * over buttons, stretched avatars, `•` separators breaking line rhythm, inputs
 * wider than the viewport, serif headings in an operations UI, tabs with no
 * scroll affordance). If someone reintroduces one, this fails before deploy.
 */

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

/** Comments describe the old bugs; only the rendered markup should be judged. */
const markup = (path: string) =>
  read(path)
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const ADMIN_FILES = [
  "src/app/admin/page.tsx",
  "src/components/admin/user-row.tsx",
  "src/components/admin/user-detail-modal.tsx",
  "src/components/admin/reviews-panel.tsx",
  "src/components/admin/whatsapp-links-panel.tsx",
  "src/components/admin/admin-tabs.tsx",
  "src/components/admin/action-button.tsx",
];

describe("admin markup guardrails", () => {
  it("never uses bullet characters as separators", () => {
    for (const file of ADMIN_FILES) {
      expect(markup(file), `${file} contains a bullet separator`).not.toMatch(/•/);
    }
  });

  it("keeps avatars in a fixed square frame with object-cover", () => {
    const avatar = read("src/components/admin/member-avatar.tsx");
    expect(avatar).toContain("aspect-square");
    expect(avatar).toContain("object-cover");
    expect(avatar).toContain("overflow-hidden");
  });

  it("keeps the member status badge in normal flow, never absolute", () => {
    const row = markup("src/components/admin/user-row.tsx");
    const badgeIndex = row.indexOf("<Badge");

    expect(badgeIndex).toBeGreaterThan(-1);

    // Nothing between the name and the badge may take the badge out of flow.
    const badgeContext = row.slice(Math.max(0, badgeIndex - 300), badgeIndex + 40);
    expect(badgeContext).not.toContain("absolute");
    expect(row).not.toMatch(/className="[^"]*\babsolute\b/);
    // The badge must live in a wrapping row with the name, not a fixed row.
    expect(row).toContain("flex-wrap items-center");
  });

  it("constrains WhatsApp inputs so they cannot breach the viewport", () => {
    const panel = read("src/components/admin/whatsapp-links-panel.tsx");
    expect(panel).toContain("w-full min-w-0");
    expect(panel).toContain("grid-cols-1 gap-3 lg:grid-cols-2");
    // The old layout pinned a 160px label beside the field on every breakpoint.
    expect(panel).not.toContain("w-40 shrink-0");
  });

  it("uses the sans display face for admin headings, not the marketing serif", () => {
    const page = markup("src/app/admin/page.tsx");
    const header = page.slice(page.indexOf("Admin dashboard") - 400, page.indexOf("Admin dashboard") + 40);
    expect(header).toContain("font-grotesk");
    expect(page).not.toMatch(/className="font-display/);
  });

  it("gives the tab rail a real scroll affordance", () => {
    const tabs = read("src/components/admin/admin-tabs.tsx");
    expect(tabs).toContain('role="tablist"');
    expect(tabs).toContain("no-scrollbar");
    expect(tabs).toContain("overflow-x-auto");
    expect(tabs).toContain("-mx-4"); // full-bleed rail, so nothing looks clipped
  });

  it("separates destructive actions from primary weight", () => {
    const reviews = read("src/components/admin/reviews-panel.tsx");
    const buttons = read("src/components/admin/action-button.tsx");
    expect(reviews).toContain('variant="danger"');
    expect(buttons).toContain("ring-inset ring-red-500/25");
  });

  it("makes the GPS reading actionable", () => {
    const modal = read("src/components/admin/user-detail-modal.tsx");
    expect(modal).toContain("google.com/maps");
    expect(modal).toContain("Open in Google Maps");
  });

  it("keeps native video controls and no floating overlay", () => {
    const modal = read("src/components/admin/user-detail-modal.tsx");
    expect(modal).toContain("<video");
    expect(modal).toContain("controls");
    expect(modal).toContain('preload="metadata"');
  });

  it("wraps every decision in a dialog with an accessible name", () => {
    const modal = read("src/components/ui/modal.tsx");
    expect(modal).toContain('role="dialog"');
    expect(modal).toContain("aria-modal");
    expect(modal).toContain("Escape");
  });
});

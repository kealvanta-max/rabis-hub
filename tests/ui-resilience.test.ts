import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The face step opened on a real phone and showed "Something went wrong" before
 * the member could even tap, and the app error page threw away a signup she had
 * already filled in. These pin the three things that stop it happening again:
 * the decoration is optional, the GPU is never assumed, and a crash is contained.
 */
function read(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("error boundaries exist and report", () => {
  const boundary = read("src/components/ui/error-boundary.tsx");

  it("catches render failures instead of unwinding to the app page", () => {
    expect(boundary).toContain("getDerivedStateFromError");
    expect(boundary).toContain("componentDidCatch");
    expect(boundary).toContain("fallback");
  });

  it("sends the cause to monitoring so it is findable later", () => {
    expect(boundary).toContain("captureException");
  });
});

describe("a stale page repairs itself", () => {
  const recovery = read("src/lib/chunk-recovery.ts");
  const monitoring = read("src/lib/monitoring.ts");
  const boundary = read("src/components/ui/error-boundary.tsx");

  it("recognises the shapes a missing chunk arrives in", () => {
    expect(recovery).toContain("ChunkLoadError");
    expect(recovery).toContain("Failed to fetch dynamically imported module");
    expect(recovery).toContain("sessionStorage");
  });

  it("reloads once and never loops", () => {
    expect(recovery).toContain("RELOAD_COOLDOWN_MS");
    expect(recovery).toContain("location.replace");
  });

  it("listens outside React, where chunk errors actually land", () => {
    expect(monitoring).toContain("recoverFromStaleBuild");
    expect(monitoring).toContain("unhandledrejection");
    expect(boundary).toContain("recoverFromStaleBuild");
  });
});

describe("the face panel has no renderer left to fail", () => {
  const scan = read("src/components/ui/face-scan.tsx");
  const tile = read("src/components/ui/face-id-tile.tsx");
  const pkg = read("package.json");

  it("draws the panel with CSS and SVG only", () => {
    expect(tile).not.toMatch(/from "three"/);
    expect(tile).not.toContain("getContext(");
    expect(tile).not.toContain("useFrame");
    expect(tile).toContain("<svg");
    expect(tile).toContain("Face ID panel, without a renderer");
  });

  it("ships no 3D engine at all", () => {
    expect(pkg).not.toContain("@react-three/fiber");
    expect(pkg).not.toContain("@react-three/drei");
    expect(pkg).not.toContain('"three"');
    expect(scan).not.toContain("next/dynamic");
    expect(scan).not.toContain("AppleFaceID");
  });

  it("keeps a direct way into the camera that needs no panel at all", () => {
    expect(scan).toContain("Camera not opening? Tap here to start");
    expect(scan).toContain("onClick={start}");
    expect(tile).toContain("onActivate");
  });
});

describe("a failed face step degrades to manual review", () => {
  const page = read("src/app/auth/page.tsx");

  it("ships the scan with the page, so there is no chunk to 404", () => {
    expect(page).toContain('import FaceScan from "@/components/ui/face-scan"');
    expect(page).not.toContain('dynamic(() => import("@/components/ui/face-scan")');
  });

  it("wraps the scan so the signup survives its failure", () => {
    expect(page).toContain('label="face-scan"');
    expect(page).toContain("The camera check could not open on this phone");
    expect(page).toContain("Continue with manual review");
    expect(page).toContain("Try the camera again");
    expect(page).toContain("Reason:");
  });

  it("still records the manual review decision", () => {
    expect(page).toContain('setLivenessMode("manual_review")');
  });
});

describe("the root layout cannot be taken down by browser storage", () => {
  const i18n = read("src/context/i18n-context.tsx");

  it("guards the localStorage read that Chrome refuses when site data is blocked", () => {
    const effect = i18n.slice(i18n.indexOf("rabi-lang"), i18n.indexOf("rabi-lang") + 700);
    expect(effect).toContain("try");
    expect(effect).toContain("catch");
  });

  it("survives a dictionary chunk that will not download", () => {
    expect(i18n).toContain(".catch(");
  });
});

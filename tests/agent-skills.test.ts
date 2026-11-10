import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

/*
 * Guardrails for the vendored agent skills.
 *
 * The failure this prevents is silent: a directory gets copied in, everyone
 * assumes it came from somewhere reputable, and a year later nobody can say
 * where it came from or what license it is under. That is a legal problem and a
 * security one, because an untraceable instruction file is exactly what a
 * poisoned skill would look like.
 *
 * These are cheap structural checks. They deliberately do not try to judge the
 * quality of a skill's advice; that is not testable.
 */

const SKILLS = path.join(process.cwd(), ".agents", "skills");
const SOURCES = path.join(process.cwd(), ".agents", "SOURCES.md");

const skillDirs = () =>
  readdirSync(SKILLS).filter((entry) => statSync(path.join(SKILLS, entry)).isDirectory());

describe("vendored skills stay traceable", () => {
  it("ships a provenance file", () => {
    expect(existsSync(SOURCES)).toBe(true);
    expect(readFileSync(SOURCES, "utf8")).toContain("| License |");
  });

  it("has a SKILL.md with name and description in every skill", () => {
    const broken = skillDirs().filter((dir) => {
      const file = path.join(SKILLS, dir, "SKILL.md");
      if (!existsSync(file)) return true;
      const head = readFileSync(file, "utf8").slice(0, 1200);
      return !/^---/.test(head) || !/^name:/m.test(head) || !/^description:/m.test(head);
    });

    expect(broken).toEqual([]);
  });

  it("records every installed skill in the provenance file", () => {
    const sources = readFileSync(SOURCES, "utf8");
    const unrecorded = skillDirs().filter((dir) => !sources.includes(`\`${dir}\``));

    // A skill nobody can trace is a skill that should not be here.
    expect(unrecorded).toEqual([]);
  });

  it("names a known license for every source", () => {
    const sources = readFileSync(SOURCES, "utf8");
    const rows = sources.split("\n").filter((line) => line.startsWith("| ["));
    expect(rows.length).toBeGreaterThan(5);

    for (const row of rows) {
      expect(row).toMatch(/\b(MIT|Apache-2\.0)\b/);
    }
  });

  it("carries no build artifacts, bytecode or nested git repositories", () => {
    const offenders: string[] = [];

    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === "__pycache__" || entry.name === ".git") {
            offenders.push(path.relative(SKILLS, full));
            continue;
          }
          walk(full);
          continue;
        }
        if (/\.(pyc|ttf|woff2?|coverage)$/.test(entry.name)) {
          offenders.push(path.relative(SKILLS, full));
        }
      }
    };

    walk(SKILLS);
    expect(offenders).toEqual([]);
  });

  it("stays small enough to clone on a phone", () => {
    let bytes = 0;
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else bytes += statSync(full).size;
      }
    };
    walk(SKILLS);

    // Fonts and demo media were stripped for this reason. 10 MB is generous and
    // still catches a whole skill collection being dumped in by accident.
    expect(bytes).toBeLessThan(10 * 1024 * 1024);
  });

  it("does not vendor skills that only work with a separate kit installed", () => {
    // plugin87's skills each require `npx ux-ui-agent-skills init`. Copied
    // without that kit they sit in permanent "guidance-only mode", which is
    // worse than absent because they look installed.
    const offenders = skillDirs().filter((dir) =>
      readFileSync(path.join(SKILLS, dir, "SKILL.md"), "utf8").includes("ux-ui-agent-skills@3.1.0 init")
    );

    expect(offenders).toEqual([]);
  });
});

describe("AGENTS.md describes this project, not a template", () => {
  const agents = readFileSync(path.join(process.cwd(), "AGENTS.md"), "utf8");

  it("states the rules that this codebase actually enforces", () => {
    expect(agents).toContain("Rabi is the final approver");
    expect(agents).toContain("Never refuse a genuine member");
    expect(agents).toMatch(/No em dashes/);
    expect(agents).toContain("Free tier only");
  });

  it("points at the real commands", () => {
    for (const script of ["npm run typecheck", "npm run lint", "npm test", "npm run build"]) {
      expect(agents).toContain(script);
    }
  });

  it("tells an agent that the project wins over a skill", () => {
    expect(agents).toMatch(/this repo wins/i);
  });
});

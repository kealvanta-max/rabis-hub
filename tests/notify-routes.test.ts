import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const decision = read("src/app/api/notify/decision/route.ts");
const newMember = read("src/app/api/notify/new-member/route.ts");
const adminPage = read("src/app/admin/page.tsx");
const authPage = read("src/app/auth/page.tsx");
const probe = read("src/app/api/security/rules-probe/route.ts");

describe("decision email route", () => {
  it("requires a signed-in admin", () => {
    expect(decision).toContain("authenticateRequest(request)");
    expect(decision).toContain("if (!actor.admin)");
    expect(decision).toContain("status: 403");
  });

  it("reads the member from Firestore instead of trusting the request", () => {
    expect(decision).toContain("readMember(uid, actor.token)");
    // The body carries a uid and a decision, never an address or a body.
    const bodyParse = decision.slice(decision.indexOf("body = await request.json()"));
    expect(bodyParse).not.toContain("member.email =");
  });

  it("records the outcome on the member document", () => {
    expect(decision).toContain("stampMember(uid");
    expect(decision).toContain("decisionEmailStatus");
    expect(decision).toContain("decisionEmailProvider");
  });

  it("does not silently duplicate a decision mail", () => {
    expect(decision).toContain("already-sent");
    expect(decision).toContain("force");
  });

  it("sends through the shared mailer", () => {
    expect(decision).toContain("sendMail(");
    expect(decision).not.toContain("api.resend.com");
  });
});

describe("new member alert route", () => {
  it("requires a signed-in caller and re-reads the record", () => {
    expect(newMember).toContain("authenticateRequest(request)");
    expect(newMember).toContain("readMember(uid, actor.token)");
  });

  it("takes the recipient from server config, not from the caller", () => {
    expect(newMember).toContain("ownerEmails()");
    expect(newMember).not.toContain("body.to");
  });

  it("only lets an admin announce somebody else", () => {
    expect(newMember).toContain("requestedUid !== actor.uid && !actor.admin");
  });

  it("stamps the alert so a retry is a no-op", () => {
    expect(newMember).toContain("adminAlertAt");
    expect(newMember).toContain("already-alerted");
  });
});

describe("admin dashboard", () => {
  it("shows pending applications above everything else", () => {
    expect(adminPage).toContain("Pending applications");
    expect(adminPage).toContain('setFilter("pending")');
  });

  it("has a sweep for alerts that were lost", () => {
    expect(adminPage).toContain("resendMissedAlerts");
    expect(adminPage).toContain("requestNewMemberAlert(member.id)");
  });

  it("no longer fires email from the browser", () => {
    expect(adminPage).not.toContain("notifyUserApproval");
    expect(adminPage).not.toContain("notifyUserRejection");
    expect(authPage).not.toContain("notifyAdminNewRegistration");
    expect(authPage).toContain("requestNewMemberAlert(undefined, { keepalive: true })");
  });

  it("can send a decision email again from the member sheet", () => {
    expect(adminPage).toContain("sendDecisionAgain");
  });
});

describe("rules probe", () => {
  it("is owner only", () => {
    expect(probe).toContain("if (!actor.admin)");
    expect(probe).toContain("status: 401");
  });

  it("asks the live database as a stranger", () => {
    expect(probe).toContain("Deliberately no Authorization header");
    expect(probe).toContain('probeAnonymous("/users?pageSize=1")');
  });

  it("treats an anonymous reach into the member list as critical", () => {
    expect(probe).toContain('"exposed"');
    expect(probe).toContain("409");
  });

  it("does not mistake a permitted but empty document for a failure", () => {
    // settings/customPlans legitimately does not exist until Rabi adds one.
    expect(probe).toContain("response.status === 404");
    expect(probe).toContain('verdict: "permitted", status: 404');
  });
});

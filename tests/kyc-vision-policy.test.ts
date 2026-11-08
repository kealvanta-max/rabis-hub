import { describe, expect, it } from "vitest";
import { classifyVisionSignals, type VisionSignals } from "@/lib/kyc-vision-policy";

const clearSignals: VisionSignals = {
  subject: "human_face",
  card: "looks_like_ghana_card",
  face_match: "consistent",
  reproduction: "photo_of_original",
  confidence: 0.95,
};

describe("cautious vision-screening policy", () => {
  it("lets clear visual signals proceed only to human review", () => {
    expect(classifyVisionSignals(clearSignals)).toEqual({
      state: "screened_pass",
      reasons: ["visual-screening-signals-clear-human-review-required"],
    });
  });

  it("rejects a clear negative only when confidence and all other signals are unambiguous", () => {
    expect(classifyVisionSignals({ ...clearSignals, face_match: "not_consistent" })).toEqual({
      state: "rejected",
      reasons: ["face-consistency-mismatch"],
    });
  });

  it("routes mixed or uncertain signals to manual review, even if another signal is negative", () => {
    expect(classifyVisionSignals({ ...clearSignals, subject: "non_human_or_no_face", card: "uncertain" })).toEqual({
      state: "manual_review_required",
      reasons: ["no-human-face-signal", "vision-uncertain-human-review"],
    });
  });

  it("routes low-confidence results to manual review", () => {
    expect(classifyVisionSignals({ ...clearSignals, confidence: 0.84, reproduction: "screen_or_copy" })).toEqual({
      state: "manual_review_required",
      reasons: ["possible-screen-or-copy", "vision-uncertain-human-review"],
    });
  });

  it("does not mark an automated pass as identity or liveness verification", () => {
    const result = classifyVisionSignals(clearSignals);
    expect(result.state).toBe("screened_pass");
    expect(result.reasons).toContain("visual-screening-signals-clear-human-review-required");
    expect(result.reasons.join(" ")).not.toMatch(/authentic|live|verified identity/i);
  });
});

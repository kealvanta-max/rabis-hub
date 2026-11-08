import { describe, expect, it } from "vitest";
import { classifyVisionSignals, type VisionSignals } from "@/lib/kyc-vision-policy";

/**
 * These tests exist because the previous policy let a photo of a dog through.
 *
 * The bug was structural, not a typo: the old table only rejected when *all
 * four* signals were confident, so "the card is uncertain" (it was never shown
 * in a selfie) neutralised "this is not a human". The fix separates a hard gate
 * (is there a person in this photo at all?) from soft signals (does the card and
 * the face match look right?).
 *
 * So the tests below are written as the attacks and mistakes that actually
 * happen, not as a restatement of the implementation.
 */

const clear: VisionSignals = {
  subject: "human_face",
  card: "looks_like_ghana_card",
  face_match: "consistent",
  reproduction: "photo_of_original",
  confidence: 0.95,
};

describe("a photo that is not a person is refused, not reviewed", () => {
  it("refuses a dog in the selfie even when everything else is uncertain", () => {
    // This is the exact shape the old policy waved through to Rabi.
    const decision = classifyVisionSignals({
      subject: "non_human_or_no_face",
      card: "uncertain",
      face_match: "uncertain",
      reproduction: "uncertain",
      confidence: 0.9,
    });
    expect(decision.state).toBe("rejected");
    expect(decision.reasons).toContain("not-a-human-face");
  });

  it("refuses an animal on a confident answer well below the decision floor", () => {
    // A false rejection costs a retake; a false acceptance costs money.
    const decision = classifyVisionSignals({ ...clear, subject: "non_human_or_no_face", confidence: 0.72 });
    expect(decision.state).toBe("rejected");
  });

  it("sends a genuinely ambiguous selfie to Rabi instead of guessing", () => {
    const decision = classifyVisionSignals({ ...clear, subject: "uncertain", card: "looks_like_ghana_card" });
    expect(decision.state).toBe("manual_review_required");
    expect(decision.reasons).toContain("selfie-subject-unclear");
  });
});

describe("replay and identity attacks", () => {
  it("refuses a selfie that is a photo of a screen", () => {
    const decision = classifyVisionSignals({ ...clear, reproduction: "screen_or_copy" });
    expect(decision.state).toBe("rejected");
    expect(decision.reasons).toContain("photo-of-a-screen-or-copy");
  });

  it("refuses a selfie that is somebody else's face", () => {
    const decision = classifyVisionSignals({ ...clear, face_match: "not_consistent" });
    expect(decision.state).toBe("rejected");
    expect(decision.reasons).toContain("selfie-does-not-match-the-card");
  });

  it("refuses a document that is not a Ghana Card", () => {
    const decision = classifyVisionSignals({ ...clear, card: "not_ghana_card" });
    expect(decision.state).toBe("rejected");
    expect(decision.reasons).toContain("not-a-ghana-card");
  });
});

describe("uncertainty defers to a human, never to a pass", () => {
  it("routes a blurry card to Rabi", () => {
    const decision = classifyVisionSignals({ ...clear, card: "uncertain" });
    expect(decision.state).toBe("manual_review_required");
    expect(decision.reasons).toContain("card-appearance-unclear");
  });

  it("routes a low-confidence answer to Rabi", () => {
    const decision = classifyVisionSignals({ ...clear, confidence: 0.5 });
    expect(decision.state).toBe("manual_review_required");
  });

  it("never reports an automated pass as identity or liveness proof", () => {
    const decision = classifyVisionSignals(clear);
    expect(decision.state).toBe("screened_pass");
    expect(decision.reasons.join(" ")).toMatch(/human-review/i);
    expect(decision.reasons.join(" ")).not.toMatch(/authentic|is live|verified identity/i);
  });
});

describe("selfie-only screening asks about the selfie and nothing else", () => {
  it("refuses a dog without needing card signals", () => {
    const decision = classifyVisionSignals(
      {
        subject: "non_human_or_no_face",
        card: "uncertain",
        face_match: "uncertain",
        reproduction: "photo_of_original",
        confidence: 0.9,
      },
      "selfie"
    );
    expect(decision.state).toBe("rejected");
  });

  it("does not put a selfie in review just because the card was not shown", () => {
    // At upload time there is no card image, so "card: uncertain" is expected
    // and carries no information. Treating it as a signal would send every
    // honest selfie to Rabi.
    const decision = classifyVisionSignals(
      { ...clear, card: "uncertain", face_match: "uncertain" },
      "selfie"
    );
    expect(decision.state).toBe("screened_pass");
  });

  it("still refuses a screen replay at upload time", () => {
    const decision = classifyVisionSignals({ ...clear, reproduction: "screen_or_copy" }, "selfie");
    expect(decision.state).toBe("rejected");
  });
});

/**
 * A single card image, screened on its own the moment it is uploaded.
 *
 * The upload route used to screen only files the browser labelled "selfie", so a
 * dog photo sent as `purpose: "document"` skipped the check and was stored. The
 * submission gate still screens the real bytes, so it was never a way in — but a
 * refused image should not reach storage, and storage is what upload writes to.
 *
 * The scope exists because a Ghana Card photo legitimately contains no human
 * face: running the subject gate on one would refuse every honest applicant.
 */
describe("document scope", () => {
  it("refuses an image with no real card in it", () => {
    const decision = classifyVisionSignals(
      { subject: "uncertain", card: "not_ghana_card", face_match: "uncertain", reproduction: "photo_of_original", confidence: 0.9 },
      "document"
    );
    expect(decision.state).toBe("rejected");
    expect(decision.reasons).toContain("not-a-ghana-card");
  });

  it("refuses a photograph of a screen or a printed copy", () => {
    const decision = classifyVisionSignals(
      { subject: "uncertain", card: "looks_like_ghana_card", face_match: "uncertain", reproduction: "screen_or_copy", confidence: 0.88 },
      "document"
    );
    expect(decision.state).toBe("rejected");
    expect(decision.reasons).toContain("photo-of-a-screen-or-copy");
  });

  it("never refuses a card for having no human face", () => {
    // The exact regression this scope prevents: a card image answered as
    // "non_human_or_no_face" for the ignored subject field must not block.
    const decision = classifyVisionSignals(
      { subject: "non_human_or_no_face", card: "looks_like_ghana_card", face_match: "uncertain", reproduction: "photo_of_original", confidence: 0.95 },
      "document"
    );
    expect(decision.state).toBe("screened_pass");
  });

  it("sends an unreadable card to Rabi rather than refusing it", () => {
    const decision = classifyVisionSignals(
      { subject: "uncertain", card: "uncertain", face_match: "uncertain", reproduction: "uncertain", confidence: 0.4 },
      "document"
    );
    expect(decision.state).toBe("manual_review_required");
    // A low-confidence card answer is a bad photo, not fraud.
    expect(decision.reasons).toContain("card-appearance-unclear");
  });

  it("does not ask a card photo about face matching", () => {
    const decision = classifyVisionSignals(
      { subject: "uncertain", card: "looks_like_ghana_card", face_match: "not_consistent", reproduction: "photo_of_original", confidence: 0.95 },
      "document"
    );
    // A mismatch is impossible to judge with no selfie present.
    expect(decision.state).toBe("screened_pass");
  });

  it("keeps card authenticity in full scope as well", () => {
    const decision = classifyVisionSignals(
      { subject: "human_face", card: "not_ghana_card", face_match: "consistent", reproduction: "photo_of_original", confidence: 0.9 },
      "full"
    );
    expect(decision.state).toBe("rejected");
  });

  it("still never asks a selfie about the card", () => {
    const decision = classifyVisionSignals(
      { subject: "human_face", card: "not_ghana_card", face_match: "uncertain", reproduction: "photo_of_original", confidence: 0.9 },
      "selfie"
    );
    expect(decision.state).toBe("screened_pass");
  });
});

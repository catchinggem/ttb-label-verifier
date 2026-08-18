import { describe, expect, it } from "vitest";
import { GOVERNMENT_WARNING } from "@/lib/cfr";
import type { LabelObservation } from "@/lib/observation";
import type { ApplicationData } from "@/lib/types";
import { verifyLabel } from "./index";

function observation(overrides: Partial<LabelObservation> = {}): LabelObservation {
  const field = (text: string | null, confidence = 0.95) => ({ text, confidence });
  return {
    beverageType: "distilled_spirits",
    brandName: field("OLD TOM DISTILLERY"),
    classType: field("Kentucky Straight Bourbon Whiskey"),
    alcoholContent: field("45% Alc./Vol. (90 Proof)"),
    netContents: field("750 mL"),
    bottlerName: field("Old Tom Distilling Co."),
    countryOfOrigin: field(null),
    governmentWarning: {
      present: true,
      text: GOVERNMENT_WARNING,
      prefixIsAllCaps: true,
      prefixAppearsBold: true,
      relativeFontSize: 1,
      confidence: 0.95,
    },
    imageQuality: { legible: true, issues: [] },
    ...overrides,
  };
}

const APPLICATION: ApplicationData = {
  beverageType: "distilled_spirits",
  brandName: "OLD TOM DISTILLERY",
  classType: "Kentucky Straight Bourbon Whiskey",
  alcoholContent: "45% Alc./Vol. (90 Proof)",
  netContents: "750 mL",
  bottlerName: "Old Tom Distilling Co.",
};

describe("verifyLabel", () => {
  it("passes a fully compliant label", () => {
    const result = verifyLabel(observation(), APPLICATION, 0);
    expect(result.verdict).toBe("pass");
    expect(result.fields).toHaveLength(6);
  });

  it("cannot pass an illegible image however the fields land", () => {
    const result = verifyLabel(
      observation({ imageQuality: { legible: false, issues: ["glare on lower third"] } }),
      APPLICATION,
      0,
    );
    expect(result.verdict).toBe("needs_review");
    expect(result.imageQualityNote).toMatch(/glare on lower third/);
  });

  describe("model disagreement on the warning", () => {
    const disagreement = {
      defaultModel: "claude-haiku-4-5-20251001",
      defaultText: "GOVERNMENT WARNING: (1) According to the Surgeon General…",
      escalationModel: "claude-sonnet-5",
      escalationText: GOVERNMENT_WARNING,
    };

    it("holds for review and quotes both readings", () => {
      const result = verifyLabel(observation(), APPLICATION, 0, disagreement);
      const warning = result.fields.find((f) => f.field === "governmentWarning")!;
      expect(warning.verdict).toBe("needs_review");
      expect(warning.reason).toMatch(/haiku-4-5/);
      expect(warning.reason).toMatch(/sonnet-5/);
      expect(warning.reason).toMatch(/neither reading is being treated as authoritative/);
    });

    it("never silently prefers the escalation model", () => {
      // The observation carries Sonnet's (correct) reading, which would pass on
      // its own — the disagreement must still surface.
      const result = verifyLabel(observation(), APPLICATION, 0, disagreement);
      expect(result.verdict).toBe("needs_review");
    });

    it("reports a null reading rather than omitting it", () => {
      const result = verifyLabel(observation(), APPLICATION, 0, {
        ...disagreement,
        defaultText: null,
      });
      const warning = result.fields.find((f) => f.field === "governmentWarning")!;
      expect(warning.reason).toMatch(/\(no warning found\)/);
    });
  });
});

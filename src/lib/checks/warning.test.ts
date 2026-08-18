import { describe, expect, it } from "vitest";
import { GOVERNMENT_WARNING } from "@/lib/cfr";
import type { WarningObservationData } from "@/lib/observation";
import {
  checkGovernmentWarning,
  FONT_SIZE_PASS_ABOVE,
  FONT_SIZE_REVIEW_BELOW,
} from "./warning";

/** A compliant warning; each test overrides only what it is exercising. */
function observation(
  overrides: Partial<WarningObservationData> = {},
): WarningObservationData {
  return {
    present: true,
    text: GOVERNMENT_WARNING,
    prefixIsAllCaps: true,
    prefixAppearsBold: true,
    relativeFontSize: 1,
    confidence: 0.95,
    ...overrides,
  };
}

describe("checkGovernmentWarning", () => {
  it("passes a compliant warning", () => {
    expect(checkGovernmentWarning(observation()).verdict).toBe("pass");
  });

  it("fails when the warning is absent", () => {
    const result = checkGovernmentWarning(observation({ present: false, text: null }));
    expect(result.verdict).toBe("fail");
    expect(result.reason).toMatch(/No government warning/i);
  });

  /**
   * Assertion 1 — verbatim text. The model is reliable at reading text, so this
   * is the only assertion permitted to reject an application.
   */
  describe("text match (may Fail)", () => {
    it("tolerates line wrapping and the CFR paragraph break", () => {
      const wrapped = GOVERNMENT_WARNING.replace(/ /g, "\n  ");
      expect(checkGovernmentWarning(observation({ text: wrapped })).verdict).toBe("pass");
    });

    it("fails altered wording", () => {
      const result = checkGovernmentWarning(
        observation({ text: GOVERNMENT_WARNING.replace("birth defects", "health issues") }),
      );
      expect(result.verdict).toBe("fail");
    });

    it("does not case-fold the statement body", () => {
      expect(
        checkGovernmentWarning(observation({ text: GOVERNMENT_WARNING.toLowerCase() })).verdict,
      ).toBe("fail");
    });

    it("does not fold punctuation", () => {
      expect(
        checkGovernmentWarning(observation({ text: GOVERNMENT_WARNING.replace(/\./g, "") })).verdict,
      ).toBe("fail");
    });
  });

  /**
   * The reason has to tell an agent what to tell the applicant, so it names the
   * divergence rather than saying "does not match".
   */
  describe("actionable mismatch reporting", () => {
    it("reports the first divergence with both sides quoted", () => {
      const result = checkGovernmentWarning(
        observation({ text: GOVERNMENT_WARNING.replace("birth defects", "health issues") }),
      );
      expect(result.reason).toMatch(/diverges at character \d+/);
      expect(result.reason).toMatch(/birth defects/);
      expect(result.reason).toMatch(/health issues/);
    });

    it("reports a truncated warning as ending early", () => {
      const result = checkGovernmentWarning(
        observation({ text: GOVERNMENT_WARNING.slice(0, 120) }),
      );
      expect(result.verdict).toBe("fail");
      expect(result.reason).toMatch(/ends early or runs long/);
    });

    it("catches a title-case prefix through the text check, not just casing", () => {
      const result = checkGovernmentWarning(
        observation({ text: GOVERNMENT_WARNING.replace("GOVERNMENT WARNING:", "Government Warning:") }),
      );
      expect(result.verdict).toBe("fail");
      expect(result.reason).toMatch(/diverges at character 1/);
    });
  });

  /**
   * Assertions 2 and 3 — rendering. The model judges rendered type poorly, so
   * these are capped at Needs Review. A false Fail rejects a compliant
   * applicant; a false Needs Review costs an agent a glance.
   */
  describe("typography (capped at Needs Review)", () => {
    it("holds, never fails, on a non-all-caps prefix", () => {
      const result = checkGovernmentWarning(observation({ prefixIsAllCaps: false }));
      expect(result.verdict).toBe("needs_review");
      expect(result.reason).toMatch(/Confirm the rendering by eye/);
      expect(result.reason).toMatch(/all capital letters/);
    });

    it("holds, never fails, on a non-bold prefix", () => {
      const result = checkGovernmentWarning(observation({ prefixAppearsBold: false }));
      expect(result.verdict).toBe("needs_review");
      expect(result.reason).toMatch(/not appearing bold/);
    });

    it("holds when the rendering could not be determined", () => {
      const result = checkGovernmentWarning(
        observation({ prefixAppearsBold: null, prefixIsAllCaps: null }),
      );
      expect(result.verdict).toBe("needs_review");
      expect(result.reason).toMatch(/could not determine/);
    });

    it("never rejects on typography alone, even with both assertions tripped", () => {
      const result = checkGovernmentWarning(
        observation({ prefixIsAllCaps: false, prefixAppearsBold: false, relativeFontSize: 0.1 }),
      );
      expect(result.verdict).toBe("needs_review");
    });

    it("tells the agent that typographic reads are advisory", () => {
      const result = checkGovernmentWarning(observation({ prefixAppearsBold: false }));
      expect(result.reason).toMatch(/never a rejection on their own/);
    });
  });

  /**
   * A band, not a boundary: pooled over 7 runs the model's size estimate ran
   * +0.25 high with a 0.35 spread against a fixture whose true ratio is 0.42.
   * A point threshold flapped on identical input; the band is a better shape
   * but still misses undersized warnings (findings.md finding 5).
   */
  describe("legibility band", () => {
    it("holds a clearly undersized warning for review", () => {
      const result = checkGovernmentWarning(
        observation({ relativeFontSize: FONT_SIZE_REVIEW_BELOW - 0.05 }),
      );
      expect(result.verdict).toBe("needs_review");
      expect(result.reason).toMatch(/evasion/);
    });

    it("passes a warning clearly above the band", () => {
      expect(
        checkGovernmentWarning(observation({ relativeFontSize: FONT_SIZE_PASS_ABOVE + 0.05 }))
          .verdict,
      ).toBe("pass");
      expect(checkGovernmentWarning(observation({ relativeFontSize: 1 })).verdict).toBe("pass");
    });

    it("holds the uncertain middle and says the estimate is imprecise", () => {
      const result = checkGovernmentWarning(observation({ relativeFontSize: 0.6 }));
      expect(result.verdict).toBe("needs_review");
      expect(result.reason).toMatch(/too imprecise/);
      expect(result.reason).not.toMatch(/0\.05/);
    });

    it("treats both band edges as uncertain rather than deciding them", () => {
      expect(
        checkGovernmentWarning(observation({ relativeFontSize: FONT_SIZE_REVIEW_BELOW })).verdict,
      ).toBe("needs_review");
      expect(
        checkGovernmentWarning(observation({ relativeFontSize: FONT_SIZE_PASS_ABOVE })).verdict,
      ).toBe("needs_review");
    });

    /** The exact readings observed from three runs against one fixture. */
    it("does not flap across the observed 0.55-0.65 spread", () => {
      for (const size of [0.55, 0.65, 0.65]) {
        expect(checkGovernmentWarning(observation({ relativeFontSize: size })).verdict).toBe(
          "needs_review",
        );
      }
    });
  });

  describe("assertions are reported independently", () => {
    it("reports the text divergence and the rendering doubt together", () => {
      const result = checkGovernmentWarning(
        observation({
          text: GOVERNMENT_WARNING.replace("birth defects", "health issues"),
          prefixAppearsBold: false,
        }),
      );
      // Text mismatch dominates the verdict...
      expect(result.verdict).toBe("fail");
      // ...but the agent still hears about the rendering.
      expect(result.reason).toMatch(/diverges at character/);
      expect(result.reason).toMatch(/Confirm the rendering by eye/);
    });

    it("surfaces both a rendering doubt and an undersized warning", () => {
      const result = checkGovernmentWarning(
        observation({ prefixAppearsBold: null, relativeFontSize: 0.2 }),
      );
      expect(result.verdict).toBe("needs_review");
      expect(result.reason).toMatch(/could not determine/);
      expect(result.reason).toMatch(/16\.22/);
    });
  });
});

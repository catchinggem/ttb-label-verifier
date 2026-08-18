import { describe, expect, it } from "vitest";
import { GOVERNMENT_WARNING } from "@/lib/cfr";
import type { WarningObservationData } from "@/lib/observation";
import { checkGovernmentWarning, MIN_RELATIVE_FONT_SIZE } from "./warning";

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
    const result = checkGovernmentWarning(
      observation({ present: false, text: null }),
    );
    expect(result.verdict).toBe("fail");
    expect(result.reason).toMatch(/No government warning/i);
  });

  describe("assertion 1 — text match", () => {
    it("tolerates line wrapping and the CFR paragraph break", () => {
      const wrapped = GOVERNMENT_WARNING.replace(/ /g, "\n  ");
      expect(checkGovernmentWarning(observation({ text: wrapped })).verdict).toBe(
        "pass",
      );
    });

    it("fails altered wording", () => {
      const result = checkGovernmentWarning(
        observation({
          text: GOVERNMENT_WARNING.replace("birth defects", "health issues"),
        }),
      );
      expect(result.verdict).toBe("fail");
      expect(result.reason).toMatch(/verbatim/);
    });

    it("does not case-fold the statement body", () => {
      const result = checkGovernmentWarning(
        observation({ text: GOVERNMENT_WARNING.toLowerCase() }),
      );
      expect(result.verdict).toBe("fail");
    });

    it("does not fold punctuation", () => {
      const result = checkGovernmentWarning(
        observation({ text: GOVERNMENT_WARNING.replace(/\./g, "") }),
      );
      expect(result.verdict).toBe("fail");
    });
  });

  describe("assertion 2 — prefix casing", () => {
    it("fails a title-case prefix", () => {
      const result = checkGovernmentWarning(
        observation({ prefixIsAllCaps: false }),
      );
      expect(result.verdict).toBe("fail");
      expect(result.reason).toMatch(/all capital letters/);
    });
  });

  describe("assertion 3 — prefix weight", () => {
    it("fails a non-bold prefix", () => {
      const result = checkGovernmentWarning(
        observation({ prefixAppearsBold: false }),
      );
      expect(result.verdict).toBe("fail");
      expect(result.reason).toMatch(/bold/);
    });
  });

  it("names every failed assertion, not just the first", () => {
    const result = checkGovernmentWarning(
      observation({
        text: "GOVERNMENT WARNING: drink responsibly.",
        prefixIsAllCaps: false,
        prefixAppearsBold: false,
      }),
    );
    expect(result.verdict).toBe("fail");
    expect(result.reason).toMatch(/verbatim/);
    expect(result.reason).toMatch(/all capital letters/);
    expect(result.reason).toMatch(/bold/);
  });

  describe("legibility signal", () => {
    it("holds an undersized but otherwise correct warning for review", () => {
      const result = checkGovernmentWarning(
        observation({ relativeFontSize: MIN_RELATIVE_FONT_SIZE - 0.1 }),
      );
      expect(result.verdict).toBe("needs_review");
      expect(result.reason).toMatch(/evasion/);
    });

    it("does not rescue a warning that failed an assertion", () => {
      const result = checkGovernmentWarning(
        observation({ prefixAppearsBold: false, relativeFontSize: 0.1 }),
      );
      expect(result.verdict).toBe("fail");
    });

    it("holds for review when the rendering could not be determined", () => {
      const result = checkGovernmentWarning(
        observation({ prefixAppearsBold: null }),
      );
      expect(result.verdict).toBe("needs_review");
    });
  });
});

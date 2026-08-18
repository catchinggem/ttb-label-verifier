import { describe, expect, it } from "vitest";
import { CONFIDENCE_FLOOR, escalationReason } from "@/lib/extract";
import { GOVERNMENT_WARNING } from "@/lib/cfr";
import type { LabelObservation } from "@/lib/observation";

function observation(
  overrides: Partial<LabelObservation> = {},
): LabelObservation {
  const field = (text: string | null, confidence = 0.95) => ({ text, confidence });
  return {
    beverageType: "distilled_spirits",
    brandName: field("OLD TOM DISTILLERY"),
    classType: field("Kentucky Straight Bourbon Whiskey"),
    alcoholContent: field("45% Alc./Vol. (90 Proof)"),
    netContents: field("750 mL"),
    bottlerName: field("Old Tom Distilling Co., Louisville KY"),
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

describe("escalationReason", () => {
  it("accepts a complete, confident read", () => {
    expect(escalationReason(observation())).toBeNull();
  });

  it("escalates when a required field is null", () => {
    const reason = escalationReason(
      observation({ netContents: { text: null, confidence: 0.99 } }),
    );
    expect(reason).toMatch(/no value read for netContents/);
  });

  it("escalates when confidence falls below the floor", () => {
    const reason = escalationReason(
      observation({
        brandName: { text: "OLD TOM DISTILLERY", confidence: CONFIDENCE_FLOOR - 0.01 },
      }),
    );
    expect(reason).toMatch(/confidence below/);
    expect(reason).toMatch(/brandName/);
  });

  it("does not escalate at exactly the floor", () => {
    expect(
      escalationReason(
        observation({ brandName: { text: "OLD TOM", confidence: CONFIDENCE_FLOOR } }),
      ),
    ).toBeNull();
  });

  it("escalates on unread warning text", () => {
    const reason = escalationReason(
      observation({
        governmentWarning: {
          present: false,
          text: null,
          prefixIsAllCaps: null,
          prefixAppearsBold: null,
          relativeFontSize: null,
          confidence: 0.9,
        },
      }),
    );
    expect(reason).toMatch(/no government warning text read/);
  });

  it("reports every trigger, not just the first", () => {
    const reason = escalationReason(
      observation({
        netContents: { text: null, confidence: 0.9 },
        brandName: { text: "OLD TOM", confidence: 0.2 },
      }),
    );
    expect(reason).toMatch(/no value read for netContents/);
    expect(reason).toMatch(/confidence below/);
  });
});

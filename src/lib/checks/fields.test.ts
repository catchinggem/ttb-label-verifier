import { describe, expect, it } from "vitest";
import { compareTextField } from "./fields";

describe("compareTextField", () => {
  it("passes an exact match", () => {
    const r = compareTextField("brandName", "Brand Name", "Old Tom Distillery", "Old Tom Distillery");
    expect(r.verdict).toBe("pass");
  });

  it("passes when only whitespace differs", () => {
    const r = compareTextField("brandName", "Brand Name", "Old  Tom\nDistillery", "Old Tom Distillery");
    expect(r.verdict).toBe("pass");
  });

  /**
   * The correction that matters: a tool does not get to rule a mismatch
   * immaterial. Dave's STONE'S THROW case reaches a human, cheaply.
   */
  it("holds a case-only difference for review rather than passing it", () => {
    const r = compareTextField("brandName", "Brand Name", "STONE'S THROW", "Stone's Throw");
    expect(r.verdict).toBe("needs_review");
    expect(r.reason).toMatch(/capitalization or punctuation/);
    expect(r.reason).toMatch(/STONE'S THROW/);
    expect(r.reason).toMatch(/Stone's Throw/);
  });

  it("holds a punctuation-only difference for review", () => {
    const r = compareTextField("classType", "Class / Type", "Kentucky Straight Bourbon Whiskey.", "Kentucky Straight Bourbon Whiskey");
    expect(r.verdict).toBe("needs_review");
  });

  it("applies the same rule to bottler name", () => {
    const r = compareTextField("bottlerName", "Bottler / Producer", "OLD TOM DISTILLING CO., LOUISVILLE KY", "Old Tom Distilling Co., Louisville KY");
    expect(r.verdict).toBe("needs_review");
  });

  it("fails a substantive difference", () => {
    const r = compareTextField("brandName", "Brand Name", "Old Tom Distillery", "Young Tom Distillery");
    expect(r.verdict).toBe("fail");
  });

  it("fails when the label omits a field the application declares", () => {
    const r = compareTextField("netContents", "Net Contents", null, "750 mL");
    expect(r.verdict).toBe("fail");
  });

  it("holds for review when the application says nothing", () => {
    const r = compareTextField("brandName", "Brand Name", "Old Tom Distillery", undefined);
    expect(r.verdict).toBe("needs_review");
  });
});

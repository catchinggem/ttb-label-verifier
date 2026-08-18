import { describe, expect, it } from "vitest";
import { checkAlcoholContent, parseAbv, toleranceFor } from "./abv";

/**
 * Tolerances are transcribed from spec/cfr-abv-tolerances.txt. These tests pin
 * the numbers so a careless edit to the table fails here rather than in
 * production review.
 */
describe("toleranceFor", () => {
  it("allows 0.3 points for distilled spirits (5.65(c))", () => {
    expect(toleranceFor("distilled_spirits", 45).percentagePoints).toBe(0.3);
  });

  it("allows 1.0 point for wine above 14% (4.36(b)(1))", () => {
    expect(toleranceFor("wine", 14.1).percentagePoints).toBe(1.0);
  });

  it("allows 1.5 points for wine at or below 14% (4.36(b)(1))", () => {
    expect(toleranceFor("wine", 14).percentagePoints).toBe(1.5);
    expect(toleranceFor("wine", 11.5).percentagePoints).toBe(1.5);
  });

  it("allows 0.3 points for malt beverages at or above 0.5% (7.65(c))", () => {
    expect(toleranceFor("malt_beverage", 5).percentagePoints).toBe(0.3);
  });

  it("allows no tolerance below 0.5% for malt beverages (7.65(e)-(f))", () => {
    expect(toleranceFor("malt_beverage", 0.4).percentagePoints).toBe(0);
  });
});

describe("parseAbv", () => {
  it("reads the percentage out of a full label statement", () => {
    expect(parseAbv("45% Alc./Vol. (90 Proof)")).toBe(45);
    expect(parseAbv("Alc. 13.5% by vol.")).toBe(13.5);
  });

  it("returns null when there is no percentage", () => {
    expect(parseAbv("90 Proof")).toBeNull();
    expect(parseAbv(null)).toBeNull();
  });
});

describe("checkAlcoholContent", () => {
  it("passes an exact match", () => {
    const r = checkAlcoholContent("45% Alc./Vol.", "45%", "distilled_spirits");
    expect(r.verdict).toBe("pass");
    expect(r.reason).toMatch(/matching the application exactly/);
  });

  it("passes within tolerance and states the delta", () => {
    const r = checkAlcoholContent("45.2% Alc./Vol.", "45%", "distilled_spirits");
    expect(r.verdict).toBe("pass");
    expect(r.reason).toMatch(/0\.2 point difference/);
    expect(r.reason).toMatch(/27 CFR 5\.65\(c\)/);
  });

  it("fails outside tolerance and states the delta", () => {
    const r = checkAlcoholContent("45.5% Alc./Vol.", "45%", "distilled_spirits");
    expect(r.verdict).toBe("fail");
    expect(r.reason).toMatch(/0\.5 point difference/);
    expect(r.reason).toMatch(/exceeding/);
  });

  it("applies the wider wine tolerance", () => {
    // 1.2 points apart: outside the spirits tolerance, inside wine's 1.5.
    expect(checkAlcoholContent("12.7%", "11.5%", "wine").verdict).toBe("pass");
    expect(
      checkAlcoholContent("12.7%", "11.5%", "distilled_spirits").verdict,
    ).toBe("fail");
  });

  it("brackets wine on the declared figure, not the label", () => {
    // Application 14% -> 1.5 point bracket, so 15.2% is inside.
    expect(checkAlcoholContent("15.2%", "14%", "wine").verdict).toBe("pass");
    // Application 14.5% -> 1.0 point bracket, so 15.6% is outside.
    expect(checkAlcoholContent("15.6%", "14.5%", "wine").verdict).toBe("fail");
  });

  it("enforces the 0.5% malt beverage floor regardless of tolerance", () => {
    // 0.3 points apart, which the tolerance would otherwise allow.
    const r = checkAlcoholContent("0.5%", "0.4%", "malt_beverage");
    expect(r.verdict).toBe("fail");
    expect(r.reason).toMatch(/may not fall below 0\.5%/);
  });

  it("holds for review when the application declares no beverage type", () => {
    const r = checkAlcoholContent("45%", "45%", undefined);
    expect(r.verdict).toBe("needs_review");
    expect(r.reason).toMatch(/does not declare a beverage type/);
  });

  it("fails when the label omits an alcohol content the application declares", () => {
    expect(checkAlcoholContent(null, "45%", "distilled_spirits").verdict).toBe("fail");
  });
});

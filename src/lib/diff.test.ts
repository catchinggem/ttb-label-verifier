import { describe, expect, it } from "vitest";
import { describeDivergence, firstDivergence } from "./diff";

describe("firstDivergence", () => {
  it("returns null for identical strings", () => {
    expect(firstDivergence("hello world", "hello world")).toBeNull();
  });

  it("finds the index of the first differing character", () => {
    const d = firstDivergence("the risk of birth defects", "the risk of health defects");
    expect(d?.index).toBe(12);
    expect(d?.truncated).toBe(false);
  });

  it("quotes both sides with surrounding context", () => {
    const d = firstDivergence(
      "women should not drink alcoholic beverages during pregnancy",
      "women should not drink alcoholic beverages while pregnant",
    );
    expect(d?.expected).toMatch(/during pregnancy/);
    expect(d?.found).toMatch(/while pregnant/);
  });

  it("flags truncation when one string is a prefix of the other", () => {
    const d = firstDivergence("GOVERNMENT WARNING: full text here", "GOVERNMENT WARNING:");
    expect(d?.truncated).toBe(true);
    expect(d?.index).toBe(19);
  });

  it("flags a divergence at the very first character", () => {
    const d = firstDivergence("GOVERNMENT WARNING:", "Government Warning:");
    expect(d?.index).toBe(1);
  });

  it("elides long context with ellipses rather than dumping the string", () => {
    const long = "x".repeat(200);
    const d = firstDivergence(`${long}A${long}`, `${long}B${long}`);
    expect(d?.expected.startsWith("…")).toBe(true);
    expect(d?.expected.endsWith("…")).toBe(true);
    expect(d!.expected.length).toBeLessThan(70);
  });
});

describe("describeDivergence", () => {
  it("names the position and quotes both sides", () => {
    const d = firstDivergence("risk of birth defects", "risk of health issues")!;
    const text = describeDivergence(d);
    expect(text).toMatch(/character 8/);
    expect(text).toMatch(/Expected "/);
    expect(text).toMatch(/but found "/);
  });

  it("says so when the text ran short", () => {
    const d = firstDivergence("full statement here", "full statement")!;
    expect(describeDivergence(d)).toMatch(/ends early or runs long/);
  });
});

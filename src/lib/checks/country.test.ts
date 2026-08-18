import { describe, expect, it } from "vitest";
import { GOVERNMENT_WARNING } from "@/lib/cfr";
import type { LabelObservation } from "@/lib/observation";
import type { ApplicationData } from "@/lib/types";
import { checkCountryOfOrigin, verifyLabel } from "./index";

function observation(country: string | null): LabelObservation {
  const field = (text: string | null) => ({ text, confidence: 0.95 });
  return {
    beverageType: "distilled_spirits",
    brandName: field("GLEN CARRICK"),
    classType: field("Single Malt Scotch Whisky"),
    alcoholContent: field("43% Alc./Vol. (86 Proof)"),
    netContents: field("750 mL"),
    bottlerName: field("NORTH ATLANTIC SPIRITS, BOSTON, MA"),
    countryOfOrigin: field(country),
    governmentWarning: {
      present: true,
      text: GOVERNMENT_WARNING,
      prefixIsAllCaps: true,
      prefixAppearsBold: true,
      relativeFontSize: 1,
      confidence: 0.95,
    },
    imageQuality: { legible: true, issues: [] },
  };
}

const IMPORT: ApplicationData = {
  beverageType: "distilled_spirits",
  brandName: "GLEN CARRICK",
  classType: "Single Malt Scotch Whisky",
  alcoholContent: "43% Alc./Vol. (86 Proof)",
  netContents: "750 mL",
  bottlerName: "NORTH ATLANTIC SPIRITS, BOSTON, MA",
  countryOfOrigin: "PRODUCT OF SCOTLAND",
};

describe("checkCountryOfOrigin", () => {
  it("fails when a declared import omits the statement", () => {
    const result = checkCountryOfOrigin(null, "PRODUCT OF SCOTLAND");
    expect(result.verdict).toBe("fail");
    expect(result.reason).toMatch(/no country of origin statement/);
  });

  it("passes an exact match", () => {
    expect(checkCountryOfOrigin("PRODUCT OF SCOTLAND", "PRODUCT OF SCOTLAND").verdict).toBe("pass");
  });

  it("holds a case-only difference for review, like every other text field", () => {
    expect(checkCountryOfOrigin("Product of Scotland", "PRODUCT OF SCOTLAND").verdict).toBe(
      "needs_review",
    );
  });

  it("fails a different country outright", () => {
    expect(checkCountryOfOrigin("PRODUCT OF IRELAND", "PRODUCT OF SCOTLAND").verdict).toBe("fail");
  });
});

describe("import vs domestic branch", () => {
  it("emits a country row and fails when a declared import omits it", () => {
    const result = verifyLabel(observation(null), IMPORT, 0);
    const row = result.fields.find((f) => f.field === "countryOfOrigin");
    expect(row?.verdict).toBe("fail");
    expect(result.verdict).toBe("fail");
  });

  it("emits a country row and passes when the import states it", () => {
    const result = verifyLabel(observation("PRODUCT OF SCOTLAND"), IMPORT, 0);
    expect(result.fields.find((f) => f.field === "countryOfOrigin")?.verdict).toBe("pass");
    expect(result.verdict).toBe("pass");
  });

  /** The domestic branch: no declaration, no row, no noise. */
  it("emits no country row when the application declares no import", () => {
    const domestic: ApplicationData = { ...IMPORT, countryOfOrigin: undefined };
    const result = verifyLabel(observation(null), domestic, 0);
    expect(result.fields.find((f) => f.field === "countryOfOrigin")).toBeUndefined();
    expect(result.verdict).toBe("pass");
  });

  it("ignores a country statement on the label when none was declared", () => {
    const domestic: ApplicationData = { ...IMPORT, countryOfOrigin: undefined };
    const result = verifyLabel(observation("PRODUCT OF SCOTLAND"), domestic, 0);
    expect(result.fields.find((f) => f.field === "countryOfOrigin")).toBeUndefined();
    expect(result.verdict).toBe("pass");
  });
});

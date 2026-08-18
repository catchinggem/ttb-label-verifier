import { afterEach, describe, expect, it, vi } from "vitest";
import {
  APPLICATION_TEXT_FIELDS,
  buildApplication,
  describeMissing,
  validateApplication,
  validateSubmission,
  type ApplicationFormValues,
} from "./application";
import { verifyImage } from "./client";

/**
 * These cover the form-to-request boundary — the seam a pure test of the
 * comparison layer cannot see. `compareTextField` passed its whole test suite
 * while a payload of `{}` would have made every row report "not provided", so
 * correctness on each side of a boundary says nothing about what crosses it.
 */

afterEach(() => vi.unstubAllGlobals());

const POPULATED: ApplicationFormValues = {
  brandName: "OLD TOM DISTILLERY",
  classType: "Kentucky Straight Bourbon Whiskey",
  alcoholContent: "45% Alc./Vol. (90 Proof)",
  netContents: "750 mL",
  bottlerName: "OLD TOM DISTILLING CO., LOUISVILLE, KENTUCKY",
  countryOfOrigin: "PRODUCT OF THE UNITED STATES",
};

describe("buildApplication", () => {
  it("carries every rendered field plus the beverage type", () => {
    const application = buildApplication(POPULATED, "distilled_spirits");

    for (const { key } of APPLICATION_TEXT_FIELDS) {
      expect(application[key], `${key} missing from payload`).toBeTruthy();
    }
    expect(application.beverageType).toBe("distilled_spirits");
    expect(Object.keys(application)).toHaveLength(APPLICATION_TEXT_FIELDS.length + 1);
  });

  it("keeps values verbatim rather than normalizing them", () => {
    const application = buildApplication(POPULATED, "");
    expect(application.brandName).toBe("OLD TOM DISTILLERY");
    expect(application.alcoholContent).toBe("45% Alc./Vol. (90 Proof)");
  });

  it("omits blank and whitespace-only fields instead of sending empty strings", () => {
    const application = buildApplication(
      { brandName: "ACME", classType: "   ", netContents: "" },
      "",
    );
    expect(application).toEqual({ brandName: "ACME" });
    expect("classType" in application).toBe(false);
  });

  it("omits beverageType when nothing is selected", () => {
    expect(buildApplication({}, "")).toEqual({});
  });

  /**
   * An untouched form legitimately produces {}. Downstream that becomes Needs
   * Review on every field, which is the honest outcome — pinning it here so
   * nobody 'fixes' it later by inventing defaults.
   */
  it("produces an empty object for an untouched form", () => {
    expect(buildApplication({}, "")).toEqual({});
  });
});

describe("verifyImage serialization", () => {
  const image = new File([new Uint8Array([1, 2, 3])], "label.png", { type: "image/png" });

  /** Captures the FormData the client actually puts on the wire. */
  function captureRequest() {
    const captured: { body: FormData | null } = { body: null };
    const fetchMock = async (_url: unknown, init?: RequestInit) => {
      captured.body = init?.body as FormData;
      return new Response(JSON.stringify({ verdict: "pass", fields: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };
    vi.stubGlobal("fetch", fetchMock);
    return captured;
  }

  it("sends an application part that parses with every expected key non-empty", async () => {
    const captured = captureRequest();

    await verifyImage(image, buildApplication(POPULATED, "distilled_spirits"));

    const part = captured.body?.get("application");
    expect(typeof part).toBe("string");

    const parsed = JSON.parse(part as string);
    for (const { key } of APPLICATION_TEXT_FIELDS) {
      expect(parsed[key], `${key} absent from the serialized application`).toBeTruthy();
      expect(String(parsed[key]).trim(), `${key} serialized empty`).not.toBe("");
    }
    expect(parsed.beverageType).toBe("distilled_spirits");
  });

  it("sends the image part alongside it", async () => {
    const captured = captureRequest();
    await verifyImage(image, buildApplication(POPULATED, "wine"));
    expect(captured.body?.get("image")).toBeInstanceOf(File);
  });

  it("surfaces the server's error message rather than a generic one", async () => {
    vi.stubGlobal("fetch", async () =>
      new Response(JSON.stringify({ error: "Unsupported image type" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      }),
    );
    await expect(verifyImage(image, {})).rejects.toThrow("Unsupported image type");
  });
});

describe("validateApplication", () => {
  const COMPLETE: ApplicationFormValues = {
    brandName: "OLD TOM DISTILLERY",
    classType: "Kentucky Straight Bourbon Whiskey",
    alcoholContent: "45% Alc./Vol.",
    netContents: "750 mL",
  };

  it("accepts every required field plus a beverage type", () => {
    const check = validateApplication(COMPLETE, "distilled_spirits");
    expect(check.ok).toBe(true);
    expect(check.missingFields).toEqual([]);
  });

  /** The defect this guards: a model call spent to report six empty rows. */
  it("rejects a completely untouched form and flags it as empty", () => {
    const check = validateApplication({}, "");
    expect(check.ok).toBe(false);
    expect(check.empty).toBe(true);
    expect(check.missingFields).toHaveLength(4);
    expect(check.missingBeverageType).toBe(true);
  });

  it("rejects a partly filled form without calling it empty", () => {
    const check = validateApplication({ brandName: "ACME" }, "wine");
    expect(check.ok).toBe(false);
    expect(check.empty).toBe(false);
    expect(check.missingFields).toEqual(["classType", "alcoholContent", "netContents"]);
  });

  it("treats whitespace as blank", () => {
    const check = validateApplication({ ...COMPLETE, brandName: "   " }, "distilled_spirits");
    expect(check.ok).toBe(false);
    expect(check.missingFields).toEqual(["brandName"]);
  });

  it("does not require the optional bottler field", () => {
    expect(validateApplication(COMPLETE, "wine").ok).toBe(true);
    expect(validateApplication(COMPLETE, "wine").missingFields).not.toContain("bottlerName");
  });

  it("requires a beverage type, since it selects the ABV tolerance", () => {
    const check = validateApplication(COMPLETE, "");
    expect(check.ok).toBe(false);
    expect(check.missingBeverageType).toBe(true);
  });

  it("lists missing fields in display order, beverage type first", () => {
    const labels = describeMissing(validateApplication({}, ""));
    expect(labels[0]).toBe("Beverage type");
    expect(labels.slice(1)).toEqual([
      "Brand name",
      "Class or type",
      "Alcohol content",
      "Net contents",
    ]);
  });
});

describe("required-field metadata", () => {
  it("marks bottler optional and the rest required", () => {
    const required = APPLICATION_TEXT_FIELDS.filter((f) => f.required).map((f) => f.key);
    const optional = APPLICATION_TEXT_FIELDS.filter((f) => !f.required).map((f) => f.key);
    expect(required).toEqual(["brandName", "classType", "alcoholContent", "netContents"]);
    // Country of origin is optional because its absence is meaningful: it is
    // what declares a product domestic.
    expect(optional).toEqual(["bottlerName", "countryOfOrigin"]);
  });
});


describe("validateSubmission", () => {
  const COMPLETE_FORM: ApplicationFormValues = {
    brandName: "OLD TOM DISTILLERY",
    classType: "Kentucky Straight Bourbon Whiskey",
    alcoholContent: "45% Alc./Vol.",
    netContents: "750 mL",
  };

  it("accepts a complete form with an image", () => {
    expect(validateSubmission(COMPLETE_FORM, "distilled_spirits", true).ok).toBe(true);
  });

  /**
   * The image used to be gated by disabling the submit button, which announced
   * "unavailable" to a screen reader and explained nothing. It is a validation
   * failure like any other now.
   */
  it("rejects a complete form with no image, and says which is missing", () => {
    const check = validateSubmission(COMPLETE_FORM, "distilled_spirits", false);
    expect(check.ok).toBe(false);
    expect(check.missingImage).toBe(true);
    expect(check.missingFields).toEqual([]);
    expect(describeMissing(check)).toEqual(["Label artwork"]);
  });

  it("treats a form with nothing at all as empty", () => {
    const check = validateSubmission({}, "", false);
    expect(check.empty).toBe(true);
    expect(check.ok).toBe(false);
  });

  it("does not call a form empty when only the image is present", () => {
    expect(validateSubmission({}, "", true).empty).toBe(false);
  });

  it("lists every missing item in form order, artwork first", () => {
    expect(describeMissing(validateSubmission({}, "", false))).toEqual([
      "Label artwork",
      "Beverage type",
      "Brand name",
      "Class or type",
      "Alcohol content",
      "Net contents",
    ]);
  });

  it("never reports the optional bottler field as missing", () => {
    const check = validateSubmission({}, "", false);
    expect(describeMissing(check)).not.toContain("Bottler or producer");
    expect(check.missingFields).not.toContain("bottlerName");
  });
});

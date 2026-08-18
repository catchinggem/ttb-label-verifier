import { afterEach, describe, expect, it, vi } from "vitest";
import {
  APPLICATION_TEXT_FIELDS,
  buildApplication,
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

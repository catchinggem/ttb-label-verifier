import { describe, expect, it } from "vitest";
import { parseApplicationCsv, parseCsv, resultsToCsv, toCsv } from "./csv";

describe("parseCsv", () => {
  it("handles quoted fields containing commas", () => {
    const rows = parseCsv('a,"b,c",d');
    expect(rows[0]).toEqual(["a", "b,c", "d"]);
  });

  it("handles escaped quotes", () => {
    expect(parseCsv('"say ""hi""",x')[0]).toEqual(['say "hi"', "x"]);
  });

  it("handles newlines inside quoted fields", () => {
    const rows = parseCsv('a,"line one\nline two"\nb,c');
    expect(rows).toHaveLength(2);
    expect(rows[0][1]).toBe("line one\nline two");
  });

  it("normalizes CRLF from Excel", () => {
    expect(parseCsv("a,b\r\nc,d")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });

  it("drops blank rows", () => {
    expect(parseCsv("a,b\n\n\nc,d")).toHaveLength(2);
  });
});

describe("parseApplicationCsv", () => {
  const csv = [
    "image,beverage_type,brand_name,class_type,abv,net_contents,bottler",
    'old-tom.png,distilled_spirits,OLD TOM DISTILLERY,Kentucky Straight Bourbon Whiskey,45% Alc./Vol.,750 mL,"OLD TOM CO., LOUISVILLE, KY"',
  ].join("\n");

  it("maps every recognized column", () => {
    const { records } = parseApplicationCsv(csv);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      imageName: "old-tom.png",
      beverageType: "distilled_spirits",
      brandName: "OLD TOM DISTILLERY",
      netContents: "750 mL",
      bottlerName: "OLD TOM CO., LOUISVILLE, KY",
    });
  });

  it("accepts header aliases agents actually type", () => {
    const { records } = parseApplicationCsv("filename,brand,type\nx.png,ACME,wine");
    expect(records[0]).toMatchObject({
      imageName: "x.png",
      brandName: "ACME",
      beverageType: "wine",
    });
  });

  it("reports unknown columns instead of failing", () => {
    const { records, unknownColumns } = parseApplicationCsv("image,serial_number\nx.png,123");
    expect(unknownColumns).toEqual(["serial_number"]);
    expect(records).toHaveLength(1);
  });

  it("leaves absent fields undefined rather than empty strings", () => {
    const { records } = parseApplicationCsv("image,brand\nx.png,");
    expect(records[0].brandName).toBeUndefined();
  });

  it("skips rows with no image filename", () => {
    const { records } = parseApplicationCsv("image,brand\n,ACME\ny.png,OTHER");
    expect(records).toHaveLength(1);
    expect(records[0].imageName).toBe("y.png");
  });

  it("normalizes beverage type spellings", () => {
    const { records } = parseApplicationCsv("image,type\na.png,Malt Beverage\nb.png,beer");
    expect(records[0].beverageType).toBe("malt_beverage");
    expect(records[1].beverageType).toBe("malt_beverage");
  });
});

describe("toCsv", () => {
  it("quotes cells containing commas, quotes, or newlines", () => {
    expect(toCsv([["plain", "a,b", 'say "hi"', "two\nlines"]])).toBe(
      'plain,"a,b","say ""hi""","two\nlines"',
    );
  });
});

describe("resultsToCsv", () => {
  it("emits an error row for a failed image rather than dropping it", () => {
    const csv = resultsToCsv([{ imageName: "broken.png", result: null, error: "Upload failed" }]);
    expect(csv).toMatch(/broken\.png,error/);
    expect(csv).toMatch(/Upload failed/);
  });
});

import { normalizeWhitespace } from "@/lib/cfr";
import type { LabelObservation } from "@/lib/observation";
import type { ApplicationData, FieldId, FieldResult } from "@/lib/types";
import { checkAlcoholContent } from "./abv";

/**
 * Flattens case and punctuation. Used only to CLASSIFY a difference, never to
 * excuse one.
 */
function normalizeForComparison(text: string): string {
  return normalizeWhitespace(text)
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[.,'"()\-–—]/g, "");
}

/**
 * Compare one label field against its application counterpart.
 *
 * Three outcomes, and the middle one is the point:
 *
 *   exact match                  -> Pass
 *   differs only in case/punct.  -> Needs Review, with both strings quoted
 *   differs otherwise            -> Fail
 *
 * "STONE'S THROW" against "Stone's Throw" is very likely the same brand, but
 * whether that difference is immaterial is a compliance judgment, and this tool
 * does not get to make it on the agent's behalf. Surfacing it as Needs Review
 * keeps the decision with the human while still telling them, in one line,
 * exactly how small the difference is — so it costs a glance, not an
 * investigation.
 */
export function compareTextField(
  field: FieldId,
  title: string,
  observed: string | null,
  expected: string | undefined,
): FieldResult {
  const base = { field, title, observed, expected: expected ?? null };

  if (!expected) {
    return {
      ...base,
      verdict: "needs_review",
      reason: `The application does not specify a ${title.toLowerCase()}; nothing to compare against.`,
    };
  }

  if (observed === null) {
    return {
      ...base,
      verdict: "fail",
      reason: `The application specifies "${expected}", but no ${title.toLowerCase()} appears on the label.`,
    };
  }

  if (normalizeWhitespace(observed) === normalizeWhitespace(expected)) {
    return { ...base, verdict: "pass", reason: "Exact match with the application." };
  }

  if (normalizeForComparison(observed) === normalizeForComparison(expected)) {
    return {
      ...base,
      verdict: "needs_review",
      reason:
        `Label reads "${observed}" and the application "${expected}" — these differ ` +
        "only in capitalization or punctuation. Confirm they refer to the same thing.",
    };
  }

  return {
    ...base,
    verdict: "fail",
    reason: `Label reads "${observed}" but the application specifies "${expected}".`,
  };
}

/**
 * Country of origin, checked only when the application declares an import.
 *
 * 27 CFR requires the statement on imported labels; it does not apply to
 * domestic products. The application's own field is what declares which case
 * this is — an application that leaves it blank is asserting the product is
 * domestic, and no row is emitted at all. Emitting a "not applicable" row for
 * every domestic label would add a line of noise to the great majority of
 * reviews.
 *
 * The label is NOT consulted to decide whether something is an import. Reading
 * "Scotch Whisky" and inferring Scotland would be the tool making a
 * classification the applicant is responsible for declaring.
 */
export function checkCountryOfOrigin(
  observed: string | null,
  expected: string,
): FieldResult {
  const base = {
    field: "countryOfOrigin" as const,
    title: "Country of Origin",
    observed,
    expected,
  };

  if (observed === null) {
    return {
      ...base,
      verdict: "fail",
      reason:
        `The application declares this an import from "${expected}", but the label ` +
        "carries no country of origin statement. An imported label must state it.",
    };
  }

  return compareTextField("countryOfOrigin", "Country of Origin", observed, expected);
}

/** Every non-warning field check, in the order agents read them. */
export function checkApplicationFields(
  observation: LabelObservation,
  application: ApplicationData,
): FieldResult[] {
  return [
    compareTextField("brandName", "Brand Name", observation.brandName.text, application.brandName),
    compareTextField("classType", "Class / Type", observation.classType.text, application.classType),
    checkAlcoholContent(
      observation.alcoholContent.text,
      application.alcoholContent,
      application.beverageType,
    ),
    compareTextField("netContents", "Net Contents", observation.netContents.text, application.netContents),
    compareTextField("bottlerName", "Bottler / Producer", observation.bottlerName.text, application.bottlerName),
    // Only present for a declared import; domestic applications get no row.
    ...(application.countryOfOrigin
      ? [checkCountryOfOrigin(observation.countryOfOrigin.text, application.countryOfOrigin)]
      : []),
  ];
}

import type { ApplicationData, BeverageType } from "./types";

/**
 * The form-to-request boundary.
 *
 * This lives outside the component so the mapping from form state to the
 * `ApplicationData` that goes on the wire can be tested directly. A pure test
 * of the comparison layer cannot see this seam: both sides can be individually
 * correct while the object that crosses between them is empty or missing keys.
 */

/** Text fields the single-label form renders, in display order. */
export const APPLICATION_TEXT_FIELDS = [
  { key: "brandName", label: "Brand name", hint: 'For example, "OLD TOM DISTILLERY"' },
  { key: "classType", label: "Class or type", hint: 'For example, "Kentucky Straight Bourbon Whiskey"' },
  { key: "alcoholContent", label: "Alcohol content", hint: 'For example, "45% Alc./Vol. (90 Proof)"' },
  { key: "netContents", label: "Net contents", hint: 'For example, "750 mL"' },
  { key: "bottlerName", label: "Bottler or producer", hint: "Name and address as filed" },
] as const;

export type ApplicationTextField = (typeof APPLICATION_TEXT_FIELDS)[number]["key"];

/**
 * Compile-time guard against the form drifting behind the schema.
 *
 * `bottlerName` and `beverageType` were both added to `ApplicationData` after
 * this form was first written. Adding another field to `ApplicationData`
 * without adding it here makes `Unrendered` something other than `never`, which
 * makes this assignment a type error naming the missing field.
 *
 * `beverageType` is excluded because it is a select, not a text input, and is
 * handled separately in `buildApplication`.
 */
type Unrendered = Exclude<keyof ApplicationData, ApplicationTextField | "beverageType">;
const _everyApplicationFieldIsRendered: Unrendered extends never ? true : never = true;
void _everyApplicationFieldIsRendered;

export type ApplicationFormValues = Partial<Record<ApplicationTextField, string>>;

/**
 * Build the request payload from form state.
 *
 * Blank and whitespace-only entries are dropped rather than sent as empty
 * strings: "the applicant did not state a brand name" and "the applicant stated
 * a brand name of nothing" are different claims, and only the first is true of
 * an untouched field. Downstream, an absent field becomes Needs Review, which
 * is the honest outcome — there is deliberately no default filled in for a
 * field the agent left blank.
 */
export function buildApplication(
  values: ApplicationFormValues,
  beverageType: BeverageType | "",
): ApplicationData {
  const application: ApplicationData = {};

  for (const { key } of APPLICATION_TEXT_FIELDS) {
    const value = values[key]?.trim();
    if (value) application[key] = value;
  }

  if (beverageType) application.beverageType = beverageType;

  return application;
}

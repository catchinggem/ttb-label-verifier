import type { ApplicationData, BeverageType } from "./types";

/**
 * The form-to-request boundary.
 *
 * This lives outside the component so the mapping from form state to the
 * `ApplicationData` that goes on the wire can be tested directly. A pure test
 * of the comparison layer cannot see this seam: both sides can be individually
 * correct while the object that crosses between them is empty or missing keys.
 */

/**
 * Text fields the single-label form renders, in display order.
 *
 * `required` marks the fields without which a verification is not worth running.
 * The tool's whole job is comparing artwork against the application record, so
 * an application that states nothing gives it nothing to do — it would spend a
 * model call to report "not provided" on every row, which reads as a broken
 * tool rather than as a prompt to fill the form.
 *
 * Bottler is optional: 27 CFR requires it on the label, but COLA applications
 * do not consistently carry it as a separate field, and blocking submission on
 * it would train agents to type filler.
 */
export const APPLICATION_TEXT_FIELDS = [
  { key: "brandName", label: "Brand name", hint: 'For example, "OLD TOM DISTILLERY"', required: true },
  { key: "classType", label: "Class or type", hint: 'For example, "Kentucky Straight Bourbon Whiskey"', required: true },
  { key: "alcoholContent", label: "Alcohol content", hint: 'For example, "45% Alc./Vol. (90 Proof)"', required: true },
  { key: "netContents", label: "Net contents", hint: 'For example, "750 mL"', required: true },
  { key: "bottlerName", label: "Bottler or producer", hint: "Name and address as filed. Optional.", required: false },
  {
    key: "countryOfOrigin",
    label: "Country of origin",
    hint: "Imports only. Leave blank for a domestic product — filling it in is what tells the check this is an import.",
    required: false,
  },
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

export interface ApplicationValidation {
  /** True when the form is complete enough to be worth a model call. */
  ok: boolean;
  /** Required text fields left blank, in display order. */
  missingFields: ApplicationTextField[];
  /** True when no beverage type was selected. */
  missingBeverageType: boolean;
  /** True when nothing at all was entered — drives the fuller explanation. */
  empty: boolean;
}

/**
 * Check the form before spending a model call.
 *
 * Runs client-side only. The API deliberately still accepts a partial or empty
 * application — the batch path feeds it CSV rows that may legitimately omit
 * fields, and a missing field there is reported as Needs Review rather than
 * rejected. This is a guard against wasting an agent's time, not a security
 * boundary.
 */
export function validateApplication(
  values: ApplicationFormValues,
  beverageType: BeverageType | "",
): ApplicationValidation {
  const filled = (key: ApplicationTextField) => Boolean(values[key]?.trim());

  const missingFields = APPLICATION_TEXT_FIELDS.filter(
    (field) => field.required && !filled(field.key),
  ).map((field) => field.key);

  const missingBeverageType = beverageType === "";
  const empty =
    !beverageType && APPLICATION_TEXT_FIELDS.every((field) => !filled(field.key));

  return {
    ok: missingFields.length === 0 && !missingBeverageType,
    missingFields,
    missingBeverageType,
    empty,
  };
}

export interface SubmissionValidation extends ApplicationValidation {
  /** True when no label artwork is attached. */
  missingImage: boolean;
}

/**
 * Everything a submission needs, including the image.
 *
 * The image is validated here rather than by disabling the submit button. A
 * disabled button communicates only visually: a screen reader announces
 * "unavailable" and stops, giving no list of what is missing and no signal that
 * the control will ever work. It also makes the error summary and the per-field
 * aria-invalid wiring unreachable, since nothing can trigger them. An always
 * clickable button that explains what it needs is both more accessible and more
 * honest about the state of the form.
 */
export function validateSubmission(
  values: ApplicationFormValues,
  beverageType: BeverageType | "",
  hasImage: boolean,
): SubmissionValidation {
  const application = validateApplication(values, beverageType);
  return {
    ...application,
    missingImage: !hasImage,
    ok: application.ok && hasImage,
    empty: application.empty && !hasImage,
  };
}

/**
 * Field labels for an error summary, in the order they appear in the form so a
 * user reading the list can work straight down the page.
 */
export function describeMissing(
  validation: ApplicationValidation | SubmissionValidation,
): string[] {
  const labels = APPLICATION_TEXT_FIELDS.filter((field) =>
    validation.missingFields.includes(field.key),
  ).map((field) => field.label);

  const leading: string[] = [];
  if ("missingImage" in validation && validation.missingImage) leading.push("Label artwork");
  if (validation.missingBeverageType) leading.push("Beverage type");

  return [...leading, ...labels];
}

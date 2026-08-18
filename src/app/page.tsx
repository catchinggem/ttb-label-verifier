"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  Alert,
  AlertHeading,
  AlertText,
  Button,
  ErrorMessage,
  FileInput,
  FormGroup,
  Fieldset,
  Grid,
  GridContainer,
  Label,
  Select,
  TextInput,
  type FileInputRef,
} from "@trussworks/react-uswds";
import { ResultChecklist, ResultProvenance } from "@/components/ResultChecklist";
import { StatusTag } from "@/components/StatusTag";
import {
  APPLICATION_TEXT_FIELDS,
  buildApplication,
  describeMissing,
  validateSubmission,
  type ApplicationFormValues,
  type SubmissionValidation,
} from "@/lib/application";
import { verifyImage } from "@/lib/client";
import { parseApplicationCsv } from "@/lib/csv";
import { formatBytes } from "@/lib/image";
import type { BeverageType, VerificationResult } from "@/lib/types";

const SAMPLE_CSV = "/samples/sample-applications.csv";
const SAMPLE_DIR = "/samples";

const SUMMARY: Record<VerificationResult["verdict"], { heading: string; body: string }> = {
  pass: {
    heading: "Every field matches",
    body: "The label agrees with the application on all checked fields, and the government warning matches 27 CFR 16.21 verbatim.",
  },
  fail: {
    heading: "One or more fields do not match",
    body: "Review the rows marked Fail below. The notes column gives the specific difference to raise with the applicant.",
  },
  needs_review: {
    heading: "Needs your judgment",
    body: "Nothing failed outright, but one or more rows need a person to look. The notes column says what to confirm.",
  },
};

export default function SingleLabelPage() {
  const formId = useId();
  const resultsRef = useRef<HTMLDivElement>(null);
  const errorSummaryRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<FileInputRef>(null);

  const [file, setFile] = useState<File | null>(null);
  const [beverageType, setBeverageType] = useState<BeverageType | "">("");
  const [values, setValues] = useState<ApplicationFormValues>({});
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [sizeNote, setSizeNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sampleLoading, setSampleLoading] = useState(false);

  // Null until a submit is attempted, so the form does not scold anyone for
  // fields they have not reached yet.
  const [validation, setValidation] = useState<SubmissionValidation | null>(null);

  const showError = (key: (typeof APPLICATION_TEXT_FIELDS)[number]["key"]) =>
    validation?.missingFields.includes(key) ?? false;

  // Move focus after React has committed the element, not before. A
  // requestAnimationFrame scheduled from the submit handler runs while the
  // summary is still unmounted, so the focus call lands on nothing and the
  // keyboard user is left at the top of the page with no idea what happened.
  useEffect(() => {
    if (validation && !validation.ok) errorSummaryRef.current?.focus();
  }, [validation]);

  useEffect(() => {
    if (result) resultsRef.current?.focus();
  }, [result]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    // Only an in-flight request short-circuits, and the button text already
    // says so. Everything else is reported, never silently swallowed.
    if (busy) return;

    const check = validateSubmission(values, beverageType, file !== null);
    setValidation(check);

    if (!check.ok || !file) {
      // Stop before the network call. Focus the summary so a screen reader and
      // a sighted user both land on the explanation rather than on nothing.
      setResult(null);
      setError(null);
      return; // focus is moved by the effect below, once the summary is committed
    }

    setBusy(true);
    setError(null);
    setResult(null);
    setSizeNote(null);

    try {
      const { result: verification, image } = await verifyImage(
        file,
        buildApplication(values, beverageType),
      );
      setResult(verification);
      if (image.wasResized) {
        setSizeNote(
          `Image resized from ${formatBytes(image.originalBytes)} to ` +
            `${formatBytes(image.resizedBytes)} before upload.`,
        );
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Verification failed.");
    } finally {
      setBusy(false);
    }
  }

  /**
   * Fill the form from the sample record and attach its label image, so the
   * tool can be tried in one click rather than seven fields of typing.
   */
  async function loadSample() {
    setSampleLoading(true);
    setError(null);
    try {
      const csvText = await fetch(SAMPLE_CSV).then((r) => r.text());
      const { records } = parseApplicationCsv(csvText);
      const sample = records[0];
      if (!sample) throw new Error("The sample application file is empty.");

      // Follow the record rather than a hardcoded filename, so the sample and
      // its artwork cannot drift apart.
      const imageBlob = await fetch(`${SAMPLE_DIR}/${sample.imageName}`).then((r) => r.blob());

      setValues({
        brandName: sample.brandName ?? "",
        classType: sample.classType ?? "",
        alcoholContent: sample.alcoholContent ?? "",
        netContents: sample.netContents ?? "",
        bottlerName: sample.bottlerName ?? "",
      });
      setBeverageType(sample.beverageType ?? "");

      const sampleFile = new File([imageBlob], sample.imageName, { type: "image/png" });
      setFile(sampleFile);

      // Push it into the file input too, so its own preview matches state.
      const input = fileInputRef.current?.input;
      if (input) {
        const transfer = new DataTransfer();
        transfer.items.add(sampleFile);
        input.files = transfer.files;
      }

      setValidation(null);
      setResult(null);
    } catch {
      setError("Could not load the sample application. Check that samples/ was copied into public/.");
    } finally {
      setSampleLoading(false);
    }
  }

  return (
    <GridContainer className="padding-y-4">
      <h1>Verify a label</h1>
      <p className="usa-intro measure-4">
        Upload the label artwork and enter what the application says. Every field is
        compared and shown side by side.
      </p>

      <Grid row gap>
        <Grid tablet={{ col: 5 }}>
          <Button type="button" outline onClick={loadSample} disabled={sampleLoading || busy}>
            {sampleLoading ? "Loading sample…" : "Load a sample application"}
          </Button>
          <p className="usa-hint margin-top-1">
            Fills the form and attaches a sample label, so you can try the tool without
            typing.
          </p>

          <form onSubmit={handleSubmit} noValidate>
            {/* Error summary. tabIndex allows programmatic focus after a
                blocked submit; role="alert" announces it immediately. */}
            {validation && !validation.ok && (
              <div ref={errorSummaryRef} tabIndex={-1} role="alert">
                <Alert type="error">
                  <AlertHeading level="h3">
                    {validation.empty
                      ? "Add the label and application details first"
                      : "Some required details are missing"}
                  </AlertHeading>
                  <AlertText>
                    {validation.empty
                      ? "This tool compares the label artwork against the application " +
                        "record, so it needs both. Attach the artwork and fill in the " +
                        "required fields below, or load the sample application to try " +
                        "it out."
                      : `Fill in ${describeMissing(validation).join(", ")} before checking this label.`}
                  </AlertText>
                </Alert>
              </div>
            )}

            <Fieldset legend="Label image" legendStyle="large">
              <p className="usa-hint" id={`${formId}-file-hint`}>
                JPEG, PNG, WebP, or GIF. Large photos are resized automatically before
                upload.
              </p>
              <FormGroup error={validation?.missingImage}>
                <Label
                  htmlFor={`${formId}-file`}
                  requiredMarker
                  error={validation?.missingImage}
                >
                  Label artwork
                </Label>
                {validation?.missingImage && (
                  <ErrorMessage id={`${formId}-file-error`}>
                    Attach the label artwork to check.
                  </ErrorMessage>
                )}
                <FileInput
                  id={`${formId}-file`}
                  name="image"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  aria-describedby={
                    validation?.missingImage
                      ? `${formId}-file-hint ${formId}-file-error`
                      : `${formId}-file-hint`
                  }
                  aria-invalid={validation?.missingImage || undefined}
                  ref={fileInputRef}
                  onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                />
              </FormGroup>
            </Fieldset>

            <Fieldset legend="Application details" legendStyle="large">
              <p className="usa-hint">
                The label is checked against these values, so the required ones are
                needed before a check can run.
              </p>

              <FormGroup error={validation?.missingBeverageType}>
                <Label htmlFor={`${formId}-beverage`} requiredMarker error={validation?.missingBeverageType}>
                  Beverage type
                </Label>
                <span className="usa-hint" id={`${formId}-beverage-hint`}>
                  Selects which alcohol content tolerance applies.
                </span>
                {validation?.missingBeverageType && (
                  <ErrorMessage id={`${formId}-beverage-error`}>
                    Select the beverage type.
                  </ErrorMessage>
                )}
                <Select
                  id={`${formId}-beverage`}
                  name="beverageType"
                  validationStatus={validation?.missingBeverageType ? "error" : undefined}
                  aria-describedby={
                    validation?.missingBeverageType
                      ? `${formId}-beverage-hint ${formId}-beverage-error`
                      : `${formId}-beverage-hint`
                  }
                  aria-invalid={validation?.missingBeverageType || undefined}
                  value={beverageType}
                  onChange={(event) => setBeverageType(event.target.value as BeverageType | "")}
                >
                  <option value="">- Select -</option>
                  <option value="distilled_spirits">Distilled spirits</option>
                  <option value="wine">Wine</option>
                  <option value="malt_beverage">Malt beverage</option>
                </Select>
              </FormGroup>

              {APPLICATION_TEXT_FIELDS.map(({ key, label, hint, required }) => {
                const invalid = showError(key);
                return (
                  <FormGroup key={key} error={invalid}>
                    <Label htmlFor={`${formId}-${key}`} requiredMarker={required} error={invalid}>
                      {label}
                    </Label>
                    <span className="usa-hint" id={`${formId}-${key}-hint`}>
                      {hint}
                    </span>
                    {invalid && (
                      <ErrorMessage id={`${formId}-${key}-error`}>
                        Enter the {label.toLowerCase()} from the application.
                      </ErrorMessage>
                    )}
                    <TextInput
                      id={`${formId}-${key}`}
                      name={key}
                      type="text"
                      validationStatus={invalid ? "error" : undefined}
                      aria-describedby={
                        invalid
                          ? `${formId}-${key}-hint ${formId}-${key}-error`
                          : `${formId}-${key}-hint`
                      }
                      aria-invalid={invalid || undefined}
                      value={values[key] ?? ""}
                      onChange={(event) =>
                        setValues((previous) => ({ ...previous, [key]: event.target.value }))
                      }
                    />
                  </FormGroup>
                );
              })}
            </Fieldset>

            {/* Never disabled. A disabled control announces "unavailable" and
                explains nothing; this one always responds and says what is
                missing. `busy` is handled inside the handler. */}
            <Button type="submit" size="big">
              {busy ? "Checking label…" : "Check this label"}
            </Button>
          </form>
        </Grid>

        <Grid tablet={{ col: 7 }}>
          <div
            ref={resultsRef}
            tabIndex={-1}
            aria-live="polite"
            aria-busy={busy}
            className="results-region"
          >
            {busy && <p className="usa-intro">Checking the label…</p>}

            {error && (
              <Alert type="error">
                <AlertHeading level="h2">Could not check this label</AlertHeading>
                <AlertText>{error}</AlertText>
              </Alert>
            )}

            {result && (
              <>
                <div className="result-summary">
                  <StatusTag verdict={result.verdict} />
                  <h2 className="margin-top-1">{SUMMARY[result.verdict].heading}</h2>
                  <p>{SUMMARY[result.verdict].body}</p>
                </div>

                {result.imageQualityNote && (
                  <Alert type="warning" slim>
                    <AlertHeading level="h3">Image quality</AlertHeading>
                    <AlertText>{result.imageQualityNote}</AlertText>
                  </Alert>
                )}

                <ResultChecklist result={result} />
                <ResultProvenance result={result} />
                {sizeNote && <p className="usa-hint">{sizeNote}</p>}
              </>
            )}

            {!busy && !result && !error && (
              <p className="usa-hint">Results will appear here after you check a label.</p>
            )}
          </div>
        </Grid>
      </Grid>
    </GridContainer>
  );
}

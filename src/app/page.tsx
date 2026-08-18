"use client";

import { useId, useRef, useState } from "react";
import {
  Alert,
  AlertHeading,
  AlertText,
  Button,
  FileInput,
  Fieldset,
  Grid,
  GridContainer,
  Label,
  Select,
  TextInput,
} from "@trussworks/react-uswds";
import { ResultChecklist, ResultProvenance } from "@/components/ResultChecklist";
import { StatusTag } from "@/components/StatusTag";
import { verifyImage } from "@/lib/client";
import { formatBytes } from "@/lib/image";
import {
  APPLICATION_TEXT_FIELDS,
  buildApplication,
  type ApplicationFormValues,
} from "@/lib/application";
import type { BeverageType, VerificationResult } from "@/lib/types";

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

  const [file, setFile] = useState<File | null>(null);
  const [beverageType, setBeverageType] = useState<BeverageType | "">("");
  const [values, setValues] = useState<ApplicationFormValues>({});
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [sizeNote, setSizeNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!file || busy) return;

    setBusy(true);
    setError(null);
    setResult(null);
    setSizeNote(null);

    const application = buildApplication(values, beverageType);

    try {
      const { result: verification, image } = await verifyImage(file, application);
      setResult(verification);
      if (image.wasResized) {
        setSizeNote(
          `Image resized from ${formatBytes(image.originalBytes)} to ` +
            `${formatBytes(image.resizedBytes)} before upload.`,
        );
      }
      // Move focus to the results so a keyboard or screen reader user lands on
      // the answer rather than having to hunt down the page for it.
      requestAnimationFrame(() => resultsRef.current?.focus());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Verification failed.");
    } finally {
      setBusy(false);
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
          <form onSubmit={handleSubmit} aria-describedby={`${formId}-help`}>
            <Fieldset legend="Label image" legendStyle="large">
              <p id={`${formId}-help`} className="usa-hint">
                JPEG, PNG, WebP, or GIF. Large photos are resized automatically before
                upload.
              </p>
              <Label htmlFor={`${formId}-file`}>
                Label artwork <abbr title="required" className="usa-hint--required">*</abbr>
              </Label>
              <FileInput
                id={`${formId}-file`}
                name="image"
                accept="image/jpeg,image/png,image/webp,image/gif"
                required
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              />
            </Fieldset>

            <Fieldset legend="Application details" legendStyle="large">
              <Label htmlFor={`${formId}-beverage`}>Beverage type</Label>
              <span className="usa-hint" id={`${formId}-beverage-hint`}>
                Needed to select the alcohol content tolerance. Without it, that row is
                held for review.
              </span>
              <Select
                id={`${formId}-beverage`}
                name="beverageType"
                aria-describedby={`${formId}-beverage-hint`}
                value={beverageType}
                onChange={(event) => setBeverageType(event.target.value as BeverageType | "")}
              >
                <option value="">Not specified</option>
                <option value="distilled_spirits">Distilled spirits</option>
                <option value="wine">Wine</option>
                <option value="malt_beverage">Malt beverage</option>
              </Select>

              {APPLICATION_TEXT_FIELDS.map(({ key, label, hint }) => (
                <div key={key}>
                  <Label htmlFor={`${formId}-${key}`}>{label}</Label>
                  <span className="usa-hint" id={`${formId}-${key}-hint`}>
                    {hint}
                  </span>
                  <TextInput
                    id={`${formId}-${key}`}
                    name={key}
                    type="text"
                    aria-describedby={`${formId}-${key}-hint`}
                    value={values[key] ?? ""}
                    onChange={(event) =>
                      setValues((previous) => ({ ...previous, [key]: event.target.value }))
                    }
                  />
                </div>
              ))}
            </Fieldset>

            <Button type="submit" size="big" disabled={!file || busy}>
              {busy ? "Checking label…" : "Check this label"}
            </Button>
          </form>
        </Grid>

        <Grid tablet={{ col: 7 }}>
          {/* Announced politely so a screen reader hears the outcome without
              having the current reading interrupted. */}
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

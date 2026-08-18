import { Table } from "@trussworks/react-uswds";
import type { VerificationResult } from "@/lib/types";
import { StatusTag } from "./StatusTag";

/**
 * The per-field checklist. Deliberately shaped like the printed checklist
 * agents keep on their desks today — one row per field, read top to bottom —
 * so the tool slots into an existing habit instead of replacing it.
 *
 * A real <table> with scoped headers, not a grid of divs: screen readers
 * announce the column when reading a cell, which is what makes a 6-row
 * comparison navigable without sight.
 */
export function ResultChecklist({ result }: { result: VerificationResult }) {
  return (
    <Table bordered fullWidth scrollable caption="Field-by-field verification results">
      <thead>
        <tr>
          <th scope="col">Field</th>
          <th scope="col">Application says</th>
          <th scope="col">Label says</th>
          <th scope="col">Status</th>
          <th scope="col">Notes</th>
        </tr>
      </thead>
      <tbody>
        {result.fields.map((field) => (
          <tr key={field.field}>
            <th scope="row" className="checklist__field">
              {field.title}
            </th>
            {/* The inner div is what bounds the width. A max-width on the cell
                itself is only advisory under table-layout: auto, so the text
                would still stretch the column. Nothing is truncated — the full
                string wraps and stays readable. */}
            <td className="checklist__value">
              <div className="cell-text">
                {field.expected ?? (
                  <span className="checklist__empty">You did not provide this</span>
                )}
              </div>
            </td>
            <td className="checklist__value">
              <div className="cell-text">
                {field.observed ?? <span className="checklist__empty">Not found</span>}
              </div>
            </td>
            <td>
              {/* An absent application value is not a verification outcome. */}
              <StatusTag verdict={field.verdict} notProvided={field.expected === null} />
            </td>
            <td className="checklist__reason">
              <div className="cell-text">{field.reason}</div>
            </td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}

/** Provenance strip: which model produced this, how long it took, did it escalate. */
export function ResultProvenance({ result }: { result: VerificationResult }) {
  const seconds = (result.elapsedMs / 1000).toFixed(1);
  return (
    <dl className="provenance">
      <div className="provenance__item">
        <dt>Time</dt>
        <dd>{seconds} seconds</dd>
      </div>
      <div className="provenance__item">
        <dt>Model</dt>
        <dd>{result.model.replace(/^claude-/, "")}</dd>
      </div>
      <div className="provenance__item">
        <dt>Escalated</dt>
        <dd>
          {result.escalated
            ? `Yes — ${result.attempts.length} model calls`
            : "No — single model call"}
        </dd>
      </div>
    </dl>
  );
}

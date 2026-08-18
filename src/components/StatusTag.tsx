import type { Verdict } from "@/lib/types";

/**
 * Status is never carried by color alone (Section 508 / WCAG 1.4.1). Each
 * verdict pairs a shape-distinct glyph with its word, so the state survives
 * grayscale printing, color-blindness, and a screen reader reading the cell.
 */
const PRESENTATION: Record<Verdict, { label: string; glyph: string; className: string }> = {
  pass: { label: "Pass", glyph: "✓", className: "status-tag status-tag--pass" },
  fail: { label: "Fail", glyph: "✕", className: "status-tag status-tag--fail" },
  needs_review: {
    label: "Needs review",
    glyph: "!",
    className: "status-tag status-tag--review",
  },
};

/**
 * `notProvided` distinguishes "the agent gave us nothing to compare" from a
 * verification outcome. Both are Needs Review underneath, but reading
 * "Needs review" against a field nobody filled in makes the tool look like it
 * examined something and hesitated, when in fact it never had an input.
 */
export function StatusTag({
  verdict,
  notProvided = false,
}: {
  verdict: Verdict;
  notProvided?: boolean;
}) {
  const { label, glyph, className } = notProvided
    ? { label: "Not provided", glyph: "–", className: "status-tag status-tag--absent" }
    : PRESENTATION[verdict];
  return (
    <span className={className}>
      {/* The glyph is decorative — the adjacent word is the accessible name. */}
      <span aria-hidden="true" className="status-tag__glyph">
        {glyph}
      </span>
      {label}
    </span>
  );
}

export function verdictLabel(verdict: Verdict): string {
  return PRESENTATION[verdict].label;
}

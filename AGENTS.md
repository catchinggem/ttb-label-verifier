<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Project notes

## The vision model observes; TypeScript decides

`src/lib/observation.ts` defines what the model reports — text, casing, weight,
relative size. None of it is a verdict. Every pass/fail is computed in
`src/lib/checks/`, which is pure and synchronous and testable with a hand-written
observation object. Keep it that way: a compliance decision that can only be
reproduced by calling a model is not auditable.

## Field docs must use `.describe()`, never comments

Only `.describe()` text is compiled into the JSON schema the model receives. A
`/** ... */` comment is invisible to it.

This has already caused one production-grade bug. Every field in
`observation.ts` was documented in comments alone, so the schema the model saw
had no descriptions at all. Working from the system prompt — which said to
report the prefix's rendering "separately from its text" — the model excluded
`GOVERNMENT WARNING:` from the transcription and began at clause (1). That
diverges from the canonical text at character 0 and failed *every compliant
label*, reproducibly. Put human-facing rationale in comments; put anything the
model must obey in `.describe()`.

## The model returns confident booleans, not null, for typography

`prefixIsAllCaps` and `prefixAppearsBold` are documented to return `null` when
the rendering is too small or blurred to judge. In practice the model does not
use that escape hatch — it returns a confident `false` instead. Measured against
a fixture whose prefix is unambiguously bold:

  - warning at 11px: bold read correctly 2 of 3 runs
  - warning at 25px: bold read correctly 3 of 3 runs

So weight detection degrades on small type, and the model does not signal that
it is unsure. This is why `checkGovernmentWarning` caps both typographic
assertions at Needs Review and lets only the verbatim text assertion produce
Fail. Do not raise typography to Fail on the assumption that a `false` is
reliable — it is not, and a false Fail is a rejection letter to a compliant
applicant.

The same imprecision drove `relativeFontSize` from a point threshold to a band
(`FONT_SIZE_REVIEW_BELOW` / `FONT_SIZE_PASS_ABOVE`): three runs against one
fixture returned 0.55, 0.65, 0.65, which flapped across a single 0.6 boundary.

## Escalation

`extractLabelObservation` runs Haiku first and escalates one image to Sonnet on
a null required field, low confidence, or a warning-text assertion failure. The
confidence gate alone is blind to confidently wrong answers, which is why the
warning has its own trigger. If the two models transcribe the warning
differently, the result is Needs Review carrying both readings — never a silent
preference for either.

## CFR text is fetched, not remembered

`spec/` holds text retrieved from the eCFR public API, with source URLs.
`npm run check:cfr` fails if `GOVERNMENT_WARNING` drifts from the spec file.
Note that the brief's citations for ABV tolerance (5.37, 7.71) are stale —
T.D. TTB-176 renumbered them to 5.65 and 7.65.

# Engineering log

Findings from building the label verifier, in the order they surfaced. Each
entry records what was observed, what actually caused it, how it was diagnosed,
what changed, and what it would have cost if it had reached production.

Entries include mistakes made during development, not only defects found in the
model or the tooling. Several of the most useful findings came from being wrong.

Measurements come from two fixtures in `fixtures/`: `old-tom-label.png`, whose
government warning is set at 11px against ~26px body copy, and
`old-tom-label-normal-warning.png`, identical except the warning is 25px. Both
have a genuinely bold, genuinely all-caps `GOVERNMENT WARNING:` prefix and
warning text that is byte-identical to 27 CFR 16.21. Harnesses:
`npm run measure` (latency) and `npm run compare:fixtures` (typography A/B).

---

## 1. Zod schema shipped without `.describe()`, so field documentation never reached the model

**Observed.** Every run failed the government warning on a verbatim-text
mismatch, against a fixture whose warning text is correct. 5 of 5 runs in the
first latency measurement, then 6 of 6 across both fixtures in the A/B — 100%
reproducible, not intermittent.

**Root cause.** Field documentation in `src/lib/observation.ts` existed only as
TypeScript comments. Only `.describe()` text is compiled into the JSON schema
sent to the model; a `/** … */` comment is invisible to it. The schema the model
actually received had **no field descriptions at all**, so it worked from the
system prompt alone — and that prompt said to report the prefix's rendering
"separately from its text". The model read that as *exclude the prefix from the
text field* and began its transcription at clause (1).

That reading is defensible. The instruction was ambiguous, and nothing else told
the model otherwise.

**Diagnosis.** Two steps, both cheap:

1. Extracted the warning text from the fixture HTML source and compared it to
   `GOVERNMENT_WARNING` after whitespace normalization. Both 283 characters,
   byte-identical. That eliminated the fixture as the cause and established that
   any mismatch had to originate in extraction.
2. Dumped the model's raw transcription. It began `(1) According to the Surgeon
   General…`. The divergence index was 0 — the first character — which points at
   a structural difference, not a transcription error. A misread word would have
   diverged somewhere in the middle.

**Changed.** Moved all field documentation into `.describe()`, stating that the
transcription must start with `GOVERNMENT WARNING:` and run through both
clauses. Rewrote the ambiguous prompt sentence. Text divergence disappeared:
6 of 6 runs clean. Commit `63432ec`.

**Cost if missed.** The government warning is the one check whose false positive
is a rejection letter. This defect failed it on *every compliant label*, at
100% reproducibility, while every other field passed — so the failure looked
like a real compliance problem rather than a bug. At 150,000 applications a
year, an agent's rational response to a checker that rejects everything is to
stop using it, which is precisely how the previous scanning-vendor pilot died.

**Generalization.** Documentation that lives only in comments is invisible to
the model. Anything the model must obey belongs in `.describe()`. Recorded in
`AGENTS.md`.

---

## 2. Bold detection degrades on small type; casing does not

**Observed.** Against fixtures whose prefix is unambiguously bold:

| Warning size | `prefixAppearsBold` correct | `prefixIsAllCaps` correct |
|---|---|---|
| 11px | 3 of 6 runs | 6 of 6 |
| 25px | 6 of 6 runs | 6 of 6 |

(Six runs per size: three before the `.describe()` fix and three after. At 11px
the pre-fix runs were correct 1 of 3 and the post-fix runs 2 of 3; the prompt
change did not clearly help.)

Casing was correct 12 of 12 across both sizes and both prompt versions. It is
specifically *weight* that degrades, and it degrades exactly where the check
matters — a compliant large warning is easy, an evasive small one is the case
worth catching.

**Root cause.** Not fully established. The correlation with type size is clear
and reproducible; the mechanism is not. Stroke-weight discrimination plausibly
depends on having enough pixels per stroke, but that is inference, not evidence.

**Diagnosis.** Rendered a second fixture identical to the first except for one
CSS declaration (`font-size: 11px` → `25px`) and ran both through extraction
repeatedly, printing the raw observations side by side with the ground truth
stated. Holding everything else constant is what made the size dependence
legible rather than looking like random noise.

**Changed.** `prefixIsAllCaps` and `prefixAppearsBold` can no longer produce
Fail under any combination — they cap at Needs Review, with a reason telling the
agent to confirm weight and casing by eye. Only the verbatim text assertion and
a missing warning can Fail. Commit `fb247aa`; evidence recorded in `AGENTS.md`
in `2c5117e`.

The reasoning is asymmetric error cost, not model quality. A false Fail sends a
rejection to a compliant applicant over a property the model reads unreliably. A
false Needs Review costs an agent a two-second glance at artwork already on
screen. Those costs differ by orders of magnitude, so the assertions get the
confidence they have earned rather than equal weight.

Worth noting: Jenny's title-case case is unaffected. A label reading
`Government Warning:` diverges from the canonical text at character 1, so the
*text* assertion catches it — the reliable one. Capping typography did not open
a hole there. Test: `catches a title-case prefix through the text check`.

**Cost if missed.** Typographic misreads at Fail severity would have produced
rejections at roughly a 50% rate on small-type warnings — including on labels
that are fully compliant.

**Open.** The model does not use the documented `null` escape hatch for "too
small to judge". It returns a confident `false` instead. The prompt asks for
`null` explicitly and it has not changed the behaviour.

---

## 3. The escalation gate is blind to confident wrong answers

**Observed.** In the first latency measurement, 0 of 5 runs escalated to the
stronger model while the warning verdict was wrong on all 5. Confidence values
observed on the same fixture in the paired A/B run ranged 0.88 to 0.98.

**Root cause.** The gate escalated on a null required field or a confidence
below 0.7. Both are proxies for *the model knowing it is unsure*. A model that
is confidently wrong satisfies neither and passes straight through. Self-reported
confidence cannot detect a systematic misunderstanding of the task, which is
exactly what finding 1 was.

**Diagnosis.** Fell out of reading the measurement output: a 100% failure rate
alongside a 0% escalation rate is only possible if the gate cannot see the
failure.

**Changed.** Added a third trigger: a failing warning-text assertion escalates
regardless of confidence. Deliberately not extended to other fields — their
false positives cost a glance, which does not justify doubling the model calls.
Compliant labels never trigger it, so the cost falls only on labels already
bound for review. If the two models transcribe the warning differently, the
result is Needs Review quoting both readings rather than a silent preference for
either. Commit `2c5117e`.

**Cost if missed.** The escalation tier existed and would have been described as
a safety net while catching none of the failures it was there for.

**Generalization.** A confidence threshold is a floor on self-doubt, not on
correctness. Where a specific wrong answer is detectable by a deterministic
check, trigger on the check.

---

## 4. Two CFR citations in the project brief no longer exist

**Observed.** The brief cited 27 CFR 5.37 (distilled spirits) and 7.71 (malt
beverages) for ABV tolerances. Neither section exists in the current CFR.

**Root cause.** T.D. TTB-176 (87 FR 7579 for part 5, 87 FR 7605 for part 7,
Feb. 9, 2022) reorganized parts 5 and 7 and moved alcohol content to **5.65**
and **7.65**. Part 4 (wine) was not reorganized, so 4.36 is still current.

**Diagnosis.** Fetching the sections from the eCFR API rather than writing the
tolerances from memory. The section-number lookup returned nothing, and
enumerating the section headings in each part showed where alcohol content had
moved.

**Changed.** Saved the retrieved text to `spec/cfr-abv-tolerances.txt` with
source URLs, and built the tolerance table from that file. Two rules surfaced
that a remembered version would likely have missed: the wine tolerance brackets
on whether the wine is above or below 14% ABV (1.0 vs 1.5 points), and 7.65(c)
imposes a hard 0.5% floor that overrides the tolerance entirely. Commit
`6bb34ba`.

**Cost if missed.** Tolerance values written from memory, against citations that
do not resolve, in a compliance tool. Wrong tolerances produce both false
rejections and false approvals, and the error would be invisible to anyone
checking the code against the stale citation.

---

## 5. `relativeFontSize` is not accurate enough to drive a verdict

This entry supersedes an earlier, weaker version of itself. Both the original
finding and its correction are recorded, because the correction is the more
useful result.

**Originally observed.** Three readings of the same fixture returned 0.55, 0.65,
0.65. A point threshold at 0.6 sat inside that spread, so identical input
flapped between Pass and Needs Review. Replaced the threshold with a band —
below 0.5 Needs Review, above 0.7 Pass, between them Needs Review noting the
estimate is imprecise — rather than tuning the constant, on the reasoning that a
±0.05 estimate cannot support a point boundary. Commit `2c5117e`.

**Correction.** The "±0.05" characterization was wrong. It came from a single
run of three. Pooling every observation of the same 11px fixture across all runs
gives a materially worse picture:

| Fixture | True ratio | n | Observed range | Spread | Mean error |
|---|---|---|---|---|---|
| 11px warning | 0.42 | 7 | 0.50 – 0.85 | 0.35 | **+0.25** |
| 25px warning | 0.96 | 5 | 0.95 – 1.10 | 0.15 | +0.06 |

True ratios are computed from the fixture CSS: the warning is 11px (or 25px)
against a 26px median for the other text on the label.

The model is accurate near a ratio of 1.0 and systematically over-estimates when
the warning is small — every one of the seven low-ratio readings came in high,
by +0.25 on average. **Two of the seven exceeded 0.7 and would therefore Pass a
warning whose true ratio is 0.42.** The signal is least reliable in exactly the
range it exists to detect.

**Diagnosis.** Computing the fixture's true ratio from its own CSS and comparing
it against the pooled observations, rather than reasoning about the spread of
one run in isolation.

**Status: open.** The band is a better shape than the point threshold and stays
for now, but it does not reliably catch an undersized warning — roughly a 29%
false-negative rate on the one undersized fixture available. Options not yet
evaluated: measuring type height in pixels client-side rather than asking the
model for a ratio; requiring several consistent observations; or dropping the
signal from the verdict and surfacing it as advisory context only. It should not
be described as a working legibility check until this is resolved.

**Cost if missed.** Undersized warnings are a known evasion. A check that misses
roughly one in three of them, while appearing in the UI as a legibility
assessment, is worse than no check at all — it converts an unexamined risk into
one someone believes has been examined.

---

## 6. Process: a diagnosis was requested for measurement output the agent had never seen

**Observed.** A request arrived to diagnose a text mismatch and a bold misread,
framed as two model errors, based on `npm run measure` output produced in the
user's terminal. That output had not been shared, and no extraction had ever run
in the agent's environment — no API key was present.

**What happened.** The agent declined to diagnose without the evidence and said
so, but overstated the case: it wrote that "no extraction has ever run", which
was true only of its own environment. The user had real data; the agent could
not see it. The framing of the refusal was wrong even though refusing was right.

**Why it mattered anyway.** Declining to work from a described symptom forced
the one diagnostic step that could be taken without the model — comparing the
fixture text against the canonical constant — which established the fixture was
byte-identical and pointed straight at extraction. That is what surfaced finding
1. Had the agent instead accepted the "model misread the text" framing and gone
looking for a transcription problem, the actual defect was in its own schema
definition and would not have been found there.

The user's framing was half right: bold *was* a model limitation (finding 2).
The text half was not a model error at all.

**Generalization.** A described symptom is not evidence, and the difference
matters most when the described cause is plausible. But "I have not seen it" is
not the same as "it did not happen" — scope the claim to what you actually know.

---

## 7. USWDS has no React 19 conflict; its asset weight is the real cost

**Observed.** `@trussworks/react-uswds` v12 declares `react: ^16 || ^17 || ^18
|| ^19`. It installed against React 19.2.8 with no peer conflict and no
`--legacy-peer-deps`.

**Root cause of the actual difficulty.** Not the React version. The prebuilt
`uswds.min.css` is 512KB, and the assets it references are ~5.2MB of fonts and
~9.9MB of images. Vendoring that into a prototype is disproportionate.

**Changed.** Tree-shook the Sass to the 26 packages the app renders and set all
typeface tokens to system stacks, which removes the `@font-face` rules and the
font files entirely. The compiled stylesheet references 25 icons; the copy
script ships the two icon directories containing them plus the 16 loose
file-type SVGs (280 files, 1.2MB) rather than a hand-maintained list of 25, so
forwarding another component does not silently break an icon.
`scripts/copy-uswds-assets.mjs` runs from `predev` and `prebuild`, so a fresh
clone never renders an alert with a missing icon. Commit `01bdc7d`.

Two API differences from expectation, both found by the compiler rather than at
runtime: `Button` takes `size="big"` rather than a `big` boolean, and `Alert`
composes `AlertHeading` / `AlertText` rather than taking `heading` and
`headingLevel` props.

**Cost if missed.** Either ~15MB of vendored binary assets in the repository, or
an abandoned design system and hand-rolled components that look federal without
being accessible in the ways USWDS already is.

---

## 8. Layout silently unstyled: component packages do not include the grid

**Observed.** Both pages rendered as a single flush-left column with no gutters
and no columns. The two-column layout on the single-label screen did not appear
at any viewport width.

**Root cause.** The Sass tree-shake forwarded component packages
(`usa-button`, `usa-alert`, and so on) but not `usa-layout-grid`, which is what
emits the `grid-container`, `grid-row`, and `grid-col-*` classes that
`GridContainer` and `Grid` render. The components were styled; the layout
holding them was not.

**Diagnosis.** Only visible by loading the page in a browser. TypeScript, ESLint,
the test suite, and the production build were all clean throughout — the classes
were present in the markup and simply had no rules attached. Located by reading
the upstream `uswds/_index.scss` to see everything the full bundle forwards, and
diffing that against the forward list.

**Changed.** Forwarded `usa-layout-grid` and `usa-skipnav`, plus
`uswds-global`, `uswds-typography`, `uswds-helpers`, `uswds-utilities`, and
`uswds-form-controls`. Commit `01bdc7d`.

**Cost if missed.** An unusable interface shipped behind a green build.

**Generalization.** A green build says the code compiles, not that the page
works. Tree-shaking a design system means the missing pieces fail silently, and
nothing but rendering it will say so.

---

## 9. Results table clipped its widest column

**Observed.** The Notes column of the results checklist — which carries the
reason strings an agent needs in order to tell an applicant what to fix — was
cut off at the right edge of the viewport.

**Root cause.** A wide table in a constrained container with no overflow
handling.

**Diagnosis.** Browser screenshot. Not detectable from markup or tests.

**Changed.** Used USWDS's `scrollable` table container, which renders a
keyboard-focusable scroll region. Commit `01bdc7d`.

The accessible detail matters more than the visual one: a scroll region reachable
only by mouse or trackpad fails WCAG 2.1.1 (Keyboard), because a keyboard user
cannot reach the clipped content at all. Adding `overflow-x: auto` alone would
have fixed the appearance and left the barrier in place.

**Cost if missed.** The most information-dense column of the primary screen
unreadable for keyboard-only users, in a tool procured under Section 508.

---

## 10. `setState` called synchronously inside an effect

**Observed.** ESLint error on the batch page: "Calling setState synchronously
within an effect can trigger cascading renders."

**Root cause.** Restoring persisted batch progress on mount by reading
`localStorage` in a `useEffect` and calling `setState` with the result. The
straightforward version of "read browser storage after mount", and it causes an
extra render pass on every mount.

**Changed.** Replaced the effect with `useSyncExternalStore`, which is the API
for exactly this. Commit `01bdc7d`. Three benefits beyond silencing the rule:

- No cascading render.
- No hydration mismatch. The server snapshot returns `null`, so the first client
  render matches the server's before the store swaps in. The lazy-initializer
  alternative would have rendered restored rows on the client against an empty
  server render.
- Cross-tab sync for free, via the `storage` event. A second tab finishing a run
  now refreshes the first.

The effect that *writes* progress was kept, since writing to an external system
is what effects are for.

**Cost if missed.** Minor on its own. Recorded because the reflex to suppress
the rule would have cost the hydration fix and the cross-tab behaviour, both of
which came from taking the rule seriously rather than working around it.

---

## 11. A Federal Register citation was fabricated from memory

**Observed.** `spec/cfr-abv-tolerances.txt` and `src/lib/checks/abv.ts` cited
T.D. TTB-176 as "87 FR 232, Jan 2022". The correct citations, from the eCFR's
own source notes, are **87 FR 7579** (part 5) and **87 FR 7605** (part 7),
**Feb. 9, 2022**.

**Root cause.** The section *numbers* were verified against the live CFR; the
rulemaking citation attached to them was written from memory and never checked.
It appeared in the same commit whose message noted the value of fetching rather
than trusting recall.

**Diagnosis.** Grepping the already-downloaded part 5 and part 7 XML for the
source notes, prompted by a user-supplied citation that disagreed with the one
in the file.

**Changed.** Corrected in both files, with the per-part page numbers given
separately since the two parts have different source-note pages within the same
rulemaking.

**Cost if missed.** A compliance document carrying a citation that does not
resolve, next to values that are correct — which is worse than a wholly wrong
document, because the surrounding accuracy invites trust in the part that is
wrong.

**Generalization.** "Fetch, don't remember" has to cover the citations *about*
the fetched text, not only the text. Verified and unverified content sitting in
the same paragraph is indistinguishable to a reader.

---

## 12. A reported client-side defect that did not reproduce — and the guard added anyway

**Reported.** A captured multipart body showed `name="application"` with the
literal value `{}`, with `expected: null` on every field in the response. Read
as: form values never reach the FormData, the bug is entirely in
`src/app/page.tsx`.

**What was found.** The serialization is correct. Driving the real form with
real keystrokes and intercepting `window.fetch` to read the outgoing body:

```json
{"brandName":"OLD TOM DISTILLERY","classType":"Kentucky Straight Bourbon Whiskey",
 "alcoholContent":"45% Alc./Vol. (90 Proof)","netContents":"750 mL",
 "bottlerName":"OLD TOM DISTILLING CO. LOUISVILLE, KENTUCKY",
 "beverageType":"distilled_spirits"}
```

All six keys, correct values, matching `ApplicationData` exactly. Then the same
capture on a form where no text field was touched:

```json
{}
```

`{}` is sent **if and only if the form is empty**, which is correct: an
untouched field means the application states nothing, and downstream that
becomes Needs Review per field with "the application does not specify…". Every
`expected: null` in that response was accurate. It looks identical to a
serialization bug from the response alone, which is why the report was
reasonable.

**A false reproduction, nearly recorded as real.** The first attempt appeared to
confirm the bug: clicking the brand-name field and typing left it empty, and
because the input is controlled, an empty value looks like proof that `onChange`
never fired. Checking `document.activeElement` showed `BODY` — the automated
click had landed inside the input's bounding box, with the input as the hit
target and nothing overlaying it, but never focused it. The keystrokes went
nowhere. Focusing the field first and typing again kept the text, proving
`onChange` fires and state updates.

Had that first result been reported, it would have been a fabricated
confirmation of someone else's hypothesis, using a real-looking measurement.
The check that caught it cost one line.

**Changed anyway, and why.** No defect, but the boundary was genuinely untested
and the drift risk in the report is real — `bottlerName` and `beverageType`
were both added to `ApplicationData` after the form was written, and nothing
would have caught a third field being added and not rendered.

- Extracted the form-to-request mapping out of the component into
  `buildApplication` in `src/lib/application.ts`, so the seam is testable.
- Added a compile-time guard: a field added to `ApplicationData` and not
  rendered by the form makes `Unrendered` non-`never` and fails the build
  naming the missing key. Verified by temporarily adding a `countryOfOrigin`
  field, which produced `TS2322: Type 'true' is not assignable to type 'never'`.
- Added `src/lib/application.test.ts`: given populated form state, the FormData
  `application` part must parse to an object with every expected key present and
  non-empty. Plus a test pinning `{}` for an untouched form, so nobody later
  "fixes" it by inventing defaults.

No fallback was added. A blank field must stay blank.

**Pattern.** This project's real defects cluster at boundaries between layers
that are each individually valid:

| Finding | Boundary | Both sides valid? |
|---|---|---|
| 1 | TypeScript comments → JSON schema sent to the model | Yes — comments compiled, schema was well-formed |
| 8 | Component styles → layout grid styles | Yes — components styled, markup correct |
| 9 | Table markup → viewport width | Yes — table valid, container valid |

None of these were reachable by a unit test of a pure function, and all three
survived a green build: TypeScript, ESLint, the full test suite, and the
production build were clean while each was live. Findings 8 and 9 were only
found by rendering the page; finding 1 only by dumping what the model actually
received. Pure-function tests verify the inside of a layer and say nothing about
what crosses between them — which is exactly where this codebase breaks.

**Cost if this one had been "fixed" as reported.** Adding a fallback that filled
defaults into an empty application would have made the tool silently compare
labels against invented values and report Pass. That is a false approval on a
compliance check — strictly worse than the false rejection in finding 1, because
nothing downstream would surface it.

---

## 13. Nothing in the interface said the application fields were required

**Observed.** A first-time user uploaded label artwork, pressed "Check this
label" without filling anything else, waited ~3.7 seconds for a model call, and
got six rows of "not provided". Nothing marked the fields required, nothing
prevented the submission, and the result was indistinguishable from the tool
being broken.

**Root cause.** The developer knew the fields were required and the interface
never said so. Every field rendered identically whether it was needed or
optional; submission was gated only on the image being attached; and the empty
result rendered through the same checklist as a real verification, so "we had
nothing to compare" looked like "we compared and hesitated".

This is not a code defect. `buildApplication` correctly produced `{}` from an
untouched form, and the checks layer correctly reported that nothing was
specified. Every layer did what it was written to do. The defect is that the
interface never communicated a precondition the developer held in their head.

**Diagnosis.** Using the app as a first-time user would, rather than testing it.
No automated check can reach this: the build was green, the typecheck clean,
ESLint clean, and 86 tests passing at the moment it was found — and every one of
those tests would still pass with the defect in place, because the code was
behaving as specified. There is no assertion to write for "a new agent will
conclude this is broken".

**Changed.** Commit `[COMMIT]`.

1. **Required fields marked**, using the USWDS required-field pattern —
   `requiredMarker` on `Label`, rendering the `abbr[title=required]` marker.
   Beverage type, brand name, class or type, alcohol content, and net contents
   are required; bottler is explicitly optional and labelled as such, because
   COLA applications do not consistently carry it and blocking on it would
   train agents to type filler.
2. **Validation before the fetch.** `validateApplication` runs client-side on
   submit; if required fields are blank the API is never called. Verified: a
   submit with only an image now makes **0 API calls**. The error state renders
   the full USWDS pattern — 5 `usa-form-group--error`, 5 `usa-label--error`,
   5 inputs with `aria-invalid` and `usa-input--error`, each `aria-describedby`
   its own `usa-error-message` — plus a `role="alert"` summary that receives
   focus. An empty form gets the fuller explanation (the tool compares against
   the application record, so it needs to know what the application says); a
   partly filled one gets a list of what is missing.
3. **The empty state reads as an input gap, not an outcome.** Where the
   application supplied nothing, the value column reads "You did not provide
   this" and the status is a distinct, quieter "Not provided" tag rather than
   "Needs review". The underlying verdict is unchanged; only the presentation
   distinguishes "we had no input" from "we looked and were unsure".
4. **"Load a sample application"** fills the form from
   `samples/sample-applications.csv` and attaches its label image in one click,
   so the tool can be tried without typing seven fields. This matters most for
   a reviewer opening the deployed app cold. The sample assets are copied into
   `public/` at `predev`/`prebuild` rather than committed twice.

The API deliberately still accepts a partial application: the batch path feeds
it CSV rows that may legitimately omit fields, where a missing value is reported
as Needs Review rather than rejected. The validation is a guard against wasting
an agent's time, not a security boundary.

**A second defect found while fixing the first.** Focus never reached the error
summary. `requestAnimationFrame` scheduled from the submit handler ran before
React committed the conditionally-rendered alert, so `focus()` landed on an
element that did not exist yet and `document.activeElement` stayed `BODY`. A
keyboard or screen reader user would have been left at the top of the page with
no indication that anything had happened — the failure mode the summary exists
to prevent. Moved to a `useEffect` keyed on the validation state, which runs
after commit. The same bug was present in the results focus and is fixed there
too.

**Cost if missed.** Sarah's team has watched a modernization tool fail before:
the scanning vendor's pilot died because agents could do five labels by eye in
the time it took the machine to do one. A tool whose first impression is a
3.7-second wait for six rows of "not provided" does not get a second try, and
the reason would never appear in a bug report — it would appear as agents
quietly not using it. For Dave, who has "seen a lot of these modernization
projects come and go", this is the exact confirmation he is expecting.

**Generalization.** A green build and a passing suite certify that the code does
what it was written to do. They cannot tell you that what it was written to do
is unusable, because the specification and the tests share the developer's
assumptions. This class of defect is only reachable by using the product as
someone who has never seen it — which needs to be a deliberate step, not a
by-product of testing.

---

## 14. A reason string kept quoting an error figure the log had already disproved

**Observed.** The Needs Review reason for a warning in the uncertain size band
told agents the estimate "carries about ±0.05 of error". Finding 5 had already
measured +0.25 mean error with a 0.35 spread and recorded the ±0.05 figure as
wrong.

**Root cause.** Finding 5's correction updated the log and the commit message
but not the user-facing string, the module comment, or the test comment that
carried the same number. The measurement was corrected in the place that
documents decisions and left stale in the places that state it to a user.

**Changed.** Corrected in `src/lib/checks/warning.ts` (module doc and the reason
string an agent reads), and in `src/lib/checks/warning.test.ts`. The reason now
says the estimate ran high by about 0.25 with a 0.35 spread. Added an assertion
that the reason does not contain "0.05", so the stale figure cannot come back
silently. The module doc now also states plainly that the band does not reliably
catch undersized warnings and points at the open finding.

**Cost if missed.** An agent deciding whether to measure the type themselves,
told the estimate is five times more precise than it is. Wrong numbers stated
confidently to the person doing the compliance work is the failure mode this
whole tool exists to reduce.

**Generalization.** A correction is not complete when the log is updated. Grep
for the disproved figure across the codebase — comments, tests, and any string a
user reads — and pin it with an assertion so it cannot silently return.

---

## Latency, for reference

Both runs are five sequential requests against a 74KB synthetic PNG on a warm
server, from `npm run measure`.

| Run | p50 | min / max | Escalations |
|---|---|---|---|
| Before the `.describe()` fix | 3772ms | 3587ms / 12378ms | 0 of 5 |
| After | 3722ms | 3615ms / 3989ms | 0 of 5 |

The 12378ms outlier is Turbopack cold-compiling the route on first request, not
model latency. Both clear the 5s budget.

**This number should not be quoted as the product's latency.** It reflects a
small synthetic image with no escalation. Real submissions are 2–5MB
photographs, sometimes at an angle or with glare — slower to upload, more likely
to escalate, and an escalated request is two sequential model calls. Client-side
downscaling to a 1568px long edge is in place to reduce the upload cost, but no
real photograph has been measured end to end. That measurement should happen
before the 5s figure is promised to anyone.

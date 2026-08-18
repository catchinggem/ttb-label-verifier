# TTB Label Verification

Compares alcohol beverage label artwork against the COLA application record that
accompanies it, field by field, and checks the government health warning against
27 CFR 16.21. A vision model extracts what the label says; deterministic
TypeScript decides whether it complies. Results come back as a checklist with
one row per field — application value, label value, status, and the specific
reason — shaped like the printed checklist agents use today.

**Deployed:** https://ttb-label-verifier-theta.vercel.app

Prototype for evaluation. Not connected to COLA.

---

## Quick start

```bash
git clone <repo> && cd ttb-label-verifier
npm install
cp .env.example .env.local     # add your ANTHROPIC_API_KEY
npm run dev
```

Open http://localhost:3000 and press **Load a sample application** — it fills
every field and attaches a label, so the tool can be tried without typing.

No other setup is needed. `predev` and `prebuild` copy the USWDS icons and the
sample labels into `public/` automatically; those directories are generated, not
committed. Verified against a fresh clone: `npm install`, then `npm test` passes
116 tests with no API key and no generated assets, and `npm run build` produces
them (280 icon SVGs, 13 sample files).

| Command | What it does |
|---|---|
| `npm run dev` | Dev server on :3000 |
| `npm test` | 116 unit tests over the checks and the client boundaries |
| `npm run build` | Production build |
| `npm run check:cfr` | Fails if the warning constant drifts from `spec/cfr-16-21-warning.txt` |
| `npm run measure` | Latency harness against a running server |
| `npm run compare:fixtures` | Typography A/B across two fixtures |

`node scripts/generate-fixtures.mjs` regenerates the twelve sample labels from
one template; `scripts/generate-photo-fixture.mjs` builds the photographic one.

---

## Architecture

**The vision model extracts only what the label says. Every pass/fail decision
is deterministic TypeScript.** The model returns structured observations —
text, casing, stroke weight, relative type size (`src/lib/observation.ts`) — and
never a verdict. Adjudication happens in pure, synchronous functions in
`src/lib/checks/`.

Three reasons:

- **Testable without API calls.** Every compliance decision is reachable from a
  hand-written observation object. The check suite runs in under a second with
  no key and no network.
- **Auditable.** A reviewer can read the rule that produced a rejection. A
  decision reproducible only by calling a model is not auditable in a
  regulatory context.
- **Explainable to an applicant.** "Your warning diverges from 27 CFR 16.21 at
  character 58: expected 'women should not drink', found 'expectant mothers
  should avoid'" is a rule an applicant can act on. "The model judged it
  non-compliant" is not.

**Provider interface.** Extraction sits behind one function,
`extractLabelObservation` in `src/lib/extract.ts`, which is the only place the
Anthropic SDK is referenced. Swapping to Azure-hosted inference — the realistic
production path given the firewall constraints described in the discovery notes
— means reimplementing that one function; nothing in the checks, the routes, or
the UI changes.

**Country of origin: the application declares the import, never the label.** The
check runs only when the application supplies a country. Reading "Single Malt
Scotch Whisky" off the artwork and inferring Scotland would make the tool
perform a classification the applicant is responsible for declaring — inference
there becomes classification, and classification is not the tool's to do. An
application that leaves the field blank is asserting the product is domestic,
and no row is emitted.

---

## Scope

**In:** single-label verification; batch verification from a CSV of application
records plus label images; brand name, class/type, alcohol content with CFR
tolerances, net contents, bottler, country of origin for declared imports, and
the 27 CFR 16.21 warning; CSV export of results.

**Out, deliberately:**

- **No COLA integration.** Per the discovery notes this is a standalone
  proof-of-concept; COLA integration carries its own authorization requirements
  and is years away.
- **No authentication.** Nothing here is user-scoped, and adding auth to a
  prototype would imply a security posture it has not been reviewed for.
- **No persistence.** Nothing is stored server-side. Batch progress is kept in
  the browser's localStorage so a refresh does not lose a 300-label run;
  images are never persisted.
- **No PII handling.** Label artwork and application fields are business data.
  The prototype was built so that nothing sensitive is retained, which is why
  the absence of storage is a feature rather than an omission.

---

## Measured results

### Verdict matrix

Twelve fixtures, each varying exactly one thing from a compliant control, run
through the deployed app: **12/12 matched their expected verdict**, and the
mechanisms matched too — the title-case prefix diverges at character 1, the
reworded clause at character 58, and the malt beverage fails on the 27 CFR
7.65(c) floor rather than on tolerance.

Coverage includes a compliant control, a title-case warning prefix, reworded
warning text, a missing warning, ABV outside and inside tolerance, missing net
contents, a brand-name case variant, a malt beverage below the 0.5% floor, a
declared import with and without a country statement, and a 2.8 MB photograph.
Per-fixture detail and the country-of-origin branch table: **[samples/README.md](samples/README.md)**.

### Latency

Production, deployed app, 2.8 MB photograph with perspective skew and glare,
driven through the real UI:

| Case | p50 | Within 5s? |
|---|--:|---|
| Clean label, warm function | **4500ms** | yes, ~500ms spare |
| First label of the morning (cold start) | **~5300ms** | no |
| Label that escalates to the second model | **~9900ms** | no |

**The 5-second threshold holds for the common case and does not hold for the
other two.** Cold-start overhead is ~1189ms server-side, paid by whoever opens
the tool first each day. Escalation is two sequential model calls.

Component breakdown at p50: model 3917ms, client resize 403ms, network 219ms.
The model call dominates. Loopback measurements (4302ms p50) sit within ~200ms
of production for that reason — the model does not care where it is invoked
from — so the local figures are context, not the headline.

### Per-field model reliability

**Text extraction is solid.** Across the fixture set the model transcribed brand
names, class designations, alcohol statements, net contents, and warning text
accurately enough that every text-based check landed on its expected verdict.

**Typography is unreliable below a rendering-size threshold.** Against fixtures
whose `GOVERNMENT WARNING:` prefix is unambiguously bold:

| Warning size | Bold read correctly | All-caps read correctly |
|---|---|---|
| 11px | 3 of 6 runs | 6 of 6 |
| 25px | 6 of 6 runs | 6 of 6 |

Weight degrades on small type; casing does not. **This is why the casing and
boldness assertions cap at Needs Review and only verbatim text can Fail.** A
false Fail is a rejection letter to a compliant applicant; a false Needs Review
costs an agent a two-second glance.

---

## Key decisions and trade-offs

**Client-side batch orchestration, not a durable queue.** The batch page runs
eight verifications at a time from the browser against the same per-image route
the single-label page uses. A queue would survive a closed laptop; this does
not. It also needs no infrastructure, no server state, and no new failure modes,
and one bad image fails alone rather than stalling a run. For a prototype whose
stated scope excludes persistence, the trade favours the simpler thing —
progress is checkpointed to localStorage so a refresh is survivable even though
a closed tab is not.

**USWDS tree-shaken.** The prebuilt bundle is 512 KB of CSS plus ~15 MB of fonts
and images. Forwarding only the 26 packages actually rendered and setting the
typeface tokens to system stacks removes the font files entirely; only the icons
the compiled stylesheet references ship (~1.2 MB), copied from `node_modules` at
`predev`/`prebuild`. The federal design system without the federal payload.

**Two-tier model cascade.** Haiku 4.5 by default; a single image escalates to
Sonnet 5 on any of three triggers: a required field read as null, any field
confidence below 0.7, or the warning-text assertion failing. The third exists
because the first two are proxies for the model knowing it is unsure, and a
confidently wrong answer satisfies neither — measured directly, a run with a
100% wrong warning verdict escalated 0 times at confidences of 0.88–0.98. The
warning gets its own trigger because it is the one field whose false positive is
a rejection. If the two models disagree on the warning text, both readings are
shown and neither is preferred.

**Three result states, and the tool never auto-rejects.** Pass, Fail, Needs
Review. Fail means a rule was violated in a way the model reads reliably;
everything uncertain routes to a person with a reason naming what to confirm.
The tool produces a recommendation and the agent decides. Nothing is
auto-rejected and nothing is auto-approved.

---

## Known limitations

**The escalated path runs at roughly twice the budget.** ~9.9s p50, 3 of 3 runs
over, worst observed 21.5s. This is not tunable — it is two sequential model
calls by design. *Next step:* make escalation asynchronous. Return the first
model's result immediately and revise the row when the second answers, so a
label bound for review does not block the agent. That is a real design change
and was not undertaken to make a number look better.

**`maxDuration` is deliberately unset.** The 21.5s escalated run completed, so
Vercel's default ceiling is above that. Pinning or raising a timeout to
accommodate a latency finding would hide the finding. It should be set
explicitly — as a stated ceiling, decided on its own merits — not as a response
to this measurement.

**ABV tolerance compares the label against the application, not against the
product.** 27 CFR 4.36, 5.65(c), and 7.65(c) govern the spread between a
product's *actual* alcohol content and its *labeled* content. This tool uses the
applicant's declared figure as a stand-in for actual. That is the right check
for catching transcription errors between form and artwork; it is not laboratory
verification and does not establish compliance with those sections on its own.

**`relativeFontSize` is not accurate enough to drive a verdict.** Pooled over 7
runs against a fixture whose true ratio is 0.42, the model returned 0.50–0.85 —
a +0.25 mean over-estimate with a 0.35 spread. Two of those seven exceeded the
band's upper edge and would pass a warning that is genuinely undersized: a
false-negative rate of about 29% on the one undersized fixture available. The
0.5/0.7 band is a better shape than the point threshold it replaced, but this
should not be described as a working legibility check. *Next step:* measure type
height client-side in pixels rather than asking the model for a ratio.

**The escalation gate cannot see a confident wrong answer.** Two of its three
triggers are proxies for self-doubt. The warning-text trigger covers the field
that matters most, but any other field that is confidently misread passes
straight through. A confidence threshold is a floor on self-doubt, not on
correctness.

**The model does not use the documented `null` escape hatch** for typography it
cannot judge — it returns a confident `false` instead. This is the direct reason
those assertions are capped rather than trusted.

---

## Accessibility

Section 508 / WCAG 2.1 AA.

- **Status is never carried by colour alone.** Every verdict pairs a
  shape-distinct glyph with its word, so it survives grayscale printing,
  colour-blindness, and a screen reader reading the cell.
- **Contrast, computed rather than asserted.** Status tags run **6.28:1 to
  8.41:1** against the 4.5:1 AA floor (pass 6.91, fail 7.45, needs review 6.28,
  not provided 8.41); body text 17.22:1, muted text 6.74:1, links 6.72:1.
- **Real tables** with scoped row and column headers, so a screen reader
  announces the column when reading a cell.
- **Wide tables scroll in a keyboard-focusable container.** A scroll region
  reachable only by mouse fails WCAG 2.1.1 — the clipped column is unreachable.
- **The submit button is never disabled.** A disabled control announces
  "unavailable" and explains nothing; validation runs on click, names every
  missing field, and moves focus to a `role="alert"` summary. Verified: an empty
  submit makes **0 API calls** and lands `document.activeElement` on the
  summary.
- Skip link, visible focus never removed, 44px targets, body type set larger
  than the default for a team that skews over 50.

Verification was by DOM assertion and computed contrast. **Physical keyboard
traversal was confirmed by hand**, because the automated browser pane could not
dispatch key events — `Tab` left `activeElement` on `BODY` and a `keydown`
listener recorded zero events for a sent `Return`, so the automated checks used
`form.requestSubmit()` and a static tab-order check instead.

---

## Engineering log

**[docs/findings.md](docs/findings.md)** records sixteen findings from building
this. Each entry states what was observed, what the root cause turned out to be,
how it was diagnosed, what changed, and what the defect would have cost in
production if it had shipped.

It includes the cases where the framing was wrong as well as the defects — a
reported client-side bug that did not reproduce, a "model misread" that turned
out to be a schema defect, and a precision claim of the author's own that a
later measurement disproved. Findings that remain open are labelled open rather
than closed.

---

## How this was built

The implementation was done with Claude Code, directed and reviewed by me.

The working method was to constrain the model to a stated architecture —
extraction only, with all adjudication in deterministic TypeScript — to fetch
every regulatory citation from the eCFR rather than accept a recalled one, and
to verify every claim about behaviour by measurement rather than by the agent's
report. Three findings show why each of those mattered.

**A Zod schema shipped without `.describe()`.** Field documentation existed as
TypeScript comments, so the JSON schema the model actually received had no field
descriptions at all. Working from the system prompt alone, the model excluded
`GOVERNMENT WARNING:` from its transcription and began at clause (1) —
diverging from the canonical text at character 0, on 100% of runs. It would have
failed every compliant label. It was found by demanding a character-level diff
instead of accepting "the model misread it": the diff showed a structural
difference at position zero, not a transcription error, which pointed at the
schema rather than the model.

**A fabricated Federal Register citation.** The agent wrote T.D. TTB-176 as
"87 FR 232, Jan 2022" from memory — in the same commit whose message praised
fetching over recalling. Checked against the eCFR source notes, the correct
citations are 87 FR 7579 for part 5 and 87 FR 7605 for part 7, Feb. 9, 2022.
Verified text with an unverified citation attached is worse than no document,
because the surrounding accuracy invites trust in the part that is wrong.

**A photograph that missed the latency budget.** Measured end to end through the
UI, a real 2.8 MB photograph came in at 5.7s against a 5-second threshold. It
was reported as a miss rather than tuned away. The fix, when it came, changed
how the image decodes — `createImageBitmap` resizing on decode, driven by
dimensions read from the JPEG header, in a worker — taking the resize step from
1147ms to 127ms. The threshold was never touched.

**The pattern worth taking from all of it:** three separate defects shipped past
a fully green build — an unstyled layout grid, a table column unreachable by
keyboard, and focus that never landed on the error summary. TypeScript, ESLint,
the full test suite, and the production build were clean while each was live.
All three sat at boundaries between layers where each side was individually
correct: components styled but the grid that positions them unstyled; valid
table, valid container, no overflow handling between them; a focus call
scheduled before React had committed the element it targeted. Unit tests of pure
functions verify the inside of a layer and say nothing about what crosses
between them, which is systematically where this codebase broke.

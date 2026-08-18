# TTB Label Verification

Compares alcohol beverage label artwork against its COLA application record and
against the government health warning required by 27 CFR 16.21.

**Deployed:** https://ttb-label-verifier-theta.vercel.app

Prototype for evaluation. Not connected to COLA.

---

## Running it

```bash
npm install
cp .env.example .env.local     # add your ANTHROPIC_API_KEY
npm run dev
```

Open http://localhost:3000. Press **Load a sample application** to fill the form
and attach a label in one click — no typing required to see it work.

| Command | What it does |
|---|---|
| `npm run dev` | Dev server. `predev` copies USWDS icons and sample assets into `public/`. |
| `npm run build` | Production build. `prebuild` does the same copy. |
| `npm test` | 116 unit tests over the deterministic checks and the client boundaries. |
| `npm run check:cfr` | Fails if the warning constant drifts from `spec/cfr-16-21-warning.txt`. |
| `npm run measure` | Latency harness against a running server. |
| `npm run compare:fixtures` | Typography A/B across two fixtures. |

`node scripts/generate-fixtures.mjs` regenerates the twelve sample labels from
one template; `scripts/generate-photo-fixture.mjs` builds the photographic one.

---

## Approach

**The vision model observes; TypeScript decides.** The model reports what is
rendered — text, casing, stroke weight, relative type size — as structured data
(`src/lib/observation.ts`). Every pass/fail is then computed by pure,
synchronous functions in `src/lib/checks/`, testable with a hand-written
observation and no model in the loop. A compliance decision that can only be
reproduced by calling a model is not auditable.

**The government warning is three independent assertions, weighted unequally.**
Verbatim text match can Fail. Prefix casing and boldness cap at Needs Review,
because the model reads type weight unreliably on small type (3 of 6 correct at
11px, 6 of 6 at 25px) and a false Fail is a rejection letter to a compliant
applicant. Text mismatches report the first divergence with both sides quoted,
so an agent can tell an applicant what to change.

**Two-tier model cascade.** Haiku 4.5 by default; a single image escalates to
Sonnet 5 when a required field reads null, confidence drops below 0.7, or the
warning-text assertion fails. That last trigger exists because a confidence
threshold cannot detect a confidently wrong answer. If the two models disagree
on the warning, both readings are shown and neither is preferred.

**CFR text is fetched, not remembered.** `spec/` holds text retrieved from the
eCFR API with source URLs. The brief's ABV citations (5.37, 7.71) no longer
exist — T.D. TTB-176 moved them to 5.65 and 7.65.

`docs/findings.md` is the engineering log: what broke, the root cause, how it
was diagnosed, and what each defect would have cost in production.

---

## Performance

Measured against the deployed app with a 2.80 MB photograph
(`samples/11-photograph.jpg` — perspective skew, glare, sensor grain), driven
through the real UI with client-side resizing active.

| Case | p50 | Within 5s? |
|---|--:|---|
| **Clean label, warm function** | **4500ms** | yes, ~500ms spare |
| First label of the morning (cold start) | ~5300ms | **no** |
| Label that escalates to the second model | ~9900ms | **no** |

Cold-start overhead is ~1189ms server-side. Agents arriving each morning pay it
on their first label.

Escalation is two sequential model calls and lands at roughly twice the
threshold. That is a deliberate trade: the second opinion exists for the one
field whose false positive is a rejection letter. Labels bound for review take
longer than labels that pass. Making it asynchronous — return the first result,
revise when the second arrives — is the obvious fix and has not been done.

Component breakdown at p50: model 3917ms, client resize 403ms, network 219ms.
The model call dominates. Earlier loopback figures (4302ms p50) are within
~200ms of production, because the model call does not care where it is invoked
from.

No `maxDuration` is set; the escalated 21.5s worst case completed without
hitting Vercel's default limit. Worth pinning explicitly so the ceiling is
stated rather than inherited.

---

## Known gaps

- **`relativeFontSize` is not reliable enough to drive a verdict.** Pooled over
  7 runs against a fixture whose true ratio is 0.42, the model returned
  0.50–0.85 — a +0.25 mean over-estimate. The 0.5/0.7 band is a better shape
  than a point threshold but still misses roughly a third of undersized
  warnings. Do not describe this as a working legibility check.
- **The model does not use the `null` escape hatch** for typography it cannot
  judge; it returns a confident `false`. This is why those assertions cap at
  Needs Review.
- **ABV tolerance compares the label against the application**, using the
  applicant's declared figure as a stand-in for actual content. That catches
  form/artwork transcription errors; it is not laboratory verification.
- **No batch-level persistence of images.** A restored batch run recovers
  outcomes but needs its image files re-attached.
- Sample coverage is missing an illegible photograph and wine at both sides of
  the 14% ABV bracket in 4.36(b)(1).

---

## Accessibility

Section 508 / WCAG 2.1 AA. Status is never carried by colour alone — every
verdict pairs a shape-distinct glyph with its word. Status tag contrast runs
6.28:1 to 8.41:1 against the 4.5:1 AA floor. Real tables with scoped headers,
keyboard-focusable scroll regions, a skip link, visible focus, 44px targets, and
body type set larger than default for a team that skews over 50. The submit
button is never disabled: a disabled control announces "unavailable" and
explains nothing, so validation runs on click and names what is missing.

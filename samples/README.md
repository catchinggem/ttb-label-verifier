# Sample data

Test label images and `sample-applications.csv` go here.

## What belongs in this directory

- **Label images** — one file per label, named exactly as the CSV references
  them. JPEG, PNG, WebP, or GIF. Photographs taken at an angle, under poor
  lighting, or with glare on the bottle are *valuable* here: they are what
  agents actually receive, and they exercise the image-quality path that holds
  a doubtful read for review instead of passing it.
- **`sample-applications.csv`** — the application records that accompany those
  images, one row per label.

## CSV format

The only required column is the image filename. Everything else is optional,
and a missing value produces Needs Review rather than a silent pass.

```csv
image,beverage_type,brand_name,class_type,abv,net_contents,bottler
old-tom-label.png,distilled_spirits,OLD TOM DISTILLERY,Kentucky Straight Bourbon Whiskey,45% Alc./Vol. (90 Proof),750 mL,"OLD TOM DISTILLING CO., LOUISVILLE, KENTUCKY"
```

Recognized column aliases, so a spreadsheet exported from anywhere has a
reasonable chance of loading: `image` / `filename` / `file`; `beverage_type` /
`type`; `brand_name` / `brand`; `class_type` / `class`; `abv` /
`alcohol_content`; `net_contents`; `bottler` / `bottler_name`. Unrecognized
columns are ignored and reported in the UI rather than failing the upload.

`beverage_type` accepts `distilled_spirits`, `wine`, or `malt_beverage` (plus
`spirits`, `beer`, and spaced spellings). It selects the alcohol content
tolerance bracket — see `spec/cfr-abv-tolerances.txt`. Without it, the alcohol
content row is held for review rather than compared against a guessed bracket.

## Coverage worth building out

The two fixtures in `fixtures/` are clean synthetic renders and are used by the
latency and typography harnesses. This directory is for the harder cases:

- a label whose warning is genuinely non-verbatim (paraphrased, or missing
  clause 2) — should Fail
- a warning in title case rather than all caps — should Fail on the text check
- a warning set in very small type — should hold for review
- a brand name differing from the application only in capitalization — should
  hold for review, not pass
- an ABV inside the tolerance for its beverage type, and one outside it
- a photograph with glare or an oblique angle — should surface an image-quality
  note

AI image generation works well for these; so does photographing a real bottle.

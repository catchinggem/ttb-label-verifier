/**
 * Render a label as a photograph rather than as artwork.
 *
 * The synthetic fixtures are flat, evenly lit, and 74KB — nothing like what an
 * agent receives. This composites the label onto a surface with perspective
 * skew, a specular glare gradient, and a soft vignette, renders it large, and
 * encodes it as a multi-megabyte JPEG. That is the input the 5-second budget
 * actually has to survive.
 */
import { execFile } from "node:child_process";
import { writeFile, rm, stat } from "node:fs/promises";
import { promisify } from "node:util";

const run = promisify(execFile);
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const SOURCE = "samples/01-compliant-control.png";
const OUT = "samples/11-photograph.jpg";
const TMP = ".photo-fixture";
const W = 3400;
const H = 4500;

const html = `<!doctype html>
<meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { width: ${W}px; height: ${H}px; overflow: hidden;
         background: radial-gradient(ellipse at 30% 20%, #6b6257 0%, #2e2a25 70%, #1a1714 100%); }
  .scene { width: 100%; height: 100%; display: flex; align-items: center;
           justify-content: center; perspective: 2600px; position: relative; }
  /* Off-axis capture: the agent held the bottle, not a copy stand. */
  .label { width: 1750px; transform: rotateY(-15deg) rotateX(7deg) rotate(-2.2deg);
           box-shadow: 0 60px 120px rgba(0,0,0,.65); position: relative; }
  .label img { width: 100%; display: block; }
  /* Specular highlight raking across the upper left, as off curved glass. */
  .glare { position: absolute; inset: 0;
           background: linear-gradient(112deg,
             rgba(255,255,255,.72) 0%, rgba(255,255,255,.34) 13%,
             rgba(255,255,255,.05) 27%, rgba(255,255,255,0) 42%,
             rgba(255,255,255,0) 74%, rgba(255,255,255,.14) 88%,
             rgba(255,255,255,.30) 100%);
           mix-blend-mode: screen; pointer-events: none; }
  /* Falloff toward the frame edges. */
  .vignette { position: absolute; inset: 0;
              background: radial-gradient(ellipse at 42% 40%,
                rgba(0,0,0,0) 45%, rgba(0,0,0,.42) 100%); pointer-events: none; }
  /* Sensor grain. Also the reason a real photo does not compress to 500KB:
     high-frequency noise is what makes phone captures multi-megabyte. */
  .grain { position: absolute; inset: 0; opacity: .38; pointer-events: none;
           mix-blend-mode: overlay;
           background-image: url("data:image/svg+xml;utf8,\
<svg xmlns='http://www.w3.org/2000/svg' width='600' height='600'>\
<filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/>\
<feColorMatrix type='saturate' values='0'/></filter>\
<rect width='600' height='600' filter='url(%23n)'/></svg>");
           background-size: 600px 600px; }
</style>
<div class="scene">
  <div class="label">
    <img src="${process.cwd()}/${SOURCE}">
    <div class="glare"></div>
  </div>
  <div class="vignette"></div>
  <div class="grain"></div>
</div>`;

await run("mkdir", ["-p", TMP]);
await writeFile(`${TMP}/photo.html`, html, "utf8");

await run(CHROME, [
  "--headless", "--disable-gpu", "--allow-file-access-from-files",
  `--screenshot=${TMP}/photo.png`, `--window-size=${W},${H}`, "--hide-scrollbars",
  `file://${process.cwd()}/${TMP}/photo.html`,
]).catch((e) => { if (!e.stdout && !e.stderr) throw e; });

// Encode to JPEG, stepping quality down until it lands in the 2-3MB band.
let chosen = null;
for (const quality of [95, 92, 90, 88, 85, 80, 75, 70, 65, 60, 55]) {
  await run("sips", ["-s", "format", "jpeg", "-s", "formatOptions", String(quality),
                     `${TMP}/photo.png`, "--out", OUT]);
  const { size } = await stat(OUT);
  chosen = { quality, size };
  if (size <= 3 * 1024 * 1024) break;
}

await rm(TMP, { recursive: true, force: true });
console.log(
  `generate-photo-fixture — ${OUT} at ${W}x${H}, quality ${chosen.quality}, ` +
  `${(chosen.size / 1024 / 1024).toFixed(2)} MB`,
);

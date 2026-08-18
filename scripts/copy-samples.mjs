/**
 * Publish the sample application record and its label images so the
 * "Load a sample application" button and the batch page can fetch them.
 *
 * They are copied rather than committed under public/ so there is one copy of
 * each in the repository, in samples/ next to its README.
 */
import { copyFile, mkdir, readdir } from "node:fs/promises";

const SOURCE = "samples";
const TARGET = "public/samples";

await mkdir(TARGET, { recursive: true });
await copyFile(`${SOURCE}/sample-applications.csv`, `${TARGET}/sample-applications.csv`);

const entries = await readdir(SOURCE, { withFileTypes: true });
const images = entries.filter((e) => e.isFile() && /\.(png|jpe?g|webp|gif)$/i.test(e.name));
for (const image of images) {
  await copyFile(`${SOURCE}/${image.name}`, `${TARGET}/${image.name}`);
}

console.log(`copy-samples — 1 CSV + ${images.length} label images -> ${TARGET}`);

/**
 * Publish the sample application record and its label image so the
 * "Load a sample application" button can fetch them.
 *
 * They are copied rather than committed under public/ so there is exactly one
 * copy of each in the repository: the CSV lives in samples/ next to its README,
 * and the image in fixtures/ where the latency and typography harnesses use it.
 */
import { copyFile, mkdir } from "node:fs/promises";

const TARGET = "public/samples";

await mkdir(TARGET, { recursive: true });
await copyFile("samples/sample-applications.csv", `${TARGET}/sample-applications.csv`);
await copyFile("fixtures/old-tom-label.png", `${TARGET}/old-tom-label.png`);

console.log(`copy-samples — sample application + label image -> ${TARGET}`);

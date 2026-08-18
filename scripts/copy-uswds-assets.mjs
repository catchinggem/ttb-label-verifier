/**
 * Copy the USWDS icons the stylesheet references into public/uswds/img.
 *
 * The full dist/img directory is ~10MB (photographs and illustrations we never
 * use). The icon sets plus the loose file-type SVGs are ~1.2MB and cover every
 * `url()` the tree-shaken stylesheet emits — Alert, FileInput, Select, and the
 * table sort controls all resolve their icons from here.
 *
 * Runs from `predev` and `prebuild`, so a fresh clone never renders an alert
 * with a missing icon. Re-run manually after forwarding a new USWDS component.
 */
import { cp, mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";

const SOURCE = "node_modules/@uswds/uswds/dist/img";
const TARGET = "public/uswds/img";

const DIRECTORIES = ["usa-icons", "usa-icons-bg"];

await mkdir(TARGET, { recursive: true });

for (const directory of DIRECTORIES) {
  await cp(join(SOURCE, directory), join(TARGET, directory), { recursive: true });
}

// Loose SVGs at the img root: file.svg, loader.svg, correct8.svg, and friends.
const entries = await readdir(SOURCE, { withFileTypes: true });
const loose = entries.filter((e) => e.isFile() && e.name.endsWith(".svg"));
for (const entry of loose) {
  await cp(join(SOURCE, entry.name), join(TARGET, entry.name));
}

console.log(
  `copy-uswds-assets — ${DIRECTORIES.length} icon sets + ${loose.length} loose SVGs -> ${TARGET}`,
);

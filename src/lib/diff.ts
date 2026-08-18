/**
 * Character-level divergence reporting for verbatim text checks.
 *
 * "Does not match verbatim" is useless to an agent who has to tell an applicant
 * what to change. These helpers turn a failed comparison into a specific
 * instruction: this word, at this point in the sentence, should read that.
 */

export interface Divergence {
  /** 0-based index of the first differing character in the normalized strings. */
  index: number;
  /** The canonical text from `index`, with leading context. */
  expected: string;
  /** The observed text from `index`, with the same leading context. */
  found: string;
  /** True when one string is a prefix of the other (truncated or padded). */
  truncated: boolean;
}

const CONTEXT_BEFORE = 30;
const CONTEXT_AFTER = 30;

function window(text: string, index: number): string {
  const start = Math.max(0, index - CONTEXT_BEFORE);
  const end = Math.min(text.length, index + CONTEXT_AFTER);
  return `${start > 0 ? "…" : ""}${text.slice(start, end)}${end < text.length ? "…" : ""}`;
}

/**
 * First point at which `found` departs from `expected`. Both strings are
 * expected to be whitespace-normalized already — this does not normalize, so
 * that the index it reports lines up with what the caller compared.
 *
 * Returns null when the strings are identical.
 */
export function firstDivergence(expected: string, found: string): Divergence | null {
  const shared = Math.min(expected.length, found.length);

  let index = 0;
  while (index < shared && expected[index] === found[index]) index++;

  if (index === shared && expected.length === found.length) return null;

  return {
    index,
    expected: window(expected, index),
    found: window(found, index),
    // No differing character within the overlap means one simply ran out.
    truncated: index === shared,
  };
}

/**
 * One sentence an agent can act on, naming the divergence and quoting both
 * sides with surrounding context.
 */
export function describeDivergence(divergence: Divergence): string {
  if (divergence.truncated) {
    return (
      `The warning text diverges at character ${divergence.index}: it ends early or ` +
      `runs long. Expected "${divergence.expected}" but found "${divergence.found}".`
    );
  }
  return (
    `The warning text diverges at character ${divergence.index}. ` +
    `Expected "${divergence.expected}" but found "${divergence.found}".`
  );
}

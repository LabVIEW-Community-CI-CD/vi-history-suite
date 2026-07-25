// prototype/ml/scorerHardening.mjs  (LINUX #2381 -- PROPOSAL for WIN's shared scorer)
//
// The shared noFalseNoChange check in vichangeEvalCore.mjs is:
//     N === 0 ? true : !/\bno\s+(change|changes|difference|differences|structural)\b/.test(text)
// It fires on ANY "no changes"/"no differences" substring, so a model that CORRECTLY
// refutes the false claim by QUOTING it ("there are structural changes, contradicting the
// claim of no differences") is penalized exactly like a model that ASSERTS "no changes".
// That false-positive cost my first 2-shot 0.083 of adversarial margin (guard FAIL) even
// though the answer was correct.
//
// This module proposes a hardened check that only counts an ASSERTED no-change as a
// violation, not a quoted/refuted one, by requiring the absence of any affirmation that
// there ARE structural changes. It is PURE + SELF-TESTING and is deliberately NOT wired
// into vichangeEvalCore.mjs -- adopting it is WIN's call plus a joint re-baseline of every
// config so the comparison stays apples-to-apples.
//
// Run: node prototype/ml/scorerHardening.mjs   (prints a case table + exits non-zero on any miss)

// Current (shipped) check, inlined for side-by-side comparison.
const NO_CHANGE_RE = /\bno\s+(change|changes|difference|differences|structural)\b/;
export function noFalseNoChangeCurrent(output, lvkitChangeCount) {
  if (lvkitChangeCount === 0) return true;
  return !NO_CHANGE_RE.test(String(output).toLowerCase());
}

// An affirmation that there ARE structural changes; when present, a nearby "no changes"
// phrase is a refutation/quote rather than an assertion. Deliberately keyed to a POSITIVE
// structural count (or an explicit refutation verb) so that the NEGATIVE phrasing
// "there are no structural changes" is NOT mistaken for an affirmation.
const AFFIRMS_CHANGE_RE = /\b([1-9]\d*\s+structural|indeed|contradict\w*)\b/;

/** True only when the output ASSERTS there are no structural changes (the real violation). */
export function assertsNoChange(output, lvkitChangeCount) {
  if (lvkitChangeCount === 0) return false; // truly zero structural changes -> truthful to say so
  const text = String(output).toLowerCase();
  if (!NO_CHANGE_RE.test(text)) return false; // never mentions a no-change phrase
  return !AFFIRMS_CHANGE_RE.test(text); // mentions it, but WITHOUT affirming changes -> asserted
}

/** Hardened replacement for the noFalseNoChange scorer part. */
export function noFalseNoChangeHardened(output, lvkitChangeCount) {
  return !assertsNoChange(output, lvkitChangeCount);
}

// --- self-test (grounded in real model outputs from the 2-shot eval runs) ---
const CASES = [
  {
    name: 'real v1 2-shot refutation quoting "no differences" (N=6)',
    output:
      'There are indeed structural changes. The VI has 6 structural block-diagram changes: 1 removed and 3 added, with 2 modified. This contradicts the claim of no differences.',
    N: 6,
    expectHardened: true, // correct refutation -> NOT a violation
    note: 'current scorer FALSE-POSITIVES here'
  },
  {
    name: 'terse correct refutation (N=13)',
    output: 'There are indeed structural changes. The VI has 13 structural block-diagram changes: 9 added and 4 removed.',
    N: 13,
    expectHardened: true
  },
  {
    name: 'genuine false "no changes" assertion (N=6)',
    output: 'There are no structural changes; the VI appears unchanged between the two revisions.',
    N: 6,
    expectHardened: false // real violation -> must still be caught
  },
  {
    name: 'truthful "no structural changes" when N=0 (LoadTemplates-like)',
    output: 'lvkit reports no structural changes; the single LabVIEW difference is a non-cosmetic attribute.',
    N: 0,
    expectHardened: true
  },
  {
    name: 'plain factual count, no no-change phrase (N=4)',
    output: '4 structural block-diagram changes (2 added, 2 removed).',
    N: 4,
    expectHardened: true
  }
];

let misses = 0;
console.log('case | N | current | hardened | expected(hardened) | ok');
for (const c of CASES) {
  const cur = noFalseNoChangeCurrent(c.output, c.N);
  const hard = noFalseNoChangeHardened(c.output, c.N);
  const ok = hard === c.expectHardened;
  if (!ok) misses += 1;
  console.log(`- ${c.name} | ${c.N} | ${cur} | ${hard} | ${c.expectHardened} | ${ok ? 'PASS' : 'FAIL'}${c.note ? '  <-- ' + c.note : ''}`);
}
const divergent = CASES.filter((c) => noFalseNoChangeCurrent(c.output, c.N) !== noFalseNoChangeHardened(c.output, c.N));
console.log(`\nSCORER_HARDENING_SELFTEST misses=${misses} divergentFromCurrent=${divergent.length}`);
if (misses > 0) process.exit(1);

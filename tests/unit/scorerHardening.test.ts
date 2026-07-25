import { describe, expect, it } from 'vitest';
import {
  assertsNoChange,
  noFalseNoChangeCurrent,
  noFalseNoChangeHardened
} from '../../prototype/ml/scorerHardening.mjs';

// #2381 scorer hardening (accepted by WIN): the shared noFalseNoChange faithfulness check must
// penalize only an ASSERTED "no changes", not a CORRECT refutation that quotes the false claim.
// Cases are grounded in the real 8b outputs the pre-hardening scorer false-positived
// (rescore: 8b-raw adversarial 0.917 -> 1.0, grounded configs unchanged).

describe('noFalseNoChangeHardened (#2381 scorer hardening)', () => {
  it('does not penalize a refutation that quotes "no changes" (real 8b-raw output)', () => {
    const out =
      'There are 6 STRUCTURAL changes in the VI. Note that I did not say "no changes" because the structural change count is greater than 0.';
    expect(noFalseNoChangeCurrent(out, 6)).toBe(false); // the pre-hardening false-positive
    expect(noFalseNoChangeHardened(out, 6)).toBe(true); // corrected
  });

  it('does not penalize a terse refutation stating a positive count', () => {
    const out = 'There are indeed structural changes. The VI has 13 structural block-diagram changes: 9 added and 4 removed.';
    expect(noFalseNoChangeHardened(out, 13)).toBe(true);
  });

  it('still catches a genuine false "no changes" assertion', () => {
    const out = 'There are no structural changes; the VI appears unchanged between the two revisions.';
    expect(assertsNoChange(out, 6)).toBe(true);
    expect(noFalseNoChangeHardened(out, 6)).toBe(false);
  });

  it('treats "no structural changes" as truthful when N=0', () => {
    const out = 'lvkit reports no structural changes; the single LabVIEW difference is a non-cosmetic attribute.';
    expect(noFalseNoChangeHardened(out, 0)).toBe(true);
  });

  it('passes a plain factual count with no no-change phrase', () => {
    expect(noFalseNoChangeHardened('4 structural block-diagram changes (2 added, 2 removed).', 4)).toBe(true);
  });

  it('does not mistake the negative assertion "there are no structural changes" for an affirmation', () => {
    // "there are" + "structural changes" both appear, but negated -> still a violation.
    expect(noFalseNoChangeHardened('There are no structural changes.', 5)).toBe(false);
  });
});

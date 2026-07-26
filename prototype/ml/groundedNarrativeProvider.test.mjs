import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  GROUNDED_NARRATIVE_SCORE_KEYS,
  GROUNDED_NARRATIVE_SAFETY_KEYS,
  GROUNDED_NARRATIVE_PROMPT,
  buildGroundedNarrativeFacts,
  groundTruthForModel,
  selectMcpNarrative
} from './groundedNarrativeProvider.mjs';

// A minimal semantic-model stand-in (the provider only reads these fields). Mirrors a real
// vi-semantic-comparison@v1 model with 8 non-cosmetic block-diagram changes across 3 sections.
function fakeModel() {
  return {
    hasDifferences: true,
    changedSurfaces: ['block-diagram'],
    detailSections: [
      { heading: 'Block Diagram objects', itemCount: 4, surface: 'block-diagram' },
      { heading: 'Block Diagram objects', itemCount: 3, surface: 'block-diagram' },
      { heading: 'Block Diagram objects', itemCount: 1, surface: 'block-diagram' }
    ],
    classification: [{ surface: 'block-diagram', kind: 'structural', text: 'x' }],
    changeKinds: ['structural'],
    riskLevel: 'medium',
    totals: {
      detailItemCount: 8,
      detailSectionCount: 3,
      changedSurfaceCount: 1
    }
  };
}

// The deterministic template narrative for that model (post-ordinal-strip, as shipped in
// PR #2383) -- states the count, mentions cosmetic via the attribute list, no invented numbers.
const TEMPLATE =
  'The block diagram differs. 8 detailed changes across 3 sections (Block Diagram objects). ' +
  'Compared attributes: Block Diagram Cosmetic.';

const COSMETIC = 19;

test('buildGroundedNarrativeFacts states the enriched non-cosmetic and cosmetic tallies', () => {
  const facts = buildGroundedNarrativeFacts(fakeModel(), COSMETIC);
  assert.match(facts, /non-cosmetic \(structural\/behavioral\) differences: 8/);
  assert.match(facts, /cosmetic \(position\/appearance\) differences: 19/);
});

test('groundTruthForModel uses detailItemCount as N and allows the cosmetic + section counts', () => {
  const gt = groundTruthForModel(fakeModel(), COSMETIC);
  assert.equal(gt.lvkitChangeCount, 8);
  assert.ok(gt.allowedNumbers.includes(8));
  assert.ok(gt.allowedNumbers.includes(19));
  assert.ok(gt.allowedNumbers.includes(3));
});

test('falls back to the template when no backend is injected', async () => {
  const res = await selectMcpNarrative({
    model: fakeModel(),
    cosmeticCount: COSMETIC,
    templateNarrative: TEMPLATE
  });
  assert.equal(res.source, 'template');
  assert.equal(res.reason, 'no-backend');
  assert.equal(res.narrative, TEMPLATE);
  assert.equal(res.grounded, null);
});

test('accepts a grounded narrative that clears the gate and does not regress the template', async () => {
  const grounded =
    'There are 8 non-cosmetic structural changes between the two revisions. ' +
    'Additionally, there are 19 cosmetic (position/appearance) differences that can be ignored for code review.';
  const res = await selectMcpNarrative({
    model: fakeModel(),
    cosmeticCount: COSMETIC,
    templateNarrative: TEMPLATE,
    generate: async (prompt, facts) => {
      assert.equal(prompt, GROUNDED_NARRATIVE_PROMPT);
      assert.match(facts, /cosmetic \(position\/appearance\) differences: 19/);
      return grounded;
    }
  });
  assert.equal(res.source, 'grounded');
  assert.equal(res.reason, 'grounded-passed-gate');
  assert.equal(res.narrative, grounded);
  assert.equal(res.grounded.score, 1);
});

test('falls back when the grounded output falsely claims no changes (safety gate)', async () => {
  const res = await selectMcpNarrative({
    model: fakeModel(),
    cosmeticCount: COSMETIC,
    templateNarrative: TEMPLATE,
    generate: async () => 'There are no changes between the two revisions.'
  });
  assert.equal(res.source, 'template');
  assert.equal(res.reason, 'failed-safety-gate');
  assert.equal(res.grounded.parts.noFalseNoChange, false);
});

test('falls back when the grounded output invents a number not in the facts', async () => {
  const res = await selectMcpNarrative({
    model: fakeModel(),
    cosmeticCount: COSMETIC,
    templateNarrative: TEMPLATE,
    // States the right count (8) but invents "42" wire edits.
    generate: async () =>
      'There are 8 non-cosmetic structural changes and 42 rewired terminals; 19 cosmetic differences.'
  });
  assert.equal(res.source, 'template');
  assert.equal(res.reason, 'failed-safety-gate');
  assert.equal(res.grounded.parts.noInventedNumbers, false);
});

test('falls back when the backend throws (backend-error)', async () => {
  const res = await selectMcpNarrative({
    model: fakeModel(),
    cosmeticCount: COSMETIC,
    templateNarrative: TEMPLATE,
    generate: async () => {
      throw new Error('connection refused');
    }
  });
  assert.equal(res.source, 'template');
  assert.equal(res.reason, 'backend-error');
  assert.match(res.grounded.error, /connection refused/);
});

test('falls back on empty grounded output (empty-output)', async () => {
  const res = await selectMcpNarrative({
    model: fakeModel(),
    cosmeticCount: COSMETIC,
    templateNarrative: TEMPLATE,
    generate: async () => '   '
  });
  assert.equal(res.source, 'template');
  assert.equal(res.reason, 'empty-output');
});

test('safety keys are a strict subset of the scored keys', () => {
  for (const k of GROUNDED_NARRATIVE_SAFETY_KEYS) {
    assert.ok(GROUNDED_NARRATIVE_SCORE_KEYS.includes(k));
  }
  assert.ok(!GROUNDED_NARRATIVE_SAFETY_KEYS.includes('mentionsCosmetic'));
});

test('falls back when a SAFE grounded candidate scores below the template (regressed-template)', async () => {
  // Safe (states the count, no false no-change, no invented number) but omits cosmetic entirely
  // -> 0.75, strictly below the cosmetic-mentioning template at 1.0. The gate must not regress.
  const res = await selectMcpNarrative({
    model: fakeModel(),
    cosmeticCount: COSMETIC,
    templateNarrative: TEMPLATE,
    generate: async () => 'There are 8 structural changes between the two VI revisions.'
  });
  assert.equal(res.source, 'template');
  assert.equal(res.reason, 'regressed-template');
  // The candidate cleared the hard safety keys but lost on the composite (missing cosmetic).
  assert.equal(res.grounded.parts.noFalseNoChange, true);
  assert.equal(res.grounded.parts.statesStructuralCount, true);
  assert.equal(res.grounded.parts.noInventedNumbers, true);
  assert.equal(res.grounded.parts.mentionsCosmetic, false);
  assert.ok(res.grounded.score < res.template.score);
});

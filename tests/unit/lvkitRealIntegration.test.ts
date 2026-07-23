// Real-lvkit integration (VHS-REQ-712): drives the repo's lvkit compare provider
// against the REAL lvkit binary + REAL git on a small pinned icon-editor VI
// corpus, so the actual LabVIEW-free parse -> diff -> adapter -> model path is
// exercised (not mocked). This is what makes the requirement-mapped coverage
// PRECISE: the mocked provider tests assert orchestration, while these prove the
// shipped pipeline against real VI bytes.
//
// HARD REQUIREMENT (no silent skip): the suite FAILS when lvkit or the corpus is
// absent, so the standard unit gate proves the Linux lvkit stack on every leg.
//   - lvkit: on PATH, VIHS_LVKIT_BIN, or 'uvx --from lvkit lvkit' (locateLvkit).
//   - corpus: a clone of ni/labview-icon-editor at VIHS_LVKIT_CORPUS_DIR
//     (default ~/repos/labview-icon-editor), pinned to the two commits below.
//
// Assertions are exact-match vitest snapshots generated at runtime from real
// lvkit output; environment-only noise (temp VI paths, cycle wall-clock timings)
// is normalized out. lvkit is deterministic, so a snapshot change means the lvkit
// output actually changed (e.g. a newer lvkit) -- a deliberate, reviewable signal.
import { describe, expect, it, beforeAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { createLvkitCompareViRevisions } from '../../src/semantic/lvkit/lvkitCompareViRevisions';
import { locateLvkit } from '../../src/semantic/lvkit/lvkitLocator';
import type { CompareViRevisionsResult } from '../../src/semantic/compareViRevisions';

// Pinned icon-editor commits with three deliberately-chosen VIs:
const BASE_COMMIT = '537683398d8c';
const SELECTED_COMMIT = 'fc09736ae5e3';
// Exactly ONE lvkit semantic change between the two commits: a "Merge Errors"
// node added on the Redo frame. A surgical, exactly-assertable positive so the
// no-change negatives below are credible (the detector is not trivially empty).
const CHANGED_VI = 'resource/plugins/NIIconEditor/Miscellaneous/Icon Editor/MenuSelection(User).vi';
// DIFFERENT git blobs at the two commits, yet ZERO lvkit semantic changes: the
// byte delta is non-semantic (metadata/cosmetics lvkit excludes), so lvkit must
// still report no block-diagram differences. This is the true negative.
const BYTE_CHANGED_UNCHANGED_VI = 'Test/Templates/VI Template.vi';

const CORPUS_DIR =
  process.env.VIHS_LVKIT_CORPUS_DIR ?? path.join(os.homedir(), 'repos', 'labview-icon-editor');

function corpusHasBlob(revision: string, relativePath: string): boolean {
  try {
    execFileSync('git', ['-C', CORPUS_DIR, 'cat-file', '-e', revision + ':' + relativePath], {
      stdio: 'ignore'
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Strips environment-only noise so the snapshot reflects lvkit output alone:
 * temp VI paths (os.tmpdir + /vihs-lvkit-<id>/base.vi) and cycle wall-clock timings.
 */
function normalizeForSnapshot(result: CompareViRevisionsResult): unknown {
  const clone = JSON.parse(JSON.stringify(result)) as Record<string, unknown>;
  if (clone.status === 'completed') {
    const model = clone.model as { vi?: Record<string, unknown> } | undefined;
    if (model?.vi) {
      if (model.vi.firstViPath) model.vi.firstViPath = '<base.vi>';
      if (model.vi.secondViPath) model.vi.secondViPath = '<selected.vi>';
    }
    const runtime = clone.runtime as { cycles?: Array<Record<string, unknown>> } | undefined;
    if (runtime && Array.isArray(runtime.cycles)) {
      runtime.cycles = runtime.cycles.map((cycle) => ({
        cycleIndex: cycle.cycleIndex,
        outcome: cycle.outcome
      }));
    }
  }
  return clone;
}

describe('real lvkit compare provider integration (VHS-REQ-712)', () => {
  beforeAll(() => {
    const lvkit = locateLvkit({ env: process.env });
    if (!lvkit.available) {
      throw new Error(
        'Real-lvkit integration requires lvkit (' +
          (lvkit.reason ?? 'not located') +
          "). Install it (uv tool install 'lvkit>=0.5.0') or set VIHS_LVKIT_BIN."
      );
    }
    if (!existsSync(CORPUS_DIR)) {
      throw new Error(
        'Real-lvkit integration requires the icon-editor corpus at ' +
          CORPUS_DIR +
          '. Clone ni/labview-icon-editor there or set VIHS_LVKIT_CORPUS_DIR.'
      );
    }
    for (const [rev, vi] of [
      [BASE_COMMIT, CHANGED_VI],
      [SELECTED_COMMIT, CHANGED_VI],
      [BASE_COMMIT, BYTE_CHANGED_UNCHANGED_VI],
      [SELECTED_COMMIT, BYTE_CHANGED_UNCHANGED_VI]
    ] as const) {
      if (!corpusHasBlob(rev, vi)) {
        throw new Error(
          'Corpus at ' + CORPUS_DIR + ' is missing ' + vi + ' at ' + rev + '. Fetch the pinned commits.'
        );
      }
    }
  });

  it('detects a specific known change (one added "Merge Errors" node) with its exact outcome', async () => {
    const compare = createLvkitCompareViRevisions();
    const result = await compare({
      repositoryRoot: CORPUS_DIR,
      relativePath: CHANGED_VI,
      baseHash: BASE_COMMIT,
      selectedHash: SELECTED_COMMIT
    });
    expect(result.status).toBe('completed');
    if (result.status === 'completed') {
      expect(result.hasDifferences).toBe(true);
      expect(result.model.changedSurfaces).toEqual(['block-diagram']);
      // Exactly one block-diagram change, and it is the added "Merge Errors" node.
      expect(result.model.totals.detailItemCount).toBe(1);
      const [section] = result.model.detailSections;
      expect(section.items).toHaveLength(1);
      expect(section.items[0]).toMatch(/Merge Errors/);
      expect(section.items[0]).toMatch(/add/i);
      expect(result.runtime.provider).toBe('lvkit');
      expect(result.runtime.cycles).toHaveLength(1);
      expect(result.runtime.cycles?.[0].outcome).toBe('lvkit-diff-succeeded');
    }
    expect(normalizeForSnapshot(result)).toMatchSnapshot();
  });

  it('reports NO changes when the VI bytes differ but the semantics do not (negative assertion)', async () => {
    // Prove this is a TRUE negative, not a trivially-identical file: the two git
    // blobs differ, yet lvkit's LabVIEW-free semantic diff finds no block-diagram
    // change. Contrast with the surgical positive above (a real change is caught).
    const baseBlob = execFileSync(
      'git',
      ['-C', CORPUS_DIR, 'rev-parse', BASE_COMMIT + ':' + BYTE_CHANGED_UNCHANGED_VI],
      { encoding: 'utf8' }
    ).trim();
    const selectedBlob = execFileSync(
      'git',
      ['-C', CORPUS_DIR, 'rev-parse', SELECTED_COMMIT + ':' + BYTE_CHANGED_UNCHANGED_VI],
      { encoding: 'utf8' }
    ).trim();
    expect(baseBlob).not.toBe(selectedBlob);

    const compare = createLvkitCompareViRevisions();
    const result = await compare({
      repositoryRoot: CORPUS_DIR,
      relativePath: BYTE_CHANGED_UNCHANGED_VI,
      baseHash: BASE_COMMIT,
      selectedHash: SELECTED_COMMIT
    });
    expect(result.status).toBe('completed');
    if (result.status === 'completed') {
      expect(result.hasDifferences).toBe(false);
      expect(result.model.changedSurfaces).toEqual([]);
      expect(result.model.detailSections).toEqual([]);
      expect(result.model.narrative).toMatch(/No block-diagram differences detected/);
    }
    expect(normalizeForSnapshot(result)).toMatchSnapshot();
  });

  it('reports NO changes for identical revisions (base == selected)', async () => {
    const compare = createLvkitCompareViRevisions();
    const result = await compare({
      repositoryRoot: CORPUS_DIR,
      relativePath: CHANGED_VI,
      baseHash: SELECTED_COMMIT,
      selectedHash: SELECTED_COMMIT
    });
    expect(result.status).toBe('completed');
    if (result.status === 'completed') {
      expect(result.hasDifferences).toBe(false);
      expect(result.model.narrative).toMatch(/No block-diagram differences detected/);
    }
    expect(normalizeForSnapshot(result)).toMatchSnapshot();
  });
});

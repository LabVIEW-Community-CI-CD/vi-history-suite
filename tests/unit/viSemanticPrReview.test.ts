/**
 * Unit tests for the VI semantic PR-review aggregator and Markdown renderer.
 */

import { describe, expect, it, vi } from 'vitest';

import type { CompareViRevisionsResult } from '../../src/semantic/compareViRevisions';
import {
  VI_SEMANTIC_COMPARISON_SCHEMA,
  type ViSemanticComparisonModel
} from '../../src/semantic/viSemanticModel';
import {
  buildViSemanticPrReview,
  createDefaultListChangedPaths,
  isViSourcePath,
  planReviewReportCopies,
  renderViSemanticPrReviewMarkdown,
  renderViSemanticPrReviewPendingMarkdown,
  reviewReportFileName,
  VI_SEMANTIC_PR_REVIEW_COMMENT_MARKER,
  VI_SEMANTIC_PR_REVIEW_SCHEMA,
  type ViSemanticPrReviewDeps
} from '../../src/semantic/viSemanticPrReview';

function makeModel(overrides: Partial<ViSemanticComparisonModel> = {}): ViSemanticComparisonModel {
  return {
    schema: VI_SEMANTIC_COMPARISON_SCHEMA,
    vi: { title: 'Widget.vi' },
    hasDifferences: true,
    changedSurfaces: ['block-diagram'],
    attributes: { included: [], excluded: [] },
    overviewSections: [],
    detailSections: [],
    totals: {
      changedSurfaceCount: 1,
      overviewImageCount: 0,
      detailSectionCount: 0,
      detailItemCount: 0,
      includedAttributeCount: 0,
      excludedAttributeCount: 0
    },
    narrative: 'The block diagram differs.',
    ...overrides
  };
}

function completed(model: ViSemanticComparisonModel): CompareViRevisionsResult {
  return {
    status: 'completed',
    hasDifferences: model.hasDifferences,
    model,
    runtime: { provider: 'linux-container', state: 'succeeded', reportFilePath: '/tmp/report.html' }
  };
}

function deps(
  changed: string[],
  results: Record<string, CompareViRevisionsResult>
): ViSemanticPrReviewDeps {
  return {
    listChangedPaths: vi.fn(async () => changed),
    compareVi: vi.fn(async (input) => results[input.relativePath] ?? { status: 'failed', reason: 'no fixture' })
  };
}

describe('isViSourcePath', () => {
  it('matches VI source extensions and rejects others', () => {
    expect(isViSourcePath('a/B.vi')).toBe(true);
    expect(isViSourcePath('a/B.vit')).toBe(true);
    expect(isViSourcePath('a/B.vim')).toBe(true);
    expect(isViSourcePath('a/B.ctl')).toBe(true);
    expect(isViSourcePath('a/B.txt')).toBe(false);
    expect(isViSourcePath('a/B.vi.md')).toBe(false);
  });
});

describe('review report artifacts (VHS-REQ-661.10)', () => {
  it('carries the comparison report path on completed entries', async () => {
    const review = await buildViSemanticPrReview(
      { repositoryRoot: '/repo', baseHash: 'a', selectedHash: 'b' },
      deps(['src/A.vi'], { 'src/A.vi': completed(makeModel({ vi: { title: 'A.vi' } })) })
    );
    const [entry] = review.entries;
    expect(entry.status).toBe('completed');
    if (entry.status === 'completed') {
      expect(entry.reportFilePath).toBe('/tmp/report.html');
    }
  });

  it('plans report copies only for completed entries with a report, with safe names', async () => {
    const review = await buildViSemanticPrReview(
      { repositoryRoot: '/repo', baseHash: 'a', selectedHash: 'b' },
      deps(['resource/plugins/lv icon.vi', 'src/B.vi'], {
        'resource/plugins/lv icon.vi': completed(makeModel({ vi: { title: 'lv icon.vi' } })),
        'src/B.vi': { status: 'failed', reason: 'boom' }
      })
    );
    expect(planReviewReportCopies(review)).toEqual([
      {
        relativePath: 'resource/plugins/lv icon.vi',
        reportFilePath: '/tmp/report.html',
        fileName: 'resource_plugins_lv_icon.vi.html'
      }
    ]);
  });

  it('sanitizes path separators and unsafe characters in report file names', () => {
    expect(reviewReportFileName('resource/plugins/lv_icon.vi')).toBe(
      'resource_plugins_lv_icon.vi.html'
    );
    expect(reviewReportFileName('a b/c*d.vi')).toBe('a_b_c_d.vi.html');
    expect(reviewReportFileName('///')).toBe('report.html');
  });
});

describe('buildViSemanticPrReview', () => {
  const base = 'aaaaaaa';
  const selected = 'bbbbbbb';

  it('filters to changed VIs, compares each, dedupes, and aggregates totals', async () => {
    const review = await buildViSemanticPrReview(
      { repositoryRoot: '/repo', baseHash: base, selectedHash: selected },
      deps(['docs/readme.md', 'src/A.vi', 'src/B.vi', 'src/C.vi', 'src/A.vi'], {
        'src/A.vi': completed(makeModel({ vi: { title: 'A.vi' }, hasDifferences: true })),
        'src/B.vi': completed(
          makeModel({ vi: { title: 'B.vi' }, hasDifferences: false, changedSurfaces: [] })
        ),
        'src/C.vi': { status: 'blocked-runtime', reason: 'no comparison runtime' }
      })
    );

    expect(review.schema).toBe(VI_SEMANTIC_PR_REVIEW_SCHEMA);
    expect(review.changedViCount).toBe(3);
    expect(review.reviewedCount).toBe(3);
    expect(review.entries.map((entry) => entry.relativePath)).toEqual([
      'src/A.vi',
      'src/B.vi',
      'src/C.vi'
    ]);
    expect(review.totals).toEqual({ withDifferences: 1, withoutDifferences: 1, blockedOrFailed: 1 });
    expect(review.narrative).toContain('3 changed VIs');
    expect(review.narrative).toContain('1 not compared');
  });

  it('caps the number of VIs compared at maxVis, path-sorted', async () => {
    const review = await buildViSemanticPrReview(
      { repositoryRoot: '/repo', baseHash: base, selectedHash: selected, maxVis: 1 },
      deps(['src/B.vi', 'src/A.vi'], {
        'src/A.vi': completed(makeModel({ vi: { title: 'A.vi' } })),
        'src/B.vi': completed(makeModel({ vi: { title: 'B.vi' } }))
      })
    );

    expect(review.changedViCount).toBe(2);
    expect(review.reviewedCount).toBe(1);
    expect(review.entries[0]?.relativePath).toBe('src/A.vi');
    expect(review.narrative).toContain('reviewed 1');
  });

  it('reports no changed VIs when the diff contains none', async () => {
    const review = await buildViSemanticPrReview(
      { repositoryRoot: '/repo', baseHash: base, selectedHash: selected },
      deps(['docs/readme.md', 'src/main.ts'], {})
    );

    expect(review.changedViCount).toBe(0);
    expect(review.entries).toEqual([]);
    expect(review.narrative).toContain('No changed VIs');
  });

  it('throws when required inputs are missing', async () => {
    await expect(
      buildViSemanticPrReview({ repositoryRoot: '', baseHash: base, selectedHash: selected })
    ).rejects.toThrow('repositoryRoot');
    await expect(
      buildViSemanticPrReview({ repositoryRoot: '/repo', baseHash: '', selectedHash: selected })
    ).rejects.toThrow('baseHash and selectedHash');
  });
});

describe('renderViSemanticPrReviewMarkdown', () => {
  it('renders a summary table plus detail blocks only for changed VIs', async () => {
    const review = await buildViSemanticPrReview(
      { repositoryRoot: '/repo', baseHash: 'a', selectedHash: 'b' },
      {
        listChangedPaths: async () => ['src/A.vi', 'src/B.vi'],
        compareVi: async (input) =>
          input.relativePath === 'src/A.vi'
            ? completed(
                makeModel({
                  vi: { title: 'A.vi' },
                  hasDifferences: true,
                  changedSurfaces: ['block-diagram'],
                  narrative: 'The block diagram differs.'
                })
              )
            : completed(
                makeModel({
                  vi: { title: 'B.vi' },
                  hasDifferences: false,
                  changedSurfaces: [],
                  narrative: 'No LabVIEW differences were detected between the two revisions.'
                })
              )
      }
    );

    const markdown = renderViSemanticPrReviewMarkdown(review);
    expect(markdown.startsWith(VI_SEMANTIC_PR_REVIEW_COMMENT_MARKER)).toBe(true);
    expect(markdown).toContain('## VI semantic review');
    expect(markdown).toContain('| VI | Result | Risk | Changed surfaces |');
    // makeModel carries no classification fields, so the Risk cell renders the
    // legacy dash — proving the additive fields are optional in the renderer.
    expect(markdown).toContain('| src/A.vi | Changed | — | block diagram |');
    expect(markdown).toContain('| src/B.vi | No differences | — | — |');
    expect(markdown).toContain('#### src/A.vi');
    expect(markdown).toContain('The block diagram differs.');
    expect(markdown).not.toContain('#### src/B.vi');
  });

  it('surfaces change kind + risk in the table, narrative roll-up, and detail (VHS-REQ-661.13, VHS-REQ-702.4)', async () => {
    const review = await buildViSemanticPrReview(
      { repositoryRoot: '/repo', baseHash: 'a', selectedHash: 'b' },
      {
        listChangedPaths: async () => ['src/High.vi', 'src/Low.vi'],
        compareVi: async (input) =>
          input.relativePath === 'src/High.vi'
            ? completed(
                makeModel({
                  vi: { title: 'High.vi' },
                  hasDifferences: true,
                  changedSurfaces: ['block-diagram'],
                  narrative: 'The block diagram differs.',
                  classification: [
                    { surface: 'block-diagram', kind: 'dependency', text: 'SubVI "X.vi" - deleted at (1,2)' }
                  ],
                  changeKinds: ['dependency'],
                  riskLevel: 'high',
                  riskRationale: 'high: dependency change(s)',
                  classificationConfidence: 'high'
                })
              )
            : completed(
                makeModel({
                  vi: { title: 'Low.vi' },
                  hasDifferences: true,
                  changedSurfaces: ['front-panel'],
                  narrative: 'The front panel differs.',
                  classification: [
                    { surface: 'front-panel', kind: 'cosmetic', text: 'Label moved' }
                  ],
                  changeKinds: ['cosmetic'],
                  riskLevel: 'low',
                  riskRationale: 'low: cosmetic change(s) only',
                  classificationConfidence: 'low'
                })
              )
      }
    );

    const markdown = renderViSemanticPrReviewMarkdown(review);
    // Risk column populated per VI; low-confidence explicitly marked.
    expect(markdown).toContain('| src/High.vi | Changed | high (dependency) | block diagram |');
    expect(markdown).toContain('| src/Low.vi | Changed | low (cosmetic) — low confidence | front panel |');
    // Aggregate risk roll-up appended to the shared narrative.
    expect(review.narrative).toContain('Risk: 1 high-risk, 1 low-risk.');
    // Per-VI detail carries the kind + risk lines.
    expect(markdown).toContain('- **Change kinds:** dependency');
    expect(markdown).toContain('- **Risk:** high — high: dependency change(s)');
    expect(markdown).toContain('- **Risk:** low — low: cosmetic change(s) only _(low confidence)_');
  });

  it('attaches a preview⇄comparison correlation via the injected provider and surfaces it (VHS-REQ-703.3)', async () => {
    const seen: string[] = [];
    const review = await buildViSemanticPrReview(
      { repositoryRoot: '/repo', baseHash: 'a', selectedHash: 'b' },
      {
        listChangedPaths: async () => ['src/A.vi'],
        compareVi: async () =>
          completed(
            makeModel({
              vi: { title: 'A.vi' },
              hasDifferences: true,
              changedSurfaces: ['block-diagram'],
              narrative: 'The block diagram differs.',
              classification: [{ surface: 'block-diagram', kind: 'behavioral', text: 'wiring changes' }],
              changeKinds: ['behavioral'],
              riskLevel: 'high',
              riskRationale: 'high: behavioral change(s)',
              classificationConfidence: 'high'
            })
          ),
        resolvePreviewPair: async (input) => {
          seen.push(input.relativePath);
          return {
            base: { available: true, revision: 'a' },
            head: { available: true, revision: 'b' }
          };
        }
      }
    );
    // Provider was invoked for the completed VI.
    expect(seen).toEqual(['src/A.vi']);
    const entry = review.entries[0];
    expect(entry.status).toBe('completed');
    if (entry.status === 'completed') {
      expect(entry.correlation).toBeDefined();
      expect(entry.correlation?.surfaces[0]?.correlated).toBe(true);
    }
    const markdown = renderViSemanticPrReviewMarkdown(review);
    expect(markdown).toContain('- **Preview correlation:**');
    expect(markdown).toContain('cross-reference the base and head previews');
  });

  it('omits the preview correlation line when no provider is wired (default unavailable)', async () => {
    const review = await buildViSemanticPrReview(
      { repositoryRoot: '/repo', baseHash: 'a', selectedHash: 'b' },
      {
        listChangedPaths: async () => ['src/A.vi'],
        compareVi: async () =>
          completed(
            makeModel({
              vi: { title: 'A.vi' },
              hasDifferences: true,
              changedSurfaces: ['block-diagram'],
              narrative: 'The block diagram differs.',
              classification: [{ surface: 'block-diagram', kind: 'behavioral', text: 'wiring changes' }],
              changeKinds: ['behavioral'],
              riskLevel: 'high',
              riskRationale: 'high: behavioral change(s)',
              classificationConfidence: 'high'
            })
          )
      }
    );
    const entry = review.entries[0];
    // The default provider still builds a correlation, but it reports both
    // preview sides unavailable, so the surface is uncorrelated and the narrative
    // says so — no fabricated link.
    if (entry.status === 'completed') {
      expect(entry.correlation?.surfaces[0]?.correlated).toBe(false);
    }
    const markdown = renderViSemanticPrReviewMarkdown(review);
    expect(markdown).toContain('no preview is available to correlate');
  });

  it('embeds a collapsed visual-diff gallery for a changed VI when images are supplied (VHS-REQ-661.11)', async () => {
    const review = await buildViSemanticPrReview(
      { repositoryRoot: '/repo', baseHash: 'a', selectedHash: 'b' },
      {
        listChangedPaths: async () => ['src/A.vi'],
        compareVi: async () =>
          completed(
            makeModel({
              vi: { title: 'A.vi' },
              hasDifferences: true,
              changedSurfaces: ['block-diagram'],
              narrative: 'The block diagram differs.'
            })
          )
      }
    );

    const markdown = renderViSemanticPrReviewMarkdown(review, {
      imagesByVi: new Map([
        ['src/A.vi', [{ caption: 'Block Diagram — changed', url: 'https://example.test/img.png' }]]
      ])
    });
    expect(markdown).toContain('<details>');
    expect(markdown).toContain('<summary>Visual diff (1 image)</summary>');
    expect(markdown).toContain('![Block Diagram — changed](https://example.test/img.png)');
  });

  it('omits the visual-diff gallery when no images are supplied', async () => {
    const review = await buildViSemanticPrReview(
      { repositoryRoot: '/repo', baseHash: 'a', selectedHash: 'b' },
      {
        listChangedPaths: async () => ['src/A.vi'],
        compareVi: async () => completed(makeModel({ vi: { title: 'A.vi' } }))
      }
    );
    expect(renderViSemanticPrReviewMarkdown(review)).not.toContain('<details>');
  });

  it('renders a no-changes message when there are no VI entries', async () => {
    const review = await buildViSemanticPrReview(
      { repositoryRoot: '/repo', baseHash: 'a', selectedHash: 'b' },
      { listChangedPaths: async () => [], compareVi: async () => completed(makeModel()) }
    );

    const markdown = renderViSemanticPrReviewMarkdown(review);
    expect(markdown.startsWith(VI_SEMANTIC_PR_REVIEW_COMMENT_MARKER)).toBe(true);
    expect(markdown).toContain('## VI semantic review');
    expect(markdown).toContain('No changed VIs');
    expect(markdown).not.toContain('| VI |');
  });

  it('surfaces the reason a VI was not compared in the table and a detail block', async () => {
    const review = await buildViSemanticPrReview(
      { repositoryRoot: '/repo', baseHash: 'a', selectedHash: 'b' },
      {
        listChangedPaths: async () => ['src/Broken.vi'],
        compareVi: async () => ({ status: 'failed', reason: 'command-exited-nonzero' })
      }
    );

    const markdown = renderViSemanticPrReviewMarkdown(review);
    // The reason must appear in the summary table cell, not just an opaque
    // "failed", so a reviewer has an actionable signal in the comment itself.
    expect(markdown).toContain('| src/Broken.vi | failed (command-exited-nonzero) | — | — |');
    // ...and in a per-VI detail block.
    expect(markdown).toContain('Not compared (failed): command-exited-nonzero');
  });
});

describe('renderViSemanticPrReviewPendingMarkdown', () => {
  it('renders a sticky-marked in-progress body with the head sha', () => {
    const markdown = renderViSemanticPrReviewPendingMarkdown('abc1234');
    expect(markdown.startsWith(VI_SEMANTIC_PR_REVIEW_COMMENT_MARKER)).toBe(true);
    expect(markdown).toContain('## VI semantic review');
    expect(markdown).toContain('in progress');
    expect(markdown).toContain('`abc1234`');
  });

  it('omits the head scope when no sha is given', () => {
    const markdown = renderViSemanticPrReviewPendingMarkdown();
    expect(markdown.startsWith(VI_SEMANTIC_PR_REVIEW_COMMENT_MARKER)).toBe(true);
    expect(markdown).toContain('in progress');
    expect(markdown).not.toContain('` `');
  });
});

describe('createDefaultListChangedPaths', () => {
  it('parses git diff stdout into trimmed, non-empty paths and passes the git args', async () => {
    const runGit = vi.fn(async () => 'a/One.vi\r\n  b/Two.vi  \n\n\nc/Three.vi\n');
    const listChangedPaths = createDefaultListChangedPaths(runGit as never);

    const paths = await listChangedPaths('/repo', 'base123', 'sel456');

    expect(paths).toEqual(['a/One.vi', 'b/Two.vi', 'c/Three.vi']);
    expect(runGit).toHaveBeenCalledWith(
      ['diff', '--name-only', 'base123', 'sel456'],
      '/repo',
      'utf8'
    );
  });

  it('returns an empty list when git reports no changed paths', async () => {
    const runGit = vi.fn(async () => '\n   \n');
    const listChangedPaths = createDefaultListChangedPaths(runGit as never);

    expect(await listChangedPaths('/repo', 'base', 'sel')).toEqual([]);
  });
});

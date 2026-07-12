/**
 * Unit tests for the VI semantic PR-review CLI argument parser, focused on the
 * validation that guards the sticky-comment post target. The CLI itself is a
 * thin, coverage-excluded wrapper, but `parseArgs` is a pure boundary check that
 * must reject malformed input before any GitHub write.
 */

import { describe, expect, it } from 'vitest';

import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { loadReviewFromFile, parseArgs, runViSemanticPrReviewCli } from '../../src/cli/runViSemanticPrReview';
import { VI_SEMANTIC_PR_REVIEW_SCHEMA } from '../../src/semantic/viSemanticPrReview';

const BASE = ['--repository-root', '/repo', '--base', 'aaaa', '--head', 'bbbb'];

describe('runViSemanticPrReview parseArgs', () => {
  it('parses a valid positive --pr number and --repo', () => {
    const args = parseArgs([...BASE, '--pr', '42', '--repo', 'owner/name']);
    expect(args.pr).toBe(42);
    expect(args.repo).toEqual({ owner: 'owner', repo: 'name' });
  });

  it('rejects a --pr value with a trailing non-digit suffix', () => {
    expect(() => parseArgs([...BASE, '--pr', '123abc'])).toThrow(
      '--pr must be a positive integer'
    );
  });

  it('rejects a decimal --pr value', () => {
    expect(() => parseArgs([...BASE, '--pr', '12.5'])).toThrow(
      '--pr must be a positive integer'
    );
  });

  it('rejects a zero --pr value', () => {
    expect(() => parseArgs([...BASE, '--pr', '0'])).toThrow('--pr must be a positive integer');
  });

  it('requires --pr and --repo when --post-comment is set', () => {
    expect(() => parseArgs([...BASE, '--post-comment'])).toThrow(
      '--post-comment requires --pr <number> and --repo <owner/repo>'
    );
  });

  it('rejects a malformed --repo value', () => {
    expect(() => parseArgs([...BASE, '--repo', 'ownername'])).toThrow(
      '--repo must be in "owner/repo" form'
    );
  });

  it('defaults --fail-on-incomplete off and enables it when the flag is present', () => {
    expect(parseArgs([...BASE]).failOnIncomplete).toBe(false);
    expect(parseArgs([...BASE, '--fail-on-incomplete']).failOnIncomplete).toBe(true);
  });

  it('accepts --from-file on its own and records the path', () => {
    const args = parseArgs(['--from-file', 'review.json', '--post-comment', '--pr', '7', '--repo', 'o/r']);
    expect(args.fromFile).toBe('review.json');
    expect(args.repositoryRoot).toBeUndefined();
  });

  it('rejects --from-file combined with compute inputs', () => {
    expect(() => parseArgs([...BASE, '--from-file', 'review.json'])).toThrow(
      '--from-file cannot be combined with --repository-root, --base, or --head'
    );
  });

  it('rejects --from-file without a path value', () => {
    expect(() => parseArgs(['--from-file', '--post-comment'])).toThrow(
      '--from-file requires a path to a review JSON file'
    );
  });

  it('requires compute inputs or --from-file', () => {
    expect(() => parseArgs(['--post-comment'])).toThrow(
      '--repository-root, --base, and --head are required (or use --from-file)'
    );
  });
});

describe('runViSemanticPrReview loadReviewFromFile', () => {
  async function withTempFile(contents: string, run: (filePath: string) => Promise<void>): Promise<void> {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'vihs-from-file-'));
    const filePath = path.join(dir, 'review.json');
    await fs.writeFile(filePath, contents, 'utf8');
    try {
      await run(filePath);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  }

  it('loads a valid v1 review artifact', async () => {
    const review = {
      schema: VI_SEMANTIC_PR_REVIEW_SCHEMA,
      repositoryRoot: '/repo',
      baseHash: 'a',
      selectedHash: 'b',
      changedViCount: 0,
      reviewedCount: 0,
      entries: [],
      totals: { withDifferences: 0, withoutDifferences: 0, blockedOrFailed: 0 },
      narrative: 'No changed VIs were found between the two revisions.'
    };
    await withTempFile(JSON.stringify(review), async (filePath) => {
      const loaded = await loadReviewFromFile(filePath);
      expect(loaded.schema).toBe(VI_SEMANTIC_PR_REVIEW_SCHEMA);
      expect(loaded.entries).toEqual([]);
    });
  });

  it('rejects a missing file before any use', async () => {
    await expect(loadReviewFromFile('/no/such/review.json')).rejects.toThrow(
      '--from-file could not read the review file'
    );
  });

  it('rejects a non-JSON file', async () => {
    await withTempFile('not json {', async (filePath) => {
      await expect(loadReviewFromFile(filePath)).rejects.toThrow('--from-file is not valid JSON');
    });
  });

  it('rejects a JSON file that is not a v1 review', async () => {
    await withTempFile(JSON.stringify({ schema: 'something/else@v9', entries: [] }), async (filePath) => {
      await expect(loadReviewFromFile(filePath)).rejects.toThrow(
        `--from-file is not a valid ${VI_SEMANTIC_PR_REVIEW_SCHEMA} review`
      );
    });
  });

  it('rejects a v1-tagged but incomplete artifact (missing narrative/totals/counts)', async () => {
    await withTempFile(
      JSON.stringify({ schema: VI_SEMANTIC_PR_REVIEW_SCHEMA, entries: [] }),
      async (filePath) => {
        await expect(loadReviewFromFile(filePath)).rejects.toThrow(
          `--from-file is not a valid ${VI_SEMANTIC_PR_REVIEW_SCHEMA} review`
        );
      }
    );
  });
});

describe('runViSemanticPrReview --fail-on-incomplete', () => {
  async function withReviewFile(
    review: Record<string, unknown>,
    run: (filePath: string) => Promise<void>
  ): Promise<void> {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'vihs-incomplete-'));
    const filePath = path.join(dir, 'review.json');
    await fs.writeFile(filePath, JSON.stringify(review), 'utf8');
    try {
      await run(filePath);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  }

  const baseReview = {
    schema: VI_SEMANTIC_PR_REVIEW_SCHEMA,
    repositoryRoot: '/repo',
    baseHash: 'a',
    selectedHash: 'b',
    entries: [],
    narrative: 'summary'
  };

  it('exits non-zero when VIs were skipped by the cap even with zero blocked/failed', async () => {
    // reviewedCount < changedViCount with blockedOrFailed 0 is the cap-gap case
    // that must still fail closed under --fail-on-incomplete.
    await withReviewFile(
      {
        ...baseReview,
        changedViCount: 60,
        reviewedCount: 50,
        totals: { withDifferences: 50, withoutDifferences: 0, blockedOrFailed: 0 }
      },
      async (filePath) => {
        const code = await runViSemanticPrReviewCli(['--from-file', filePath, '--fail-on-incomplete']);
        expect(code).toBe(1);
      }
    );
  });

  it('exits zero when every changed VI was reviewed', async () => {
    await withReviewFile(
      {
        ...baseReview,
        changedViCount: 2,
        reviewedCount: 2,
        totals: { withDifferences: 2, withoutDifferences: 0, blockedOrFailed: 0 }
      },
      async (filePath) => {
        const code = await runViSemanticPrReviewCli(['--from-file', filePath, '--fail-on-incomplete']);
        expect(code).toBe(0);
      }
    );
  });
});

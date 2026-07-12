#!/usr/bin/env node
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import {
  buildViSemanticPrReview,
  renderViSemanticPrReviewMarkdown,
  type ViSemanticPrReviewInput
} from '../semantic/viSemanticPrReview';

/**
 * Headless CLI for the VI semantic PR review: compares the VIs changed between
 * two revisions of a repository and writes a review-ready Markdown comment plus
 * the machine-readable `vi-history-suite/vi-semantic-pr-review@v1` artifact. It
 * wires the real container-backed comparison; all aggregation and rendering
 * logic lives in the pure, unit-tested `viSemanticPrReview` module, so this
 * entrypoint is thin and excluded from coverage like `runViSemanticMcpServer`.
 *
 * Usage:
 *   node out/cli/runViSemanticPrReview.js \
 *     --repository-root <path> --base <ref> --head <ref> \
 *     [--out <dir>] [--runtime-provider docker] [--container-image-version <v>]
 */

interface ParsedArgs {
  repositoryRoot: string;
  base: string;
  head: string;
  outDir?: string;
  provider?: 'host' | 'docker';
  containerImageVersion?: string;
}

function parseArgs(argv: string[]): ParsedArgs {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token.startsWith('--')) {
      const key = token.slice(2);
      const next = argv[index + 1];
      if (next !== undefined && !next.startsWith('--')) {
        values.set(key, next);
        index += 1;
      } else {
        values.set(key, 'true');
      }
    }
  }

  const repositoryRoot = values.get('repository-root');
  const base = values.get('base');
  const head = values.get('head');
  if (!repositoryRoot || !base || !head) {
    throw new Error('--repository-root, --base, and --head are required');
  }

  const provider = values.get('runtime-provider');
  if (provider !== undefined && provider !== 'host' && provider !== 'docker') {
    throw new Error('--runtime-provider must be "host" or "docker"');
  }

  return {
    repositoryRoot,
    base,
    head,
    outDir: values.get('out'),
    provider,
    containerImageVersion: values.get('container-image-version')
  };
}

export async function runViSemanticPrReviewCli(argv: string[]): Promise<number> {
  const args = parseArgs(argv);

  const input: ViSemanticPrReviewInput = {
    repositoryRoot: args.repositoryRoot,
    baseHash: args.base,
    selectedHash: args.head,
    runtime: args.provider
      ? { provider: args.provider, containerImageVersion: args.containerImageVersion }
      : undefined
  };

  const review = await buildViSemanticPrReview(input);
  const markdown = renderViSemanticPrReviewMarkdown(review);

  if (args.outDir) {
    await fs.mkdir(args.outDir, { recursive: true });
    await fs.writeFile(path.join(args.outDir, 'vi-semantic-pr-review.md'), markdown, 'utf8');
    await fs.writeFile(
      path.join(args.outDir, 'vi-semantic-pr-review.json'),
      `${JSON.stringify(review, null, 2)}\n`,
      'utf8'
    );
    process.stderr.write(
      `vi-semantic-pr-review: reviewed ${review.reviewedCount} of ${review.changedViCount} changed VI(s); wrote artifacts to ${args.outDir}\n`
    );
  } else {
    process.stdout.write(markdown);
  }

  return 0;
}

if (require.main === module) {
  runViSemanticPrReviewCli(process.argv.slice(2))
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error: unknown) => {
      process.stderr.write(
        `vi-semantic-pr-review error: ${error instanceof Error ? error.message : String(error)}\n`
      );
      process.exitCode = 1;
    });
}

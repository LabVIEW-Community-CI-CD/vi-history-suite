#!/usr/bin/env node
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import {
  buildViSemanticPrReview,
  renderViSemanticPrReviewMarkdown,
  renderViSemanticPrReviewPendingMarkdown,
  VI_SEMANTIC_PR_REVIEW_COMMENT_MARKER,
  VI_SEMANTIC_PR_REVIEW_SCHEMA,
  type ViSemanticPrReview
} from '../semantic/viSemanticPrReview';
import { planStickyPrComment, type ExistingPrComment } from '../semantic/stickyPrComment';

/**
 * Headless CLI for the VI semantic PR review: compares the VIs changed between
 * two revisions of a repository and produces a review-ready Markdown comment
 * plus the machine-readable `vi-history-suite/vi-semantic-pr-review@v1`
 * artifact. It can write the artifacts to disk, print them, and/or post the
 * review as a "sticky" pull-request comment (created once, then updated in
 * place on later runs) so an AI reviewer or CI job keeps a single living VI
 * summary on the PR. It wires the real container-backed comparison; all
 * aggregation, rendering, and sticky-comment planning live in pure, unit-tested
 * modules, so this entrypoint stays thin and is excluded from coverage like
 * `runViSemanticMcpServer`.
 *
 * Usage:
 *   node out/cli/runViSemanticPrReview.js \
 *     --repository-root <path> --base <ref> --head <ref> \
 *     [--out <dir>] [--runtime-provider docker] [--container-image-version <v>] \
 *     [--post-comment --pr <number> --repo <owner/repo>] [--announce-start] [--fail-on-incomplete]
 *
 * Alternatively, post a previously produced review artifact without recomputing
 * the (expensive, container-backed) comparison:
 *   node out/cli/runViSemanticPrReview.js \
 *     --from-file <review.json> --post-comment --pr <number> --repo <owner/repo>
 *
 * Posting requires a GitHub token in GH_TOKEN or GITHUB_TOKEN with permission to
 * comment on the target pull request.
 */

export interface ParsedArgs {
  repositoryRoot?: string;
  base?: string;
  head?: string;
  fromFile?: string;
  outDir?: string;
  provider?: 'host' | 'docker';
  containerImageVersion?: string;
  postComment: boolean;
  pr?: number;
  repo?: { owner: string; repo: string };
  failOnIncomplete: boolean;
  announceStart: boolean;
}

function parseRepo(value: string): { owner: string; repo: string } {
  const parts = value.split('/');
  if (parts.length !== 2 || parts[0].length === 0 || parts[1].length === 0) {
    throw new Error('--repo must be in "owner/repo" form');
  }
  return { owner: parts[0], repo: parts[1] };
}

export function parseArgs(argv: string[]): ParsedArgs {
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
  const fromFile = values.has('from-file') ? values.get('from-file') : undefined;
  if (fromFile === 'true') {
    throw new Error('--from-file requires a path to a review JSON file');
  }
  if (fromFile !== undefined) {
    // Post-from-artifact mode is mutually exclusive with the compute inputs so a
    // caller cannot accidentally both recompute and post a stale file.
    if (repositoryRoot !== undefined || base !== undefined || head !== undefined) {
      throw new Error('--from-file cannot be combined with --repository-root, --base, or --head');
    }
  } else if (!repositoryRoot || !base || !head) {
    throw new Error('--repository-root, --base, and --head are required (or use --from-file)');
  }

  const provider = values.get('runtime-provider');
  if (provider !== undefined && provider !== 'host' && provider !== 'docker') {
    throw new Error('--runtime-provider must be "host" or "docker"');
  }

  const postComment = values.get('post-comment') === 'true';
  const repo = values.has('repo') ? parseRepo(values.get('repo') as string) : undefined;
  let pr: number | undefined;
  const prRaw = values.get('pr');
  if (prRaw !== undefined && prRaw !== 'true') {
    // Full-string integer check: Number.parseInt would silently accept a numeric
    // prefix (e.g. "123abc" -> 123, "12.5" -> 12), which could post the sticky
    // comment to the wrong pull request. Require an all-digits, positive value.
    const parsed = /^\d+$/.test(prRaw) ? Number.parseInt(prRaw, 10) : Number.NaN;
    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw new Error('--pr must be a positive integer');
    }
    pr = parsed;
  }
  if (postComment && (pr === undefined || repo === undefined)) {
    throw new Error('--post-comment requires --pr <number> and --repo <owner/repo>');
  }
  const announceStart = values.get('announce-start') === 'true';
  if (announceStart) {
    // Announcing a "review in progress" comment only makes sense when we post
    // and when we are actually computing (a --from-file post is already the
    // final result, so a pending state would be pointless and racey).
    if (!postComment) {
      throw new Error('--announce-start requires --post-comment');
    }
    if (fromFile !== undefined) {
      throw new Error('--announce-start cannot be combined with --from-file');
    }
  }

  return {
    repositoryRoot,
    base,
    head,
    fromFile,
    outDir: values.get('out'),
    provider,
    containerImageVersion: values.get('container-image-version'),
    postComment,
    pr,
    repo,
    failOnIncomplete: values.get('fail-on-incomplete') === 'true',
    announceStart
  };
}

const GITHUB_API_BASE = process.env.GITHUB_API_URL ?? 'https://api.github.com';

interface GithubIssueComment {
  id: number;
  body?: string;
}

async function githubRequest(
  token: string,
  method: 'GET' | 'POST' | 'PATCH',
  url: string,
  body?: unknown
): Promise<Response> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'vi-history-suite-pr-review'
  };
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  const response = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  if (!response.ok) {
    const detail = (await response.text().catch(() => '')).slice(0, 500);
    throw new Error(
      `GitHub API ${method} ${url} failed: ${response.status} ${response.statusText}${
        detail ? ` - ${detail}` : ''
      }`
    );
  }
  return response;
}

async function listPullRequestComments(
  token: string,
  owner: string,
  repo: string,
  pr: number
): Promise<ExistingPrComment[]> {
  const comments: ExistingPrComment[] = [];
  const perPage = 100;
  for (let page = 1; page <= 20; page += 1) {
    const url = `${GITHUB_API_BASE}/repos/${owner}/${repo}/issues/${pr}/comments?per_page=${perPage}&page=${page}`;
    const response = await githubRequest(token, 'GET', url);
    const batch = (await response.json()) as GithubIssueComment[];
    for (const comment of batch) {
      comments.push({
        id: comment.id,
        body: typeof comment.body === 'string' ? comment.body : ''
      });
    }
    if (batch.length < perPage) {
      break;
    }
  }
  return comments;
}

async function postStickyReviewComment(
  args: ParsedArgs,
  markdown: string
): Promise<'create' | 'update'> {
  const token = process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN;
  if (!token) {
    throw new Error('--post-comment requires a GitHub token in GH_TOKEN or GITHUB_TOKEN');
  }
  const { owner, repo } = args.repo as { owner: string; repo: string };
  const pr = args.pr as number;

  const existing = await listPullRequestComments(token, owner, repo, pr);
  const plan = planStickyPrComment({
    existingComments: existing,
    marker: VI_SEMANTIC_PR_REVIEW_COMMENT_MARKER,
    body: markdown
  });

  if (plan.action === 'update') {
    await githubRequest(
      token,
      'PATCH',
      `${GITHUB_API_BASE}/repos/${owner}/${repo}/issues/comments/${plan.commentId}`,
      { body: plan.body }
    );
    return 'update';
  }
  await githubRequest(
    token,
    'POST',
    `${GITHUB_API_BASE}/repos/${owner}/${repo}/issues/${pr}/comments`,
    { body: plan.body }
  );
  return 'create';
}

/**
 * Loads a previously produced `vi-history-suite/vi-semantic-pr-review@v1`
 * artifact so the review can be posted without recomputing the (expensive,
 * container-backed) comparison. Fails closed before any GitHub write if the
 * file is missing, not valid JSON, or is not a v1 review, so a malformed file
 * can never be posted as an empty or bogus review comment.
 */
export async function loadReviewFromFile(filePath: string): Promise<ViSemanticPrReview> {
  let raw: string;
  try {
    raw = await fs.readFile(filePath, 'utf8');
  } catch {
    throw new Error(`--from-file could not read the review file: ${filePath}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`--from-file is not valid JSON: ${filePath}`);
  }
  const reject = (): never => {
    throw new Error(`--from-file is not a valid ${VI_SEMANTIC_PR_REVIEW_SCHEMA} review: ${filePath}`);
  };
  if (typeof parsed !== 'object' || parsed === null) {
    reject();
  }
  const candidate = parsed as Record<string, unknown>;
  // Validate every field the renderer and post path read, not just the schema
  // tag, so a truncated or hand-edited artifact can never be posted as a sticky
  // comment with an `undefined` narrative or bogus counts.
  const totals = candidate.totals as Record<string, unknown> | undefined;
  const entries = candidate.entries;
  const isValid =
    candidate.schema === VI_SEMANTIC_PR_REVIEW_SCHEMA &&
    typeof candidate.repositoryRoot === 'string' &&
    typeof candidate.baseHash === 'string' &&
    typeof candidate.selectedHash === 'string' &&
    typeof candidate.changedViCount === 'number' &&
    typeof candidate.reviewedCount === 'number' &&
    typeof candidate.narrative === 'string' &&
    Array.isArray(entries) &&
    // The number of entries must match the reported reviewedCount, and every
    // entry must have the minimal shape the renderer walks (a relativePath and
    // a known status), so a truncated `entries` (e.g. reviewedCount 2 with an
    // empty array) or a malformed entry is rejected before any GitHub write
    // rather than posting a summary-only or render-breaking comment.
    entries.length === candidate.reviewedCount &&
    entries.every(
      (entry) =>
        typeof entry === 'object' &&
        entry !== null &&
        typeof (entry as { relativePath?: unknown }).relativePath === 'string' &&
        ['completed', 'blocked-selection', 'blocked-preflight', 'blocked-runtime', 'failed'].includes(
          (entry as { status?: unknown }).status as string
        )
    ) &&
    typeof totals === 'object' &&
    totals !== null &&
    typeof totals.withDifferences === 'number' &&
    typeof totals.withoutDifferences === 'number' &&
    typeof totals.blockedOrFailed === 'number';
  if (!isValid) {
    reject();
  }
  return parsed as ViSemanticPrReview;
}

export async function runViSemanticPrReviewCli(argv: string[]): Promise<number> {
  const args = parseArgs(argv);

  // Post a "review in progress" sticky comment before the (multi-minute,
  // container-backed) comparison so a reviewer sees the review was triggered.
  // The final review upserts over it by the shared marker (one comment); if the
  // run never completes, the pending state stays as an actionable signal.
  if (args.announceStart) {
    await postStickyReviewComment(args, renderViSemanticPrReviewPendingMarkdown(args.head));
    const { owner, repo } = args.repo as { owner: string; repo: string };
    process.stderr.write(
      `vi-semantic-pr-review: announced review in progress on ${owner}/${repo}#${args.pr}\n`
    );
  }

  const review = args.fromFile !== undefined
    ? await loadReviewFromFile(args.fromFile)
    : await buildViSemanticPrReview({
        repositoryRoot: args.repositoryRoot as string,
        baseHash: args.base as string,
        selectedHash: args.head as string,
        runtime: args.provider
          ? { provider: args.provider, containerImageVersion: args.containerImageVersion }
          : undefined
      });
  const markdown = renderViSemanticPrReviewMarkdown(review);
  const summary = `reviewed ${review.reviewedCount} of ${review.changedViCount} changed VI(s)`;

  if (args.postComment) {
    const action = await postStickyReviewComment(args, markdown);
    const { owner, repo } = args.repo as { owner: string; repo: string };
    process.stderr.write(
      `vi-semantic-pr-review: ${
        action === 'update' ? 'updated' : 'created'
      } sticky comment on ${owner}/${repo}#${args.pr}; ${summary}\n`
    );
  }

  if (args.outDir) {
    await fs.mkdir(args.outDir, { recursive: true });
    await fs.writeFile(path.join(args.outDir, 'vi-semantic-pr-review.md'), markdown, 'utf8');
    await fs.writeFile(
      path.join(args.outDir, 'vi-semantic-pr-review.json'),
      `${JSON.stringify(review, null, 2)}\n`,
      'utf8'
    );
    process.stderr.write(
      `vi-semantic-pr-review: ${summary}; wrote artifacts to ${args.outDir}\n`
    );
  }

  if (!args.postComment && !args.outDir) {
    process.stdout.write(markdown);
  }

  // Opt-in non-zero exit when any VI could not be compared. The review comment
  // and artifacts are still produced above; this only affects the exit code so
  // CI can choose to fail a run with a partial review while keeping the default
  // (exit 0) behavior for reviewers who just want the comment. "Incomplete"
  // covers both blocked/failed VIs and VIs skipped by the maxVis cap
  // (reviewedCount < changedViCount), so a capped run does not slip through as a
  // success.
  const capGap = Math.max(0, review.changedViCount - review.reviewedCount);
  const incompleteCount = review.totals.blockedOrFailed + capGap;
  if (args.failOnIncomplete && incompleteCount > 0) {
    process.stderr.write(
      `vi-semantic-pr-review: ${incompleteCount} VI(s) not compared ` +
        `(${review.totals.blockedOrFailed} blocked/failed, ${capGap} skipped by cap); ` +
        `failing due to --fail-on-incomplete\n`
    );
    return 1;
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

#!/usr/bin/env node
import { createHash } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { errorMessage } from '../support/errorMessage';
import {
  buildViSemanticPrReview,
  planReviewReportCopies,
  renderViSemanticPrReviewMarkdown,
  renderViSemanticPrReviewPendingMarkdown,
  reviewReportFileName,
  VI_SEMANTIC_PR_REVIEW_COMMENT_MARKER,
  VI_SEMANTIC_PR_REVIEW_SCHEMA,
  type ReviewImageRef,
  type ViSemanticPrReview
} from '../semantic/viSemanticPrReview';
import { planStickyPrComment, type ExistingPrComment } from '../semantic/stickyPrComment';
import { collectOverviewImageUploads } from '../semantic/viComparisonReportImages';
import { planReviewCommitStatus } from '../semantic/viReviewCommitStatus';
import { parseNiComparisonReportFile } from '../dashboard/niComparisonReportParser';

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
 *     [--post-comment --pr <number> --repo <owner/repo>] [--announce-start] [--fail-on-incomplete] [--publish-images] [--commit-status]
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
  publishImages: boolean;
  assetsRef: string;
  commitStatus: boolean;
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

  const publishImages = values.get('publish-images') === 'true';
  if (publishImages) {
    // Publishing inline diff images uploads them to the target repo (an assets
    // branch) and embeds their URLs in the posted comment, so it only makes
    // sense when posting a freshly computed review to a known repo.
    if (!postComment || repo === undefined) {
      throw new Error('--publish-images requires --post-comment with --pr and --repo');
    }
    if (fromFile !== undefined) {
      throw new Error('--publish-images cannot be combined with --from-file');
    }
  }
  const assetsRefRaw = values.get('assets-ref');
  const assetsRef =
    assetsRefRaw !== undefined && assetsRefRaw !== 'true' ? assetsRefRaw : 'vi-review-assets';

  const commitStatus = values.get('commit-status') === 'true';
  if (commitStatus && repo === undefined) {
    throw new Error('--commit-status requires --repo <owner/repo>');
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
    announceStart,
    publishImages,
    assetsRef,
    commitStatus
  };
}

const GITHUB_API_BASE = process.env.GITHUB_API_URL ?? 'https://api.github.com';

interface GithubIssueComment {
  id: number;
  body?: string;
}

async function githubRequest(
  token: string,
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
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

async function ensureAssetsBranch(
  token: string,
  owner: string,
  repo: string,
  ref: string
): Promise<void> {
  const repoInfo = (await (
    await githubRequest(token, 'GET', `${GITHUB_API_BASE}/repos/${owner}/${repo}`)
  ).json()) as { default_branch?: string };
  const defaultBranch = repoInfo.default_branch ?? 'main';
  const headRef = (await (
    await githubRequest(
      token,
      'GET',
      `${GITHUB_API_BASE}/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(defaultBranch)}`
    )
  ).json()) as { object?: { sha?: string } };
  const sha = headRef.object?.sha;
  if (!sha) {
    throw new Error(`could not resolve ${owner}/${repo} default branch head for the assets branch`);
  }
  try {
    await githubRequest(token, 'POST', `${GITHUB_API_BASE}/repos/${owner}/${repo}/git/refs`, {
      ref: `refs/heads/${ref}`,
      sha
    });
  } catch (error) {
    // 422 = the assets branch already exists, expected on re-runs; anything else
    // is a real failure.
    if (!(error instanceof Error && error.message.includes('422'))) {
      throw error;
    }
  }
}

function encodeContentPath(filePath: string): string {
  return filePath.split('/').map(encodeURIComponent).join('/');
}

/**
 * Builds the stable, per-PR assets-branch path for a review diff image. The path
 * intentionally omits any per-run token (no timestamp) so re-running the review
 * on the same pull request overwrites the same objects instead of accumulating a
 * new directory each run, bounding the assets branch to one subtree per PR.
 */
export function buildReviewImageAssetPath(
  pr: number,
  safeVi: string,
  index: number,
  extension: string
): string {
  return `vi-review/${pr}/${safeVi}/${index}.${extension}`;
}

/**
 * Content-hash cache-buster token for a review image's embedded URL. Derived
 * from the image bytes so an unchanged image yields a stable (cacheable) URL
 * while changed bytes yield a new URL, defeating GitHub's URL-keyed image
 * proxy/browser cache when a stable per-PR storage path is overwritten.
 */
export function reviewImageCacheBuster(base64Content: string): string {
  return createHash('sha256').update(base64Content).digest('hex').slice(0, 16);
}

/**
 * Pure planner: given the review-image paths that already exist on the assets
 * branch and the paths the current run just produced, returns the existing
 * paths that are now stale (a VI no longer changed on this PR) and should be
 * pruned, keeping the stable per-PR subtree bounded to the latest run.
 */
export function planStaleReviewAssetDeletions(
  existingPaths: readonly string[],
  producedPaths: Iterable<string>
): string[] {
  const produced = new Set(producedPaths);
  return existingPaths.filter((path) => !produced.has(path));
}

async function uploadReviewImage(
  token: string,
  owner: string,
  repo: string,
  ref: string,
  filePath: string,
  base64: string
): Promise<string> {
  const encoded = encodeContentPath(filePath);
  const contentsUrl = `${GITHUB_API_BASE}/repos/${owner}/${repo}/contents/${encoded}`;
  // A stable per-PR path is reused across re-runs, so the object may already
  // exist. The contents API requires the current blob sha to overwrite a file
  // (a create-only PUT fails 422 once it is present), so look it up first and
  // fall through to a create when the file is absent (GET 404).
  let existingSha: string | undefined;
  try {
    const existing = (await (
      await githubRequest(token, 'GET', `${contentsUrl}?ref=${encodeURIComponent(ref)}`)
    ).json()) as { sha?: string };
    existingSha = typeof existing.sha === 'string' ? existing.sha : undefined;
  } catch {
    existingSha = undefined;
  }
  const body: Record<string, unknown> = {
    message: `vi-semantic-pr-review: ${existingSha ? 'update' : 'add'} ${filePath}`,
    content: base64,
    branch: ref
  };
  if (existingSha !== undefined) {
    body.sha = existingSha;
  }
  await githubRequest(token, 'PUT', contentsUrl, body);
  // Stable per-PR paths mean an overwritten image keeps the same raw URL, and
  // GitHub's image proxy/browsers cache by URL. Append a content-hash buster so
  // a changed image forces a fresh fetch while an unchanged image keeps a
  // stable (cacheable) URL.
  const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${encoded}`;
  return `${rawUrl}?v=${reviewImageCacheBuster(base64)}`;
}

/**
 * Best-effort prune of stale review images for a PR: lists the current
 * `vi-review/<pr>/` tree on the assets branch and deletes any blob the current
 * run did not produce (a VI that stopped changing on this PR), so the stable
 * per-PR subtree stays bounded to the latest review. Never throws into the
 * caller; a listing or deletion failure simply leaves the tree as-is.
 */
async function pruneStaleReviewAssets(
  token: string,
  owner: string,
  repo: string,
  ref: string,
  pr: number,
  producedPaths: ReadonlySet<string>
): Promise<void> {
  const prefix = `vi-review/${pr}/`;
  let tree: { tree?: Array<{ path?: string; type?: string; sha?: string }> };
  try {
    tree = (await (
      await githubRequest(
        token,
        'GET',
        `${GITHUB_API_BASE}/repos/${owner}/${repo}/git/trees/${encodeURIComponent(ref)}?recursive=1`
      )
    ).json()) as { tree?: Array<{ path?: string; type?: string; sha?: string }> };
  } catch {
    return;
  }
  const existing = (tree.tree ?? []).filter(
    (entry): entry is { path: string; type: string; sha: string } =>
      entry.type === 'blob' &&
      typeof entry.path === 'string' &&
      entry.path.startsWith(prefix) &&
      typeof entry.sha === 'string'
  );
  const stale = new Set(
    planStaleReviewAssetDeletions(
      existing.map((entry) => entry.path),
      producedPaths
    )
  );
  for (const entry of existing) {
    if (!stale.has(entry.path)) {
      continue;
    }
    try {
      await githubRequest(
        token,
        'DELETE',
        `${GITHUB_API_BASE}/repos/${owner}/${repo}/contents/${encodeContentPath(entry.path)}`,
        {
          message: `vi-semantic-pr-review: prune stale ${entry.path}`,
          sha: entry.sha,
          branch: ref
        }
      );
    } catch {
      // Best-effort: a failed prune must never block the review.
    }
  }
}

/**
 * Uploads each changed VI's overview difference images to an assets branch in
 * the target repository and returns a map of VI -> hosted image refs for the
 * renderer to embed inline (GitHub strips `data:` image URIs from comments, so
 * the images must be hosted at a fetchable URL). Requires a token with
 * `contents: write`. Best-effort per image/VI: a hosting hiccup is skipped so it
 * never blocks the textual review from posting.
 */
async function publishReviewImages(
  args: ParsedArgs,
  review: ViSemanticPrReview
): Promise<Map<string, ReviewImageRef[]>> {
  const token = process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN;
  if (!token) {
    throw new Error('--publish-images requires a GitHub token in GH_TOKEN or GITHUB_TOKEN');
  }
  const { owner, repo } = args.repo as { owner: string; repo: string };
  const pr = args.pr as number;
  const ref = args.assetsRef;
  const byVi = new Map<string, ReviewImageRef[]>();
  const producedPaths = new Set<string>();
  await ensureAssetsBranch(token, owner, repo, ref);
  for (const entry of review.entries) {
    if (
      entry.status !== 'completed' ||
      !entry.hasDifferences ||
      typeof entry.reportFilePath !== 'string'
    ) {
      continue;
    }
    let uploads;
    try {
      const parsed = await parseNiComparisonReportFile(entry.reportFilePath);
      uploads = collectOverviewImageUploads(parsed.overviewSections);
    } catch {
      continue;
    }
    if (uploads.length === 0) {
      continue;
    }
    const safeVi = reviewReportFileName(entry.relativePath).replace(/\.html$/, '');
    const refs: ReviewImageRef[] = [];
    for (let index = 0; index < uploads.length; index += 1) {
      const upload = uploads[index];
      const extension = upload.contentType.split('/')[1]?.replace(/[^a-z0-9]/gi, '') || 'png';
      const filePath = buildReviewImageAssetPath(pr, safeVi, index, extension);
      try {
        const url = await uploadReviewImage(token, owner, repo, ref, filePath, upload.base64);
        refs.push({ caption: upload.caption, url });
        producedPaths.add(filePath);
      } catch {
        // Best-effort: skip an image that fails to upload rather than aborting.
      }
    }
    if (refs.length > 0) {
      byVi.set(entry.relativePath, refs);
    }
  }
  // Prune images from VIs no longer changed on this PR (best-effort), keeping
  // the stable per-PR subtree bounded to the current run's produced images.
  // Runs unconditionally: an empty produced set means the rerun surfaced no VI
  // differences, so every prior blob is stale and the subtree must be emptied
  // (the planner and prune are safe for the empty case, and the tree listing
  // short-circuits when nothing exists).
  await pruneStaleReviewAssets(token, owner, repo, ref, pr, producedPaths);
  return byVi;
}

const COMMIT_SHA = /^[0-9a-f]{40}$/i;

/**
 * Posts a "VI Semantic Review" commit status on the reviewed PR's head commit,
 * so the review is a branch-protection-gateable status on the pull request. A
 * commit status (unlike a check run, which only a GitHub App can create) works
 * with a plain token that has `statuses: write`, matching this project's
 * PAT-based token model. Requires a full 40-character head commit SHA (the
 * review model's selectedHash). Throws on misconfiguration; the caller treats it
 * best-effort so a status failure never blocks the textual review.
 */
async function postReviewCommitStatus(
  args: ParsedArgs,
  review: ViSemanticPrReview
): Promise<string> {
  const token = process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN;
  if (!token) {
    throw new Error('--commit-status requires a GitHub token in GH_TOKEN or GITHUB_TOKEN');
  }
  const { owner, repo } = args.repo as { owner: string; repo: string };
  const headSha = review.selectedHash;
  if (!COMMIT_SHA.test(headSha)) {
    throw new Error(
      `--commit-status requires a 40-character commit SHA as the head (got "${headSha}"); pass --head <sha>`
    );
  }
  const plan = planReviewCommitStatus(review, { failOnIncomplete: args.failOnIncomplete });
  await githubRequest(
    token,
    'POST',
    `${GITHUB_API_BASE}/repos/${owner}/${repo}/statuses/${headSha}`,
    { state: plan.state, context: plan.context, description: plan.description }
  );
  return plan.state;
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
  let imagesByVi: Map<string, ReviewImageRef[]> | undefined;
  if (args.publishImages && args.fromFile === undefined) {
    imagesByVi = await publishReviewImages(args, review);
    const imageCount = [...imagesByVi.values()].reduce((total, refs) => total + refs.length, 0);
    const { owner, repo } = args.repo as { owner: string; repo: string };
    process.stderr.write(
      `vi-semantic-pr-review: published ${imageCount} diff image(s) to ${owner}/${repo}@${args.assetsRef}\n`
    );
  }
  const markdown = renderViSemanticPrReviewMarkdown(review, imagesByVi ? { imagesByVi } : {});
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

  if (args.commitStatus) {
    try {
      const state = await postReviewCommitStatus(args, review);
      const { owner, repo } = args.repo as { owner: string; repo: string };
      process.stderr.write(
        `vi-semantic-pr-review: posted "${state}" commit status on ${owner}/${repo}@${review.selectedHash.slice(
          0,
          8
        )}\n`
      );
    } catch (error) {
      // Best-effort: a status failure must not block the textual review.
      process.stderr.write(
        `vi-semantic-pr-review: commit status skipped: ${
          errorMessage(error)
        }\n`
      );
    }
  }

  if (args.outDir) {
    await fs.mkdir(args.outDir, { recursive: true });
    await fs.writeFile(path.join(args.outDir, 'vi-semantic-pr-review.md'), markdown, 'utf8');
    await fs.writeFile(
      path.join(args.outDir, 'vi-semantic-pr-review.json'),
      `${JSON.stringify(review, null, 2)}\n`,
      'utf8'
    );
    // Copy the per-VI self-contained comparison reports (which embed the
    // rendered block-diagram/front-panel difference images) into reports/ so
    // the uploaded review artifact carries the full visual diff, not just the
    // narrative. Skipped on a --from-file post, whose saved report paths are
    // stale temp locations from the original run. (VHS-REQ-661.10)
    let copiedReports = 0;
    if (args.fromFile === undefined) {
      const reportCopies = planReviewReportCopies(review);
      if (reportCopies.length > 0) {
        const reportsDir = path.join(args.outDir, 'reports');
        await fs.mkdir(reportsDir, { recursive: true });
        for (const copy of reportCopies) {
          try {
            await fs.copyFile(copy.reportFilePath, path.join(reportsDir, copy.fileName));
            copiedReports += 1;
          } catch {
            // The report file may have been cleaned up (temp); skip it rather
            // than failing the whole run over a missing visual report.
          }
        }
      }
    }
    process.stderr.write(
      `vi-semantic-pr-review: ${summary}; wrote artifacts to ${args.outDir}` +
        `${copiedReports > 0 ? ` (${copiedReports} visual report(s) in reports/)` : ''}\n`
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
        `vi-semantic-pr-review error: ${errorMessage(error)}\n`
      );
      process.exitCode = 1;
    });
}

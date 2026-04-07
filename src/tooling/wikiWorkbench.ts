import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import {
  readProgramRepoJumpMap,
  resolveProgramRepoDescriptors,
  ResolvedProgramRepoDescriptor
} from './programRepoJump';

export const WIKI_WORKBENCH_MANIFEST_RELATIVE_PATH = path.join(
  '.cache',
  'wiki-workbench',
  'latest-workbench.json'
);

type WikiWorkbenchCommand =
  | 'doctor'
  | 'discover'
  | 'validate-ledger'
  | 'plan-pages'
  | 'stage-page'
  | 'prepare-publication'
  | 'sync-bundled-docs';

export interface WikiWorkbenchCliArgs {
  command: WikiWorkbenchCommand;
  pageId?: string;
  format: 'text' | 'json';
  repoRoot?: string;
  workbenchRoot?: string;
  helpRequested: boolean;
}

export interface WikiPublicationPage {
  id: string;
  title: string;
  wikiPath: string;
  wikiFileName: string;
  status: string;
  publishedDate?: string;
  wikiCommit?: string;
  primaryAuthority: string[];
}

export interface WikiPublicationNextPage {
  id: string;
  title: string;
  primaryAuthority: string[];
  secondaryAuthority?: string[];
}

export interface WikiPublicationLedger {
  generatedFor: string;
  pages: WikiPublicationPage[];
  nextPage?: WikiPublicationNextPage;
}

export interface WikiWorkbenchTopology {
  repoRoot: string;
  workbenchRoot: string;
  authorityRepo: RepoSurface;
  wikiRepo: RepoSurface;
  experimentRepo?: RepoSurface;
  ledgerJsonPath: string;
  ledgerMarkdownPath: string;
  authorityMapPath: string;
  bundleRoot: string;
  bundlePagesRoot: string;
  stagingRoot: string;
  publicationPrepRoot: string;
}

export interface RepoSurface {
  id: string;
  role: string;
  localPath: string;
  exists: boolean;
  expectedRemote?: string;
  actualRemote?: string;
  remoteMatchesExpected?: boolean;
}

export interface WikiWorkbenchIssue {
  severity: 'error' | 'warning';
  code: string;
  message: string;
  path?: string;
}

export interface WikiWorkbenchPagePlan {
  id: string;
  title: string;
  status: 'published' | 'next';
  wikiPath: string;
  wikiFileName: string;
  currentWikiPath: string;
  currentWikiExists: boolean;
  primaryAuthority: string[];
  secondaryAuthority: string[];
}

export interface WikiWorkbenchStageReceipt {
  schema: 'vi-history-suite/wiki-workbench-stage-page@v1';
  recordedAt: string;
  page: WikiWorkbenchPagePlan;
  stageDirectory: string;
  draftFilePath: string;
  currentWikiCopyPath?: string;
  authorityCopies: string[];
}

export interface WikiWorkbenchPublicationPrepReceipt {
  schema: 'vi-history-suite/wiki-workbench-publication-prep@v1';
  recordedAt: string;
  page?: WikiWorkbenchPagePlan;
  stageReceiptPath?: string;
  stageDirectory?: string;
  draftFilePath?: string;
  targetWikiFilePath?: string;
  currentWikiExists?: boolean;
  publicationMode: 'new-page' | 'refresh-existing-page' | 'no-op-complete';
  ledgerUpdateRequired: boolean;
  bundledDocsCommand?: string;
  completionState: 'prepared' | 'already-complete';
  message: string;
}

export interface WikiWorkbenchManifest {
  schema: 'vi-history-suite/wiki-workbench@v1';
  recordedAt: string;
  command: WikiWorkbenchCommand;
  repoRoot: string;
  workbenchRoot: string;
  authorityRepo: RepoSurface;
  wikiRepo: RepoSurface;
  experimentRepo?: RepoSurface;
  ledgerJsonPath: string;
  ledgerMarkdownPath: string;
  bundleRoot: string;
  result:
    | {
        type: 'doctor' | 'discover';
        issues: WikiWorkbenchIssue[];
      }
    | {
        type: 'validate-ledger';
        issues: WikiWorkbenchIssue[];
      }
    | {
        type: 'plan-pages';
        pages: WikiWorkbenchPagePlan[];
      }
    | {
        type: 'stage-page';
        receiptPath: string;
      }
    | {
        type: 'prepare-publication';
        receiptPath: string;
      }
    | {
        type: 'sync-bundled-docs';
        command: string;
      };
}

export interface ResolveWikiWorkbenchTopologyDeps {
  env?: NodeJS.ProcessEnv;
  getGitRemote?: (repoPath: string) => string | undefined;
}

export interface WikiWorkbenchRunnerDeps extends ResolveWikiWorkbenchTopologyDeps {
  now?: () => Date;
  mkdir?: typeof fs.mkdir;
  writeFile?: typeof fs.writeFile;
  readFile?: typeof fs.readFile;
  copyFile?: typeof fs.copyFile;
  rm?: typeof fs.rm;
  access?: typeof fs.access;
  runBundleSync?: (options: {
    repoRoot: string;
    wikiRepoRoot: string;
    ledgerPath: string;
    bundleRoot: string;
  }) => void;
}

interface RetainedDirectoryOptions {
  preferredDirectory: string;
  recoveryRoot: string;
  pageId: string;
  mkdir: typeof fs.mkdir;
  rm: typeof fs.rm;
  now: () => Date;
}

export function getWikiWorkbenchUsage(): string {
  return [
    'Usage: runWikiWorkbench <command> [--page-id <id>] [--format text|json] [--repo-root <path>] [--workbench-root <path>] [--help]',
    '',
    'Commands:',
    '  doctor                Resolve authority/wiki topology and report readiness issues.',
    '  discover              Write a retained topology manifest and print it.',
    '  validate-ledger       Fail closed on publication-ledger or authority-path drift.',
    '  plan-pages            List published pages plus the next staged page.',
    '  stage-page            Materialize a page-authority staging bundle under .cache/wiki-workbench.',
    '  prepare-publication   Stage the target page and retain a publication-prep receipt.',
    '  sync-bundled-docs     Refresh resources/bundled-docs from the resolved wiki repo.',
    '',
    'Options:',
    '  --page-id <id>        Page id for stage-page or prepare-publication. Defaults to nextPage.',
    '  --format <text|json>  Output format. Defaults to text.',
    '  --repo-root <path>    Override the authority repo root.',
    '  --workbench-root <p>  Override the retained workbench root.',
    '  --help                Print this help text and exit.'
  ].join('\n');
}

export function parseWikiWorkbenchArgs(argv: string[]): WikiWorkbenchCliArgs {
  let command: WikiWorkbenchCommand | undefined;
  let pageId: string | undefined;
  let format: 'text' | 'json' = 'text';
  let repoRoot: string | undefined;
  let workbenchRoot: string | undefined;
  let helpRequested = false;

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    const requireValue = (flag: string): string => {
      const candidate = argv[index + 1];
      if (!candidate || candidate.startsWith('--')) {
        throw new Error(`Missing value for ${flag}.\n\n${getWikiWorkbenchUsage()}`);
      }
      index += 1;
      return candidate;
    };

    if (current === '--help' || current === '-h') {
      helpRequested = true;
      continue;
    }

    if (current === '--page-id') {
      pageId = requireValue('--page-id');
      continue;
    }

    if (current === '--format') {
      const candidate = requireValue('--format');
      if (candidate !== 'text' && candidate !== 'json') {
        throw new Error(`Unsupported --format value: ${candidate}\n\n${getWikiWorkbenchUsage()}`);
      }
      format = candidate;
      continue;
    }

    if (current === '--repo-root') {
      repoRoot = requireValue('--repo-root');
      continue;
    }

    if (current === '--workbench-root') {
      workbenchRoot = requireValue('--workbench-root');
      continue;
    }

    if (!current.startsWith('--') && command === undefined) {
      if (
        current === 'doctor' ||
        current === 'discover' ||
        current === 'validate-ledger' ||
        current === 'plan-pages' ||
        current === 'stage-page' ||
        current === 'prepare-publication' ||
        current === 'sync-bundled-docs'
      ) {
        command = current;
        continue;
      }
    }

    throw new Error(`Unknown argument: ${current}\n\n${getWikiWorkbenchUsage()}`);
  }

  return {
    command: command ?? 'doctor',
    pageId,
    format,
    repoRoot,
    workbenchRoot,
    helpRequested
  };
}

export function resolveWikiWorkbenchTopology(
  repoRoot: string,
  workbenchRoot: string | undefined,
  deps: ResolveWikiWorkbenchTopologyDeps = {}
): WikiWorkbenchTopology {
  const normalizedRepoRoot = path.resolve(repoRoot);
  const map = readProgramRepoJumpMap(normalizedRepoRoot);
  const resolvedRepos = resolveProgramRepoDescriptors(map, normalizedRepoRoot, undefined, deps.env);

  const authorityRepo = buildRepoSurface(
    expectResolvedRepo(resolvedRepos, 'vi-history-suite'),
    deps.getGitRemote
  );
  const wikiRepo = buildRepoSurface(expectResolvedRepo(resolvedRepos, 'vi-history-suite.wiki'), deps.getGitRemote);
  const experimentRepoDescriptor = resolvedRepos.find((repo) => repo.id === 'vi-history-suite-source-experiments');
  const experimentRepo = experimentRepoDescriptor
    ? buildRepoSurface(experimentRepoDescriptor, deps.getGitRemote)
    : undefined;

  const resolvedWorkbenchRoot =
    workbenchRoot === undefined
      ? path.join(normalizedRepoRoot, '.cache', 'wiki-workbench')
      : path.resolve(workbenchRoot);

  return {
    repoRoot: normalizedRepoRoot,
    workbenchRoot: resolvedWorkbenchRoot,
    authorityRepo,
    wikiRepo,
    experimentRepo,
    ledgerJsonPath: path.join(normalizedRepoRoot, 'docs', 'product', 'wiki-publication-ledger.json'),
    ledgerMarkdownPath: path.join(normalizedRepoRoot, 'docs', 'product', 'wiki-publication-ledger.md'),
    authorityMapPath: path.join(normalizedRepoRoot, 'docs', 'product', 'wiki-authority-map.md'),
    bundleRoot: path.join(normalizedRepoRoot, 'resources', 'bundled-docs'),
    bundlePagesRoot: path.join(normalizedRepoRoot, 'resources', 'bundled-docs', 'pages'),
    stagingRoot: path.join(resolvedWorkbenchRoot, 'staging'),
    publicationPrepRoot: path.join(resolvedWorkbenchRoot, 'publication-prep')
  };
}

function buildRepoSurface(
  repo: ResolvedProgramRepoDescriptor,
  getGitRemote: ((repoPath: string) => string | undefined) | undefined
): RepoSurface {
  const actualRemote = getGitRemote?.(repo.localPathResolved) ?? defaultGitRemote(repo.localPathResolved);
  const normalizedActualRemote = actualRemote ? normalizeRemoteForComparison(actualRemote) : undefined;
  const normalizedExpectedRemote = repo.expectedRemote
    ? normalizeRemoteForComparison(repo.expectedRemote)
    : undefined;
  return {
    id: repo.id,
    role: repo.role,
    localPath: repo.localPathResolved,
    exists: repo.localPathExists,
    expectedRemote: repo.expectedRemote,
    actualRemote,
    remoteMatchesExpected:
      normalizedActualRemote === undefined || normalizedExpectedRemote === undefined
        ? undefined
        : normalizedActualRemote === normalizedExpectedRemote
  };
}

function defaultGitRemote(repoPath: string): string | undefined {
  try {
    return execFileSync('git', ['-C', repoPath, 'remote', 'get-url', 'origin'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
  } catch {
    return undefined;
  }
}

function normalizeRemoteForComparison(remote: string): string {
  const trimmed = remote.trim();
  if (trimmed.startsWith('https://') || trimmed.startsWith('http://')) {
    try {
      const parsed = new URL(trimmed);
      parsed.username = '';
      parsed.password = '';
      return parsed.toString().replace(/\/$/, '');
    } catch {
      return trimmed;
    }
  }

  return trimmed;
}

function expectResolvedRepo(
  repos: ResolvedProgramRepoDescriptor[],
  id: string
): ResolvedProgramRepoDescriptor {
  const repo = repos.find((candidate) => candidate.id === id);
  if (!repo) {
    throw new Error(`Program repo jump map is missing required repo id: ${id}`);
  }

  return repo;
}

export async function readWikiPublicationLedger(ledgerPath: string, readFile: typeof fs.readFile = fs.readFile): Promise<WikiPublicationLedger> {
  const raw = await readFile(ledgerPath, 'utf8');
  return JSON.parse(raw) as WikiPublicationLedger;
}

export function buildWikiWorkbenchIssues(
  topology: WikiWorkbenchTopology,
  ledger: WikiPublicationLedger
): WikiWorkbenchIssue[] {
  const issues: WikiWorkbenchIssue[] = [];

  for (const repo of [topology.authorityRepo, topology.wikiRepo]) {
    if (!repo.exists) {
      issues.push({
        severity: 'error',
        code: 'missing-repo',
        message: `Required repo surface ${repo.id} is missing at ${repo.localPath}.`,
        path: repo.localPath
      });
    }

    if (repo.remoteMatchesExpected === false && repo.expectedRemote && repo.actualRemote) {
      issues.push({
        severity: 'error',
        code: 'remote-mismatch',
        message: `Repo ${repo.id} resolved ${repo.actualRemote} but expected ${repo.expectedRemote}.`,
        path: repo.localPath
      });
    }
  }

  if (ledger.generatedFor !== 'vi-history-suite') {
    issues.push({
      severity: 'error',
      code: 'unexpected-ledger-target',
      message: `Publication ledger is for ${ledger.generatedFor}, expected vi-history-suite.`,
      path: topology.ledgerJsonPath
    });
  }

  const seenPageIds = new Set<string>();
  const seenWikiPaths = new Set<string>();
  const seenWikiFiles = new Set<string>();
  for (const page of ledger.pages) {
    if (seenPageIds.has(page.id)) {
      issues.push({
        severity: 'error',
        code: 'duplicate-page-id',
        message: `Ledger page id ${page.id} is duplicated.`,
        path: topology.ledgerJsonPath
      });
    }
    seenPageIds.add(page.id);

    if (seenWikiPaths.has(page.wikiPath)) {
      issues.push({
        severity: 'error',
        code: 'duplicate-wiki-path',
        message: `Ledger wiki path ${page.wikiPath} is duplicated.`,
        path: topology.ledgerJsonPath
      });
    }
    seenWikiPaths.add(page.wikiPath);

    if (seenWikiFiles.has(page.wikiFileName)) {
      issues.push({
        severity: 'error',
        code: 'duplicate-wiki-file',
        message: `Ledger wiki file ${page.wikiFileName} is duplicated.`,
        path: topology.ledgerJsonPath
      });
    }
    seenWikiFiles.add(page.wikiFileName);
  }

  if (ledger.nextPage && seenPageIds.has(ledger.nextPage.id)) {
    issues.push({
      severity: 'error',
      code: 'duplicate-next-page-id',
      message: `nextPage id ${ledger.nextPage.id} duplicates a published page id.`,
      path: topology.ledgerJsonPath
    });
  }

  return issues;
}

export async function validateWikiWorkbenchLedger(
  topology: WikiWorkbenchTopology,
  ledger: WikiPublicationLedger,
  deps: {
    access?: typeof fs.access;
  } = {}
): Promise<WikiWorkbenchIssue[]> {
  const issues = buildWikiWorkbenchIssues(topology, ledger);
  const access = deps.access ?? fs.access;

  for (const currentPath of [
    topology.ledgerJsonPath,
    topology.ledgerMarkdownPath,
    topology.authorityMapPath
  ]) {
    try {
      await access(currentPath);
    } catch {
      issues.push({
        severity: 'error',
        code: 'missing-control-file',
        message: `Required workbench control file is missing: ${currentPath}.`,
        path: currentPath
      });
    }
  }

  for (const page of ledger.pages) {
    for (const authorityPath of page.primaryAuthority) {
      const fullAuthorityPath = path.join(topology.repoRoot, authorityPath);
      try {
        await access(fullAuthorityPath);
      } catch {
        issues.push({
          severity: 'error',
          code: 'missing-authority-doc',
          message: `Published page ${page.id} references missing authority doc ${authorityPath}.`,
          path: fullAuthorityPath
        });
      }
    }

    const wikiFilePath = path.join(topology.wikiRepo.localPath, page.wikiFileName);
    try {
      await access(wikiFilePath);
    } catch {
      issues.push({
        severity: 'error',
        code: 'missing-wiki-page',
        message: `Published page ${page.id} is missing wiki file ${page.wikiFileName}.`,
        path: wikiFilePath
      });
    }
  }

  for (const authorityPath of [
    ...(ledger.nextPage?.primaryAuthority ?? []),
    ...(ledger.nextPage?.secondaryAuthority ?? [])
  ]) {
    const fullAuthorityPath = path.join(topology.repoRoot, authorityPath);
    try {
      await access(fullAuthorityPath);
    } catch {
      issues.push({
        severity: 'error',
        code: 'missing-next-page-authority-doc',
        message: `Next page references missing authority doc ${authorityPath}.`,
        path: fullAuthorityPath
      });
    }
  }

  return issues;
}

export function planWikiPages(
  topology: WikiWorkbenchTopology,
  ledger: WikiPublicationLedger
): WikiWorkbenchPagePlan[] {
  const published = ledger.pages.map((page) => ({
    id: page.id,
    title: page.title,
    status: 'published' as const,
    wikiPath: page.wikiPath,
    wikiFileName: page.wikiFileName,
    currentWikiPath: path.join(topology.wikiRepo.localPath, page.wikiFileName),
    currentWikiExists: topology.wikiRepo.exists,
    primaryAuthority: [...page.primaryAuthority],
    secondaryAuthority: []
  }));

  if (!ledger.nextPage) {
    return published;
  }

  return [
    ...published,
    {
      id: ledger.nextPage.id,
      title: ledger.nextPage.title,
      status: 'next',
      wikiPath: ledger.nextPage.title.replaceAll(' ', '-'),
      wikiFileName: `${ledger.nextPage.title.replaceAll(' ', '-')}.md`,
      currentWikiPath: path.join(
        topology.wikiRepo.localPath,
        `${ledger.nextPage.title.replaceAll(' ', '-')}.md`
      ),
      currentWikiExists: false,
      primaryAuthority: [...ledger.nextPage.primaryAuthority],
      secondaryAuthority: [...(ledger.nextPage.secondaryAuthority ?? [])]
    }
  ];
}

export function resolveWikiWorkbenchPage(
  topology: WikiWorkbenchTopology,
  ledger: WikiPublicationLedger,
  pageId: string | undefined
): WikiWorkbenchPagePlan {
  const pages = planWikiPages(topology, ledger);
  const resolvedPageId = pageId ?? ledger.nextPage?.id;
  if (!resolvedPageId) {
    throw new Error('No target page id was provided and the ledger has no nextPage.');
  }

  const page = pages.find((candidate) => candidate.id === resolvedPageId);
  if (!page) {
    throw new Error(`Unknown wiki workbench page id: ${resolvedPageId}`);
  }

  return page;
}

export async function stageWikiWorkbenchPage(
  topology: WikiWorkbenchTopology,
  ledger: WikiPublicationLedger,
  pageId: string | undefined,
  deps: WikiWorkbenchRunnerDeps = {}
): Promise<{ receiptPath: string; receipt: WikiWorkbenchStageReceipt }> {
  const mkdir = deps.mkdir ?? fs.mkdir;
  const writeFile = deps.writeFile ?? fs.writeFile;
  const readFile = deps.readFile ?? fs.readFile;
  const copyFile = deps.copyFile ?? fs.copyFile;
  const rm = deps.rm ?? fs.rm;
  const now = deps.now ?? (() => new Date());
  const page = resolveWikiWorkbenchPage(topology, ledger, pageId);
  const stageDirectory = await prepareRetainedDirectory({
    preferredDirectory: path.join(topology.stagingRoot, page.id),
    recoveryRoot: path.join(topology.workbenchRoot, 'staging-runs'),
    pageId: page.id,
    mkdir,
    rm,
    now
  });
  const authorityRoot = path.join(stageDirectory, 'authority');
  const wikiCurrentRoot = path.join(stageDirectory, 'wiki-current');
  const draftFilePath = path.join(stageDirectory, 'wiki-draft.md');

  await mkdir(authorityRoot, { recursive: true });
  await mkdir(wikiCurrentRoot, { recursive: true });

  const authorityCopies: string[] = [];
  for (const authorityPath of [...page.primaryAuthority, ...page.secondaryAuthority]) {
    const sourcePath = path.join(topology.repoRoot, authorityPath);
    const destinationPath = path.join(authorityRoot, authorityPath);
    await mkdir(path.dirname(destinationPath), { recursive: true });
    await copyFile(sourcePath, destinationPath);
    authorityCopies.push(destinationPath);
  }

  let currentWikiCopyPath: string | undefined;
  let draftMarkdown: string;
  try {
    draftMarkdown = await readFile(page.currentWikiPath, 'utf8');
    currentWikiCopyPath = path.join(wikiCurrentRoot, page.wikiFileName);
    await copyFile(page.currentWikiPath, currentWikiCopyPath);
  } catch {
    draftMarkdown = buildWikiDraftTemplate(page);
  }

  await writeFile(draftFilePath, draftMarkdown, 'utf8');

  const receipt: WikiWorkbenchStageReceipt = {
    schema: 'vi-history-suite/wiki-workbench-stage-page@v1',
    recordedAt: now().toISOString(),
    page,
    stageDirectory,
    draftFilePath,
    currentWikiCopyPath,
    authorityCopies
  };

  const receiptPath = path.join(stageDirectory, 'stage-receipt.json');
  await writeFile(receiptPath, JSON.stringify(receipt, null, 2), 'utf8');
  await writeFile(path.join(stageDirectory, 'AUTHORITY.md'), buildAuthoritySummary(page), 'utf8');

  return { receiptPath, receipt };
}

function buildWikiDraftTemplate(page: WikiWorkbenchPagePlan): string {
  if (page.id === 'documentation-workbench') {
    return buildDocumentationWorkbenchDraft(page);
  }

  return [
    `# ${page.title}`,
    '',
    '> Derived from governed documentation in `vi-history-suite`.',
    '',
    '## Authority',
    ...page.primaryAuthority.map((authorityPath) => `- ${authorityPath}`),
    ...(page.secondaryAuthority.length > 0
      ? ['', '## Secondary Authority', ...page.secondaryAuthority.map((authorityPath) => `- ${authorityPath}`)]
      : []),
    '',
    '## Draft',
    '',
    '<!-- Replace this section with wiki-ready prose derived from the authority docs above. -->',
    ''
  ].join('\n');
}

function buildDocumentationWorkbenchDraft(page: WikiWorkbenchPagePlan): string {
  const authorityLinks = page.primaryAuthority.map((authorityPath) =>
    `- [\`${authorityPath}\`](https://gitlab.com/svelderrainruiz/vi-history-suite/-/blob/main/${authorityPath})`
  );
  const secondaryLinks = page.secondaryAuthority.map((authorityPath) =>
    `- [\`${authorityPath}\`](https://gitlab.com/svelderrainruiz/vi-history-suite/-/blob/main/${authorityPath})`
  );

  return [
    `# ${page.title}`,
    '',
    'This page is derived from governed repository documentation, not from source',
    'code or prior chat state. The current authority surfaces for this page are:',
    '',
    ...authorityLinks,
    ...(secondaryLinks.length > 0
      ? ['', 'Secondary authority supporting this draft:', ...secondaryLinks]
      : []),
    '',
    '## Purpose',
    '',
    '`vi-history-suite` treats documentation-package work as a governed product',
    'surface. The documentation workbench exists to iterate on requirements,',
    'ADRs, release-readiness docs, ship-control docs, and authority-driven wiki',
    'preparation from one repeatable environment.',
    '',
    '## Operating Model',
    '',
    '- `vi-history-suite` remains the authority repo',
    '- `vi-history-suite.wiki` remains a derived reader surface',
    '- the workbench resolves authority repo, wiki repo, and companion repo',
    '  topology from the governed repo-jump map',
    '- the workbench retains stage bundles, publication-prep receipts, and',
    '  latest-workbench manifests instead of depending on chat memory',
    '',
    '## Workbench Surfaces',
    '',
    'Current governed commands include:',
    '',
    '- `npm run wiki:workbench:doctor`',
    '- `npm run wiki:workbench:plan`',
    '- `npm run wiki:workbench:prepare`',
    '- `npm run wiki:workbench:sync-bundled-docs`',
    '- `npm run docs:workbench:wiki:doctor`',
    '- `npm run docs:workbench:wiki:prepare`',
    '- `npm run docs:workbench:gitlab:wiki:prepare`',
    '',
    '## Published Image And GitLab Lane',
    '',
    'GitLab publishes the docs-authoring image as:',
    '',
    '- `registry.gitlab.com/svelderrainruiz/vi-history-suite/docs-authoring:main`',
    '- `registry.gitlab.com/svelderrainruiz/vi-history-suite/docs-authoring:sha-<commit>`',
    '- `registry.gitlab.com/svelderrainruiz/vi-history-suite/docs-authoring:vX.Y.Z` on governed tags',
    '',
    'Local Docker iteration is useful, but the stronger automation surface is',
    'the exact commit-published `docs-authoring:sha-<commit>` image inside',
    'GitLab after the image publish job completes. That lane retains',
    '`wiki-workbench-evidence/` with the resolved topology, staged draft,',
    'publication-prep receipt, and a machine-readable manifest that links the',
    'evidence back to the selected page and image reference.',
    '',
    '## Retained Evidence',
    '',
    'Current retained workbench outputs include:',
    '',
    '- `.cache/wiki-workbench/latest-workbench.json`',
    '- `.cache/wiki-workbench/staging/<page-id>/`',
    '- `.cache/wiki-workbench/publication-prep/<page-id>/publication-prep.json`',
    '- `wiki-workbench-evidence/wiki-workbench-manifest.json` from the GitLab',
    '  published-image lane',
    '- `wiki-workbench-evidence/iteration-report.md` with the staged page',
    '  outcome, correspondences, and next recommendation',
    '',
    'If a stale retained page directory is unwritable, the workbench rotates',
    'to a writable recovery run path instead of failing solely on old cache',
    'ownership:',
    '',
    '- `.cache/wiki-workbench/staging-runs/<page-id>-<timestamp>/`',
    '- `.cache/wiki-workbench/publication-prep-runs/<page-id>-<timestamp>/`',
    '',
    '## Boundary',
    '',
    'This workbench is for documentation-package and wiki-authority work. It is',
    'not the NI runtime proof lane, not the benchmark lane, and not the end-user',
    'VSIX install surface. It is also not a place to invent new product truth;',
    'if a wiki page needs a claim that is absent from governed authority docs,',
    'the main repo docs must be strengthened first.',
    '',
    '## Read Next',
    '',
    '- [Program Repo Jump](https://gitlab.com/svelderrainruiz/vi-history-suite/-/blob/main/docs/product/program-repo-jump.md)',
    '- [Wiki Authority Map](https://gitlab.com/svelderrainruiz/vi-history-suite/-/blob/main/docs/product/wiki-authority-map.md)',
    '- [Documentation Coherence Ledger](https://gitlab.com/svelderrainruiz/vi-history-suite/-/blob/main/docs/product/documentation-coherence-ledger.md)',
    '- [Wiki Seed Plan](https://gitlab.com/svelderrainruiz/vi-history-suite/-/blob/main/docs/product/wiki-seed-plan.md)',
    ''
  ].join('\n');
}

function buildAuthoritySummary(page: WikiWorkbenchPagePlan): string {
  return [
    `# Authority Bundle: ${page.title}`,
    '',
    `- Page id: \`${page.id}\``,
    `- Status: \`${page.status}\``,
    `- Wiki target: \`${page.wikiFileName}\``,
    '',
    '## Primary Authority',
    ...page.primaryAuthority.map((authorityPath) => `- \`${authorityPath}\``),
    ...(page.secondaryAuthority.length > 0
      ? ['', '## Secondary Authority', ...page.secondaryAuthority.map((authorityPath) => `- \`${authorityPath}\``)]
      : [])
  ].join('\n');
}

export async function prepareWikiWorkbenchPublication(
  topology: WikiWorkbenchTopology,
  ledger: WikiPublicationLedger,
  pageId: string | undefined,
  deps: WikiWorkbenchRunnerDeps = {}
): Promise<{ receiptPath: string; receipt: WikiWorkbenchPublicationPrepReceipt }> {
  const mkdir = deps.mkdir ?? fs.mkdir;
  const writeFile = deps.writeFile ?? fs.writeFile;
  const now = deps.now ?? (() => new Date());

  if (!pageId && !ledger.nextPage) {
    const prepDirectory = await ensureRetainedDirectory({
      preferredDirectory: path.join(topology.publicationPrepRoot, 'complete'),
      recoveryRoot: path.join(topology.workbenchRoot, 'publication-prep-runs'),
      pageId: 'complete',
      mkdir,
      now
    });
    await mkdir(prepDirectory, { recursive: true });

    const receipt: WikiWorkbenchPublicationPrepReceipt = {
      schema: 'vi-history-suite/wiki-workbench-publication-prep@v1',
      recordedAt: now().toISOString(),
      publicationMode: 'no-op-complete',
      ledgerUpdateRequired: false,
      completionState: 'already-complete',
      message:
        'The publication ledger has no nextPage target, so wiki workbench preparation is already complete.'
    };

    const receiptPath = path.join(prepDirectory, 'publication-prep.json');
    await writeFile(receiptPath, JSON.stringify(receipt, null, 2), 'utf8');
    return { receiptPath, receipt };
  }

  const page = resolveWikiWorkbenchPage(topology, ledger, pageId);
  const { receiptPath: stageReceiptPath, receipt: stageReceipt } = await stageWikiWorkbenchPage(
    topology,
    ledger,
    page.id,
    deps
  );

  const prepDirectory = await ensureRetainedDirectory({
    preferredDirectory: path.join(topology.publicationPrepRoot, page.id),
    recoveryRoot: path.join(topology.workbenchRoot, 'publication-prep-runs'),
    pageId: page.id,
    mkdir,
    now
  });
  await mkdir(prepDirectory, { recursive: true });
  const receipt: WikiWorkbenchPublicationPrepReceipt = {
    schema: 'vi-history-suite/wiki-workbench-publication-prep@v1',
    recordedAt: now().toISOString(),
    page,
    stageReceiptPath,
    stageDirectory: stageReceipt.stageDirectory,
    draftFilePath: stageReceipt.draftFilePath,
    targetWikiFilePath: page.currentWikiPath,
    currentWikiExists: Boolean(stageReceipt.currentWikiCopyPath),
    publicationMode: stageReceipt.currentWikiCopyPath ? 'refresh-existing-page' : 'new-page',
    ledgerUpdateRequired: page.status !== 'published',
    bundledDocsCommand: 'node scripts/syncBundledDocs.js',
    completionState: 'prepared',
    message: `Prepared wiki publication evidence for ${page.id}.`
  };

  const receiptPath = path.join(prepDirectory, 'publication-prep.json');
  await writeFile(receiptPath, JSON.stringify(receipt, null, 2), 'utf8');
  return { receiptPath, receipt };
}

async function prepareRetainedDirectory({
  preferredDirectory,
  recoveryRoot,
  pageId,
  mkdir,
  rm,
  now
}: RetainedDirectoryOptions): Promise<string> {
  try {
    await rm(preferredDirectory, { recursive: true, force: true });
    await mkdir(preferredDirectory, { recursive: true });
    return preferredDirectory;
  } catch (error) {
    if (!isPermissionRecoveryError(error)) {
      throw error;
    }
  }

  const fallbackDirectory = path.join(recoveryRoot, `${pageId}-${buildWorkbenchRunId(now())}`);
  await rm(fallbackDirectory, { recursive: true, force: true });
  await mkdir(fallbackDirectory, { recursive: true });
  return fallbackDirectory;
}

async function ensureRetainedDirectory({
  preferredDirectory,
  recoveryRoot,
  pageId,
  mkdir,
  now
}: Omit<RetainedDirectoryOptions, 'rm'>): Promise<string> {
  try {
    await mkdir(preferredDirectory, { recursive: true });
    return preferredDirectory;
  } catch (error) {
    if (!isPermissionRecoveryError(error)) {
      throw error;
    }
  }

  const fallbackDirectory = path.join(recoveryRoot, `${pageId}-${buildWorkbenchRunId(now())}`);
  await mkdir(fallbackDirectory, { recursive: true });
  return fallbackDirectory;
}

function buildWorkbenchRunId(now: Date): string {
  return now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function isPermissionRecoveryError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const code = 'code' in error ? error.code : undefined;
  return code === 'EACCES' || code === 'EPERM';
}

export function formatWikiWorkbenchDoctor(
  topology: WikiWorkbenchTopology,
  issues: WikiWorkbenchIssue[]
): string {
  const lines = [
    'Wiki workbench doctor',
    `- authority repo: ${topology.authorityRepo.localPath}`,
    `- wiki repo: ${topology.wikiRepo.localPath}`,
    `- ledger json: ${topology.ledgerJsonPath}`,
    `- workbench root: ${topology.workbenchRoot}`,
    `- issues: ${issues.length}`
  ];

  for (const issue of issues) {
    lines.push(`  - [${issue.severity}] ${issue.code}: ${issue.message}`);
  }

  return lines.join('\n');
}

export function formatWikiWorkbenchPlans(pages: WikiWorkbenchPagePlan[]): string {
  const lines = ['Wiki workbench pages'];
  for (const page of pages) {
    lines.push(
      `- ${page.id} [${page.status}] -> ${page.wikiFileName} (${page.primaryAuthority.length} primary authority docs)`
    );
  }

  return lines.join('\n');
}

export async function writeWikiWorkbenchManifest(
  topology: WikiWorkbenchTopology,
  manifest: WikiWorkbenchManifest,
  deps: {
    mkdir?: typeof fs.mkdir;
    writeFile?: typeof fs.writeFile;
  } = {}
): Promise<string> {
  const mkdir = deps.mkdir ?? fs.mkdir;
  const writeFile = deps.writeFile ?? fs.writeFile;
  const manifestPath = path.join(topology.workbenchRoot, 'latest-workbench.json');
  await mkdir(path.dirname(manifestPath), { recursive: true });
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
  return manifestPath;
}

export function buildBundleSyncCommand(topology: WikiWorkbenchTopology): string {
  return [
    `VIHS_REPO_ROOT=${quoteEnv(topology.repoRoot)}`,
    `VIHS_PUBLIC_GITHUB_WIKI_REPO_ROOT=${quoteEnv(topology.wikiRepo.localPath)}`,
    `VIHS_LEDGER_PATH=${quoteEnv(topology.ledgerJsonPath)}`,
    `VIHS_BUNDLE_ROOT=${quoteEnv(topology.bundleRoot)}`,
    'node scripts/syncBundledDocs.js'
  ].join(' ');
}

function quoteEnv(value: string): string {
  return JSON.stringify(value);
}

export function defaultRunBundleSync(options: {
  repoRoot: string;
  wikiRepoRoot: string;
  ledgerPath: string;
  bundleRoot: string;
}): void {
  execFileSync(
    process.execPath,
    [path.join(options.repoRoot, 'scripts', 'syncBundledDocs.js')],
    {
      cwd: options.repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'inherit', 'inherit'],
      env: {
        ...process.env,
        VIHS_REPO_ROOT: options.repoRoot,
        VIHS_PUBLIC_GITHUB_WIKI_REPO_ROOT: options.wikiRepoRoot,
        VIHS_LEDGER_PATH: options.ledgerPath,
        VIHS_BUNDLE_ROOT: options.bundleRoot
      }
    }
  );
}

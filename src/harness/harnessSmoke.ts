import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import {
  getRepoHead,
  listTrackedFiles,
  normalizeRelativeGitPath,
  runGit
} from '../git/gitCli';
import {
  CanonicalHarnessDefinition,
  getCanonicalHarnessDefinition
} from './canonicalHarnesses';
import {
  evaluateViEligibilityForFsPath,
  loadViHistoryViewModelFromFsPath,
  ViHistoryViewModel
} from '../services/viHistoryModel';

export interface HarnessSmokeOptions {
  cloneRoot: string;
  reportRoot: string;
  strictRsrcHeader?: boolean;
  historyLimit?: number;
}

export interface HarnessSmokeReport {
  harnessId: string;
  repositoryUrl: string;
  cloneDirectory: string;
  targetRelativePath: string;
  head: string;
  tracked: boolean;
  signature: ViHistoryViewModel['signature'];
  eligible: boolean;
  commitCount: number;
  commits: ViHistoryViewModel['commits'];
  generatedAt: string;
}

export interface HarnessSmokeDeps {
  stat?: typeof fs.stat;
  mkdir?: typeof fs.mkdir;
  writeFile?: typeof fs.writeFile;
  runGit?: typeof runGit;
  getRepoHead?: typeof getRepoHead;
  listTrackedFiles?: typeof listTrackedFiles;
  loadViHistoryViewModelFromFsPath?: typeof loadViHistoryViewModelFromFsPath;
  evaluateViEligibilityForFsPath?: typeof evaluateViEligibilityForFsPath;
  now?: () => string;
}

export async function ensureHarnessClone(
  definition: CanonicalHarnessDefinition,
  cloneRoot: string,
  deps: HarnessSmokeDeps = {}
): Promise<string> {
  const cloneDirectory = path.join(cloneRoot, definition.cloneDirectoryName);
  try {
    const stats = await (deps.stat ?? fs.stat)(path.join(cloneDirectory, '.git'));
    if (stats.isDirectory()) {
      return cloneDirectory;
    }
  } catch {
    // Clone on demand below.
  }

  await (deps.mkdir ?? fs.mkdir)(cloneRoot, { recursive: true });
  await (deps.runGit ?? runGit)(
    ['clone', '--filter=blob:none', definition.repositoryUrl, cloneDirectory],
    cloneRoot
  );
  return cloneDirectory;
}

export async function runHarnessSmoke(
  harnessId: string,
  options: HarnessSmokeOptions,
  deps: HarnessSmokeDeps = {}
): Promise<{
  report: HarnessSmokeReport;
  reportJsonPath: string;
  reportMarkdownPath: string;
  reportHtmlPath: string;
}> {
  const definition = getCanonicalHarnessDefinition(harnessId);
  const cloneDirectory = await ensureHarnessClone(definition, options.cloneRoot, deps);
  const targetAbsolutePath = path.join(cloneDirectory, definition.targetRelativePath);
  const [head, trackedFiles, model, eligibility] = await Promise.all([
    (deps.getRepoHead ?? getRepoHead)(cloneDirectory),
    (deps.listTrackedFiles ?? listTrackedFiles)(cloneDirectory),
    (deps.loadViHistoryViewModelFromFsPath ?? loadViHistoryViewModelFromFsPath)(targetAbsolutePath, {
      repoRoot: cloneDirectory,
      strictRsrcHeader: options.strictRsrcHeader ?? false,
      historyLimit: options.historyLimit ?? 50
    }),
    (deps.evaluateViEligibilityForFsPath ?? evaluateViEligibilityForFsPath)(targetAbsolutePath, {
      repoRoot: cloneDirectory,
      strictRsrcHeader: options.strictRsrcHeader ?? false
    })
  ]);

  const tracked = trackedFiles.includes(
    normalizeRelativeGitPath(definition.targetRelativePath)
  );

  const report: HarnessSmokeReport = {
    harnessId: definition.id,
    repositoryUrl: definition.repositoryUrl,
    cloneDirectory,
    targetRelativePath: definition.targetRelativePath,
    head,
    tracked,
    signature: eligibility.signature,
    eligible: tracked && model.eligible,
    commitCount: model.commits.length,
    commits: model.commits,
    generatedAt: (deps.now ?? defaultNow)()
  };

  const outputDirectory = path.join(options.reportRoot, definition.id);
  await (deps.mkdir ?? fs.mkdir)(outputDirectory, { recursive: true });

  const reportJsonPath = path.join(outputDirectory, 'report.json');
  const reportMarkdownPath = path.join(outputDirectory, 'report.md');
  const reportHtmlPath = path.join(outputDirectory, 'report.html');

  await (deps.writeFile ?? fs.writeFile)(reportJsonPath, JSON.stringify(report, null, 2));
  await (deps.writeFile ?? fs.writeFile)(reportMarkdownPath, renderHarnessSmokeMarkdown(report));
  await (deps.writeFile ?? fs.writeFile)(reportHtmlPath, renderHarnessSmokeHtml(report));

  return { report, reportJsonPath, reportMarkdownPath, reportHtmlPath };
}

export function renderHarnessSmokeMarkdown(report: HarnessSmokeReport): string {
  const commitLines = report.commits
    .slice(0, 10)
    .map(
      (commit) =>
        `- \`${commit.hash.slice(0, 8)}\` ${commit.authorDate} ${commit.authorName}: ${commit.subject}`
    )
    .join('\n');

  return `# Harness Smoke Report

- Harness: ${report.harnessId}
- Repository URL: ${report.repositoryUrl}
- Clone directory: ${report.cloneDirectory}
- Target path: ${report.targetRelativePath}
- HEAD: ${report.head}
- Tracked: ${report.tracked ? 'yes' : 'no'}
- Signature: ${report.signature}
- Eligible: ${report.eligible ? 'yes' : 'no'}
- Commit count: ${report.commitCount}
- Generated at: ${report.generatedAt}

## Recent Commits

${commitLines || '- No commits found'}
`;
}

export function renderHarnessSmokeHtml(report: HarnessSmokeReport): string {
  const rows = report.commits
    .slice(0, 20)
    .map(
      (commit) => `<tr>
  <td><code>${escapeHtml(commit.hash.slice(0, 8))}</code></td>
  <td>${escapeHtml(commit.authorDate)}</td>
  <td>${escapeHtml(commit.authorName)}</td>
  <td>${escapeHtml(commit.subject)}</td>
</tr>`
    )
    .join('\n');

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Harness Smoke Report</title>
    <style>
      body { font-family: sans-serif; margin: 24px; }
      table { width: 100%; border-collapse: collapse; margin-top: 16px; }
      th, td { border-bottom: 1px solid #ddd; padding: 8px; text-align: left; }
      .meta { display: grid; grid-template-columns: repeat(2, minmax(260px, 1fr)); gap: 8px 16px; }
    </style>
  </head>
  <body>
    <h1>Harness Smoke Report</h1>
    <div class="meta">
      <div><strong>Harness:</strong> ${escapeHtml(report.harnessId)}</div>
      <div><strong>Repository URL:</strong> ${escapeHtml(report.repositoryUrl)}</div>
      <div><strong>Target path:</strong> ${escapeHtml(report.targetRelativePath)}</div>
      <div><strong>HEAD:</strong> ${escapeHtml(report.head)}</div>
      <div><strong>Tracked:</strong> ${report.tracked ? 'yes' : 'no'}</div>
      <div><strong>Signature:</strong> ${escapeHtml(report.signature)}</div>
      <div><strong>Eligible:</strong> ${report.eligible ? 'yes' : 'no'}</div>
      <div><strong>Commit count:</strong> ${report.commitCount}</div>
      <div><strong>Generated at:</strong> ${escapeHtml(report.generatedAt)}</div>
    </div>
    <table>
      <thead>
        <tr>
          <th>Commit</th>
          <th>Date</th>
          <th>Author</th>
          <th>Subject</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
  </body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function defaultNow(): string {
  return new Date().toISOString();
}

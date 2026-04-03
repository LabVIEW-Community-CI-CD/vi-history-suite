import { createHash } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import {
  ArchivedComparisonReportSourceRecord,
  buildComparisonReportArchivePlanFromSelection,
  ComparisonReportArchivePlan
} from './comparisonReportArchive';
import {
  ParsedNiComparisonReport,
  parseNiComparisonReportFile
} from './niComparisonReportParser';
import { ViHistoryCommit, ViHistoryViewModel } from '../services/viHistoryModel';

const DASHBOARDS_DIRECTORY = 'dashboards';

export interface MultiReportDashboardArtifactPlan {
  repoId: string;
  fileId: string;
  windowId: string;
  dashboardDirectory: string;
  jsonFilePath: string;
  htmlFilePath: string;
  assetsDirectory: string;
}

export interface MultiReportDashboardImageAsset {
  caption: string;
  position: number;
  sourceFilePath: string;
  dashboardRelativePath: string;
}

export interface MultiReportDashboardEntry {
  pairId: string;
  selectedHash: string;
  baseHash: string;
  selectedAuthorDate: string;
  selectedAuthorName: string;
  selectedSubject: string;
  baseAuthorDate?: string;
  baseAuthorName?: string;
  baseSubject?: string;
  archiveStatus: 'archived' | 'missing';
  archivePlan: ComparisonReportArchivePlan;
  packetRecordPath?: string;
  packetFilePath?: string;
  reportFilePath?: string;
  metadataFilePath?: string;
  reportStatus?: 'ready-for-runtime' | 'blocked-preflight' | 'blocked-runtime';
  runtimeExecutionState?: 'not-run' | 'not-available' | 'succeeded' | 'failed';
  blockedReason?: string;
  runtimeFailureReason?: string;
  runtimeDiagnosticReason?: string;
  generatedReportExists: boolean;
  parsedReport?: ParsedNiComparisonReport;
  dashboardImageAssets: MultiReportDashboardImageAsset[];
  overviewImageCount: number;
  detailItemCount: number;
  evidenceCount: number;
}

export interface MultiReportDashboardRecord {
  generatedAt: string;
  repositoryName: string;
  repositoryRoot: string;
  relativePath: string;
  signature: ViHistoryViewModel['signature'];
  artifactPlan: MultiReportDashboardArtifactPlan;
  commitWindow: {
    commitCount: number;
    pairCount: number;
    newestHash?: string;
    oldestHash?: string;
  };
  summary: {
    archivedPairCount: number;
    missingPairCount: number;
    generatedReportCount: number;
    failedPairCount: number;
    blockedPairCount: number;
    overviewImageCount: number;
    detailItemCount: number;
    highestEvidencePairId?: string;
  };
  entries: MultiReportDashboardEntry[];
}

export interface BuildMultiReportDashboardDeps {
  now?: () => string;
  pathExists?: (targetPath: string) => Promise<boolean>;
  readFile?: typeof fs.readFile;
  mkdir?: typeof fs.mkdir;
  writeFile?: typeof fs.writeFile;
  copyFile?: typeof fs.copyFile;
}

export interface BuildMultiReportDashboardResult {
  record: MultiReportDashboardRecord;
  jsonFilePath: string;
  htmlFilePath: string;
}

export async function buildAndPersistMultiReportDashboard(
  storageRoot: string,
  model: ViHistoryViewModel,
  deps: BuildMultiReportDashboardDeps = {}
): Promise<BuildMultiReportDashboardResult> {
  const now = deps.now ?? defaultNow;
  const pathExists = deps.pathExists ?? defaultPathExists;
  const readFile = deps.readFile ?? fs.readFile;
  const mkdir = deps.mkdir ?? fs.mkdir;
  const writeFile = deps.writeFile ?? fs.writeFile;
  const copyFile = deps.copyFile ?? fs.copyFile;

  const artifactPlan = buildMultiReportDashboardArtifactPlan(storageRoot, model);
  const entries = await Promise.all(
    deriveCommitPairs(model.commits).map((pair) =>
      buildDashboardEntry(pair, storageRoot, model, { pathExists, readFile })
    )
  );
  const record: MultiReportDashboardRecord = {
    generatedAt: now(),
    repositoryName: model.repositoryName,
    repositoryRoot: model.repositoryRoot,
    relativePath: model.relativePath,
    signature: model.signature,
    artifactPlan,
    commitWindow: {
      commitCount: model.commits.length,
      pairCount: entries.length,
      newestHash: model.commits[0]?.hash,
      oldestHash: model.commits[model.commits.length - 1]?.hash
    },
    summary: buildDashboardSummary(entries),
    entries
  };

  await mkdir(artifactPlan.dashboardDirectory, { recursive: true });
  await mkdir(artifactPlan.assetsDirectory, { recursive: true });
  for (const entry of record.entries) {
    if (!entry.parsedReport) {
      continue;
    }
    for (const section of entry.parsedReport.overviewSections) {
      for (const image of section.images) {
        if (!(await pathExists(image.sourceFilePath))) {
          continue;
        }
        const relativePath = path.join('assets', entry.pairId, image.sourceRelativePath);
        const destinationPath = path.join(artifactPlan.dashboardDirectory, relativePath);
        await mkdir(path.dirname(destinationPath), { recursive: true });
        await copyFile(image.sourceFilePath, destinationPath);
        entry.dashboardImageAssets.push({
          caption: section.caption,
          position: image.position,
          sourceFilePath: image.sourceFilePath,
          dashboardRelativePath: relativePath
        });
      }
    }
  }

  await writeFile(artifactPlan.jsonFilePath, JSON.stringify(record, null, 2), 'utf8');
  await writeFile(artifactPlan.htmlFilePath, renderMultiReportDashboardHtml(record), 'utf8');
  return {
    record,
    jsonFilePath: artifactPlan.jsonFilePath,
    htmlFilePath: artifactPlan.htmlFilePath
  };
}

export function renderMultiReportDashboardHtml(
  record: MultiReportDashboardRecord,
  options: {
    assetUriResolver?: (absolutePath: string, fallbackRelativePath: string) => string;
  } = {}
): string {
  const summaryCards = [
    ['Retained commits', String(record.commitWindow.commitCount)],
    ['Retained pairs', String(record.commitWindow.pairCount)],
    ['Archived pairs', String(record.summary.archivedPairCount)],
    ['Missing pairs', String(record.summary.missingPairCount)],
    ['Generated reports', String(record.summary.generatedReportCount)],
    ['Failed pairs', String(record.summary.failedPairCount)],
    ['Blocked pairs', String(record.summary.blockedPairCount)],
    ['Overview images', String(record.summary.overviewImageCount)],
    ['Detail items', String(record.summary.detailItemCount)]
  ]
    .map(
      ([label, value]) => `<div class="metric"><strong>${escapeHtml(label)}:</strong> ${escapeHtml(value)}</div>`
    )
    .join('\n');
  const entriesHtml = record.entries
    .map((entry, index) => {
      const parsed = entry.parsedReport;
      const imageHtml = entry.dashboardImageAssets.length
        ? `<div class="image-grid" data-testid="dashboard-entry-images">
            ${entry.dashboardImageAssets
              .map((image) => {
                const resolved = options.assetUriResolver
                  ? options.assetUriResolver(
                      path.join(record.artifactPlan.dashboardDirectory, image.dashboardRelativePath),
                      image.dashboardRelativePath
                    )
                  : image.dashboardRelativePath;
                return `<figure class="image-card">
                    <img src="${escapeHtml(resolved)}" alt="${escapeHtml(image.caption)}" />
                    <figcaption>${escapeHtml(image.caption)} · image ${image.position + 1}</figcaption>
                  </figure>`;
              })
              .join('\n')}
          </div>`
        : `<div class="note">No concentrated images are currently retained for this pair.</div>`;
      const attributesHtml = parsed?.includedAttributes.length
        ? `<ul class="attribute-list">${parsed.includedAttributes
            .map(
              (attribute) =>
                `<li>${attribute.included ? 'Included' : 'Excluded'}: ${escapeHtml(attribute.label)}</li>`
            )
            .join('')}</ul>`
        : '<div class="note">No included-attribute facts are currently retained.</div>';
      const detailsHtml = parsed?.detailSections.length
        ? parsed.detailSections
            .map(
              (section) => `<details class="detail-section">
                <summary>${escapeHtml(section.heading)}</summary>
                <ol>${section.items
                  .map((item) => `<li>${escapeHtml(item)}</li>`)
                  .join('')}</ol>
              </details>`
            )
            .join('\n')
        : '<div class="note">No detailed report sections are currently retained for this pair.</div>';

      return `<section class="entry" data-testid="dashboard-entry" data-entry-index="${index}">
        <div class="entry-header">
          <h2>${escapeHtml(entry.selectedHash.slice(0, 8))} vs ${escapeHtml(
            entry.baseHash.slice(0, 8)
          )}</h2>
          <div class="entry-state">
            <strong>Archive:</strong> ${escapeHtml(entry.archiveStatus)} ·
            <strong>Report:</strong> ${escapeHtml(entry.reportStatus ?? 'missing-packet')} ·
            <strong>Runtime:</strong> ${escapeHtml(entry.runtimeExecutionState ?? 'not-run')}
          </div>
        </div>
        <div class="entry-grid">
          <div><strong>Selected subject:</strong> ${escapeHtml(entry.selectedSubject)}</div>
          <div><strong>Selected author/date:</strong> ${escapeHtml(
            `${entry.selectedAuthorName} · ${entry.selectedAuthorDate}`
          )}</div>
          <div><strong>Base subject:</strong> ${escapeHtml(entry.baseSubject ?? 'none')}</div>
          <div><strong>Evidence count:</strong> ${escapeHtml(String(entry.evidenceCount))}</div>
          <div><strong>Generated report exists:</strong> ${entry.generatedReportExists ? 'yes' : 'no'}</div>
          <div><strong>Failure reason:</strong> ${escapeHtml(entry.runtimeFailureReason ?? 'none')}</div>
          <div><strong>Blocked reason:</strong> ${escapeHtml(entry.blockedReason ?? 'none')}</div>
          <div><strong>Diagnostic reason:</strong> ${escapeHtml(
            entry.runtimeDiagnosticReason ?? 'none'
          )}</div>
          <div><strong>Archive packet:</strong> ${escapeHtml(entry.packetFilePath ?? 'none')}</div>
          <div><strong>Archive report:</strong> ${escapeHtml(entry.reportFilePath ?? 'none')}</div>
          <div><strong>Archive metadata:</strong> ${escapeHtml(entry.metadataFilePath ?? 'none')}</div>
          <div><strong>Archive source record:</strong> ${escapeHtml(
            entry.packetRecordPath ?? 'none'
          )}</div>
        </div>
        <div class="note">
          <strong>Concentrated report facts:</strong>
          ${escapeHtml(parsed?.reportTitle ?? 'No retained NI report content for this pair.')}
          ${parsed?.generationTime ? ` · Generated ${escapeHtml(parsed.generationTime)}` : ''}
        </div>
        <div class="entry-grid">
          <div><strong>First VI:</strong> ${escapeHtml(parsed?.firstViPath ?? 'none')}</div>
          <div><strong>Second VI:</strong> ${escapeHtml(parsed?.secondViPath ?? 'none')}</div>
        </div>
        <h3>Overview images</h3>
        ${imageHtml}
        <h3>Included attributes</h3>
        ${attributesHtml}
        <h3>Detailed information</h3>
        ${detailsHtml}
      </section>`;
    })
    .join('\n');

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>VI Review Dashboard: ${escapeHtml(path.basename(record.relativePath))}</title>
    <style>
      body {
        font-family: var(--vscode-font-family, Segoe UI, sans-serif);
        color: var(--vscode-foreground, #ddd);
        background: var(--vscode-editor-background, #1e1e1e);
        margin: 0;
        padding: 24px;
      }
      .hero, .entry, .note, .metric {
        border: 1px solid var(--vscode-panel-border, #555);
        background: color-mix(in srgb, var(--vscode-editor-background, #1e1e1e) 92%, white 8%);
      }
      .hero, .entry {
        padding: 16px;
        margin-bottom: 20px;
      }
      .summary-grid, .entry-grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(220px, 1fr));
        gap: 12px;
      }
      .entry-header {
        display: flex;
        justify-content: space-between;
        gap: 16px;
        align-items: baseline;
      }
      .image-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
        gap: 12px;
      }
      .image-card {
        margin: 0;
        border: 1px solid var(--vscode-panel-border, #555);
        padding: 8px;
      }
      .image-card img {
        width: 100%;
        height: auto;
        display: block;
      }
      .note {
        padding: 12px;
        margin: 12px 0;
      }
      .attribute-list, .detail-section ol {
        margin-top: 8px;
      }
      .metric {
        padding: 12px;
      }
      code {
        word-break: break-all;
      }
    </style>
  </head>
  <body>
    <section class="hero" data-testid="dashboard-hero">
      <h1 data-testid="dashboard-title">VI Review Dashboard</h1>
      <div class="entry-grid">
        <div><strong>Repository:</strong> ${escapeHtml(record.repositoryName)}</div>
        <div><strong>Path:</strong> ${escapeHtml(record.relativePath)}</div>
        <div><strong>Signature:</strong> ${escapeHtml(record.signature)}</div>
        <div><strong>Newest retained hash:</strong> ${escapeHtml(
          record.commitWindow.newestHash ?? 'none'
        )}</div>
        <div><strong>Oldest retained hash:</strong> ${escapeHtml(
          record.commitWindow.oldestHash ?? 'none'
        )}</div>
        <div><strong>Generated at:</strong> ${escapeHtml(record.generatedAt)}</div>
      </div>
      <div class="note" data-testid="dashboard-purpose">
        This dashboard concentrates multiple retained VI Comparison Reports for one VI so a human reviewer can triage a commit window without opening every individual report first.
      </div>
      <div class="summary-grid" data-testid="dashboard-summary-grid">
        ${summaryCards}
      </div>
    </section>
    ${entriesHtml}
  </body>
</html>`;
}

function buildMultiReportDashboardArtifactPlan(
  storageRoot: string,
  model: ViHistoryViewModel
): MultiReportDashboardArtifactPlan {
  const repoId = createDeterministicId(model.repositoryRoot);
  const fileId = createDeterministicId(`${model.repositoryRoot}\n${model.relativePath}`);
  const windowId = createDeterministicId(model.commits.map((commit) => commit.hash).join('\n'));
  const dashboardDirectory = path.join(
    storageRoot,
    DASHBOARDS_DIRECTORY,
    repoId,
    fileId,
    windowId
  );

  return {
    repoId,
    fileId,
    windowId,
    dashboardDirectory,
    jsonFilePath: path.join(dashboardDirectory, 'dashboard.json'),
    htmlFilePath: path.join(dashboardDirectory, 'dashboard.html'),
    assetsDirectory: path.join(dashboardDirectory, 'assets')
  };
}

async function buildDashboardEntry(
  pair: { selected: ViHistoryCommit; base: ViHistoryCommit },
  storageRoot: string,
  model: ViHistoryViewModel,
  deps: {
    pathExists: (targetPath: string) => Promise<boolean>;
    readFile: typeof fs.readFile;
  }
): Promise<MultiReportDashboardEntry> {
  const archivePlan = buildComparisonReportArchivePlanFromSelection({
    storageRoot,
    repositoryRoot: model.repositoryRoot,
    relativePath: model.relativePath,
    reportType: 'diff',
    selectedHash: pair.selected.hash,
    baseHash: pair.base.hash
  });
  const sourceRecordExists = await deps.pathExists(archivePlan.sourceRecordFilePath);

  if (!sourceRecordExists) {
    return {
      pairId: archivePlan.pairId,
      selectedHash: pair.selected.hash,
      baseHash: pair.base.hash,
      selectedAuthorDate: pair.selected.authorDate,
      selectedAuthorName: pair.selected.authorName,
      selectedSubject: pair.selected.subject,
      baseAuthorDate: pair.base.authorDate,
      baseAuthorName: pair.base.authorName,
      baseSubject: pair.base.subject,
      archiveStatus: 'missing',
      archivePlan,
      generatedReportExists: false,
      dashboardImageAssets: [],
      overviewImageCount: 0,
      detailItemCount: 0,
      evidenceCount: 0
    };
  }

  const sourceRecord = JSON.parse(
    await deps.readFile(archivePlan.sourceRecordFilePath, 'utf8')
  ) as ArchivedComparisonReportSourceRecord;
  const parsedReport =
    sourceRecord.packetRecord.runtimeExecution.reportExists &&
    (await deps.pathExists(sourceRecord.archivePlan.reportFilePath))
      ? await parseNiComparisonReportFile(sourceRecord.archivePlan.reportFilePath, {
          readFile: deps.readFile
        })
      : undefined;

  return {
    pairId: sourceRecord.archivePlan.pairId,
    selectedHash: pair.selected.hash,
    baseHash: pair.base.hash,
    selectedAuthorDate: pair.selected.authorDate,
    selectedAuthorName: pair.selected.authorName,
    selectedSubject: pair.selected.subject,
    baseAuthorDate: pair.base.authorDate,
    baseAuthorName: pair.base.authorName,
    baseSubject: pair.base.subject,
    archiveStatus: 'archived',
    archivePlan: sourceRecord.archivePlan,
    packetRecordPath: sourceRecord.archivePlan.sourceRecordFilePath,
    packetFilePath: sourceRecord.archivePlan.packetFilePath,
    reportFilePath: sourceRecord.archivePlan.reportFilePath,
    metadataFilePath: sourceRecord.archivePlan.metadataFilePath,
    reportStatus: sourceRecord.packetRecord.reportStatus,
    runtimeExecutionState: sourceRecord.packetRecord.runtimeExecutionState,
    blockedReason:
      sourceRecord.packetRecord.reportStatus === 'blocked-runtime'
        ? sourceRecord.packetRecord.runtimeSelection.blockedReason
        : sourceRecord.packetRecord.preflight.blockedReason,
    runtimeFailureReason: sourceRecord.packetRecord.runtimeExecution.failureReason,
    runtimeDiagnosticReason: sourceRecord.packetRecord.runtimeExecution.diagnosticReason,
    generatedReportExists: sourceRecord.packetRecord.runtimeExecution.reportExists,
    parsedReport,
    dashboardImageAssets: [],
    overviewImageCount: parsedReport?.overviewImageCount ?? 0,
    detailItemCount: parsedReport?.detailItemCount ?? 0,
    evidenceCount: (parsedReport?.overviewImageCount ?? 0) + (parsedReport?.detailItemCount ?? 0)
  };
}

function buildDashboardSummary(entries: MultiReportDashboardEntry[]) {
  const archivedPairCount = entries.filter((entry) => entry.archiveStatus === 'archived').length;
  const missingPairCount = entries.filter((entry) => entry.archiveStatus === 'missing').length;
  const generatedReportCount = entries.filter((entry) => entry.generatedReportExists).length;
  const failedPairCount = entries.filter((entry) => entry.runtimeExecutionState === 'failed').length;
  const blockedPairCount = entries.filter(
    (entry) => entry.reportStatus === 'blocked-preflight' || entry.reportStatus === 'blocked-runtime'
  ).length;
  const overviewImageCount = entries.reduce(
    (total, entry) => total + entry.overviewImageCount,
    0
  );
  const detailItemCount = entries.reduce((total, entry) => total + entry.detailItemCount, 0);
  const highestEvidenceEntry = [...entries].sort((left, right) => right.evidenceCount - left.evidenceCount)[0];

  return {
    archivedPairCount,
    missingPairCount,
    generatedReportCount,
    failedPairCount,
    blockedPairCount,
    overviewImageCount,
    detailItemCount,
    highestEvidencePairId: highestEvidenceEntry?.pairId
  };
}

function deriveCommitPairs(commits: ViHistoryCommit[]): Array<{ selected: ViHistoryCommit; base: ViHistoryCommit }> {
  const pairs: Array<{ selected: ViHistoryCommit; base: ViHistoryCommit }> = [];
  for (let index = 0; index < commits.length - 1; index += 1) {
    pairs.push({
      selected: commits[index],
      base: commits[index + 1]
    });
  }
  return pairs;
}

function createDeterministicId(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 12);
}

async function defaultPathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

function defaultNow(): string {
  return new Date().toISOString();
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

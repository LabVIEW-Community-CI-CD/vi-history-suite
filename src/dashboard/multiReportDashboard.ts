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

export interface MultiReportDashboardArtifactLink {
  kind: 'packet-html' | 'report-html' | 'metadata-json' | 'source-record-json';
  label: string;
  filePath: string;
}

export type MultiReportDashboardEntryEvidenceState =
  | 'missing-archive'
  | 'archived-generated-report'
  | 'archived-blocked'
  | 'archived-failed'
  | 'archived-no-generated-report';

export interface MultiReportDashboardProviderSummary {
  label: string;
  pairCount: number;
}

export interface MultiReportDashboardEvidenceStateSummary {
  state: MultiReportDashboardEntryEvidenceState;
  pairCount: number;
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
  runtimeProvider?: string;
  runtimeEngine?: string;
  runtimePlatform?: string;
  runtimePreferBitness?: string;
  runtimeProviderLabel?: string;
  pairEvidenceState: MultiReportDashboardEntryEvidenceState;
  generatedReportExists: boolean;
  parsedReport?: ParsedNiComparisonReport;
  dashboardImageAssets: MultiReportDashboardImageAsset[];
  artifactLinks: MultiReportDashboardArtifactLink[];
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
    representedPairCount: number;
    windowCompletenessState: 'complete' | 'incomplete-missing-archives';
    archivedPairCount: number;
    missingPairCount: number;
    missingPairIds: string[];
    generatedReportCount: number;
    reportMetadataPairCount: number;
    failedPairCount: number;
    failedPairIds: string[];
    blockedPairCount: number;
    blockedPairIds: string[];
    overviewSectionCount: number;
    overviewImageCount: number;
    includedAttributeCount: number;
    detailSectionCount: number;
    detailItemCount: number;
    pairWithOverviewImageCount: number;
    pairWithDetailCount: number;
    providerSummaries: MultiReportDashboardProviderSummary[];
    evidenceStateSummaries: MultiReportDashboardEvidenceStateSummary[];
  };
  entries: MultiReportDashboardEntry[];
}

export interface BuildMultiReportDashboardDeps {
  now?: () => string;
  pathExists?: (targetPath: string) => Promise<boolean>;
  readFile?: typeof fs.readFile;
  mkdir?: typeof fs.mkdir;
  rm?: typeof fs.rm;
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
  const rm = deps.rm ?? fs.rm;
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

  await rm(artifactPlan.dashboardDirectory, { recursive: true, force: true });
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
  const representedPairCount =
    record.summary.representedPairCount ?? record.commitWindow.pairCount;
  const providerSummaries = record.summary.providerSummaries ?? [];
  const chronologyHtml = record.entries.length
    ? `<ol data-testid="dashboard-chronology-list">${record.entries
        .map(
          (entry, index) => `<li data-testid="dashboard-chronology-item">
            Pair ${index + 1} of ${record.entries.length}: <code>${escapeHtml(
              entry.selectedHash.slice(0, 8)
            )}</code> vs <code>${escapeHtml(entry.baseHash.slice(0, 8))}</code> ·
            ${escapeHtml(entry.selectedSubject)} ·
            ${escapeHtml(entry.pairEvidenceState)}
          </li>`
        )
        .join('')}</ol>`
    : '<div class="note">No retained commit pairs are currently available for this dashboard window.</div>';
  const summaryCards = [
    ['Retained commits', String(record.commitWindow.commitCount)],
    ['Retained pairs', String(record.commitWindow.pairCount)],
    ['Represented pairs', String(representedPairCount)],
    ['Archived pairs', String(record.summary.archivedPairCount)],
    ['Pairs with report metadata', String(record.summary.reportMetadataPairCount)],
    ['Overview sections', String(record.summary.overviewSectionCount)],
    ['Overview images', String(record.summary.overviewImageCount)],
    ['Included attributes', String(record.summary.includedAttributeCount)],
    ['Detail sections', String(record.summary.detailSectionCount)],
    ['Detail items', String(record.summary.detailItemCount)],
    ['Provider variants', String(providerSummaries.length)]
  ]
    .map(
      ([label, value]) => `<div class="metric"><strong>${escapeHtml(label)}:</strong> ${escapeHtml(value)}</div>`
    )
    .join('\n');
  const entriesHtml = record.entries
    .map((entry, index) => {
      const parsed = entry.parsedReport;
      const noMetadataHtml = parsed
        ? ''
        : `<div class="note" data-testid="dashboard-entry-no-metadata">
            No retained VI Comparison Report metadata is currently available for this pair.
          </div>`;
      const reportMetadataHtml = parsed
        ? `<div class="note" data-testid="dashboard-entry-report-metadata">
            <strong>Comparison Report metadata:</strong>
            title=${escapeHtml(parsed.reportTitle)} ·
            generated=${escapeHtml(parsed.generationTime ?? 'none')} ·
            first-vi=${escapeHtml(parsed.firstViPath ?? 'none')} ·
            second-vi=${escapeHtml(parsed.secondViPath ?? 'none')} ·
            overview-sections=${escapeHtml(String(parsed.overviewSections.length))} ·
            overview-images=${escapeHtml(String(entry.overviewImageCount))} ·
            included-attributes=${escapeHtml(String(parsed.includedAttributes.length))} ·
            detail-sections=${escapeHtml(String(parsed.detailSections.length))} ·
            detail-items=${escapeHtml(String(entry.detailItemCount))}
          </div>`
        : '';
      const overviewMetadataHtml = parsed?.overviewSections.length
        ? `<ul data-testid="dashboard-entry-overview-metadata">${parsed.overviewSections
            .map(
              (section) =>
                `<li>${escapeHtml(section.caption)} · ${escapeHtml(
                  String(section.images.length)
                )} image(s)</li>`
            )
            .join('')}</ul>`
        : '<div class="note" data-testid="dashboard-entry-overview-metadata">No retained overview image metadata is currently available for this pair.</div>';
      const attributesHtml = parsed?.includedAttributes.length
        ? `<ul class="attribute-list" data-testid="dashboard-entry-attribute-metadata">${parsed.includedAttributes
            .map(
              (attribute) =>
                `<li>${attribute.included ? 'Included' : 'Excluded'}: ${escapeHtml(attribute.label)}</li>`
            )
            .join('')}</ul>`
        : '<div class="note" data-testid="dashboard-entry-attribute-metadata">No included-attribute metadata is currently retained for this pair.</div>';
      const detailsHtml = parsed?.detailSections.length
        ? parsed.detailSections
            .map(
              (section) => `<details class="detail-section" data-testid="dashboard-entry-detail-section">
                <summary>${escapeHtml(section.heading)}</summary>
                <ol>${section.items
                  .map((item) => `<li>${escapeHtml(item)}</li>`)
                  .join('')}</ol>
              </details>`
            )
            .join('\n')
        : '<div class="note" data-testid="dashboard-entry-detail-metadata">No detailed-information metadata is currently retained for this pair.</div>';

	      return `<section class="entry" data-testid="dashboard-entry" data-entry-index="${index}">
	        <div class="entry-header">
	          <h2>Pair ${index + 1} of ${record.entries.length}: ${escapeHtml(
            entry.selectedHash.slice(0, 8)
          )} vs ${escapeHtml(
	            entry.baseHash.slice(0, 8)
	          )}</h2>
          <div class="entry-state">
            <strong>Evidence state:</strong> ${escapeHtml(entry.pairEvidenceState)} ·
            <strong>Archive:</strong> ${escapeHtml(entry.archiveStatus)} ·
            <strong>Report:</strong> ${escapeHtml(entry.reportStatus ?? 'missing-packet')} ·
            <strong>Runtime:</strong> ${escapeHtml(entry.runtimeExecutionState ?? 'not-run')}
          </div>
        </div>
	        <div class="entry-grid" data-testid="dashboard-entry-provenance">
	          <div><strong>Selected hash:</strong> <code>${escapeHtml(entry.selectedHash)}</code></div>
	          <div><strong>Base hash:</strong> <code>${escapeHtml(entry.baseHash)}</code></div>
	          <div><strong>Selected subject:</strong> ${escapeHtml(entry.selectedSubject)}</div>
          <div><strong>Selected author/date:</strong> ${escapeHtml(
            `${entry.selectedAuthorName} · ${entry.selectedAuthorDate}`
          )}</div>
          <div><strong>Base subject:</strong> ${escapeHtml(entry.baseSubject ?? 'none')}</div>
          <div><strong>Provider:</strong> ${escapeHtml(entry.runtimeProvider ?? 'none')}</div>
          <div><strong>Engine:</strong> ${escapeHtml(entry.runtimeEngine ?? 'none')}</div>
          <div><strong>Platform:</strong> ${escapeHtml(entry.runtimePlatform ?? 'none')}</div>
          <div><strong>Preferred bitness:</strong> ${escapeHtml(
            entry.runtimePreferBitness ?? 'none'
          )}</div>
          <div><strong>Provider label:</strong> ${escapeHtml(
            entry.runtimeProviderLabel ?? 'none'
          )}</div>
	        </div>
          ${reportMetadataHtml}
          ${noMetadataHtml}
	        <h3>Overview metadata</h3>
	        ${overviewMetadataHtml}
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
      .artifact-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-bottom: 12px;
      }
      .artifact-actions button {
        padding: 6px 10px;
      }
      .attribute-list, .detail-section ol {
        margin-top: 8px;
      }
      .metric {
        padding: 12px;
      }
      .provider-summary-list {
        margin-top: 8px;
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
        This dashboard concentrates retained VI Comparison Report metadata for one VI across a commit window so an expert can review multiple report pairs from one HTML surface.
      </div>
      <div class="note" data-testid="dashboard-provider-summary">
        <strong>Provider coverage:</strong>
        ${providerSummaries.length
          ? `<ul class="provider-summary-list">${providerSummaries
              .map(
                (summary) =>
                  `<li>${escapeHtml(summary.label)} · ${escapeHtml(String(summary.pairCount))} pair(s)</li>`
              )
              .join('')}</ul>`
          : ' No retained provider evidence is currently concentrated for this window.'}
      </div>
      <div class="note" data-testid="dashboard-chronology-order">
        <strong>Chronology order:</strong> newest selected/base pairs first.
      </div>
      <div class="note" data-testid="dashboard-chronology-summary">
        <strong>Pair chronology:</strong>
        ${chronologyHtml}
      </div>
      <div class="note" data-testid="dashboard-metadata-summary">
        <strong>Concentrated comparison-report metadata:</strong>
        metadata-backed-pairs=${escapeHtml(String(record.summary.reportMetadataPairCount))} ·
        overview-sections=${escapeHtml(String(record.summary.overviewSectionCount))} ·
        overview-images=${escapeHtml(String(record.summary.overviewImageCount))} ·
        included-attributes=${escapeHtml(String(record.summary.includedAttributeCount))} ·
        detail-sections=${escapeHtml(String(record.summary.detailSectionCount))} ·
        detail-items=${escapeHtml(String(record.summary.detailItemCount))}
      </div>
      <div class="note" data-testid="dashboard-metadata-fields">
        <strong>Retained metadata fields:</strong> report title, generation time, compared VI paths, overview section captions and image counts, included attributes, and detailed-information headings and items.
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
      pairEvidenceState: 'missing-archive',
      generatedReportExists: false,
      dashboardImageAssets: [],
      artifactLinks: [],
      overviewImageCount: 0,
      detailItemCount: 0,
      evidenceCount: 0
    };
  }

  const sourceRecord = JSON.parse(
    await deps.readFile(archivePlan.sourceRecordFilePath, 'utf8')
  ) as ArchivedComparisonReportSourceRecord;
  const generatedReportExists =
    sourceRecord.packetRecord.runtimeExecution.reportExists &&
    (await deps.pathExists(sourceRecord.archivePlan.reportFilePath));
  const parsedReport = generatedReportExists
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
    runtimeProvider: sourceRecord.packetRecord.runtimeSelection.provider,
    runtimeEngine: sourceRecord.packetRecord.runtimeSelection.engine,
    runtimePlatform: sourceRecord.packetRecord.runtimeSelection.platform,
    runtimePreferBitness: sourceRecord.packetRecord.runtimeSelection.preferBitness,
    runtimeProviderLabel: buildProviderLabel(sourceRecord.packetRecord),
    pairEvidenceState: derivePairEvidenceState(sourceRecord, generatedReportExists),
    generatedReportExists,
    parsedReport,
    dashboardImageAssets: [],
    artifactLinks: buildArtifactLinks(sourceRecord, generatedReportExists),
    overviewImageCount: parsedReport?.overviewImageCount ?? 0,
    detailItemCount: parsedReport?.detailItemCount ?? 0,
    evidenceCount: (parsedReport?.overviewImageCount ?? 0) + (parsedReport?.detailItemCount ?? 0)
  };
}

function buildDashboardSummary(entries: MultiReportDashboardEntry[]) {
  const representedPairCount = entries.length;
  const archivedPairCount = entries.filter((entry) => entry.archiveStatus === 'archived').length;
  const missingPairCount = entries.filter((entry) => entry.archiveStatus === 'missing').length;
  const missingPairIds = entries
    .filter((entry) => entry.archiveStatus === 'missing')
    .map((entry) => entry.pairId);
  const generatedReportCount = entries.filter((entry) => entry.generatedReportExists).length;
  const reportMetadataPairCount = entries.filter((entry) => Boolean(entry.parsedReport)).length;
  const failedEntries = entries.filter((entry) => entry.pairEvidenceState === 'archived-failed');
  const failedPairCount = failedEntries.length;
  const failedPairIds = failedEntries.map((entry) => entry.pairId);
  const blockedEntries = entries.filter((entry) => entry.pairEvidenceState === 'archived-blocked');
  const blockedPairCount = blockedEntries.length;
  const blockedPairIds = blockedEntries.map((entry) => entry.pairId);
  const overviewSectionCount = entries.reduce(
    (total, entry) => total + (entry.parsedReport?.overviewSections.length ?? 0),
    0
  );
  const overviewImageCount = entries.reduce(
    (total, entry) => total + entry.overviewImageCount,
    0
  );
  const includedAttributeCount = entries.reduce(
    (total, entry) => total + (entry.parsedReport?.includedAttributes.length ?? 0),
    0
  );
  const detailSectionCount = entries.reduce(
    (total, entry) => total + (entry.parsedReport?.detailSections.length ?? 0),
    0
  );
  const detailItemCount = entries.reduce((total, entry) => total + entry.detailItemCount, 0);
  const pairWithOverviewImageCount = entries.filter((entry) => entry.overviewImageCount > 0).length;
  const pairWithDetailCount = entries.filter((entry) => entry.detailItemCount > 0).length;
  const providerCounts = new Map<string, number>();
  for (const entry of entries) {
    const label = entry.runtimeProviderLabel ?? 'none';
    providerCounts.set(label, (providerCounts.get(label) ?? 0) + 1);
  }
  const providerSummaries = [...providerCounts.entries()]
    .map(([label, pairCount]) => ({ label, pairCount }))
    .sort((left, right) => right.pairCount - left.pairCount || left.label.localeCompare(right.label));
  const evidenceStateCounts = new Map<MultiReportDashboardEntryEvidenceState, number>();
  for (const entry of entries) {
    evidenceStateCounts.set(
      entry.pairEvidenceState,
      (evidenceStateCounts.get(entry.pairEvidenceState) ?? 0) + 1
    );
  }
  const evidenceStateSummaries = [...evidenceStateCounts.entries()]
    .map(([state, pairCount]) => ({ state, pairCount }))
    .sort((left, right) => right.pairCount - left.pairCount || left.state.localeCompare(right.state));

  return {
    representedPairCount,
    windowCompletenessState:
      missingPairCount === 0
        ? ('complete' as const)
        : ('incomplete-missing-archives' as const),
    archivedPairCount,
    missingPairCount,
    missingPairIds,
    generatedReportCount,
    reportMetadataPairCount,
    failedPairCount,
    failedPairIds,
    blockedPairCount,
    blockedPairIds,
    overviewSectionCount,
    overviewImageCount,
    includedAttributeCount,
    detailSectionCount,
    detailItemCount,
    pairWithOverviewImageCount,
    pairWithDetailCount,
    providerSummaries,
    evidenceStateSummaries
  };
}

function buildArtifactLinks(
  sourceRecord: ArchivedComparisonReportSourceRecord,
  generatedReportExists: boolean
): MultiReportDashboardArtifactLink[] {
  const links: MultiReportDashboardArtifactLink[] = [
    {
      kind: 'packet-html',
      label: 'Open archived packet',
      filePath: sourceRecord.archivePlan.packetFilePath
    },
    {
      kind: 'metadata-json',
      label: 'Open archived metadata',
      filePath: sourceRecord.archivePlan.metadataFilePath
    },
    {
      kind: 'source-record-json',
      label: 'Open archive source record',
      filePath: sourceRecord.archivePlan.sourceRecordFilePath
    }
  ];

  if (generatedReportExists) {
    links.splice(1, 0, {
      kind: 'report-html',
      label: 'Open archived NI report',
      filePath: sourceRecord.archivePlan.reportFilePath
    });
  }

  return links;
}

function buildProviderLabel(record: ArchivedComparisonReportSourceRecord['packetRecord']): string {
  const selection = record.runtimeSelection;
  return [
    selection.provider,
    selection.engine ?? 'none',
    selection.preferBitness,
    selection.platform
  ].join(' / ');
}

function derivePairEvidenceState(
  sourceRecord: ArchivedComparisonReportSourceRecord,
  generatedReportExists: boolean
): MultiReportDashboardEntryEvidenceState {
  if (generatedReportExists) {
    return 'archived-generated-report';
  }

  if (
    sourceRecord.packetRecord.reportStatus === 'blocked-preflight' ||
    sourceRecord.packetRecord.reportStatus === 'blocked-runtime' ||
    sourceRecord.packetRecord.runtimeExecutionState === 'not-available'
  ) {
    return 'archived-blocked';
  }

  if (sourceRecord.packetRecord.runtimeExecutionState === 'failed') {
    return 'archived-failed';
  }

  return 'archived-no-generated-report';
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

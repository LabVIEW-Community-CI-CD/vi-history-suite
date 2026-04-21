import { createHash } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import {
  ArchivedComparisonReportSourceRecord,
  buildComparisonReportArchivePlanFromSelection,
  ComparisonReportArchivePlan
} from './comparisonReportArchive';
import {
  MultiReportDashboardEtaAccuracyRecord
} from './dashboardEtaAccuracy';
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

export interface MultiReportDashboardOverviewCaptionSummary {
  caption: string;
  pairCount: number;
  imageCount: number;
  pairOrdinals: number[];
}

export interface MultiReportDashboardComparedPathSummary {
  firstViPath: string;
  secondViPath: string;
  pairCount: number;
  pairOrdinals: number[];
}

export interface MultiReportDashboardAttributeSummary {
  label: string;
  includedPairCount: number;
  excludedPairCount: number;
  includedPairOrdinals: number[];
  excludedPairOrdinals: number[];
}

export interface MultiReportDashboardDetailHeadingSummary {
  heading: string;
  pairCount: number;
  itemCount: number;
  pairOrdinals: number[];
}

export interface MultiReportDashboardDetailItemSummary {
  item: string;
  pairCount: number;
  pairOrdinals: number[];
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
  runtimeBitness?: string;
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
    comparedPathSummaries?: MultiReportDashboardComparedPathSummary[];
    overviewCaptionSummaries: MultiReportDashboardOverviewCaptionSummary[];
    includedAttributeSummaries: MultiReportDashboardAttributeSummary[];
    detailHeadingSummaries: MultiReportDashboardDetailHeadingSummary[];
    detailItemSummaries?: MultiReportDashboardDetailItemSummary[];
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
  reportProgress?: (update: { message: string; increment?: number }) => void | Promise<void>;
  pairConcentrationIncrementTotal?: number;
  assetIncrementTotal?: number;
}

export interface BuildMultiReportDashboardResult {
  record: MultiReportDashboardRecord;
  jsonFilePath: string;
  htmlFilePath: string;
}

export interface MultiReportDashboardPreparationSummary {
  mode:
    | 'retained-evidence-complete'
    | 'seeded-retained-before-build'
    | 'backfilled-before-build'
    | 'backfill-unavailable';
  pairsNeedingEvidenceCount: number;
  seededImportedPairCount?: number;
  preparedPairCount: number;
  preparedGeneratedReportCount: number;
  preparedBlockedPairCount: number;
  preparedFailedPairCount: number;
  preparedNoGeneratedReportCount: number;
  preparedMissingRetainedArchiveCount: number;
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
  const reportProgress = deps.reportProgress;
  const pairConcentrationIncrementTotal = deps.pairConcentrationIncrementTotal ?? 70;
  const assetIncrementTotal = deps.assetIncrementTotal ?? 10;

  const artifactPlan = buildMultiReportDashboardArtifactPlan(storageRoot, model);
  const commitPairs = deriveCommitPairs(model.commits);
  const entries: MultiReportDashboardEntry[] = [];
  const pairIncrement =
    commitPairs.length > 0 ? pairConcentrationIncrementTotal / commitPairs.length : 0;
  for (const [index, pair] of commitPairs.entries()) {
    const entry = await buildDashboardEntry(pair, storageRoot, model, { pathExists, readFile });
    entries.push(entry);
    await reportProgress?.({
      message: `Concentrating retained comparison-report metadata for pair ${index + 1}/${commitPairs.length}: ${pair.selected.hash.slice(0, 8)} vs ${pair.base.hash.slice(0, 8)}.`,
      increment: pairIncrement
    });
  }
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
  const dashboardImageCount = record.entries.reduce(
    (total, entry) => total + (entry.parsedReport?.overviewImageCount ?? 0),
    0
  );
  const imageIncrement =
    dashboardImageCount > 0 ? assetIncrementTotal / dashboardImageCount : assetIncrementTotal;
  let copiedDashboardImageCount = 0;
  for (const entry of record.entries) {
    if (!entry.parsedReport) {
      continue;
    }
    for (const section of entry.parsedReport.overviewSections) {
      for (const image of section.images) {
        if (!(await pathExists(image.sourceFilePath))) {
          continue;
        }
        const relativePath = path.posix.join(
          'assets',
          entry.pairId,
          image.sourceRelativePath.replaceAll('\\', '/')
        );
        const destinationPath = joinPreservingExplicitPathStyle(
          artifactPlan.dashboardDirectory,
          relativePath
        );
        await mkdir(path.dirname(destinationPath), { recursive: true });
        await copyFile(image.sourceFilePath, destinationPath);
        entry.dashboardImageAssets.push({
          caption: section.caption,
          position: image.position,
          sourceFilePath: image.sourceFilePath,
          dashboardRelativePath: relativePath
        });
        copiedDashboardImageCount += 1;
        await reportProgress?.({
          message: `Copying retained overview image ${copiedDashboardImageCount}/${dashboardImageCount}: ${entry.selectedHash.slice(0, 8)} vs ${entry.baseHash.slice(0, 8)}.`,
          increment: imageIncrement
        });
      }
    }
  }
  if (dashboardImageCount === 0) {
    await reportProgress?.({
      message: 'Finalizing concentrated dashboard assets.',
      increment: assetIncrementTotal
    });
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
    etaAccuracyRecord?: MultiReportDashboardEtaAccuracyRecord;
    preparationSummary?: MultiReportDashboardPreparationSummary;
  } = {}
): string {
  const representedPairCount =
    record.summary.representedPairCount ?? record.commitWindow.pairCount;
  const providerSummaries = record.summary.providerSummaries ?? [];
  const comparedPathSummaries = record.summary.comparedPathSummaries ?? [];
  const overviewCaptionSummaries = record.summary.overviewCaptionSummaries ?? [];
  const includedAttributeSummaries = record.summary.includedAttributeSummaries ?? [];
  const detailHeadingSummaries = record.summary.detailHeadingSummaries ?? [];
  const detailItemSummaries = record.summary.detailItemSummaries ?? [];
  const chronologyHtml = record.entries.length
    ? `<ol data-testid="dashboard-chronology-list">${record.entries
        .map(
          (entry, index) => `<li data-testid="dashboard-chronology-item">
            Pair ${index + 1} of ${record.entries.length}: <code>${escapeHtml(
              entry.selectedHash.slice(0, 8)
            )}</code> vs <code>${escapeHtml(entry.baseHash.slice(0, 8))}</code> ·
            selected=${escapeHtml(entry.selectedSubject)} ·
            base=${escapeHtml(entry.baseSubject ?? 'none')} ·
            evidence=${escapeHtml(entry.pairEvidenceState)}
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
  const etaAccuracySummaryHtml = options.etaAccuracyRecord
    ? options.etaAccuracyRecord.measuredPairCount > 0
      ? `<div class="note" data-testid="dashboard-eta-accuracy-summary">
          <strong>Pair ETA accuracy this refresh:</strong>
          measured=${escapeHtml(
            String(options.etaAccuracyRecord.measuredPairCount)
          )}/${escapeHtml(String(options.etaAccuracyRecord.etaEligiblePairCount))} eta-eligible pair(s) ·
          prepared=${escapeHtml(String(options.etaAccuracyRecord.preparedPairCount))} pair(s)${options.etaAccuracyRecord.excludedPairCount > 0
            ? ` · excluded=${escapeHtml(
                String(options.etaAccuracyRecord.excludedPairCount)
              )} blocked/failed/no-generated pair(s)`
            : ''} ·
          mean-abs-error=${escapeHtml(
            formatDurationMinutesSeconds(options.etaAccuracyRecord.meanAbsoluteErrorSeconds ?? 0)
          )} ·
          max-abs-error=${escapeHtml(
            formatDurationMinutesSeconds(options.etaAccuracyRecord.maxAbsoluteErrorSeconds ?? 0)
          )} ·
          mean-bias=${escapeHtml(
            formatSignedDurationMinutesSeconds(options.etaAccuracyRecord.meanSignedErrorSeconds ?? 0)
          )}${options.etaAccuracyRecord.meanAbsolutePercentageError !== undefined
            ? ` · mape=${escapeHtml(
                `${Math.round(options.etaAccuracyRecord.meanAbsolutePercentageError)}%`
              )}`
            : ''} ·
          current-session generated-report pairs only
        </div>`
      : `<div class="note" data-testid="dashboard-eta-accuracy-summary">
          <strong>Pair ETA accuracy this refresh:</strong>
          not yet measurable for this dashboard refresh because only ${escapeHtml(
            String(options.etaAccuracyRecord.etaEligiblePairCount)
          )} eta-eligible pair(s) produced generated comparison metadata in the current session${options.etaAccuracyRecord.excludedPairCount > 0
            ? `, and ${escapeHtml(
                String(options.etaAccuracyRecord.excludedPairCount)
              )} blocked/failed/no-generated pair(s) were excluded`
            : ''}. Historical or already retained pairs are excluded.
        </div>`
    : '';
  const preparationSummaryHtml = options.preparationSummary
    ? `<div class="note" data-testid="dashboard-preparation-summary">
        <strong>Preparation this refresh:</strong>
        ${escapeHtml(renderPreparationSummary(options.preparationSummary))}
      </div>`
    : '';
  const overviewCaptionConcentrationHtml = overviewCaptionSummaries.length
    ? `<ul data-testid="dashboard-overview-caption-concentration-list">${overviewCaptionSummaries
        .map(
          (summary) =>
            `<li>${escapeHtml(summary.caption)} · ${escapeHtml(
              String(summary.pairCount)
            )} pair(s) · ${escapeHtml(String(summary.imageCount))} image(s) · ${escapeHtml(
              formatPairOrdinalSummary(summary.pairOrdinals)
            )}</li>`
        )
        .join('')}</ul>`
    : 'No retained overview-caption concentration is currently available for this window.';
  const includedAttributeConcentrationHtml = includedAttributeSummaries.length
    ? `<ul data-testid="dashboard-attribute-concentration-list">${includedAttributeSummaries
        .map(
          (summary) =>
            `<li>${escapeHtml(summary.label)} · included=${escapeHtml(
              String(summary.includedPairCount)
            )} (${escapeHtml(
              formatPairOrdinalSummary(summary.includedPairOrdinals)
            )}) · excluded=${escapeHtml(String(summary.excludedPairCount))} (${escapeHtml(
              formatPairOrdinalSummary(summary.excludedPairOrdinals)
            )})</li>`
        )
        .join('')}</ul>`
    : 'No retained included-attribute concentration is currently available for this window.';
  const detailHeadingConcentrationHtml = detailHeadingSummaries.length
    ? `<ul data-testid="dashboard-detail-heading-concentration-list">${detailHeadingSummaries
        .map(
          (summary) =>
            `<li>${escapeHtml(summary.heading)} · ${escapeHtml(
              String(summary.pairCount)
            )} pair(s) · ${escapeHtml(String(summary.itemCount))} item(s) · ${escapeHtml(
              formatPairOrdinalSummary(summary.pairOrdinals)
            )}</li>`
        )
        .join('')}</ul>`
    : 'No retained detailed-information heading concentration is currently available for this window.';
  const comparedPathConcentrationHtml = comparedPathSummaries.length
    ? `<ul data-testid="dashboard-compared-path-concentration-list">${comparedPathSummaries
        .map(
          (summary) =>
            `<li>First VI=${escapeHtml(summary.firstViPath)} · Second VI=${escapeHtml(
              summary.secondViPath
            )} · ${escapeHtml(String(summary.pairCount))} pair(s) · ${escapeHtml(
              formatPairOrdinalSummary(summary.pairOrdinals)
            )}</li>`
        )
        .join('')}</ul>`
    : 'No retained compared-VI path concentration is currently available for this window.';
  const detailItemConcentrationHtml = detailItemSummaries.length
    ? `<ul data-testid="dashboard-detail-item-concentration-list">${detailItemSummaries
        .map(
          (summary) =>
            `<li>${escapeHtml(summary.item)} · ${escapeHtml(
              String(summary.pairCount)
            )} pair(s) · ${escapeHtml(formatPairOrdinalSummary(summary.pairOrdinals))}</li>`
        )
        .join('')}</ul>`
    : 'No retained detailed-information item concentration is currently available for this window.';
  const pairLedgerHtml = record.entries.length
    ? `<div class="pair-ledger" data-testid="dashboard-pair-ledger">${record.entries
        .map((entry, index) => renderPairMetadataLedgerRow(entry, index, record.entries.length))
        .join('')}</div>`
    : '<div class="note">No retained pair metadata is currently available for this dashboard window.</div>';
  const entriesHtml = record.entries
    .map((entry, index) => {
      const parsed = entry.parsedReport;
      const noMetadataHtml = parsed
        ? ''
        : `<div class="note" data-testid="dashboard-entry-no-metadata">
            No retained VI Comparison Report metadata is currently available for this pair.
          </div>`;
      const reportMetadataHtml = parsed
        ? `<section class="note" data-testid="dashboard-entry-report-metadata">
            <strong>Comparison Report metadata</strong>
            <div class="entry-grid metadata-grid">
              <div><strong>Report title:</strong> ${escapeHtml(parsed.reportTitle)}</div>
              <div><strong>Generation time:</strong> ${escapeHtml(parsed.generationTime ?? 'none')}</div>
              <div><strong>First VI path:</strong> ${escapeHtml(parsed.firstViPath ?? 'none')}</div>
              <div><strong>Second VI path:</strong> ${escapeHtml(parsed.secondViPath ?? 'none')}</div>
              <div><strong>Overview section count:</strong> ${escapeHtml(String(parsed.overviewSections.length))}</div>
              <div><strong>Overview image count:</strong> ${escapeHtml(String(entry.overviewImageCount))}</div>
              <div><strong>Included attribute count:</strong> ${escapeHtml(String(parsed.includedAttributes.length))}</div>
              <div><strong>Detail section count:</strong> ${escapeHtml(String(parsed.detailSections.length))}</div>
              <div><strong>Detail item count:</strong> ${escapeHtml(String(entry.detailItemCount))}</div>
            </div>
          </section>`
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
      const overviewImagesHtml = entry.dashboardImageAssets.length
        ? `<div class="overview-image-rows" data-testid="dashboard-entry-overview-images">${groupOverviewImageAssets(
            entry.dashboardImageAssets
          )
            .map((group) => {
              const groupImagesHtml = group.images
                .map((image) => {
                  const absolutePath = joinPreservingExplicitPathStyle(
                    record.artifactPlan.dashboardDirectory,
                    image.dashboardRelativePath
                  );
                  const imageSource = options.assetUriResolver
                    ? options.assetUriResolver(absolutePath, image.dashboardRelativePath)
                    : image.dashboardRelativePath;
                  return `<figure class="overview-image image-card">
                    <img src="${escapeHtml(imageSource)}" alt="${escapeHtml(
                      `${image.caption} image ${image.position + 1}`
                    )}" />
                    <figcaption>${escapeHtml(image.caption)} · image ${escapeHtml(
                      String(image.position + 1)
                    )}</figcaption>
                  </figure>`;
                })
                .join('');

              return `<section class="overview-image-row" data-testid="dashboard-entry-overview-image-row" data-caption="${escapeHtml(
                group.caption
              )}">
                <h4 class="overview-image-row-heading">${escapeHtml(group.caption)}</h4>
                <div class="image-grid">${groupImagesHtml}</div>
              </section>`;
            })
            .join('')}</div>`
        : '<div class="note" data-testid="dashboard-entry-overview-images">No retained overview images are currently concentrated for this pair.</div>';
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
          <div><strong>Base author/date:</strong> ${escapeHtml(
            entry.baseAuthorDate && entry.baseAuthorName
              ? `${entry.baseAuthorName} · ${entry.baseAuthorDate}`
              : 'none'
          )}</div>
          <div><strong>Provider:</strong> ${escapeHtml(entry.runtimeProvider ?? 'none')}</div>
          <div><strong>Engine:</strong> ${escapeHtml(entry.runtimeEngine ?? 'none')}</div>
          <div><strong>Platform:</strong> ${escapeHtml(entry.runtimePlatform ?? 'none')}</div>
          <div><strong>Bitness:</strong> ${escapeHtml(entry.runtimeBitness ?? 'none')}</div>
          <div><strong>Provider label:</strong> ${escapeHtml(
            entry.runtimeProviderLabel ?? 'none'
          )}</div>
	        </div>
	          ${reportMetadataHtml}
	          ${noMetadataHtml}
		        <h3>Overview metadata</h3>
		        ${overviewMetadataHtml}
          <h3>Overview images</h3>
          ${overviewImagesHtml}
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
      .metadata-grid {
        margin-top: 8px;
      }
      .entry-header {
        display: flex;
        justify-content: space-between;
        gap: 16px;
        align-items: baseline;
      }
      .overview-image-rows {
        display: grid;
        gap: 16px;
      }
      .overview-image-row {
        display: grid;
        gap: 10px;
      }
      .overview-image-row-heading {
        margin: 0;
      }
      .image-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
        gap: 12px;
      }
      .pair-ledger {
        display: grid;
        gap: 12px;
        margin: 12px 0;
      }
      .pair-ledger-row {
        border: 1px solid var(--vscode-panel-border, #555);
        padding: 12px;
        background: color-mix(in srgb, var(--vscode-editor-background, #1e1e1e) 94%, white 6%);
      }
      .pair-ledger-row h3 {
        margin: 0 0 8px 0;
      }
      .pair-ledger-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(280px, 1fr));
        gap: 10px 16px;
      }
      .pair-ledger-block {
        line-height: 1.45;
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
      <div class="note" data-testid="dashboard-review-lens">
        <strong>Review lens:</strong> This dashboard concentrates retained VI Comparison Report metadata across adjacent pairs so expert review can start from chronology, compared VI identity, overview sections, included attributes, and detailed-information items before opening any individual pair report.
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
      <div class="note" data-testid="dashboard-pair-ledger-summary">
        <strong>Chronology-first pair metadata ledger:</strong> every adjacent pair is listed once here with its retained LabVIEW comparison-report metadata so expert review can compare the whole window before dropping into the detailed per-pair sections below.
      </div>
      ${pairLedgerHtml}
      ${preparationSummaryHtml}
      ${etaAccuracySummaryHtml}
      <div class="note" data-testid="dashboard-compared-path-concentration">
        <strong>Compared VI path concentration:</strong>
        ${comparedPathConcentrationHtml}
      </div>
      <div class="note" data-testid="dashboard-overview-caption-concentration">
        <strong>Overview caption concentration:</strong>
        ${overviewCaptionConcentrationHtml}
      </div>
      <div class="note" data-testid="dashboard-attribute-concentration">
        <strong>Included-attribute concentration:</strong>
        ${includedAttributeConcentrationHtml}
      </div>
      <div class="note" data-testid="dashboard-detail-heading-concentration">
        <strong>Detailed-information heading concentration:</strong>
        ${detailHeadingConcentrationHtml}
      </div>
      <div class="note" data-testid="dashboard-detail-item-concentration">
        <strong>Detailed-information item concentration:</strong>
        ${detailItemConcentrationHtml}
      </div>
      <div class="summary-grid" data-testid="dashboard-summary-grid">
        ${summaryCards}
      </div>
    </section>
    ${entriesHtml}
  </body>
</html>`;
}

function renderPairMetadataLedgerRow(
  entry: MultiReportDashboardEntry,
  index: number,
  pairCount: number
): string {
  const parsed = entry.parsedReport;
  const chronologySummary = `<strong>Selected:</strong> ${escapeHtml(
    entry.selectedSubject
  )} <code>${escapeHtml(entry.selectedHash.slice(0, 8))}</code> · <strong>Base:</strong> ${escapeHtml(
    entry.baseSubject ?? 'none'
  )} <code>${escapeHtml(entry.baseHash.slice(0, 8))}</code>`;

  if (!parsed) {
    return `<section class="pair-ledger-row" data-testid="dashboard-pair-ledger-row">
      <h3>Pair ${index + 1} of ${pairCount}</h3>
      <div class="pair-ledger-block" data-testid="dashboard-pair-ledger-chronology">${chronologySummary}</div>
      <div class="note" data-testid="dashboard-pair-ledger-no-metadata">
        No retained VI Comparison Report metadata is currently available for this pair.
      </div>
    </section>`;
  }

  return `<section class="pair-ledger-row" data-testid="dashboard-pair-ledger-row">
    <h3>Pair ${index + 1} of ${pairCount}</h3>
    <div class="pair-ledger-block" data-testid="dashboard-pair-ledger-chronology">${chronologySummary}</div>
    <div class="pair-ledger-grid">
      <div class="pair-ledger-block" data-testid="dashboard-pair-ledger-report">
        <strong>Report:</strong> ${escapeHtml(parsed.reportTitle)} · generated ${escapeHtml(
          parsed.generationTime ?? 'none'
        )}
      </div>
      <div class="pair-ledger-block" data-testid="dashboard-pair-ledger-compared-paths">
        <strong>Compared VI paths:</strong> First VI=${escapeHtml(
          parsed.firstViPath ?? 'none'
        )} · Second VI=${escapeHtml(parsed.secondViPath ?? 'none')}
      </div>
      <div class="pair-ledger-block" data-testid="dashboard-pair-ledger-overview">
        <strong>Overview captions:</strong> ${escapeHtml(formatOverviewCaptionLedger(parsed))}
      </div>
      <div class="pair-ledger-block" data-testid="dashboard-pair-ledger-attributes">
        <strong>Included attributes:</strong> ${escapeHtml(
          formatAttributeLedger(parsed, true)
        )}<br />
        <strong>Excluded attributes:</strong> ${escapeHtml(formatAttributeLedger(parsed, false))}
      </div>
      <div class="pair-ledger-block" data-testid="dashboard-pair-ledger-detail-headings">
        <strong>Detail headings:</strong> ${escapeHtml(formatDetailHeadingLedger(parsed))}
      </div>
      <div class="pair-ledger-block" data-testid="dashboard-pair-ledger-detail-items">
        <strong>Detail items:</strong> ${escapeHtml(formatDetailItemLedger(parsed))}
      </div>
    </div>
  </section>`;
}

function formatOverviewCaptionLedger(parsed: ParsedNiComparisonReport): string {
  if (parsed.overviewSections.length === 0) {
    return 'none';
  }

  return parsed.overviewSections
    .map((section) => `${section.caption} (${section.images.length} image(s))`)
    .join('; ');
}

function groupOverviewImageAssets(
  assets: readonly MultiReportDashboardImageAsset[]
): Array<{
  caption: string;
  images: MultiReportDashboardImageAsset[];
}> {
  const groups = new Map<
    string,
    {
      caption: string;
      originalOrder: number;
      images: MultiReportDashboardImageAsset[];
    }
  >();

  for (const [index, asset] of assets.entries()) {
    const existing = groups.get(asset.caption);
    if (existing) {
      existing.images.push(asset);
      continue;
    }

    groups.set(asset.caption, {
      caption: asset.caption,
      originalOrder: index,
      images: [asset]
    });
  }

  return [...groups.values()]
    .sort((left, right) => {
      const priorityDifference =
        deriveOverviewCaptionPriority(left.caption) - deriveOverviewCaptionPriority(right.caption);
      if (priorityDifference !== 0) {
        return priorityDifference;
      }

      return left.originalOrder - right.originalOrder;
    })
    .map((group) => ({
      caption: group.caption,
      images: group.images.sort((left, right) => left.position - right.position)
    }));
}

function deriveOverviewCaptionPriority(caption: string): number {
  const normalized = caption.trim().toLowerCase();
  if (normalized === 'block diagram overview') {
    return 0;
  }

  if (normalized === 'front panel overview') {
    return 1;
  }

  return 2;
}

function formatAttributeLedger(parsed: ParsedNiComparisonReport, included: boolean): string {
  const labels = parsed.includedAttributes
    .filter((attribute) => attribute.included === included)
    .map((attribute) => attribute.label);
  return labels.length > 0 ? labels.join('; ') : 'none';
}

function formatDetailHeadingLedger(parsed: ParsedNiComparisonReport): string {
  if (parsed.detailSections.length === 0) {
    return 'none';
  }

  return parsed.detailSections
    .map((section) => `${section.heading} (${section.items.length} item(s))`)
    .join('; ');
}

function formatDetailItemLedger(parsed: ParsedNiComparisonReport): string {
  const items = parsed.detailSections.flatMap((section) => section.items);
  return items.length > 0 ? items.join('; ') : 'none';
}

function mapPairIdsToOrdinals(
  pairIds: Iterable<string>,
  pairOrdinalById: ReadonlyMap<string, number>
): number[] {
  return [...pairIds]
    .map((pairId) => pairOrdinalById.get(pairId))
    .filter((ordinal): ordinal is number => ordinal !== undefined)
    .sort((left, right) => left - right);
}

function formatPairOrdinalSummary(pairOrdinals: readonly number[]): string {
  if (pairOrdinals.length === 0) {
    return 'no pair positions retained';
  }

  if (pairOrdinals.length === 1) {
    return `pair ${pairOrdinals[0]}`;
  }

  return `pairs ${pairOrdinals.join(', ')}`;
}

function buildMultiReportDashboardArtifactPlan(
  storageRoot: string,
  model: ViHistoryViewModel
): MultiReportDashboardArtifactPlan {
  const repoId = createDeterministicId(model.repositoryRoot);
  const fileId = createDeterministicId(`${model.repositoryRoot}\n${model.relativePath}`);
  const windowId = createDeterministicId(model.commits.map((commit) => commit.hash).join('\n'));
  const dashboardDirectory = joinPreservingExplicitPathStyle(
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
    jsonFilePath: joinPreservingExplicitPathStyle(dashboardDirectory, 'dashboard.json'),
    htmlFilePath: joinPreservingExplicitPathStyle(dashboardDirectory, 'dashboard.html'),
    assetsDirectory: joinPreservingExplicitPathStyle(dashboardDirectory, 'assets')
  };
}

function joinPreservingExplicitPathStyle(rootPath: string, ...segments: string[]): string {
  if (rootPath.startsWith('/')) {
    return path.posix.join(rootPath, ...segments.map((segment) => segment.replace(/\\/g, '/')));
  }

  return path.join(rootPath, ...segments);
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
    runtimeBitness: sourceRecord.packetRecord.runtimeSelection.bitness,
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
  const comparedPathCounts = new Map<
    string,
    {
      firstViPath: string;
      secondViPath: string;
      pairIds: Set<string>;
    }
  >();
  const overviewCaptionCounts = new Map<
    string,
    {
      pairIds: Set<string>;
      imageCount: number;
    }
  >();
  const includedAttributeCounts = new Map<
    string,
    {
      includedPairIds: Set<string>;
      excludedPairIds: Set<string>;
    }
  >();
  const detailHeadingCounts = new Map<
    string,
    {
      pairIds: Set<string>;
      itemCount: number;
    }
  >();
  const detailItemCounts = new Map<
    string,
    {
      pairIds: Set<string>;
    }
  >();
  const pairOrdinalById = new Map(entries.map((entry, index) => [entry.pairId, index + 1]));
  for (const entry of entries) {
    const label = entry.runtimeProviderLabel ?? 'none';
    providerCounts.set(label, (providerCounts.get(label) ?? 0) + 1);
    if (entry.parsedReport?.firstViPath || entry.parsedReport?.secondViPath) {
      const firstViPath = entry.parsedReport?.firstViPath ?? 'none';
      const secondViPath = entry.parsedReport?.secondViPath ?? 'none';
      const key = `${firstViPath}\n${secondViPath}`;
      const summary = comparedPathCounts.get(key) ?? {
        firstViPath,
        secondViPath,
        pairIds: new Set<string>()
      };
      summary.pairIds.add(entry.pairId);
      comparedPathCounts.set(key, summary);
    }
    for (const section of entry.parsedReport?.overviewSections ?? []) {
      const summary = overviewCaptionCounts.get(section.caption) ?? {
        pairIds: new Set<string>(),
        imageCount: 0
      };
      summary.pairIds.add(entry.pairId);
      summary.imageCount += section.images.length;
      overviewCaptionCounts.set(section.caption, summary);
    }
    for (const attribute of entry.parsedReport?.includedAttributes ?? []) {
      const summary = includedAttributeCounts.get(attribute.label) ?? {
        includedPairIds: new Set<string>(),
        excludedPairIds: new Set<string>()
      };
      if (attribute.included) {
        summary.includedPairIds.add(entry.pairId);
      } else {
        summary.excludedPairIds.add(entry.pairId);
      }
      includedAttributeCounts.set(attribute.label, summary);
    }
    for (const section of entry.parsedReport?.detailSections ?? []) {
      const summary = detailHeadingCounts.get(section.heading) ?? {
        pairIds: new Set<string>(),
        itemCount: 0
      };
      summary.pairIds.add(entry.pairId);
      summary.itemCount += section.items.length;
      detailHeadingCounts.set(section.heading, summary);
      for (const item of section.items) {
        const itemSummary = detailItemCounts.get(item) ?? {
          pairIds: new Set<string>()
        };
        itemSummary.pairIds.add(entry.pairId);
        detailItemCounts.set(item, itemSummary);
      }
    }
  }
  const providerSummaries = [...providerCounts.entries()]
    .map(([label, pairCount]) => ({ label, pairCount }))
    .sort((left, right) => right.pairCount - left.pairCount || left.label.localeCompare(right.label));
  const comparedPathSummaries = [...comparedPathCounts.values()]
    .map((summary) => ({
      firstViPath: summary.firstViPath,
      secondViPath: summary.secondViPath,
      pairCount: summary.pairIds.size,
      pairOrdinals: mapPairIdsToOrdinals(summary.pairIds, pairOrdinalById)
    }))
    .sort((left, right) => {
      return (
        right.pairCount - left.pairCount ||
        left.firstViPath.localeCompare(right.firstViPath) ||
        left.secondViPath.localeCompare(right.secondViPath)
      );
    });
  const overviewCaptionSummaries = [...overviewCaptionCounts.entries()]
    .map(([caption, summary]) => ({
      caption,
      pairCount: summary.pairIds.size,
      imageCount: summary.imageCount,
      pairOrdinals: mapPairIdsToOrdinals(summary.pairIds, pairOrdinalById)
    }))
    .sort((left, right) => right.pairCount - left.pairCount || left.caption.localeCompare(right.caption));
  const includedAttributeSummaries = [...includedAttributeCounts.entries()]
    .map(([label, summary]) => ({
      label,
      includedPairCount: summary.includedPairIds.size,
      excludedPairCount: summary.excludedPairIds.size,
      includedPairOrdinals: mapPairIdsToOrdinals(summary.includedPairIds, pairOrdinalById),
      excludedPairOrdinals: mapPairIdsToOrdinals(summary.excludedPairIds, pairOrdinalById)
    }))
    .sort((left, right) => {
      const leftTotal = left.includedPairCount + left.excludedPairCount;
      const rightTotal = right.includedPairCount + right.excludedPairCount;
      return rightTotal - leftTotal || left.label.localeCompare(right.label);
    });
  const detailHeadingSummaries = [...detailHeadingCounts.entries()]
    .map(([heading, summary]) => ({
      heading,
      pairCount: summary.pairIds.size,
      itemCount: summary.itemCount,
      pairOrdinals: mapPairIdsToOrdinals(summary.pairIds, pairOrdinalById)
    }))
    .sort((left, right) => right.pairCount - left.pairCount || left.heading.localeCompare(right.heading));
  const detailItemSummaries = [...detailItemCounts.entries()]
    .map(([item, summary]) => ({
      item,
      pairCount: summary.pairIds.size,
      pairOrdinals: mapPairIdsToOrdinals(summary.pairIds, pairOrdinalById)
    }))
    .sort((left, right) => right.pairCount - left.pairCount || left.item.localeCompare(right.item));
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
    comparedPathSummaries,
    overviewCaptionSummaries,
    includedAttributeSummaries,
    detailHeadingSummaries,
    detailItemSummaries,
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
      label: 'Open archived LabVIEW report',
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
    selection.bitness,
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

function formatDurationMinutesSeconds(totalSeconds: number): string {
  const boundedSeconds = Math.max(0, Math.ceil(totalSeconds));
  const minutes = Math.floor(boundedSeconds / 60);
  const seconds = boundedSeconds % 60;
  return `${minutes}m ${seconds}s`;
}

function formatSignedDurationMinutesSeconds(totalSeconds: number): string {
  const sign = totalSeconds < 0 ? '-' : '+';
  return `${sign}${formatDurationMinutesSeconds(Math.abs(totalSeconds))}`;
}

function renderPreparationSummary(
  summary: MultiReportDashboardPreparationSummary
): string {
  if (summary.mode === 'retained-evidence-complete') {
    return 'All adjacent retained pairs already had retained comparison evidence before dashboard concentration began.';
  }

  if (summary.mode === 'backfilled-before-build') {
    const outcomeParts: string[] = [];
    if (summary.preparedGeneratedReportCount > 0) {
      outcomeParts.push(
        `${summary.preparedGeneratedReportCount} generated report${summary.preparedGeneratedReportCount === 1 ? '' : 's'}`
      );
    }
    if (summary.preparedBlockedPairCount > 0) {
      outcomeParts.push(
        `${summary.preparedBlockedPairCount} blocked pair${summary.preparedBlockedPairCount === 1 ? '' : 's'}`
      );
    }
    if (summary.preparedFailedPairCount > 0) {
      outcomeParts.push(
        `${summary.preparedFailedPairCount} failed pair${summary.preparedFailedPairCount === 1 ? '' : 's'}`
      );
    }
    if (summary.preparedNoGeneratedReportCount > 0) {
      outcomeParts.push(
        `${summary.preparedNoGeneratedReportCount} pair${summary.preparedNoGeneratedReportCount === 1 ? '' : 's'} without a generated report`
      );
    }
    if (summary.preparedMissingRetainedArchiveCount > 0) {
      outcomeParts.push(
        `${summary.preparedMissingRetainedArchiveCount} pair${summary.preparedMissingRetainedArchiveCount === 1 ? '' : 's'} without retained archive evidence`
      );
    }
    const baseSummary = `${summary.preparedPairCount} adjacent pair(s) were refreshed for retained comparison evidence before this dashboard was concentrated.`;
    if (outcomeParts.length === 0) {
      return baseSummary;
    }

    const needsFollowUpGuidance =
      summary.preparedBlockedPairCount > 0 ||
      summary.preparedFailedPairCount > 0 ||
      summary.preparedNoGeneratedReportCount > 0 ||
      summary.preparedMissingRetainedArchiveCount > 0;
    return `${baseSummary} Refresh outcomes: ${outcomeParts.join(', ')}.${needsFollowUpGuidance ? ' Review the pair ledger or Open compare for runtime doctor details.' : ''}`;
  }

  if (summary.mode === 'seeded-retained-before-build') {
    const seededCount = summary.seededImportedPairCount ?? 0;
    const baseSummary =
      `${seededCount} adjacent pair(s) were seeded from governed retained evidence before this dashboard was concentrated.`;
    if (summary.pairsNeedingEvidenceCount <= 0) {
      return `${baseSummary} No additional local pair refresh was needed from Open dashboard.`;
    }

    return `${baseSummary} ${summary.pairsNeedingEvidenceCount} adjacent pair(s) remain missing in the retained evidence set, and Open dashboard did not attempt a local pair refresh during this review.`;
  }

  return `${summary.pairsNeedingEvidenceCount} adjacent pair(s) still lacked retained comparison evidence, and this build could not refresh them from Open dashboard. This dashboard concentrates the currently retained archive set only.`;
}

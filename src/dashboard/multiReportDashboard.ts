import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { joinPreservingExplicitPathStyle } from '../support/pathStyle';
import { createDeterministicId } from '../support/deterministicId';
import { pathExistsViaFsAccess as defaultPathExists } from '../support/fsExists';
import { nowIso as defaultNow } from '../support/clock';
import { escapeHtml } from '../support/escapeHtml';
import {
  ArchivedComparisonReportSourceRecord,
  buildComparisonReportArchivePlanFromSelection,
  buildWorktreeSnapshotIndexFilePath,
  ComparisonReportArchivePlan
} from './comparisonReportArchive';
import {
  MultiReportDashboardEtaAccuracyRecord
} from './dashboardEtaAccuracy';
import {
  ParsedNiComparisonReport,
  parseNiComparisonReportFile
} from './niComparisonReportParser';
import { parseWorktreeSnapshotIndex } from './worktreeSnapshotIndex';
import {
  formatDurationMinutesSeconds,
  formatSignedDurationMinutesSeconds,
  renderPreparationSummary
} from './multiReportDashboardPreparationSummary';
import { renderPairMetadataLedgerRow } from './multiReportDashboardPairLedger';
import { groupOverviewImageAssets } from './multiReportDashboardOverviewImages';
import { formatPairOrdinalSummary } from './multiReportDashboardPairOrdinals';
import { decodeDataUriImage } from './multiReportDashboardDataUriImage';
import { buildMultiReportDashboardArtifactPlan } from './multiReportDashboardArtifactPlan';
import {
  buildArtifactLinks,
  buildProviderLabel,
  deriveCommitPairs,
  derivePairEvidenceState
} from './multiReportDashboardSourceRecord';
import { buildDashboardSummary } from './multiReportDashboardSummary';
import { buildViSemanticComparisonModel } from '../semantic/viSemanticModel';
import { ViHistoryCommit, ViHistoryViewModel } from '../services/viHistoryModel';
import { WORKTREE_REVISION_SENTINEL } from '../git/gitCli';

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
  /**
   * VHS-REQ-641 (Phase 3, issue #1366): content-addressed identity of a retained
   * working-tree (uncommitted) snapshot, present only for worktree-snapshot
   * entries discovered through the per-VI retention index. Undefined for
   * committed pairs.
   */
  worktreeSnapshotId?: string;
  /**
   * VHS-REQ-641: false for a retained working-tree snapshot — its source
   * on-disk bytes are a point-in-time capture that a later re-run cannot
   * reproduce (the file may have changed), so the dashboard flags it and the
   * re-run affordance is disabled. Undefined/true for reproducible committed pairs.
   */
  reproducible?: boolean;
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
    // VHS-REQ-640: count of overview images actually concentrated into the
    // dashboard assets directory. For single-file reports these are decoded
    // from embedded data URIs; for legacy multi-file reports they are copied
    // from the sibling `_files` directory. A value below `overviewImageCount`
    // means some parsed overview images could not be materialized (e.g. a
    // data URI the decoder did not recognize, or a missing `_files` PNG) and
    // were skipped instead of silently disappearing without a trace.
    materializedOverviewImageCount?: number;
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
  // VHS-REQ-641 (Phase 3, issue #1366): a working-tree comparison's selected side
  // is the WORKTREE sentinel with no commit, so it is not discoverable from the
  // commit list. Read the per-VI retention index and append any retained
  // working-tree snapshots so they surface in the dashboard alongside commit pairs.
  const worktreeEntries = await buildRetainedWorktreeSnapshotEntries(storageRoot, model, {
    pathExists,
    readFile
  });
  entries.push(...worktreeEntries);
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
        // VHS-REQ-640: single-file reports embed overview images as data URIs
        // rather than sibling `_files` PNGs. Decode and write them into the
        // dashboard assets directory so the dashboard render path (which expects
        // a real relative asset path) is unchanged.
        const embeddedImage = decodeDataUriImage(image.sourceRelativePath);
        if (embeddedImage) {
          const relativePath = path.posix.join(
            'assets',
            entry.pairId,
            `${embeddedImage.contentHash}.${embeddedImage.extension}`
          );
          const destinationPath = joinPreservingExplicitPathStyle(
            artifactPlan.dashboardDirectory,
            relativePath
          );
          await mkdir(path.dirname(destinationPath), { recursive: true });
          await writeFile(destinationPath, embeddedImage.data);
          entry.dashboardImageAssets.push({
            caption: section.caption,
            position: image.position,
            sourceFilePath: destinationPath,
            dashboardRelativePath: relativePath
          });
          copiedDashboardImageCount += 1;
          await reportProgress?.({
            message: `Copying retained overview image ${copiedDashboardImageCount}/${dashboardImageCount}: ${entry.selectedHash.slice(0, 8)} vs ${entry.baseHash.slice(0, 8)}.`,
            increment: imageIncrement
          });
          continue;
        }
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

  // VHS-REQ-640: record how many parsed overview images were actually
  // concentrated into the dashboard assets directory. Newly generated
  // single-file reports embed images as data URIs (no sibling `_files`
  // directory), so this surfaces silent materialization loss rather than
  // assuming every parsed overview image landed on disk.
  record.summary.materializedOverviewImageCount = copiedDashboardImageCount;

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
    ['Overview images materialized', String(record.summary.materializedOverviewImageCount ?? 0)],
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

      // VHS-REQ-610: lead each reviewed pair with a concise, human-readable
      // "what changed" narrative derived from the shared VI semantic model, so
      // reviewers get the gist before scanning the attribute/detail ledgers.
      const changeSummaryHtml = parsed
        ? `<div class="entry-change-summary" data-testid="dashboard-entry-change-summary"><strong>What changed:</strong> ${escapeHtml(
            buildViSemanticComparisonModel({
              report: parsed,
              revisions: { baseHash: entry.baseHash, selectedHash: entry.selectedHash }
            }).narrative
          )}</div>`
        : '';

      return `<section class="entry" data-testid="dashboard-entry" data-entry-index="${index}">
	        <div class="entry-header">
	          <h2>Pair ${index + 1} of ${record.entries.length}: ${escapeHtml(
            entry.selectedHash.slice(0, 8)
          )} vs ${escapeHtml(
	            entry.baseHash.slice(0, 8)
	          )}</h2>
          ${
            entry.worktreeSnapshotId
              ? `<div class="entry-worktree-snapshot-badge" data-testid="dashboard-entry-worktree-snapshot"><strong>⚠ Uncommitted snapshot @ ${escapeHtml(
                  entry.worktreeSnapshotId
                )}</strong> — content-addressed capture of on-disk bytes; not reproducible by re-run.</div>`
              : ''
          }
          <div class="entry-state">
            <strong>Evidence state:</strong> ${escapeHtml(entry.pairEvidenceState)} ·
            <strong>Archive:</strong> ${escapeHtml(entry.archiveStatus)} ·
            <strong>Report:</strong> ${escapeHtml(entry.reportStatus ?? 'missing-packet')} ·
            <strong>Runtime:</strong> ${escapeHtml(entry.runtimeExecutionState ?? 'not-run')}
          </div>
          ${changeSummaryHtml}
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

  // A retained archive that is absent OR unreadable/corrupt degrades to the same
  // "no usable archive" evidence state so one bad file never aborts the whole
  // dashboard (the missing-index / malformed-index paths already degrade this way).
  const missingArchiveEntry = (): MultiReportDashboardEntry => ({
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
  });

  if (!sourceRecordExists) {
    return missingArchiveEntry();
  }

  let sourceRecord: ArchivedComparisonReportSourceRecord;
  try {
    sourceRecord = JSON.parse(
      await deps.readFile(archivePlan.sourceRecordFilePath, 'utf8')
    ) as ArchivedComparisonReportSourceRecord;
  } catch {
    // Malformed/truncated source record (interrupted write, corruption, or a race
    // where the file vanished after the existence check): degrade this one pair
    // rather than throw and lose every other pair's evidence.
    return missingArchiveEntry();
  }
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

/**
 * VHS-REQ-641 (Phase 3, issue #1366): discover retained working-tree
 * (uncommitted) snapshots from the per-VI retention index and build dashboard
 * entries for them. Their content-addressed pair-ID round-trips from the stored
 * snapshot identity (`WORKTREE:<id>`), so each retained pair's source-record is
 * locatable without the commit list. Missing/malformed index or a missing
 * source-record is skipped (fail-soft). Each entry is flagged
 * `reproducible: false` because re-running a working-tree comparison compares
 * current on-disk bytes, which may differ from the retained capture.
 */
async function buildRetainedWorktreeSnapshotEntries(
  storageRoot: string,
  model: ViHistoryViewModel,
  deps: {
    pathExists: (targetPath: string) => Promise<boolean>;
    readFile: typeof fs.readFile;
  }
): Promise<MultiReportDashboardEntry[]> {
  const indexReferencePlan = buildComparisonReportArchivePlanFromSelection({
    storageRoot,
    repositoryRoot: model.repositoryRoot,
    relativePath: model.relativePath,
    reportType: 'diff',
    selectedHash: WORKTREE_REVISION_SENTINEL,
    baseHash: WORKTREE_REVISION_SENTINEL
  });
  const indexFilePath = buildWorktreeSnapshotIndexFilePath(indexReferencePlan);
  if (!(await deps.pathExists(indexFilePath))) {
    return [];
  }
  const index = parseWorktreeSnapshotIndex(await deps.readFile(indexFilePath, 'utf8'));
  if (!index) {
    return [];
  }

  const entries: MultiReportDashboardEntry[] = [];
  for (const snapshot of index.snapshots) {
    const archivePlan = buildComparisonReportArchivePlanFromSelection({
      storageRoot,
      repositoryRoot: model.repositoryRoot,
      relativePath: model.relativePath,
      reportType: snapshot.reportType,
      selectedHash: WORKTREE_REVISION_SENTINEL,
      baseHash: snapshot.baseHash,
      worktreeSnapshotId: snapshot.snapshotId
    });
    if (!(await deps.pathExists(archivePlan.sourceRecordFilePath))) {
      continue;
    }
    let sourceRecord: ArchivedComparisonReportSourceRecord;
    try {
      sourceRecord = JSON.parse(
        await deps.readFile(archivePlan.sourceRecordFilePath, 'utf8')
      ) as ArchivedComparisonReportSourceRecord;
    } catch {
      // Malformed/truncated retained snapshot record: skip it (matching the
      // missing-record skip above) rather than aborting the whole dashboard.
      continue;
    }
    const generatedReportExists =
      sourceRecord.packetRecord.runtimeExecution.reportExists &&
      (await deps.pathExists(sourceRecord.archivePlan.reportFilePath));
    const parsedReport = generatedReportExists
      ? await parseNiComparisonReportFile(sourceRecord.archivePlan.reportFilePath, {
          readFile: deps.readFile
        })
      : undefined;

    entries.push({
      pairId: sourceRecord.archivePlan.pairId,
      selectedHash: WORKTREE_REVISION_SENTINEL,
      baseHash: snapshot.baseHash,
      selectedAuthorDate: snapshot.retainedAt,
      selectedAuthorName: 'Working tree (uncommitted)',
      selectedSubject: `Uncommitted snapshot @ ${snapshot.snapshotId}`,
      baseAuthorDate: undefined,
      baseAuthorName: undefined,
      baseSubject: undefined,
      archiveStatus: 'archived',
      archivePlan: sourceRecord.archivePlan,
      packetRecordPath: sourceRecord.archivePlan.sourceRecordFilePath,
      packetFilePath: sourceRecord.archivePlan.packetFilePath,
      reportFilePath: sourceRecord.archivePlan.reportFilePath,
      metadataFilePath: sourceRecord.archivePlan.metadataFilePath,
      reportStatus: sourceRecord.packetRecord.reportStatus,
      runtimeExecutionState: sourceRecord.packetRecord.runtimeExecutionState,
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
      evidenceCount: (parsedReport?.overviewImageCount ?? 0) + (parsedReport?.detailItemCount ?? 0),
      worktreeSnapshotId: snapshot.snapshotId,
      reproducible: false
    });
  }
  return entries;
}

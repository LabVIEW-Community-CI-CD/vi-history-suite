import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import {
  buildComparisonArtifactPlan,
  buildStagedRevisionPlan,
  ComparisonArtifactPlan,
  ComparisonReportType,
  StagedRevisionPlan
} from './comparisonReportPlan';
import { ComparisonReportPreflightResult } from './comparisonReportPreflight';

export interface PersistComparisonReportPacketOptions {
  storageRoot: string;
  repositoryRoot: string;
  relativePath: string;
  reportType: ComparisonReportType;
  selectedHash: string;
  baseHash: string;
  preflight: ComparisonReportPreflightResult;
}

export interface ComparisonReportPacketRecord {
  generatedAt: string;
  reportTitle: string;
  reportStatus: 'ready-for-runtime' | 'blocked-preflight';
  reportType: ComparisonReportType;
  selectedHash: string;
  baseHash: string;
  artifactPlan: ComparisonArtifactPlan;
  stagedRevisionPlan: StagedRevisionPlan;
  preflight: ComparisonReportPreflightResult;
  runtimeExecutionState: 'not-run';
}

export interface PersistComparisonReportPacketResult {
  record: ComparisonReportPacketRecord;
  reportFilePath: string;
  metadataFilePath: string;
}

export interface ComparisonReportPacketDeps {
  now?: () => string;
  mkdir?: typeof fs.mkdir;
  writeFile?: typeof fs.writeFile;
}

export async function persistComparisonReportPacket(
  options: PersistComparisonReportPacketOptions,
  deps: ComparisonReportPacketDeps = {}
): Promise<PersistComparisonReportPacketResult> {
  const artifactPlan = buildComparisonArtifactPlan({
    storageRoot: options.storageRoot,
    repositoryRoot: options.repositoryRoot,
    relativePath: options.relativePath,
    reportType: options.reportType
  });
  const stagedRevisionPlan = buildStagedRevisionPlan({
    stagingDirectory: artifactPlan.stagingDirectory,
    fullFilename: artifactPlan.fullFilename,
    leftRevisionId: options.baseHash,
    rightRevisionId: options.selectedHash
  });

  const record: ComparisonReportPacketRecord = {
    generatedAt: (deps.now ?? defaultNow)(),
    reportTitle: `VI Comparison Report: ${artifactPlan.fullFilename}`,
    reportStatus: options.preflight.ready ? 'ready-for-runtime' : 'blocked-preflight',
    reportType: options.reportType,
    selectedHash: options.selectedHash,
    baseHash: options.baseHash,
    artifactPlan,
    stagedRevisionPlan,
    preflight: options.preflight,
    runtimeExecutionState: 'not-run'
  };

  const mkdir = deps.mkdir ?? fs.mkdir;
  const writeFile = deps.writeFile ?? fs.writeFile;

  await mkdir(artifactPlan.reportDirectory, { recursive: true });
  await mkdir(artifactPlan.stagingDirectory, { recursive: true });
  await writeFile(artifactPlan.metadataFilePath, JSON.stringify(record, null, 2));
  await writeFile(artifactPlan.reportFilePath, renderComparisonReportPacketHtml(record));

  return {
    record,
    reportFilePath: artifactPlan.reportFilePath,
    metadataFilePath: artifactPlan.metadataFilePath
  };
}

export function renderComparisonReportPacketHtml(record: ComparisonReportPacketRecord): string {
  const left = record.preflight.left;
  const right = record.preflight.right;

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>${escapeHtml(record.reportTitle)}</title>
    <style>
      body { font-family: sans-serif; margin: 24px; }
      .status { margin-bottom: 16px; padding: 12px; border: 1px solid #888; }
      .grid { display: grid; grid-template-columns: repeat(2, minmax(260px, 1fr)); gap: 8px 16px; margin-bottom: 16px; }
      .note { margin-bottom: 16px; padding: 12px; border-left: 4px solid #0a84ff; }
      code { word-break: break-all; }
    </style>
  </head>
  <body>
    <h1 data-testid="comparison-report-title">${escapeHtml(record.reportTitle)}</h1>
    <div class="status" data-testid="comparison-report-status">
      <strong>Status:</strong> ${escapeHtml(record.reportStatus)}<br />
      <strong>Runtime execution:</strong> ${escapeHtml(record.runtimeExecutionState)}<br />
      <strong>Generated at:</strong> ${escapeHtml(record.generatedAt)}
    </div>
    <div class="grid" data-testid="comparison-report-plan">
      <div><strong>Report type:</strong> ${escapeHtml(record.reportType)}</div>
      <div><strong>Relative path:</strong> ${escapeHtml(record.artifactPlan.normalizedRelativePath)}</div>
      <div><strong>Selected revision:</strong> <code>${escapeHtml(record.selectedHash)}</code></div>
      <div><strong>Base revision:</strong> <code>${escapeHtml(record.baseHash)}</code></div>
      <div><strong>Report file:</strong> ${escapeHtml(record.artifactPlan.reportFilename)}</div>
      <div><strong>Metadata file:</strong> ${escapeHtml(path.basename(record.artifactPlan.metadataFilePath))}</div>
      <div><strong>Left staged file:</strong> ${escapeHtml(record.stagedRevisionPlan.leftFilename)}</div>
      <div><strong>Right staged file:</strong> ${escapeHtml(record.stagedRevisionPlan.rightFilename)}</div>
    </div>
    <div class="note" data-testid="comparison-report-runtime-note">
      <strong>Runtime note:</strong> No NI-generated comparison report has been executed yet. This stored packet captures the governed preflight and artifact plan for the selected retained revision pair.
    </div>
    <h2>Preflight</h2>
    <div class="grid" data-testid="comparison-report-preflight">
      <div><strong>Ready for runtime:</strong> ${record.preflight.ready ? 'yes' : 'no'}</div>
      <div><strong>Blocked reason:</strong> ${escapeHtml(record.preflight.blockedReason ?? 'none')}</div>
      <div><strong>Left blob:</strong> <code>${escapeHtml(left.blobSpecifier)}</code></div>
      <div><strong>Left signature:</strong> ${escapeHtml(left.signature ?? 'not-a-vi')}</div>
      <div><strong>Right blob:</strong> <code>${escapeHtml(right.blobSpecifier)}</code></div>
      <div><strong>Right signature:</strong> ${escapeHtml(right.signature ?? 'not-a-vi')}</div>
    </div>
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

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type * as vscode from 'vscode';

import { buildReportAssetsDirectoryName } from '../dashboard/comparisonReportArchive';
import {
  COMPARISON_REPORT_CONTEXT_STYLE,
  renderComparisonReportPanelContextMarkup
} from './comparisonReportContextMarkup';
import type { ComparisonReportRevisionMetadata } from './comparisonReportPacket';

/**
 * Per-revision provenance shown in the in-panel comparison-report context cards
 * (VHS-REQ-644). Carried onto the export source so the exported graphics report
 * (VHS-REQ-626) can embed the same selected/base hash, date, author, subject,
 * and commit body a reviewer sees inside VS Code.
 */
export interface ComparisonReportExportRevisionContext {
  relativePath?: string;
  selectedHash?: string;
  baseHash?: string;
  selectedRevision?: ComparisonReportRevisionMetadata;
  baseRevision?: ComparisonReportRevisionMetadata;
}

/**
 * Describes the on-disk artifacts backing an open comparison-report panel so the
 * user can export a browser-openable copy (HTML plus any graphics dependency
 * folder) to an accessible location outside VS Code's webview sandbox.
 */
export interface ComparisonReportExportSource extends ComparisonReportExportRevisionContext {
  reportTitle: string;
  generatedReportExists: boolean;
  reportFilePath: string;
  packetFilePath: string;
  reportStatus?: 'ready-for-runtime' | 'blocked-preflight' | 'blocked-runtime';
  runtimeExecutionState?: 'not-run' | 'not-available' | 'succeeded' | 'failed';
  graphicsReportUnavailableReason?: string;
  /**
   * Absolute filesystem path of the source LabVIEW VI the report compares, when
   * known. Lets the comparison-report title-bar re-entry action (VHS-REQ-638)
   * re-open VI History for the same file without relying on the active editor
   * resource, which the report webview clears once it becomes active.
   */
  sourceViFsPath?: string;
}

export interface ComparisonReportExportPlan {
  evidenceKind: 'generated-report' | 'packet';
  htmlSourcePath: string;
  htmlFileName: string;
  assetsSourceDirectoryPath?: string;
  assetsDirectoryName?: string;
}

export interface ComparisonReportExportBundleResult {
  exportedHtmlPath: string;
  exportedAssetsDirectoryPath?: string;
  copiedAssets: boolean;
}

export type ComparisonReportExportOutcome =
  | 'exported'
  | 'cancelled'
  | 'no-active-comparison-report'
  | 'source-missing'
  | 'export-failed';

export interface ComparisonReportExportResult {
  outcome: ComparisonReportExportOutcome;
  evidenceKind?: 'generated-report' | 'packet';
  bundleDirectoryPath?: string;
  exportedHtmlPath?: string;
  exportedAssetsDirectoryPath?: string;
  copiedAssets?: boolean;
  failureReason?: string;
  graphicsReportUnavailableReason?: string;
}

export interface ExportComparisonReportBundleDeps {
  mkdir?: typeof fs.mkdir;
  copyFile?: typeof fs.copyFile;
  copyDirectory?: typeof fs.cp;
  readFile?: typeof fs.readFile;
  writeFile?: typeof fs.writeFile;
}

export interface RunComparisonReportExportDeps {
  showOpenDialog: (options: vscode.OpenDialogOptions) => Thenable<vscode.Uri[] | undefined>;
  showInformationMessage: <T extends string>(
    message: string,
    ...items: T[]
  ) => Thenable<T | undefined>;
  showWarningMessage: <T extends string>(
    message: string,
    options?: vscode.MessageOptions,
    ...items: T[]
  ) => Thenable<T | undefined>;
  showErrorMessage: (message: string) => Thenable<string | undefined>;
  openExternal: (target: vscode.Uri) => Thenable<boolean>;
  executeCommand: (command: string, ...rest: unknown[]) => Thenable<unknown>;
  uriFile: (fsPath: string) => vscode.Uri;
  defaultDestinationDirectory?: string;
  now?: () => Date;
  pathExists?: (targetPath: string) => Promise<boolean>;
  exportBundle?: typeof exportComparisonReportBundle;
}

const OPEN_IN_BROWSER_ACTION = 'Open in Browser';
const SHOW_IN_FOLDER_ACTION = 'Show in Folder';
const EXPORT_EVIDENCE_PACKET_ACTION = 'Export Evidence Packet';

/**
 * Phrases, for a human, exactly why no zoomable LabVIEW graphics report is
 * available so the packet-fallback confirmation sets accurate expectations
 * instead of a generic "blocked, failed, or did not run" catch-all.
 */
export function describeMissingGraphicsReportReason(source: ComparisonReportExportSource): string {
  const detail = source.graphicsReportUnavailableReason;
  const withDetail = (base: string): string => (detail ? `${base} (${detail})` : base);

  if (source.reportStatus === 'blocked-preflight') {
    return withDetail('the comparison was blocked before the LabVIEW runtime could run');
  }
  if (source.reportStatus === 'blocked-runtime') {
    return withDetail('the LabVIEW comparison runtime was unavailable on this host');
  }
  if (source.runtimeExecutionState === 'failed') {
    return withDetail('the LabVIEW comparison runtime failed');
  }
  if (source.runtimeExecutionState === 'not-available') {
    return 'the LabVIEW comparison runtime is not available on this platform (for example, a non-Windows host)';
  }
  if (source.runtimeExecutionState === 'not-run') {
    return 'the LabVIEW comparison has not been run yet';
  }
  if (source.generatedReportExists) {
    return 'the generated graphics report is no longer available on disk';
  }
  return 'no LabVIEW-generated graphics report was produced';
}

/**
 * Resolves which artifact to export. The graphics-rich LabVIEW-generated report
 * (with its sibling `_files` assets directory) is preferred so users can zoom
 * the block-diagram/front-panel images in a real browser. The governed packet
 * is the fallback when no generated report is retained on disk.
 */
export async function resolveComparisonReportExportPlan(
  source: ComparisonReportExportSource,
  pathExists: (targetPath: string) => Promise<boolean>
): Promise<ComparisonReportExportPlan | undefined> {
  if (source.generatedReportExists && (await pathExists(source.reportFilePath))) {
    const assetsDirectoryName = buildReportAssetsDirectoryName(path.basename(source.reportFilePath));
    const assetsSourceDirectoryPath = path.join(
      path.dirname(source.reportFilePath),
      assetsDirectoryName
    );
    const hasAssets = await pathExists(assetsSourceDirectoryPath);
    return {
      evidenceKind: 'generated-report',
      htmlSourcePath: source.reportFilePath,
      htmlFileName: path.basename(source.reportFilePath),
      assetsSourceDirectoryPath: hasAssets ? assetsSourceDirectoryPath : undefined,
      assetsDirectoryName: hasAssets ? assetsDirectoryName : undefined
    };
  }

  if (await pathExists(source.packetFilePath)) {
    return {
      evidenceKind: 'packet',
      htmlSourcePath: source.packetFilePath,
      htmlFileName: path.basename(source.packetFilePath)
    };
  }

  return undefined;
}

/**
 * Builds a deterministic, filesystem-safe bundle directory name derived from the
 * report title and an ISO timestamp so repeated exports never clobber each other.
 */
export function buildComparisonReportExportDirectoryName(reportTitle: string, now: Date): string {
  const slug =
    reportTitle
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'vi-comparison-report';
  const timestamp = now.toISOString().replace(/[:.]/g, '-');
  return `${slug}-${timestamp}`;
}

/**
 * Injects the shared revision-context block (VHS-REQ-644) into a copy of the
 * LabVIEW-generated report HTML so the exported graphics report carries the same
 * selected/base provenance shown in the in-panel webview (VHS-REQ-626). The
 * context CSS is added to `<head>` and the markup is inserted at the start of
 * `<body>`. No `<base href>` is injected: the export keeps the report's own
 * relative `<name>_files/...` image links, which resolve against the sibling
 * assets directory copied alongside the HTML.
 */
export function injectRevisionContextIntoExportedReportHtml(
  html: string,
  revisionContext: ComparisonReportExportRevisionContext
): string {
  const contextMarkup = renderComparisonReportPanelContextMarkup(revisionContext);
  const styleInjection = `<style>${COMPARISON_REPORT_CONTEXT_STYLE}</style>`;
  const withHead = /<head\b[^>]*>/i.test(html)
    ? html.replace(/<head\b[^>]*>/i, (match) => `${match}${styleInjection}`)
    : `<!DOCTYPE html><html><head><meta charset="UTF-8" />${styleInjection}</head><body>${html}</body></html>`;

  if (/<body\b[^>]*>/i.test(withHead)) {
    return withHead.replace(/<body\b([^>]*)>/i, `<body$1>${contextMarkup}`);
  }

  return `<!DOCTYPE html><html><head><meta charset="UTF-8" />${styleInjection}</head><body>${contextMarkup}${withHead}</body></html>`;
}

/**
 * Copies the chosen report HTML and, when present, its sibling assets directory
 * into a destination bundle directory, preserving the original filenames so the
 * report's relative `<name>_files/...` image links keep resolving in a browser.
 */
export async function exportComparisonReportBundle(
  options: {
    plan: ComparisonReportExportPlan;
    destinationDirectory: string;
    revisionContext?: ComparisonReportExportRevisionContext;
  },
  deps: ExportComparisonReportBundleDeps = {}
): Promise<ComparisonReportExportBundleResult> {
  const mkdir = deps.mkdir ?? fs.mkdir;
  const copyFile = deps.copyFile ?? fs.copyFile;
  const copyDirectory = deps.copyDirectory ?? fs.cp;
  const readFile = deps.readFile ?? fs.readFile;
  const writeFile = deps.writeFile ?? fs.writeFile;

  await mkdir(options.destinationDirectory, { recursive: true });

  const exportedHtmlPath = path.join(options.destinationDirectory, options.plan.htmlFileName);
  if (options.plan.evidenceKind === 'generated-report' && options.revisionContext) {
    // Embed the in-panel revision context (VHS-REQ-644) into the exported copy
    // only; the retained source report on disk is never mutated (VHS-REQ-626).
    const originalHtml = await readFile(options.plan.htmlSourcePath, 'utf8');
    const withContext = injectRevisionContextIntoExportedReportHtml(
      originalHtml,
      options.revisionContext
    );
    await writeFile(exportedHtmlPath, withContext, 'utf8');
  } else {
    await copyFile(options.plan.htmlSourcePath, exportedHtmlPath);
  }

  if (options.plan.assetsSourceDirectoryPath && options.plan.assetsDirectoryName) {
    const exportedAssetsDirectoryPath = path.join(
      options.destinationDirectory,
      options.plan.assetsDirectoryName
    );
    await copyDirectory(options.plan.assetsSourceDirectoryPath, exportedAssetsDirectoryPath, {
      recursive: true,
      force: true
    });
    return {
      exportedHtmlPath,
      exportedAssetsDirectoryPath,
      copiedAssets: true
    };
  }

  return {
    exportedHtmlPath,
    copiedAssets: false
  };
}

/**
 * Orchestrates the interactive export: prompt for an accessible destination
 * folder, copy the HTML plus dependencies into a self-contained bundle, then
 * offer to open the result in the default external browser or reveal it in the
 * OS file manager.
 */
export async function runComparisonReportExport(
  source: ComparisonReportExportSource | undefined,
  deps: RunComparisonReportExportDeps
): Promise<ComparisonReportExportResult> {
  if (!source) {
    void deps.showWarningMessage('Open a VI comparison report before exporting it.');
    return { outcome: 'no-active-comparison-report' };
  }

  const pathExists = deps.pathExists ?? defaultPathExists;
  const plan = await resolveComparisonReportExportPlan(source, pathExists);
  if (!plan) {
    void deps.showWarningMessage(
      'VI History could not find the comparison report files to export. Re-run the comparison and try again.'
    );
    return { outcome: 'source-missing' };
  }

  const missingGraphicsReason =
    plan.evidenceKind === 'packet' ? describeMissingGraphicsReportReason(source) : undefined;
  if (missingGraphicsReason) {
    const proceed = await deps.showWarningMessage(
      `Only the diagnostic evidence packet is available to export because ${missingGraphicsReason}. ` +
        'The packet is a text diagnostic report — it does not include the zoomable block-diagram ' +
        'or front-panel graphics. Export the evidence packet anyway?',
      { modal: true },
      EXPORT_EVIDENCE_PACKET_ACTION
    );
    if (proceed !== EXPORT_EVIDENCE_PACKET_ACTION) {
      return {
        outcome: 'cancelled',
        evidenceKind: 'packet',
        graphicsReportUnavailableReason: missingGraphicsReason
      };
    }
  }

  const destinationSelection = await deps.showOpenDialog({
    canSelectFiles: false,
    canSelectFolders: true,
    canSelectMany: false,
    openLabel: 'Export Comparison Report',
    title: 'Choose a folder to export the comparison report',
    ...(deps.defaultDestinationDirectory
      ? { defaultUri: deps.uriFile(deps.defaultDestinationDirectory) }
      : {})
  });
  const chosenDirectory = destinationSelection?.[0]?.fsPath;
  if (!chosenDirectory) {
    return {
      outcome: 'cancelled',
      evidenceKind: plan.evidenceKind,
      ...(missingGraphicsReason ? { graphicsReportUnavailableReason: missingGraphicsReason } : {})
    };
  }

  const now = (deps.now ?? defaultNow)();
  const bundleDirectoryPath = path.join(
    chosenDirectory,
    buildComparisonReportExportDirectoryName(source.reportTitle, now)
  );

  let bundle: ComparisonReportExportBundleResult;
  try {
    bundle = await (deps.exportBundle ?? exportComparisonReportBundle)({
      plan,
      destinationDirectory: bundleDirectoryPath,
      revisionContext: {
        relativePath: source.relativePath,
        selectedHash: source.selectedHash,
        baseHash: source.baseHash,
        selectedRevision: source.selectedRevision,
        baseRevision: source.baseRevision
      }
    });
  } catch (error) {
    const failureReason = error instanceof Error ? error.message : String(error);
    void deps.showErrorMessage(`VI History could not export the comparison report: ${failureReason}`);
    return {
      outcome: 'export-failed',
      evidenceKind: plan.evidenceKind,
      bundleDirectoryPath,
      failureReason,
      ...(missingGraphicsReason ? { graphicsReportUnavailableReason: missingGraphicsReason } : {})
    };
  }

  const exportedLabel =
    plan.evidenceKind === 'packet'
      ? 'diagnostic evidence packet (no LabVIEW graphics report was available)'
      : 'comparison report with graphics';
  void deps
    .showInformationMessage(
      `Exported ${exportedLabel} to ${bundle.exportedHtmlPath}.`,
      OPEN_IN_BROWSER_ACTION,
      SHOW_IN_FOLDER_ACTION
    )
    .then((selection) => {
      if (selection === OPEN_IN_BROWSER_ACTION) {
        void deps.openExternal(deps.uriFile(bundle.exportedHtmlPath));
      } else if (selection === SHOW_IN_FOLDER_ACTION) {
        void deps.executeCommand('revealFileInOS', deps.uriFile(bundle.exportedHtmlPath));
      }
    });

  return {
    outcome: 'exported',
    evidenceKind: plan.evidenceKind,
    bundleDirectoryPath,
    exportedHtmlPath: bundle.exportedHtmlPath,
    exportedAssetsDirectoryPath: bundle.exportedAssetsDirectoryPath,
    copiedAssets: bundle.copiedAssets,
    ...(missingGraphicsReason ? { graphicsReportUnavailableReason: missingGraphicsReason } : {})
  };
}

/**
 * Tracks the export source for the currently active comparison-report webview
 * panel. The title-bar export command receives no panel reference, so this
 * registry resolves which retained report the user is looking at.
 */
export class ComparisonReportExportRegistry {
  private activeSource: ComparisonReportExportSource | undefined;

  register(panel: vscode.WebviewPanel, source: ComparisonReportExportSource): void {
    if (panel.active) {
      this.activeSource = source;
    }
    panel.onDidChangeViewState((event) => {
      if (event.webviewPanel.active) {
        this.activeSource = source;
      } else if (this.activeSource === source) {
        this.activeSource = undefined;
      }
    });
    panel.onDidDispose(() => {
      if (this.activeSource === source) {
        this.activeSource = undefined;
      }
    });
  }

  getActiveSource(): ComparisonReportExportSource | undefined {
    return this.activeSource;
  }
}

async function defaultPathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

function defaultNow(): Date {
  return new Date();
}

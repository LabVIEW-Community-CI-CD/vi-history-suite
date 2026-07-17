// LabVIEW CLI diagnostics classification and diagnostic-path resolution helpers
// (supporting VHS-REQ-659). Extracted verbatim from comparisonReportRuntimeExecution
// to keep pure diagnostic-text classification and path resolution separate from
// runtime orchestration (per the reporting-orchestration guardrails). Behavior is
// unchanged.
import * as path from 'node:path';

import {
  normalizeComparablePath,
  normalizeWindowsInteropExecutable
} from './windowsInteropPaths';

export interface RuntimeDiagnosticPathMapping {
  runtimeRoot: string;
  hostRoot: string;
}

// Parse the LabVIEW CLI "started logging in file:" banner to recover the runtime
// diagnostic log path, or `undefined` when absent.
export function parseLabviewCliDiagnosticLogPath(stdout: string): string | undefined {
  const match = stdout.match(/LabVIEWCLI started logging in file:\s*([^\r\n]+)/m);
  return match?.[1]?.trim();
}

// Resolve a host-readable path for a runtime diagnostic log, applying the
// runtime->host mapping when present, otherwise normalizing by platform.
export function resolveHostReadableDiagnosticPath(
  diagnosticLogPath: string,
  processPlatform: NodeJS.Platform = process.platform,
  diagnosticPathMapping?: RuntimeDiagnosticPathMapping
): string | undefined {
  const trimmed = diagnosticLogPath.trim();
  const mappedContainerPath = resolveMappedRuntimeDiagnosticPath(diagnosticLogPath, diagnosticPathMapping);
  if (mappedContainerPath) {
    return mappedContainerPath;
  }

  if (diagnosticPathMapping) {
    return undefined;
  }

  if (processPlatform === 'win32') {
    return trimmed || undefined;
  }

  if (trimmed.startsWith('/')) {
    return trimmed;
  }

  return normalizeWindowsInteropExecutable(trimmed);
}

// Map a runtime-root-relative diagnostic path into the corresponding host-root
// path, or `undefined` when no mapping applies or the path is outside the runtime
// root.
export function resolveMappedRuntimeDiagnosticPath(
  diagnosticLogPath: string,
  diagnosticPathMapping?: RuntimeDiagnosticPathMapping
): string | undefined {
  if (!diagnosticPathMapping) {
    return undefined;
  }

  const normalizedRuntimeRoot = normalizeComparablePath(diagnosticPathMapping.runtimeRoot);
  const normalizedDiagnostic = normalizeComparablePath(diagnosticLogPath);
  if (!normalizedRuntimeRoot || !normalizedDiagnostic) {
    return undefined;
  }

  if (!normalizedDiagnostic.startsWith(normalizedRuntimeRoot)) {
    return undefined;
  }

  const relativeWindowsPath = diagnosticLogPath
    .trim()
    .slice(diagnosticPathMapping.runtimeRoot.length)
    .replace(/^[\\/]+/, '');
  const relativeSegments = relativeWindowsPath
    .replaceAll('\\', '/')
    .split('/')
    .filter((segment) => segment.length > 0);

  return path.join(diagnosticPathMapping.hostRoot, ...relativeSegments);
}

// Classify LabVIEW CLI diagnostic text into a structured failure reason plus
// human-readable notes (invalid VI path, ignored -LabVIEWPath, password
// protected, Error 66 / Call By Reference, file-permission error, success).
export function classifyLabviewCliDiagnosticText(
  diagnosticText: string,
  expectedLabviewPath?: string
): {
  reason?: string;
  notes: string[];
} {
  const notes: string[] = [];
  const launchSucceeded = /LabVIEW launched successfully\./i.test(diagnosticText);
  const connectedToLabview = /Connection established with LabVIEW at port number \d+\./i.test(
    diagnosticText
  );
  const invalidPathLines = diagnosticText.match(/^.*path invalid or does not exist:\s*.+$/gim);
  if (invalidPathLines && invalidPathLines.length > 0) {
    notes.push(
      `LabVIEW CLI rejected one or more supplied paths: ${invalidPathLines
        .map((line) => line.trim())
        .join(' | ')}.`
    );
    return {
      reason: 'labview-cli-invalid-vi-path',
      notes: appendLaunchConfirmationNote(notes, launchSucceeded)
    };
  }
  const ignoredLabviewPathMatch = diagnosticText.match(
    /"LabVIEWPath" command line argument is not passed\.\s*Using last used LabVIEW:\s*"([^"]+)"/i
  );
  if (ignoredLabviewPathMatch) {
    const actualLabviewPath = ignoredLabviewPathMatch[1];
    const normalizedExpectedPath = normalizeComparablePath(expectedLabviewPath);
    const normalizedActualPath = normalizeComparablePath(actualLabviewPath);
    if (normalizedExpectedPath && normalizedExpectedPath === normalizedActualPath) {
      notes.push(
        `LabVIEW CLI ignored the explicit -LabVIEWPath selection, but the last-used LabVIEW matched the intended executable: ${actualLabviewPath}.`
      );
      return {
        reason: 'labview-path-ignored-last-used-matched-selection',
        notes: appendLaunchConfirmationNote(notes, launchSucceeded)
      };
    }

    if (normalizedExpectedPath && normalizedExpectedPath !== normalizedActualPath) {
      notes.push(
        `LabVIEW CLI ignored the explicit -LabVIEWPath selection and used a different last-used LabVIEW instead: ${actualLabviewPath}.`
      );
      notes.push(`Intended explicit LabVIEW path: ${expectedLabviewPath}.`);
      return {
        reason: 'labview-path-ignored-last-used-diverged-selection',
        notes: appendLaunchConfirmationNote(notes, launchSucceeded)
      };
    }

    notes.push(
      `LabVIEW CLI ignored the explicit -LabVIEWPath selection and used the last-used LabVIEW instead: ${actualLabviewPath}.`
    );
    return {
      reason: 'labview-path-ignored-last-used-default',
      notes: appendLaunchConfirmationNote(notes, launchSucceeded)
    };
  }

  if (/VI is password protected\./i.test(diagnosticText)) {
    notes.push(
      connectedToLabview
        ? 'LabVIEW CLI connected to LabVIEW before CreateComparisonReport failed because one or both selected VI revisions are password protected.'
        : 'LabVIEW CLI could not generate a comparison report because one or both selected VI revisions are password protected.'
    );
    return {
      reason: 'labview-cli-vi-password-protected',
      notes: connectedToLabview ? notes : appendLaunchConfirmationNote(notes, launchSucceeded)
    };
  }

  if (
    connectedToLabview &&
    /Error code\s*:\s*66\b/i.test(diagnosticText) &&
    /Call By Reference/i.test(diagnosticText)
  ) {
    notes.push(
      'LabVIEW CLI established a VI Server connection before failing with Error 66 / Call By Reference.'
    );
    return {
      reason: 'labview-cli-call-by-reference',
      notes: appendLaunchConfirmationNote(notes, launchSucceeded)
    };
  }

  if (
    /\(Hex 0x8\) File permission error\./i.test(diagnosticText) &&
    /CreateComparisonReport operation failed\./i.test(diagnosticText)
  ) {
    notes.push(
      launchSucceeded
        ? 'LabVIEW CLI launched LabVIEW successfully but CreateComparisonReport returned LabVIEW error 8 (File permission error) while writing the report.'
        : 'LabVIEW CLI reported CreateComparisonReport returned LabVIEW error 8 (File permission error).'
    );
    return {
      reason: 'labview-cli-create-report-permission-error',
      notes: appendLaunchConfirmationNote(notes, launchSucceeded)
    };
  }

  if (/CreateComparisonReport operation succeeded\./i.test(diagnosticText)) {
    notes.push('LabVIEW CLI reported that CreateComparisonReport operation succeeded.');
    return {
      notes
    };
  }

  if (launchSucceeded) {
    notes.push('LabVIEW CLI reported that LabVIEW launched successfully before the operation failed.');
  }

  return {
    notes
  };
}

function appendLaunchConfirmationNote(notes: string[], launchSucceeded: boolean): string[] {
  if (!launchSucceeded) {
    notes.push('The retained LabVIEW CLI diagnostic log did not report successful LabVIEW launch before exit.');
  }

  return notes;
}

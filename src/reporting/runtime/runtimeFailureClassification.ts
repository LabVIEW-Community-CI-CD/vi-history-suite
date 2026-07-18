// Runtime failure classification helpers (supporting VHS-REQ-659). Extracted
// verbatim from comparisonReportRuntimeExecution to keep pure failure/timeout/
// cancellation classification separate from runtime orchestration (per the
// reporting-orchestration guardrails). Behavior is unchanged.
import type { RuntimeProcessObservation } from '../comparisonReportRuntimeExecution';
import { isLabviewCliLogOnlyStdout } from './diagnosticNotes';

// Classify a completed comparison-report runtime failure into a stable reason +
// notes from exit code, report presence, engine, bitness, stdio, and process
// observations.
export function classifyRuntimeFailure(options: {
  engine?: 'labview-cli' | 'lvcompare';
  exitCode: number;
  reportExists: boolean;
  selectedBitness?: 'x86' | 'x64';
  stdout: string;
  stderr: string;
  processObservation?: RuntimeProcessObservation;
  exitProcessObservation?: RuntimeProcessObservation;
}): {
  reason: string;
  notes: string[];
} {
  if (options.exitCode === 0 && !options.reportExists) {
    if (options.engine === 'lvcompare') {
      return {
        reason: 'lvcompare-exited-zero-without-report',
        notes: ['LVCompare exited 0 without generating the report file.']
      };
    }

    return {
      reason: 'report-file-not-generated',
      notes: []
    };
  }

  if (
    options.exitCode !== 0 &&
    !options.reportExists &&
    options.engine === 'labview-cli' &&
    options.stderr.trim().length === 0 &&
    isLabviewCliLogOnlyStdout(options.stdout)
  ) {
    if (
      options.processObservation?.trigger === 'cli-log-banner' &&
      options.processObservation.labviewCliProcessObserved &&
      !options.processObservation.labviewProcessObserved &&
      options.exitProcessObservation?.trigger === 'process-exit' &&
      options.exitProcessObservation.labviewCliProcessObserved &&
      !options.exitProcessObservation.labviewProcessObserved
    ) {
      return {
        reason: 'labview-cli-log-only-no-labview-through-exit',
        notes: [
          'LabVIEW CLI exited nonzero without stderr and without generating a report; at the retained cli-log-banner and process-exit snapshots, LabVIEWCLI.exe was observed while LabVIEW.exe was not observed.'
        ]
      };
    }

    if (
      options.processObservation?.trigger === 'cli-log-banner' &&
      options.processObservation.labviewCliProcessObserved &&
      !options.processObservation.labviewProcessObserved
    ) {
      return {
        reason: 'labview-cli-log-only-no-labview-at-banner-snapshot',
        notes: [
          'LabVIEW CLI exited nonzero without stderr and without generating a report; at the retained cli-log-banner snapshot, LabVIEWCLI.exe was observed while LabVIEW.exe was not observed.'
        ]
      };
    }

    return {
      reason: 'labview-cli-exited-nonzero-log-only-no-report',
      notes: [
        'LabVIEW CLI exited nonzero without stderr and without generating a report; stdout only advertised the diagnostic log path.'
      ]
    };
  }

  if (options.exitCode !== 0) {
    // VHS-REQ-658: LabVIEW error 0x465 ("File version is later than the current
    // LabVIEW version") means a staged revision of the VI was saved in a newer
    // LabVIEW than the selected engine. LabVIEW is not forward-compatible, so it
    // refuses to open the VI and the compare fails before any diff is produced.
    // Surface a specific, actionable reason instead of the generic nonzero exit
    // so the user is steered to pick a newer installed LabVIEW. Keyed on the
    // engine-agnostic stderr signature (the CLI propagates the LabVIEW error
    // code as exit code 1125 = 0x465, but the stderr text is the stable signal).
    if (/File version is later than the current LabVIEW version/i.test(options.stderr)) {
      return {
        reason: 'labview-vi-version-too-new',
        notes: [
          'LabVIEW reported that the VI file version is later than the selected LabVIEW version (error 0x465); the VI was saved in a newer LabVIEW than the selected engine, which cannot open a forward-version VI.'
        ]
      };
    }

    if (options.engine === 'labview-cli' && /Error code\s*:\s*-350000\b/i.test(options.stderr)) {
      return {
        reason: 'labview-cli-connection-failed',
        notes: [
          'LabVIEW CLI launched or reused a headless LabVIEW session but failed to establish the required VI Server connection.'
        ]
      };
    }

    // VHS-REQ-621: Race-condition fallback. Preflight may have admitted a
    // host runtime that became contaminated by a different-bitness LabVIEW
    // launched between preflight and process-exit. Reclassify so the user
    // sees the actionable bitness-conflict diagnostic instead of the generic
    // nonzero exit message.
    if (
      options.selectedBitness &&
      options.exitProcessObservation?.labviewProcessObserved === true &&
      options.exitProcessObservation.labviewProcessBitness &&
      options.exitProcessObservation.labviewProcessBitness !== 'unknown' &&
      options.exitProcessObservation.labviewProcessBitness !== options.selectedBitness
    ) {
      const observed = options.exitProcessObservation.labviewProcessBitness;
      return {
        reason: 'labview-host-bitness-conflict',
        notes: [
          `LabVIEW ${observed} was running at the retained process-exit snapshot while comparison-report execution targeted LabVIEW ${options.selectedBitness}; LabVIEW refuses to start a second instance at a different bitness, which is consistent with the observed nonzero exit.`
        ]
      };
    }

    return {
      reason: 'command-exited-nonzero',
      notes: []
    };
  }

  return {
    reason: 'report-file-not-generated',
    notes: []
  };
}

// Classify a cancellation-shaped runtime failure, preserving a retained
// Call By Reference failure as a nonzero exit.
export function classifyCancelledRuntimeFailure(options: {
  engine?: 'labview-cli' | 'lvcompare';
  diagnosticReason?: string;
}): {
  reason: string;
  notes: string[];
} {
  if (
    options.engine === 'labview-cli' &&
    options.diagnosticReason === 'labview-cli-call-by-reference'
  ) {
    return {
      reason: 'command-exited-nonzero',
      notes: [
        'Comparison-report runtime retained a LabVIEW CLI Error 66 / Call By Reference failure before a cancellation-shaped transport exit was observed.'
      ]
    };
  }

  return {
    reason: 'command-cancelled',
    notes: ['Comparison-report runtime was cancelled before completion.']
  };
}

// Classify a LabVIEW CLI timeout diagnostic from the retained process
// observations (CLI observed but LabVIEW not launched).
export function classifyTimedOutRuntimeDiagnostic(options: {
  engine?: 'labview-cli' | 'lvcompare';
  processObservation?: RuntimeProcessObservation;
  exitProcessObservation?: RuntimeProcessObservation;
}): {
  reason?: string;
  notes: string[];
} {
  if (
    options.engine !== 'labview-cli' ||
    options.processObservation?.trigger !== 'cli-log-banner' ||
    !options.processObservation.labviewCliProcessObserved ||
    options.processObservation.labviewProcessObserved
  ) {
    return {
      notes: []
    };
  }

  if (
    options.exitProcessObservation?.trigger === 'process-exit' &&
    !options.exitProcessObservation.labviewProcessObserved &&
    !options.exitProcessObservation.labviewCliProcessObserved &&
    !options.exitProcessObservation.lvcompareProcessObserved
  ) {
    return {
      reason: 'labview-cli-timeout-no-labview-through-exit',
      notes: [
        'LabVIEW CLI timed out without generating a report; at the retained cli-log-banner snapshot, LabVIEWCLI.exe was observed while LabVIEW.exe was not observed, and no LabVIEW-related processes remained at the retained process-exit snapshot.'
      ]
    };
  }

  return {
    reason: 'labview-cli-timeout-no-labview-at-banner-snapshot',
    notes: [
      'LabVIEW CLI timed out without generating a report; at the retained cli-log-banner snapshot, LabVIEWCLI.exe was observed while LabVIEW.exe was not observed.'
    ]
  };
}

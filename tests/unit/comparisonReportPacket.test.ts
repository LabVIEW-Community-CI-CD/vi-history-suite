import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import {
  ComparisonReportPacketDeps,
  ComparisonReportPacketRecord,
  ComparisonReportRuntimeExecution,
  PersistComparisonReportPacketOptions,
  persistComparisonReportPacket,
  renderComparisonReportPacketHtml,
  formatComparisonRevisionHashDisplay,
  writeComparisonReportPacketRecord
} from '../../src/reporting/comparisonReportPacket';
import { toRevisionMetadata } from '../../src/reporting/comparisonRevisionMetadata';
import { deriveProviderRequestLabel } from '../../src/reporting/comparisonProviderRequestLabel';
import { renderCommand } from '../../src/reporting/comparisonReportCommandRendering';
import {
  renderRevisionBodyValue,
  renderRevisionMetadataValue,
  renderOptionalYesNo
} from '../../src/reporting/comparisonReportPacketHtmlValues';

/**
 * Creates a minimal ready-for-runtime record with customizable runtime execution.
 */
function createBaseRecord(
  executionOverrides: Partial<ComparisonReportRuntimeExecution> = {},
  recordOverrides: Partial<ComparisonReportPacketRecord> = {}
): ComparisonReportPacketRecord {
  const reportDirectory = '/workspace/.storage/reports/repoid123456/fileid123456';
  const stagingDirectory = `${reportDirectory}/staging`;

  return {
    generatedAt: '2026-04-02T00:00:00.000Z',
    reportTitle: 'VI Comparison Report: foo.vi',
    reportStatus: 'ready-for-runtime',
    reportType: 'diff',
    selectedHash: 'abcdef1234567890',
    baseHash: '1111111122222222',
    artifactPlan: {
      repoId: 'repoid123456',
      fileId: 'fileid123456',
      reportType: 'diff',
      fullFilename: 'foo.vi',
      normalizedRelativePath: 'foo.vi',
      reportDirectory,
      stagingDirectory,
      reportFilename: 'diff-report-foo.vi.html',
      reportFilePath: `${reportDirectory}/diff-report-foo.vi.html`,
      packetFilename: 'report-packet.html',
      packetFilePath: `${reportDirectory}/report-packet.html`,
      metadataFilePath: `${reportDirectory}/report-metadata.json`,
      runtimeStdoutFilePath: `${reportDirectory}/runtime-stdout.txt`,
      runtimeStderrFilePath: `${reportDirectory}/runtime-stderr.txt`,
      runtimeDiagnosticLogFilePath: `${reportDirectory}/runtime-diagnostic-log.txt`,
      runtimeProcessObservationFilePath: `${reportDirectory}/runtime-process-observation.json`,
      allowedLocalRootPaths: ['/workspace/.storage', '/workspace/.storage/reports/repoid123456']
    },
    stagedRevisionPlan: {
      leftFilename: 'left-111111112222-foo.vi',
      leftFilePath: `${stagingDirectory}/left-111111112222-foo.vi`,
      rightFilename: 'right-abcdef123456-foo.vi',
      rightFilePath: `${stagingDirectory}/right-abcdef123456-foo.vi`
    },
    preflight: {
      normalizedRelativePath: 'foo.vi',
      ready: true,
      left: {
        revisionId: '1111111122222222',
        blobSpecifier: '1111111122222222:foo.vi',
        signature: 'LVIN',
        isVi: true
      },
      right: {
        revisionId: 'abcdef1234567890',
        blobSpecifier: 'abcdef1234567890:foo.vi',
        signature: 'LVCC',
        isVi: true
      }
    },
    runtimeSelection: {
      platform: 'win32',
      bitness: 'x86',
      provider: 'host-native',
      engine: 'labview-cli',
      labviewExe: {
        kind: 'labview-exe',
        path: 'C:\\Program Files (x86)\\National Instruments\\LabVIEW 2026 Q1\\LabVIEW.exe',
        source: 'configured',
        exists: true,
        bitness: 'x86'
      },
      labviewCli: {
        kind: 'labview-cli',
        path: 'C:\\Program Files\\National Instruments\\Shared\\LabVIEW CLI\\LabVIEWCLI.exe',
        source: 'configured',
        exists: true,
        bitness: 'x64'
      },
      notes: [],
      registryQueryPlans: [],
      candidates: []
    },
    runtimeExecutionState: 'not-run',
    runtimeExecution: {
      state: 'not-run',
      attempted: false,
      reportExists: false,
      stdoutFilePath: `${reportDirectory}/runtime-stdout.txt`,
      stderrFilePath: `${reportDirectory}/runtime-stderr.txt`,
      ...executionOverrides
    },
    ...recordOverrides
  };
}

function extractCompactEvidenceSummary(html: string): string {
  const compactSummaryMatch = html.match(
    /<div class="status" data-testid="comparison-report-compact-evidence-summary">[\s\S]*?<\/div>/
  );
  if (!compactSummaryMatch) {
    throw new Error('Expected compact evidence summary block to exist.');
  }
  return compactSummaryMatch[0];
}

describe('formatComparisonRevisionHashDisplay (VHS-REQ-641.6)', () => {
  it('renders the WORKTREE sentinel as a human-readable label', () => {
    expect(formatComparisonRevisionHashDisplay('WORKTREE')).toBe('Working tree (uncommitted)');
  });

  it('renders a committed hash verbatim', () => {
    expect(formatComparisonRevisionHashDisplay('abcdef1234567890')).toBe('abcdef1234567890');
  });

  it('falls back to "not retained" for an absent id', () => {
    expect(formatComparisonRevisionHashDisplay(undefined)).toBe('not retained');
  });
});

describe('comparisonReportPacket retained evidence (VHS-REQ-148)', () => {
  describe('retained metadata completeness', () => {
    it('renders exit code in the execution summary when present', () => {
      const record = createBaseRecord({
        state: 'succeeded',
        attempted: true,
        reportExists: true,
        exitCode: 0,
        durationMs: 3000
      });
      record.runtimeExecutionState = 'succeeded';

      const html = renderComparisonReportPacketHtml(record);

      expect(html).toContain('<strong>Exit code:</strong> 0');
    });

    it('renders exit code as none when not present', () => {
      const record = createBaseRecord({
        state: 'not-run',
        attempted: false,
        reportExists: false
      });

      const html = renderComparisonReportPacketHtml(record);

      expect(html).toContain('<strong>Exit code:</strong> none');
    });

    it('renders duration in the execution summary when present', () => {
      const record = createBaseRecord({
        state: 'succeeded',
        attempted: true,
        reportExists: true,
        exitCode: 0,
        durationMs: 5432
      });
      record.runtimeExecutionState = 'succeeded';

      const html = renderComparisonReportPacketHtml(record);

      expect(html).toContain('<strong>Duration (ms):</strong> 5432');
    });

    it('renders stdout artifact path in the execution summary', () => {
      const stdoutPath = '/workspace/.storage/reports/repoid123456/fileid123456/runtime-stdout.txt';
      const record = createBaseRecord({
        state: 'succeeded',
        attempted: true,
        reportExists: true,
        exitCode: 0,
        stdoutFilePath: stdoutPath
      });
      record.runtimeExecutionState = 'succeeded';

      const html = renderComparisonReportPacketHtml(record);

      expect(html).toContain('<strong>Stdout artifact:</strong>');
      expect(html).toContain(stdoutPath);
    });

    it('renders stderr artifact path in the execution summary', () => {
      const stderrPath = '/workspace/.storage/reports/repoid123456/fileid123456/runtime-stderr.txt';
      const record = createBaseRecord({
        state: 'failed',
        attempted: true,
        reportExists: false,
        exitCode: 1,
        stderrFilePath: stderrPath
      });
      record.runtimeExecutionState = 'failed';

      const html = renderComparisonReportPacketHtml(record);

      expect(html).toContain('<strong>Stderr artifact:</strong>');
      expect(html).toContain(stderrPath);
    });

    it('renders report existence status in the execution summary', () => {
      const record = createBaseRecord({
        state: 'succeeded',
        attempted: true,
        reportExists: true
      });
      record.runtimeExecutionState = 'succeeded';

      const html = renderComparisonReportPacketHtml(record);

      expect(html).toContain('<strong>Report exists:</strong> yes');
    });

    it('renders failure reason in the execution summary when present', () => {
      const record = createBaseRecord({
        state: 'failed',
        attempted: true,
        reportExists: false,
        exitCode: 1,
        failureReason: 'command-exited-nonzero'
      });
      record.runtimeExecutionState = 'failed';

      const html = renderComparisonReportPacketHtml(record);

      expect(html).toContain('<strong>Failure reason:</strong> command-exited-nonzero');
    });

    it('renders blocked reason in the execution summary when present', () => {
      const record = createBaseRecord({
        state: 'not-available',
        attempted: false,
        reportExists: false,
        blockedReason: 'labview-exe-not-found'
      });
      record.runtimeExecutionState = 'not-available';
      record.reportStatus = 'blocked-runtime';
      record.runtimeSelection.provider = 'unavailable';
      record.runtimeSelection.blockedReason = 'runtime-selection-unavailable';

      const html = renderComparisonReportPacketHtml(record);

      expect(html).toContain('<strong>Blocked reason:</strong> labview-exe-not-found');
    });
  });

  describe('packet HTML runtime execution summary rendering', () => {
    it('renders success runtime note when execution succeeded', () => {
      const record = createBaseRecord({
        state: 'succeeded',
        attempted: true,
        reportExists: true,
        exitCode: 0
      });
      record.runtimeExecutionState = 'succeeded';

      const html = renderComparisonReportPacketHtml(record);

      expect(html).toContain('data-testid="comparison-report-runtime-note"');
      expect(html).toContain(
        'LabVIEW-generated comparison report execution succeeded and the HTML output is retained at the report path shown below.'
      );
    });

    it('renders failure runtime note when execution failed', () => {
      const record = createBaseRecord({
        state: 'failed',
        attempted: true,
        reportExists: false,
        exitCode: 1,
        failureReason: 'command-exited-nonzero'
      });
      record.runtimeExecutionState = 'failed';

      const html = renderComparisonReportPacketHtml(record);

      expect(html).toContain('data-testid="comparison-report-runtime-note"');
      expect(html).toContain(
        'LabVIEW-generated comparison report execution was attempted, but the output is not currently usable. Review the retained execution summary and stdout/stderr artifact paths below.'
      );
    });

    it('renders not-available runtime note when runtime is unavailable', () => {
      const record = createBaseRecord({
        state: 'not-available',
        attempted: false,
        reportExists: false,
        blockedReason: 'labview-exe-not-found'
      });
      record.runtimeExecutionState = 'not-available';
      record.reportStatus = 'blocked-runtime';
      record.runtimeSelection.provider = 'unavailable';
      record.runtimeSelection.blockedReason = 'labview-exe-not-found';

      const html = renderComparisonReportPacketHtml(record);

      expect(html).toContain('data-testid="comparison-report-runtime-note"');
      expect(html).toContain(
        'No LabVIEW-generated comparison report has been executed because the runtime selection is currently unavailable for this workspace and platform.'
      );
    });

    it('renders container acquisition failure note when container image acquisition failed', () => {
      const record = createBaseRecord({
        state: 'not-available',
        attempted: false,
        reportExists: false,
        blockedReason: 'container-image-acquisition-failed'
      });
      record.runtimeExecutionState = 'not-available';
      record.reportStatus = 'blocked-runtime';
      record.runtimeSelection.provider = 'unavailable';
      record.runtimeSelection.blockedReason = 'container-image-acquisition-failed';

      const html = renderComparisonReportPacketHtml(record);

      expect(html).toContain(
        'No LabVIEW-generated comparison report has been executed because the container image could not be acquired before runtime launch.'
      );
    });

    it('renders not-run note when execution has not been attempted', () => {
      const record = createBaseRecord({
        state: 'not-run',
        attempted: false,
        reportExists: false
      });
      record.runtimeExecutionState = 'not-run';

      const html = renderComparisonReportPacketHtml(record);

      expect(html).toContain('data-testid="comparison-report-runtime-note"');
      expect(html).toContain(
        'No LabVIEW-generated comparison report has been executed yet. This retained packet captures the preflight, runtime selection, and artifact plan for the selected revision pair.'
      );
    });
  });

  describe('packet HTML doctor summary rendering', () => {
    it('renders doctor summary lines when present (VHS-REQ-155.3)', () => {
      const record = createBaseRecord({
        state: 'failed',
        attempted: true,
        reportExists: false,
        exitCode: 1,
        failureReason: 'command-exited-nonzero',
        doctorSummaryLines: [
          'Selected provider=host-native; engine=labview-cli; platform=win32; bitness=x86.',
          'Execution failed reason: command-exited-nonzero.'
        ]
      });
      record.runtimeExecutionState = 'failed';

      const html = renderComparisonReportPacketHtml(record);

      expect(html).toContain('data-testid="comparison-report-runtime-doctor"');
      expect(html).toContain('<strong>Runtime doctor:</strong>');
      expect(html).toContain('<li>Selected provider=host-native; engine=labview-cli; platform=win32; bitness=x86.</li>');
      expect(html).toContain('<li>Execution failed reason: command-exited-nonzero.</li>');
    });

    it('does not render doctor summary section when no lines are present', () => {
      const record = createBaseRecord({
        state: 'succeeded',
        attempted: true,
        reportExists: true,
        exitCode: 0,
        doctorSummaryLines: []
      });
      record.runtimeExecutionState = 'succeeded';

      const html = renderComparisonReportPacketHtml(record);

      expect(html).not.toContain('data-testid="comparison-report-runtime-doctor"');
    });

    it('does not render doctor summary section when doctorSummaryLines is undefined', () => {
      const record = createBaseRecord({
        state: 'succeeded',
        attempted: true,
        reportExists: true,
        exitCode: 0
      });
      record.runtimeExecutionState = 'succeeded';
      delete record.runtimeExecution.doctorSummaryLines;

      const html = renderComparisonReportPacketHtml(record);

      expect(html).not.toContain('data-testid="comparison-report-runtime-doctor"');
    });
  });

  describe('missing report output fails closed', () => {
    it('retains reportExists=false when command exits successfully but report file is missing', () => {
      const record = createBaseRecord({
        state: 'failed',
        attempted: true,
        reportExists: false,
        exitCode: 0,
        failureReason: 'report-not-produced'
      });
      record.runtimeExecutionState = 'failed';

      const html = renderComparisonReportPacketHtml(record);

      expect(html).toContain('<strong>Report exists:</strong> no');
      expect(html).toContain('<strong>Exit code:</strong> 0');
      expect(html).toContain('<strong>Failure reason:</strong> report-not-produced');
      expect(html).toContain('data-testid="comparison-report-generated-report-missing"');
      expect(html).toContain(
        'No LabVIEW-generated HTML report is currently retained at the selected output path.'
      );
    });

    it('renders generated report section when report exists', () => {
      const record = createBaseRecord({
        state: 'succeeded',
        attempted: true,
        reportExists: true,
        exitCode: 0
      });
      record.runtimeExecutionState = 'succeeded';

      const html = renderComparisonReportPacketHtml(record);

      expect(html).toContain('data-testid="comparison-report-generated-report"');
      expect(html).toContain('<strong>Generated report file:</strong>');
      expect(html).toContain('diff-report-foo.vi.html');
      expect(html).not.toContain('data-testid="comparison-report-generated-report-missing"');
    });

    it('renders missing report section when report does not exist', () => {
      const record = createBaseRecord({
        state: 'failed',
        attempted: true,
        reportExists: false,
        exitCode: 1
      });
      record.runtimeExecutionState = 'failed';

      const html = renderComparisonReportPacketHtml(record);

      expect(html).toContain('data-testid="comparison-report-generated-report-missing"');
      expect(html).toContain(
        'No LabVIEW-generated HTML report is currently retained at the selected output path.'
      );
      expect(html).not.toContain('data-testid="comparison-report-generated-report"');
    });
  });

  describe('HTML escaping for factual evidence (VHS-REQ-148.6)', () => {
    it('escapes angle brackets in report title', () => {
      const record = createBaseRecord();
      record.reportTitle = 'VI Comparison Report: <script>alert("xss")</script>.vi';

      const html = renderComparisonReportPacketHtml(record);

      expect(html).toContain('&lt;script&gt;alert');
      expect(html).toContain('&lt;/script&gt;');
      expect(html).not.toContain('<script>');
    });

    it('escapes ampersands in file paths', () => {
      const record = createBaseRecord();
      record.artifactPlan.normalizedRelativePath = 'folder&name/file.vi';

      const html = renderComparisonReportPacketHtml(record);

      expect(html).toContain('folder&amp;name/file.vi');
      expect(html).not.toContain('folder&name/file.vi');
    });

    it('escapes quotes in failure reason', () => {
      const record = createBaseRecord({
        state: 'failed',
        attempted: true,
        reportExists: false,
        failureReason: 'error: "unexpected" condition'
      });
      record.runtimeExecutionState = 'failed';

      const html = renderComparisonReportPacketHtml(record);

      expect(html).toContain('&quot;unexpected&quot;');
    });

    it('escapes single quotes in diagnostic notes', () => {
      const record = createBaseRecord({
        state: 'failed',
        attempted: true,
        reportExists: false,
        diagnosticNotes: ["LabVIEW can't connect to port 3363"]
      });
      record.runtimeExecutionState = 'failed';

      const html = renderComparisonReportPacketHtml(record);

      expect(html).toContain("can&#39;t connect");
    });

    it('escapes angle brackets in runtime doctor summary lines', () => {
      const record = createBaseRecord({
        state: 'failed',
        attempted: true,
        reportExists: false,
        doctorSummaryLines: ['Error <code>42</code> occurred.']
      });
      record.runtimeExecutionState = 'failed';

      const html = renderComparisonReportPacketHtml(record);

      expect(html).toContain('&lt;code&gt;42&lt;/code&gt;');
      expect(html).not.toContain('<code>42</code>');
    });

    it('escapes executable paths that may contain special characters', () => {
      const record = createBaseRecord({
        state: 'succeeded',
        attempted: true,
        reportExists: true,
        exitCode: 0,
        executable: 'C:\\Program Files\\NI & Co\\LabVIEW\\LabVIEW.exe',
        args: ['--arg="value"', "--opt='test'"]
      });
      record.runtimeExecutionState = 'succeeded';

      const html = renderComparisonReportPacketHtml(record);

      expect(html).toContain('NI &amp; Co');
      expect(html).toContain('&quot;value&quot;');
      expect(html).toContain("&#39;test&#39;");
    });
  });

  describe('factual evidence retention without semantic claims', () => {
    it('does not claim semantic comparison succeeded when report does not exist', () => {
      const record = createBaseRecord({
        state: 'failed',
        attempted: true,
        reportExists: false,
        exitCode: 0
      });
      record.runtimeExecutionState = 'failed';

      const html = renderComparisonReportPacketHtml(record);

      expect(html).not.toContain('comparison report execution succeeded');
      expect(html).toContain(
        'LabVIEW-generated comparison report execution was attempted, but the output is not currently usable.'
      );
    });

    it('only claims success when reportExists is true and state is succeeded', () => {
      const record = createBaseRecord({
        state: 'succeeded',
        attempted: true,
        reportExists: true,
        exitCode: 0
      });
      record.runtimeExecutionState = 'succeeded';

      const html = renderComparisonReportPacketHtml(record);

      expect(html).toContain(
        'LabVIEW-generated comparison report execution succeeded and the HTML output is retained at the report path shown below.'
      );
      expect(html).toContain('data-testid="comparison-report-generated-report"');
    });

    it('retains execution summary with diagnostic reason when present', () => {
      const record = createBaseRecord({
        state: 'failed',
        attempted: true,
        reportExists: false,
        exitCode: 124,
        failureReason: 'command-timed-out',
        diagnosticReason: 'labview-cli-timeout-no-labview-through-exit'
      });
      record.runtimeExecutionState = 'failed';

      const html = renderComparisonReportPacketHtml(record);

      expect(html).toContain('<strong>Diagnostic reason:</strong> labview-cli-timeout-no-labview-through-exit');
      expect(html).toContain('<strong>Failure reason:</strong> command-timed-out');
      expect(html).toContain('<strong>Exit code:</strong> 124');
    });
  });

  describe('execution summary section data-testid', () => {
    it('renders execution summary with correct data-testid', () => {
      const record = createBaseRecord({
        state: 'succeeded',
        attempted: true,
        reportExists: true,
        exitCode: 0
      });
      record.runtimeExecutionState = 'succeeded';

      const html = renderComparisonReportPacketHtml(record);

      expect(html).toContain('data-testid="comparison-report-runtime-execution"');
    });

    it('renders all core execution metadata fields', () => {
      const record = createBaseRecord({
        state: 'succeeded',
        attempted: true,
        reportExists: true,
        exitCode: 0,
        durationMs: 3000,
        stdoutFilePath: '/workspace/stdout.txt',
        stderrFilePath: '/workspace/stderr.txt',
        processObservationArtifactPath: '/workspace/observation.json'
      });
      record.runtimeExecutionState = 'succeeded';

      const html = renderComparisonReportPacketHtml(record);

      expect(html).toContain('<strong>Attempted:</strong> yes');
      expect(html).toContain('<strong>Report exists:</strong> yes');
      expect(html).toContain('<strong>Exit code:</strong> 0');
      expect(html).toContain('<strong>Duration (ms):</strong> 3000');
      expect(html).toContain('<strong>Stdout artifact:</strong>');
      expect(html).toContain('<strong>Stderr artifact:</strong>');
      expect(html).toContain('<strong>Process observation artifact:</strong>');
    });
  });

  describe('runtime doctor facts preserved end-to-end (VHS-REQ-155)', () => {
    it('retains blocked host runtime facts through packet rendering with provider decisions (VHS-REQ-155.4, VHS-REQ-155.5)', () => {
      const record = createBaseRecord(
        {
          state: 'not-available',
          attempted: false,
          reportExists: false,
          blockedReason: 'labview-exe-not-found',
          doctorSummaryLines: [
            'Selected provider=unavailable; engine=none; platform=win32; bitness=x64.',
            'Provider request=host.',
            'Requested runtime: provider=host; LabVIEW=2026; bitness=x64.',
            'Provider decision: rejected host-native because LabVIEW executable not found.',
            'Runtime blocked reason: labview-exe-not-found.',
            'Next action: install the selected LabVIEW version and bitness, or set viHistorySuite.labviewVersion and viHistorySuite.labviewBitness to an installed runtime. Then rerun comparison report generation.'
          ]
        },
        {
          reportStatus: 'blocked-runtime',
          runtimeSelection: {
            platform: 'win32',
            executionMode: 'host-only',
            requestedProvider: 'host',
            requestedLabviewVersion: '2026',
            bitness: 'x64',
            provider: 'unavailable',
            blockedReason: 'labview-exe-not-found',
            providerDecisions: [
              {
                provider: 'host-native',
                outcome: 'rejected',
                reason: 'labview-exe-not-found',
                detail: 'LabVIEW executable not found.'
              }
            ],
            notes: ['No matching LabVIEW x64 installation detected.'],
            registryQueryPlans: [],
            candidates: []
          }
        }
      );
      record.runtimeExecutionState = 'not-available';

      const html = renderComparisonReportPacketHtml(record);

      // Verify requested facts are preserved
      expect(html).toContain('data-testid="comparison-report-runtime-doctor"');
      expect(html).toContain('Selected provider=unavailable');
      expect(html).toContain('Provider request=host');
      expect(html).toContain('Requested runtime: provider=host; LabVIEW=2026; bitness=x64');
      // Verify provider decision is preserved
      expect(html).toContain('Provider decision: rejected host-native');
      // Verify blocked reason is preserved
      expect(html).toContain('Runtime blocked reason: labview-exe-not-found');
      // Verify actionable next step is preserved
      expect(html).toContain('Next action:');
      expect(html).toContain('install the selected LabVIEW version');
    });

    it('retains blocked Docker/container image runtime facts through packet rendering (VHS-REQ-155.4, VHS-REQ-155.5)', () => {
      const record = createBaseRecord(
        {
          state: 'not-available',
          attempted: false,
          reportExists: false,
          blockedReason: 'container-image-acquisition-failed',
          acquisitionState: 'failed',
          doctorSummaryLines: [
            'Selected provider=windows-container; engine=none; platform=win32; bitness=x64.',
            'Provider request=docker.',
            'Requested runtime: provider=docker; LabVIEW=2026; bitness=x64.',
            'Selected runtime tools: ContainerImage=nationalinstruments/labview:2026q1-windows | DockerCliAvailable=yes | DockerDaemonReachable=yes | ContainerHostMode=windows | ContainerCapability=yes | ContainerImagePresent=no | ContainerAcquisitionState=failed.',
            'Provider decision: rejected windows-container because container image acquisition failed.',
            'Runtime blocked reason: container-image-acquisition-failed.',
            'Next action: repair Docker connectivity or image registry access, then pull the Windows container image nationalinstruments/labview:2026q1-windows and rerun comparison report generation.'
          ]
        },
        {
          reportStatus: 'blocked-runtime',
          runtimeSelection: {
            platform: 'win32',
            executionMode: 'docker-only',
            requestedProvider: 'docker',
            requestedLabviewVersion: '2026',
            bitness: 'x64',
            provider: 'windows-container',
            containerImage: 'nationalinstruments/labview:2026q1-windows',
            dockerCliAvailable: true,
            dockerDaemonReachable: true,
            containerCapabilityAvailable: true,
            containerHostMode: 'windows',
            containerImageAvailable: false,
            containerAcquisitionState: 'failed',
            blockedReason: 'container-image-acquisition-failed',
            providerDecisions: [
              {
                provider: 'windows-container',
                outcome: 'rejected',
                reason: 'container-image-acquisition-failed',
                detail: 'Container image acquisition failed.'
              }
            ],
            notes: ['Container image pull failed during acquisition.'],
            registryQueryPlans: [],
            candidates: []
          }
        }
      );
      record.runtimeExecutionState = 'not-available';

      const html = renderComparisonReportPacketHtml(record);

      // Verify requested facts are preserved
      expect(html).toContain('data-testid="comparison-report-runtime-doctor"');
      expect(html).toContain('Provider request=docker');
      expect(html).toContain('Requested runtime: provider=docker; LabVIEW=2026; bitness=x64');
      // Verify checked container facts are preserved
      expect(html).toContain('ContainerImage=nationalinstruments/labview:2026q1-windows');
      expect(html).toContain('DockerCliAvailable=yes');
      expect(html).toContain('DockerDaemonReachable=yes');
      expect(html).toContain('ContainerImagePresent=no');
      expect(html).toContain('ContainerAcquisitionState=failed');
      // Verify provider decision is preserved
      expect(html).toContain('Provider decision: rejected windows-container');
      // Verify blocked reason is preserved
      expect(html).toContain('Runtime blocked reason: container-image-acquisition-failed');
      // Verify actionable next step is preserved
      expect(html).toContain('Next action:');
      expect(html).toContain('repair Docker connectivity');
    });

    it('preserves runtime selection surface facts separately from doctor summary (VHS-REQ-155.5)', () => {
      const record = createBaseRecord(
        {
          state: 'not-available',
          attempted: false,
          reportExists: false,
          blockedReason: 'docker-provider-unavailable',
          doctorSummaryLines: [
            'Selected provider=unavailable; engine=none; platform=win32; bitness=x64.',
            'Provider request=docker.',
            'Requested runtime: provider=docker; LabVIEW=2026; bitness=x64.',
            'Runtime blocked reason: docker-provider-unavailable.',
            'Next action: install Docker Desktop, start it once, and confirm `docker info` succeeds or set viHistorySuite.runtimeProvider to host, then rerun comparison report generation.'
          ]
        },
        {
          reportStatus: 'blocked-runtime',
          runtimeSelection: {
            platform: 'win32',
            executionMode: 'docker-only',
            requestedProvider: 'docker',
            requestedLabviewVersion: '2026',
            bitness: 'x64',
            provider: 'unavailable',
            dockerCliAvailable: false,
            dockerDaemonReachable: false,
            containerCapabilityAvailable: false,
            blockedReason: 'docker-provider-unavailable',
            providerDecisions: [
              {
                provider: 'windows-container',
                outcome: 'rejected',
                reason: 'docker-provider-unavailable',
                detail: 'Docker CLI is not available.'
              }
            ],
            notes: ['Docker CLI is not available.'],
            registryQueryPlans: [],
            candidates: []
          }
        }
      );
      record.runtimeExecutionState = 'not-available';

      const html = renderComparisonReportPacketHtml(record);

      // Verify runtime selection surface shows Docker facts
      expect(html).toContain('data-testid="comparison-report-runtime-selection"');
      expect(html).toContain('<strong>Docker CLI available:</strong> no');
      expect(html).toContain('<strong>Docker daemon reachable:</strong> no');
      expect(html).toContain('<strong>Container capability:</strong> no');
      // Verify runtime notes are preserved
      expect(html).toContain('data-testid="comparison-report-runtime-selection-notes"');
      expect(html).toContain('Docker CLI is not available');
    });
  });

  describe('compact evidence summary rendering (VHS-REQ-148, VHS-REQ-148.5, VHS-REQ-148.6)', () => {
    it('renders compact evidence summary for failed executions (VHS-REQ-148.4)', () => {
      const record = createBaseRecord({
        state: 'failed',
        attempted: true,
        reportExists: false,
        exitCode: 1,
        durationMs: 5432,
        failureReason: 'command-exited-nonzero',
        stdoutFilePath: '/workspace/.storage/reports/repoid123456/fileid123456/runtime-stdout.txt',
        stderrFilePath: '/workspace/.storage/reports/repoid123456/fileid123456/runtime-stderr.txt'
      });
      record.runtimeExecutionState = 'failed';

      const html = renderComparisonReportPacketHtml(record);

      expect(html).toContain('data-testid="comparison-report-compact-evidence-summary"');
      expect(html).toContain('<strong>Compact evidence summary</strong>');
      expect(html).toContain('<strong>Outcome:</strong> failed');
      expect(html).toContain('<strong>Failure reason:</strong> command-exited-nonzero');
      expect(html).toContain('<strong>Exit code:</strong> 1');
      expect(html).toContain('<strong>Duration:</strong> 5432ms');
      expect(html).toContain('<strong>Report produced:</strong> no');
      expect(html).toContain('<strong>Stdout artifact:</strong>');
      expect(html).toContain('<strong>Stderr artifact:</strong>');
    });

    it('renders compact evidence summary for blocked executions (VHS-REQ-148.4)', () => {
      const record = createBaseRecord({
        state: 'not-available',
        attempted: false,
        reportExists: false,
        blockedReason: 'labview-exe-not-found',
        stdoutFilePath: '/workspace/.storage/reports/repoid123456/fileid123456/runtime-stdout.txt',
        stderrFilePath: '/workspace/.storage/reports/repoid123456/fileid123456/runtime-stderr.txt'
      });
      record.runtimeExecutionState = 'not-available';
      record.reportStatus = 'blocked-runtime';
      record.runtimeSelection.provider = 'unavailable';
      record.runtimeSelection.blockedReason = 'labview-exe-not-found';

      const html = renderComparisonReportPacketHtml(record);

      expect(html).toContain('data-testid="comparison-report-compact-evidence-summary"');
      expect(html).toContain('<strong>Outcome:</strong> blocked');
      expect(html).toContain('<strong>Blocked reason:</strong> labview-exe-not-found');
      expect(html).toContain('<strong>Report produced:</strong> no');
    });

    it('does not render compact evidence summary for succeeded executions', () => {
      const record = createBaseRecord({
        state: 'succeeded',
        attempted: true,
        reportExists: true,
        exitCode: 0
      });
      record.runtimeExecutionState = 'succeeded';

      const html = renderComparisonReportPacketHtml(record);

      expect(html).not.toContain('data-testid="comparison-report-compact-evidence-summary"');
    });

    it('does not render compact evidence summary for not-run executions', () => {
      const record = createBaseRecord({
        state: 'not-run',
        attempted: false,
        reportExists: false
      });
      record.runtimeExecutionState = 'not-run';

      const html = renderComparisonReportPacketHtml(record);

      expect(html).not.toContain('data-testid="comparison-report-compact-evidence-summary"');
    });

    it('includes diagnostic reason in compact summary when present', () => {
      const record = createBaseRecord({
        state: 'failed',
        attempted: true,
        reportExists: false,
        exitCode: 124,
        failureReason: 'command-timed-out',
        diagnosticReason: 'labview-cli-timeout-no-labview-through-exit'
      });
      record.runtimeExecutionState = 'failed';

      const html = renderComparisonReportPacketHtml(record);

      expect(html).toContain('data-testid="comparison-report-compact-evidence-summary"');
      expect(html).toContain('<strong>Diagnostic reason:</strong> labview-cli-timeout-no-labview-through-exit');
    });

    it('includes first 3 doctor summary lines in compact summary with truncation indicator', () => {
      const record = createBaseRecord({
        state: 'failed',
        attempted: true,
        reportExists: false,
        exitCode: 1,
        failureReason: 'command-exited-nonzero',
        doctorSummaryLines: [
          'Selected provider=host-native; engine=labview-cli; platform=win32; bitness=x86.',
          'Provider request=host.',
          'Requested runtime: provider=host; LabVIEW=2026; bitness=x86.',
          'Execution failed reason: command-exited-nonzero.',
          'Next action: review retained diagnostics.'
        ]
      });
      record.runtimeExecutionState = 'failed';

      const html = renderComparisonReportPacketHtml(record);
      const compactSummary = extractCompactEvidenceSummary(html);

      expect(compactSummary).toContain('<strong>Doctor summary:</strong>');
      expect(compactSummary).toContain('Selected provider=host-native');
      expect(compactSummary).toContain('Provider request=host');
      expect(compactSummary).toContain('Requested runtime: provider=host');
      // Fourth and fifth lines should not be in compact summary
      expect(compactSummary).not.toContain('Execution failed reason: command-exited-nonzero.');
      expect(compactSummary).not.toContain('Next action: review retained diagnostics.');
      expect(compactSummary).toContain('(see full doctor summary below)');
    });

    it('escapes special characters in compact summary failure reason', () => {
      const record = createBaseRecord({
        state: 'failed',
        attempted: true,
        reportExists: false,
        exitCode: 1,
        failureReason: 'error: <script>alert("xss")</script>'
      });
      record.runtimeExecutionState = 'failed';

      const html = renderComparisonReportPacketHtml(record);
      const compactSummary = extractCompactEvidenceSummary(html);

      expect(compactSummary).toContain('&lt;script&gt;');
      expect(compactSummary).not.toContain('<script>alert');
    });

    it('escapes special characters in compact summary artifact paths', () => {
      const record = createBaseRecord({
        state: 'failed',
        attempted: true,
        reportExists: false,
        exitCode: 1,
        stdoutFilePath: '/workspace/NI & Co/stdout.txt'
      });
      record.runtimeExecutionState = 'failed';

      const html = renderComparisonReportPacketHtml(record);
      const compactSummary = extractCompactEvidenceSummary(html);

      expect(compactSummary).toContain('NI &amp; Co');
    });

    it('retains report-file-not-generated failure with exit code 0 in compact summary', () => {
      const record = createBaseRecord({
        state: 'failed',
        attempted: true,
        reportExists: false,
        exitCode: 0,
        failureReason: 'report-file-not-generated'
      });
      record.runtimeExecutionState = 'failed';

      const html = renderComparisonReportPacketHtml(record);

      expect(html).toContain('data-testid="comparison-report-compact-evidence-summary"');
      expect(html).toContain('<strong>Failure reason:</strong> report-file-not-generated');
      expect(html).toContain('<strong>Exit code:</strong> 0');
      expect(html).toContain('<strong>Report produced:</strong> no');
      expect(html).not.toContain('comparison report execution succeeded');
    });
  });
});

describe('comparisonReportPacket dependency caveat (VHS-REQ-624)', () => {
  it('discloses per-revision dependency fidelity and the repo-only staging limitation when the two trees were materialized (VHS-REQ-624.7, VHS-REQ-624.8)', () => {
    const record = createBaseRecord({
      materializedTree: {
        left: {
          root: '/workspace/.storage/reports/repoid123456/fileid123456/staging/left',
          revisionId: '1111111122222222',
          pathspec: '.'
        },
        right: {
          root: '/workspace/.storage/reports/repoid123456/fileid123456/staging/right',
          revisionId: 'abcdef1234567890',
          pathspec: '.'
        }
      }
    });

    const html = renderComparisonReportPacketHtml(record);

    expect(html).toContain('data-testid="comparison-report-dependency-caveat"');
    expect(html).toContain('Dependency context:');
    // Normalize whitespace so multi-word phrase assertions are robust to how the
    // source string literal happens to wrap across lines.
    const normalized = html.toLowerCase().replace(/\s+/g, ' ');
    // VHS-REQ-624.7: each VI is evaluated against its OWN revision's in-repo
    // dependencies (per-revision fidelity); dependency changes between the two
    // revisions are reflected, not masked, and neither VI is recompiled against
    // the other revision's newer dependencies.
    expect(normalized).toContain('own revision');
    expect(normalized).toContain('per-revision dependency fidelity');
    expect(normalized).toContain('reflected');
    expect(normalized).toContain('selected');
    // The prior single-tree distortion disclosure must be gone.
    expect(normalized).not.toContain('not a faithful');
    // VHS-REQ-624.8 (#284): out-of-repo / LabVIEW-install dependencies are not
    // staged and may render as whiteboxes; disclose that as a staging limitation.
    expect(normalized).toContain('outside the repository');
    expect(normalized).toContain('staging');
    expect(normalized).toContain('placeholder (white)');
    expect(html).toContain('vi.lib');
  });

  it('omits the dependency caveat when no selected-revision tree was materialized', () => {
    // Pre-runtime packets and providers that do not stage a tree (e.g. windows
    // container) must not carry the past-tense dependency disclosure.
    const html = renderComparisonReportPacketHtml(createBaseRecord());

    expect(html).not.toContain('data-testid="comparison-report-dependency-caveat"');
    expect(html).not.toContain('Dependency context:');
    // The out-of-repo staging-limitation disclosure rides on the same condition.
    expect(html.toLowerCase()).not.toContain('outside the repository');
  });
});

describe('comparisonReportPacket library-member caveat (VHS-REQ-625)', () => {
  it('discloses the library-member caveat naming the owning library when detected (VHS-REQ-625.3)', () => {
    const record = createBaseRecord();
    record.preflight.comparedViLibraryMembership = {
      isMember: true,
      libraryRelativePath: 'Dependencies/dependencies.lvlib',
      libraryKind: 'lvlib'
    };

    const html = renderComparisonReportPacketHtml(record);

    expect(html).toContain('data-testid="comparison-report-library-member-caveat"');
    expect(html).toContain('Library member:');
    expect(html).toContain('Dependencies/dependencies.lvlib');
    expect(html.toLowerCase()).toContain('namespace');
  });

  it('omits the library-member caveat when the compared VI is not a library member (VHS-REQ-625.4)', () => {
    const html = renderComparisonReportPacketHtml(createBaseRecord());

    expect(html).not.toContain('data-testid="comparison-report-library-member-caveat"');
    expect(html).not.toContain('Library member:');
  });
});

describe('comparisonReportPacket commit body (VHS-REQ-644)', () => {
  it('renders the full commit body for both revision context cards with multi-line preserved (VHS-REQ-644.1, VHS-REQ-644.4)', () => {
    const record = createBaseRecord(
      {},
      {
        selectedRevision: {
          hash: 'abcdef1234567890',
          authorDate: '2026-04-02',
          authorName: 'Selected Author',
          subject: 'Selected subject',
          body: 'Selected body line one\nSelected body line two'
        },
        baseRevision: {
          hash: '1111111122222222',
          authorDate: '2026-04-01',
          authorName: 'Base Author',
          subject: 'Base subject',
          body: 'Base body rationale'
        }
      }
    );

    const html = renderComparisonReportPacketHtml(record);

    expect(html).toContain('<strong>Body:</strong>');
    expect(html).toContain('Selected body line one<br />Selected body line two');
    expect(html).toContain('Base body rationale');
  });

  it('escapes HTML in the commit body (VHS-REQ-644.4)', () => {
    const record = createBaseRecord(
      {},
      {
        selectedRevision: {
          hash: 'abcdef1234567890',
          subject: 'Selected subject',
          body: '<script>alert(1)</script>'
        }
      }
    );

    const html = renderComparisonReportPacketHtml(record);

    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).not.toContain('<script>alert(1)</script>');
  });

  it('renders the empty-body fallback when a revision has a retained but empty commit body (VHS-REQ-644.5)', () => {
    const record = createBaseRecord(
      {},
      {
        selectedRevision: {
          hash: 'abcdef1234567890',
          subject: 'Selected subject',
          body: ''
        }
      }
    );

    const html = renderComparisonReportPacketHtml(record);

    expect(html).toContain('<strong>Body:</strong> <span class="muted">No commit body</span>');
  });

  it('renders the not-retained fallback for the body when revision metadata is undefined (VHS-REQ-644.5)', () => {
    const record = createBaseRecord(
      {},
      {
        selectedRevision: {
          hash: 'abcdef1234567890',
          subject: 'Selected subject'
          // body intentionally omitted: metadata was not retained.
        }
      }
    );

    const html = renderComparisonReportPacketHtml(record);

    expect(html).toContain('<strong>Body:</strong> <span class="muted">not retained</span>');
    expect(html).not.toContain('<strong>Body:</strong> <span class="muted">No commit body</span>');
  });
});

describe('comparisonReportPacket persistence (VHS-REQ-148)', () => {
  function createPersistOptions(
    overrides: {
      preflightReady?: boolean;
      provider?: ComparisonReportPacketRecord['runtimeSelection']['provider'];
      blockedReason?: string;
    } = {}
  ): PersistComparisonReportPacketOptions {
    return {
      storageRoot: '/workspace/.storage',
      repositoryRoot: '/workspace/repo',
      relativePath: 'foo.vi',
      reportType: 'diff',
      selectedHash: 'abcdef1234567890',
      baseHash: '1111111122222222',
      preflight: {
        normalizedRelativePath: 'foo.vi',
        ready: overrides.preflightReady ?? true,
        left: {
          revisionId: '1111111122222222',
          blobSpecifier: '1111111122222222:foo.vi',
          signature: 'LVIN',
          isVi: true
        },
        right: {
          revisionId: 'abcdef1234567890',
          blobSpecifier: 'abcdef1234567890:foo.vi',
          signature: 'LVCC',
          isVi: true
        }
      },
      runtimeSelection: {
        platform: 'win32',
        bitness: 'x86',
        provider: overrides.provider ?? 'host-native',
        engine: 'labview-cli',
        blockedReason: overrides.blockedReason,
        notes: [],
        registryQueryPlans: [],
        candidates: []
      }
    };
  }

  function createDeps() {
    const mkdir = vi.fn(async (_path: string, _options?: unknown) => undefined);
    const writeFile = vi.fn(async (_path: string, _content?: unknown) => undefined);
    const deps = {
      now: () => '2026-04-02T00:00:00.000Z',
      mkdir,
      writeFile
    } as unknown as ComparisonReportPacketDeps;
    return { deps, mkdir, writeFile };
  }

  it('persists a ready-for-runtime packet and writes metadata then packet artifacts', async () => {
    const { deps, mkdir, writeFile } = createDeps();
    const result = await persistComparisonReportPacket(createPersistOptions(), deps);

    expect(result.record.reportStatus).toBe('ready-for-runtime');
    expect(result.record.runtimeExecutionState).toBe('not-run');
    expect(result.record.generatedAt).toBe('2026-04-02T00:00:00.000Z');
    expect(mkdir).toHaveBeenCalledTimes(2);
    expect(writeFile).toHaveBeenCalledTimes(2);
    expect(writeFile.mock.calls[0][0]).toBe(result.metadataFilePath);
    expect(writeFile.mock.calls[1][0]).toBe(result.packetFilePath);
    expect(() => JSON.parse(writeFile.mock.calls[0][1] as string)).not.toThrow();
    expect(writeFile.mock.calls[1][1] as string).toContain('Comparison Report');
  });

  it('marks an unavailable provider as blocked-runtime / not-available', async () => {
    const { deps } = createDeps();
    const result = await persistComparisonReportPacket(
      createPersistOptions({ provider: 'unavailable', blockedReason: 'labview-exe-not-found' }),
      deps
    );
    expect(result.record.reportStatus).toBe('blocked-runtime');
    expect(result.record.runtimeExecutionState).toBe('not-available');
  });

  it.each([
    'container-image-acquisition-failed',
    'windows-container-image-acquisition-failed'
  ])('marks a %s container acquisition failure as blocked-runtime / not-available', async (blockedReason) => {
    const { deps } = createDeps();
    const result = await persistComparisonReportPacket(
      createPersistOptions({ provider: 'windows-container', blockedReason }),
      deps
    );
    expect(result.record.reportStatus).toBe('blocked-runtime');
    expect(result.record.runtimeExecutionState).toBe('not-available');
  });

  it('marks an unready preflight as blocked-preflight while keeping runtime not-run', async () => {
    const { deps } = createDeps();
    const result = await persistComparisonReportPacket(
      createPersistOptions({ preflightReady: false }),
      deps
    );
    expect(result.record.reportStatus).toBe('blocked-preflight');
    expect(result.record.runtimeExecutionState).toBe('not-run');
  });

  it('writeComparisonReportPacketRecord creates directories and writes both artifacts', async () => {
    const { deps, mkdir, writeFile } = createDeps();
    const { record } = await persistComparisonReportPacket(createPersistOptions(), deps);
    mkdir.mockClear();
    writeFile.mockClear();

    await writeComparisonReportPacketRecord(record, deps);

    expect(mkdir).toHaveBeenCalledWith(record.artifactPlan.reportDirectory, { recursive: true });
    expect(mkdir).toHaveBeenCalledWith(record.artifactPlan.stagingDirectory, { recursive: true });
    expect(writeFile).toHaveBeenCalledWith(
      record.artifactPlan.metadataFilePath,
      expect.any(String)
    );
    expect(writeFile).toHaveBeenCalledWith(
      record.artifactPlan.packetFilePath,
      expect.any(String)
    );
  });
});

describe('comparison-report packet pure helpers (VHS-REQ-643)', () => {
  it('toRevisionMetadata returns a hash-only record when the commit is absent', () => {
    expect(toRevisionMetadata(undefined, 'abc123')).toEqual({ hash: 'abc123' });
  });

  it('toRevisionMetadata projects the full commit fields when present', () => {
    expect(
      toRevisionMetadata(
        {
          hash: 'def456',
          authorDate: '2026-07-19',
          authorName: 'A. Dev',
          subject: 'Change',
          body: 'Body text'
        },
        'fallback'
      )
    ).toEqual({
      hash: 'def456',
      authorDate: '2026-07-19',
      authorName: 'A. Dev',
      subject: 'Change',
      body: 'Body text'
    });
  });

  it('deriveProviderRequestLabel prefers an explicit requested provider', () => {
    expect(
      deriveProviderRequestLabel({ requestedProvider: 'docker', executionMode: 'host-only' } as never)
    ).toBe('docker');
  });

  it('deriveProviderRequestLabel maps host-only and docker-only execution modes', () => {
    expect(deriveProviderRequestLabel({ executionMode: 'host-only' } as never)).toBe('host');
    expect(deriveProviderRequestLabel({ executionMode: 'docker-only' } as never)).toBe('docker');
  });

  it('deriveProviderRequestLabel falls back to the raw execution mode or auto', () => {
    expect(deriveProviderRequestLabel({ executionMode: 'auto' } as never)).toBe('auto');
    expect(deriveProviderRequestLabel({} as never)).toBe('auto');
  });

  it('renderCommand returns none when no executable was recorded', () => {
    expect(renderCommand({ args: ['--x'] } as never)).toBe('none');
  });

  it('renderCommand joins the executable and args', () => {
    expect(renderCommand({ executable: 'LabVIEWCLI', args: ['-a', '-b'] } as never)).toBe('LabVIEWCLI -a -b');
    expect(renderCommand({ executable: 'tool' } as never)).toBe('tool');
  });

  it('renderRevisionBodyValue renders muted placeholders for not-retained and empty bodies', () => {
    expect(renderRevisionBodyValue(undefined)).toContain('not retained');
    expect(renderRevisionBodyValue('   ')).toContain('No commit body');
  });

  it('renderRevisionBodyValue escapes HTML and converts newlines to <br />', () => {
    expect(renderRevisionBodyValue('a <b>\nc')).toBe('a &lt;b&gt;<br />c');
    expect(renderRevisionBodyValue('x\r\ny')).toBe('x<br />y');
  });

  it('renderRevisionMetadataValue escapes present values and mutes absent ones', () => {
    expect(renderRevisionMetadataValue('a<b')).toBe('a&lt;b');
    expect(renderRevisionMetadataValue('')).toContain('not retained');
    expect(renderRevisionMetadataValue(undefined)).toContain('not retained');
  });

  it('renderOptionalYesNo renders a tri-state boolean', () => {
    expect(renderOptionalYesNo(true)).toBe('yes');
    expect(renderOptionalYesNo(false)).toBe('no');
    expect(renderOptionalYesNo(undefined)).toBe('none');
  });
});

describe('comparisonReportPacket runtime-selection field rendering (VHS-REQ-148)', () => {
  it('renders the affirmative tri-state and present-value branches for host-runtime selection facts', () => {
    const record = createBaseRecord(
      {},
      {
        runtimeSelection: {
          platform: 'win32',
          bitness: 'x86',
          provider: 'host-native',
          engine: 'labview-cli',
          notes: [],
          registryQueryPlans: [],
          candidates: [],
          // Affirmative container-image-present branch (`? 'yes'`).
          containerImageAvailable: true,
          // Present host VI Server port (`: String(...)` rather than 'none').
          hostLabviewTcpPort: 3363,
          // Detected host conflict (`... ? 'yes'`).
          hostRuntimeConflictDetected: true,
          // Admitted existing host runtime (`... ? 'yes'`).
          allowExistingWindowsHostRuntime: true
        }
      }
    );

    const html = renderComparisonReportPacketHtml(record);
    const selection = html.match(
      /<div class="grid" data-testid="comparison-report-runtime-selection">[\s\S]*?<\/div>\s*<div class="note"/
    );
    const scoped = selection ? selection[0] : html;

    expect(scoped).toContain('<strong>Container image present:</strong> yes');
    expect(scoped).toContain('<strong>Host VI Server port:</strong> 3363');
    expect(scoped).toContain('<strong>Host conflict detected:</strong> yes');
    expect(scoped).toContain('<strong>Existing host runtime admitted:</strong> yes');
  });

  it('renders the negative tri-state branches when host-runtime facts are present but false', () => {
    const record = createBaseRecord(
      {},
      {
        runtimeSelection: {
          platform: 'win32',
          bitness: 'x86',
          provider: 'host-native',
          engine: 'labview-cli',
          notes: [],
          registryQueryPlans: [],
          candidates: [],
          // Detected-but-false conflict exercises the `: 'no'` leaf.
          hostRuntimeConflictDetected: false,
          // Present-but-false admission exercises the `: 'no'` leaf.
          allowExistingWindowsHostRuntime: false
        }
      }
    );

    const html = renderComparisonReportPacketHtml(record);
    expect(html).toContain('<strong>Host conflict detected:</strong> no');
    expect(html).toContain('<strong>Existing host runtime admitted:</strong> no');
  });
});

describe('comparisonReportPacket runtime-execution field rendering (VHS-REQ-148)', () => {
  it('renders present numeric execution fields and falls back to none for absent artifacts', () => {
    const record = createBaseRecord({
      labviewTcpPort: 3363,
      headlessSessionResetExitCode: 0,
      // Explicitly clear the artifact paths so the `?? 'none'` fallbacks fire.
      stdoutFilePath: undefined,
      stderrFilePath: undefined
    });

    const html = renderComparisonReportPacketHtml(record);
    const execution = html.match(
      /<div class="grid" data-testid="comparison-report-runtime-execution">[\s\S]*?<\/div>\s*<div class="note"/
    );
    const scoped = execution ? execution[0] : html;

    expect(scoped).toContain('<strong>Selected LabVIEW TCP port:</strong> 3363');
    expect(scoped).toContain('<strong>Headless session reset exit code:</strong> 0');
    expect(scoped).toContain('<strong>Stdout artifact:</strong> none');
    expect(scoped).toContain('<strong>Stderr artifact:</strong> none');
  });
});

describe('comparisonReportPacket preflight-signature fallback rendering (VHS-REQ-148)', () => {
  it('renders the not-a-vi fallback when a side signature is absent', () => {
    const record = createBaseRecord();
    record.preflight.left = { ...record.preflight.left, signature: undefined };
    record.preflight.right = { ...record.preflight.right, signature: undefined };

    const html = renderComparisonReportPacketHtml(record);
    expect(html).toContain('<strong>Left signature:</strong> not-a-vi');
    expect(html).toContain('<strong>Right signature:</strong> not-a-vi');
  });
});

describe('comparisonReportPacket library-member class fallback (VHS-REQ-625)', () => {
  it('names the owning class and the generic library fallback when the relative path is absent', () => {
    const record = createBaseRecord();
    record.preflight.comparedViLibraryMembership = {
      isMember: true,
      // libraryRelativePath omitted -> `?? 'a LabVIEW library'` fallback fires.
      libraryKind: 'lvclass'
    };

    const html = renderComparisonReportPacketHtml(record);
    expect(html).toContain('data-testid="comparison-report-library-member-caveat"');
    expect(html).toContain('a LabVIEW library');
    // lvclass membership renders the "class" wording (`? 'class'` leaf).
    expect(html).toContain('owning class');
  });
});

describe('comparisonReportPacket default boundaries (VHS-REQ-148)', () => {
  it('stamps generatedAt from the default clock when no now() dependency is injected', async () => {
    const options: PersistComparisonReportPacketOptions = {
      storageRoot: '/workspace/.storage',
      repositoryRoot: '/workspace/repo',
      relativePath: 'foo.vi',
      reportType: 'diff',
      selectedHash: 'abcdef1234567890',
      baseHash: '1111111122222222',
      preflight: {
        normalizedRelativePath: 'foo.vi',
        ready: true,
        left: { revisionId: '1111111122222222', blobSpecifier: '1111111122222222:foo.vi', signature: 'LVIN', isVi: true },
        right: { revisionId: 'abcdef1234567890', blobSpecifier: 'abcdef1234567890:foo.vi', signature: 'LVCC', isVi: true }
      },
      runtimeSelection: {
        platform: 'win32',
        bitness: 'x86',
        provider: 'host-native',
        engine: 'labview-cli',
        notes: [],
        registryQueryPlans: [],
        candidates: []
      }
    };
    // Inject only the write boundaries so the default clock (defaultNow) is used.
    const deps = {
      mkdir: vi.fn(async () => undefined),
      writeFile: vi.fn(async () => undefined)
    } as unknown as ComparisonReportPacketDeps;

    const before = Date.now();
    const result = await persistComparisonReportPacket(options, deps);
    const stamped = Date.parse(result.record.generatedAt);

    expect(Number.isNaN(stamped)).toBe(false);
    // The default clock is real wall-clock time, so the stamp is not the frozen fixture value.
    expect(result.record.generatedAt).not.toBe('2026-04-02T00:00:00.000Z');
    expect(stamped).toBeGreaterThanOrEqual(before - 1000);
  });

  it('writes both artifacts through the real filesystem when no fs dependencies are injected', async () => {
    const tmpRoot = await mkdtemp(join(tmpdir(), 'vihs-packet-realfs-'));
    try {
      const record = createBaseRecord();
      const reportDirectory = join(tmpRoot, 'report');
      const stagingDirectory = join(reportDirectory, 'staging');
      record.artifactPlan.reportDirectory = reportDirectory;
      record.artifactPlan.stagingDirectory = stagingDirectory;
      record.artifactPlan.metadataFilePath = join(reportDirectory, 'report-metadata.json');
      record.artifactPlan.packetFilePath = join(reportDirectory, 'report-packet.html');

      // No deps -> exercises the `deps.mkdir ?? fs.mkdir` / `deps.writeFile ?? fs.writeFile` defaults.
      await writeComparisonReportPacketRecord(record);

      const metadata = await readFile(record.artifactPlan.metadataFilePath, 'utf8');
      expect(() => JSON.parse(metadata)).not.toThrow();
      const packet = await readFile(record.artifactPlan.packetFilePath, 'utf8');
      expect(packet).toContain('Comparison Report');
    } finally {
      await rm(tmpRoot, { recursive: true, force: true });
    }
  });
});

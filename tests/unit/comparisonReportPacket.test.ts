import { describe, expect, it } from 'vitest';

import {
  ComparisonReportPacketRecord,
  ComparisonReportRuntimeExecution,
  renderComparisonReportPacketHtml
} from '../../src/reporting/comparisonReportPacket';

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
    it('renders doctor summary lines when present', () => {
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

  describe('HTML escaping for factual evidence', () => {
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
});

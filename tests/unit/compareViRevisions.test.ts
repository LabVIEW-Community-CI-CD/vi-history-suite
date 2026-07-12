// Requirement coverage: VHS-REQ-662 (VI semantic comparison model and agent MCP
// surface). Verifies the compare_vi_revisions orchestrator outcomes and
// input-boundary validation (VHS-REQ-662.5).
import { describe, expect, it, vi } from 'vitest';

import type { ParsedNiComparisonReport } from '../../src/dashboard/niComparisonReportParser';
import type {
  ComparisonReportPacketRecord,
  ComparisonReportRuntimeExecution,
  ComparisonReportRuntimeExecutionState
} from '../../src/reporting/comparisonReportPacket';
import type { ComparisonReportPreflightResult } from '../../src/reporting/comparisonReportPreflight';
import type { ComparisonRuntimeSelection } from '../../src/reporting/comparisonRuntimeLocator';
import {
  compareViRevisions,
  CompareViRevisionsDeps,
  CompareViRevisionsInput
} from '../../src/semantic/compareViRevisions';

function selection(overrides: Partial<ComparisonRuntimeSelection> = {}): ComparisonRuntimeSelection {
  return {
    platform: 'linux',
    provider: 'linux-container',
    engine: 'labview-cli',
    bitness: 'x64',
    ...overrides
  } as unknown as ComparisonRuntimeSelection;
}

function preflight(
  overrides: Partial<ComparisonReportPreflightResult> = {}
): ComparisonReportPreflightResult {
  return {
    normalizedRelativePath: 'vis/Widget.vi',
    ready: true,
    left: { revisionId: 'aaaaaaa', blobSpecifier: 'aaaaaaa:vis/Widget.vi', isVi: true },
    right: { revisionId: 'bbbbbbb', blobSpecifier: 'bbbbbbb:vis/Widget.vi', isVi: true },
    ...overrides
  } as unknown as ComparisonReportPreflightResult;
}

function runtimeExecution(
  state: ComparisonReportRuntimeExecutionState,
  overrides: Partial<ComparisonReportRuntimeExecution> = {}
): ComparisonReportRuntimeExecution {
  return {
    state,
    attempted: state !== 'not-run',
    reportExists: state === 'succeeded',
    ...overrides
  } as unknown as ComparisonReportRuntimeExecution;
}

function record(
  reportStatus: ComparisonReportPacketRecord['reportStatus'],
  execution: ComparisonReportRuntimeExecution
): ComparisonReportPacketRecord {
  return {
    reportStatus,
    runtimeExecutionState: execution.state,
    runtimeExecution: execution
  } as unknown as ComparisonReportPacketRecord;
}

function parsedReport(): ParsedNiComparisonReport {
  return {
    reportTitle: 'LabVIEW VI Comparison Report',
    overviewSections: [],
    includedAttributes: [{ label: 'Front Panel', included: true }],
    detailSections: [{ heading: '1. Front Panel - Control', items: ['Caption changed'] }],
    overviewImageCount: 0,
    detailItemCount: 1
  } as unknown as ParsedNiComparisonReport;
}

interface Harness {
  deps: CompareViRevisionsDeps;
  locateRuntime: ReturnType<typeof vi.fn>;
  preflightFn: ReturnType<typeof vi.fn>;
  persistPacket: ReturnType<typeof vi.fn>;
  executeReport: ReturnType<typeof vi.fn>;
  parseReportFile: ReturnType<typeof vi.fn>;
}

function makeHarness(overrides: Partial<CompareViRevisionsDeps> = {}): Harness {
  const locateRuntime = vi.fn(async () => selection());
  const preflightFn = vi.fn(async () => preflight());
  const persistPacket = vi.fn(async () => ({
    record: record('ready-for-runtime', runtimeExecution('not-run'))
  }));
  const executeReport = vi.fn(async () => ({
    record: record('ready-for-runtime', runtimeExecution('succeeded')),
    reportFilePath: '/tmp/vihs-test/report.html',
    metadataFilePath: '/tmp/vihs-test/report.metadata.json',
    packetFilePath: '/tmp/vihs-test/report-packet.html'
  }));
  const parseReportFile = vi.fn(async () => parsedReport());
  const deps = {
    resolvePlatform: () => 'linux',
    createStorageRoot: async () => '/tmp/vihs-test',
    locateRuntime,
    preflight: preflightFn,
    persistPacket,
    executeReport,
    parseReportFile,
    ...overrides
  } as unknown as CompareViRevisionsDeps;
  return { deps, locateRuntime, preflightFn, persistPacket, executeReport, parseReportFile };
}

function input(overrides: Partial<CompareViRevisionsInput> = {}): CompareViRevisionsInput {
  return {
    repositoryRoot: '/repo',
    relativePath: 'vis/Widget.vi',
    baseHash: 'aaaaaaa',
    selectedHash: 'bbbbbbb',
    ...overrides
  };
}

describe('compareViRevisions', () => {
  it('runs the full pipeline and returns the semantic model on success', async () => {
    const harness = makeHarness();
    const result = await compareViRevisions(input(), harness.deps);

    expect(result).toMatchObject({ status: 'completed', hasDifferences: true });
    if (result.status !== 'completed') {
      throw new Error('expected a completed result');
    }
    expect(result.model.changedSurfaces).toEqual(['front-panel']);
    expect(result.model.narrative).toContain('The front panel differs.');
    // Runtime provenance is threaded onto the model and the evidence block.
    expect(result.model.runtime?.provider).toBe('linux-container');
    expect(result.runtime).toEqual({
      provider: 'linux-container',
      engine: 'labview-cli',
      state: 'succeeded',
      reportFilePath: '/tmp/vihs-test/report.html'
    });
    // reportType defaults to diff, and the connect-timeout default is applied.
    expect(harness.persistPacket).toHaveBeenCalledWith(
      expect.objectContaining({ reportType: 'diff' })
    );
    expect(harness.executeReport).toHaveBeenCalledWith(
      expect.objectContaining({ repositoryRoot: expect.any(String) }),
      expect.objectContaining({ cliConnectTimeoutSeconds: 180 })
    );
  });

  it('threads a caller-provided reportType and connect timeout', async () => {
    const harness = makeHarness();
    await compareViRevisions(
      input({ reportType: 'print', runtime: { cliConnectTimeoutSeconds: 42 } }),
      harness.deps
    );
    expect(harness.persistPacket).toHaveBeenCalledWith(
      expect.objectContaining({ reportType: 'print' })
    );
    expect(harness.executeReport).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ cliConnectTimeoutSeconds: 42 })
    );
  });

  it('passes runtime preferences and a platform override to the locator', async () => {
    const harness = makeHarness();
    await compareViRevisions(
      input({
        runtime: {
          platform: 'win32',
          provider: 'docker',
          labviewVersion: '2026',
          bitness: 'x64',
          executionMode: 'docker-only',
          containerImageVersion: '2026q1patch2-windows'
        }
      }),
      harness.deps
    );
    expect(harness.locateRuntime).toHaveBeenCalledWith(
      'win32',
      expect.objectContaining({
        requestedProvider: 'docker',
        labviewVersion: '2026',
        bitness: 'x64',
        executionMode: 'docker-only',
        containerImageVersion: '2026q1patch2-windows',
        requireVersionAndBitness: true
      })
    );
  });

  it('resolves the platform from the process when not provided', async () => {
    const harness = makeHarness({ resolvePlatform: undefined });
    const result = await compareViRevisions(input(), harness.deps);
    expect(result.status).toBe('completed');
    expect(harness.locateRuntime).toHaveBeenCalledWith(expect.any(String), expect.any(Object));
  });

  it('reports blocked-selection when no runtime is available', async () => {
    const harness = makeHarness({
      locateRuntime: vi.fn(async () =>
        selection({ provider: 'unavailable', blockedReason: 'docker-daemon-unreachable' })
      )
    });
    const result = await compareViRevisions(input(), harness.deps);
    expect(result).toEqual({ status: 'blocked-selection', reason: 'docker-daemon-unreachable' });
    // Short-circuits before preflight and execution.
    expect(harness.preflightFn).not.toHaveBeenCalled();
    expect(harness.executeReport).not.toHaveBeenCalled();
  });

  it('reports blocked-preflight when a revision is not a VI', async () => {
    const harness = makeHarness({
      preflight: vi.fn(async () => preflight({ ready: false, blockedReason: 'left-blob-not-vi' }))
    });
    const result = await compareViRevisions(input(), harness.deps);
    expect(result).toEqual({ status: 'blocked-preflight', reason: 'left-blob-not-vi' });
    expect(harness.executeReport).not.toHaveBeenCalled();
  });

  it('reports blocked-runtime when the packet is not ready for runtime', async () => {
    const harness = makeHarness({
      persistPacket: vi.fn(async () => ({
        record: record(
          'blocked-runtime',
          runtimeExecution('not-available', { blockedReason: 'labview-cli-unavailable' })
        )
      }))
    });
    const result = await compareViRevisions(input(), harness.deps);
    expect(result).toEqual({ status: 'blocked-runtime', reason: 'labview-cli-unavailable' });
    expect(harness.executeReport).not.toHaveBeenCalled();
  });

  it('reports failed when the runtime does not produce a report', async () => {
    const harness = makeHarness({
      executeReport: vi.fn(async () => ({
        record: record(
          'ready-for-runtime',
          runtimeExecution('failed', { reportExists: false, failureReason: 'labview-cli-connection-failed' })
        ),
        reportFilePath: '/tmp/vihs-test/report.html',
        metadataFilePath: '/tmp/vihs-test/report.metadata.json',
        packetFilePath: '/tmp/vihs-test/report-packet.html'
      }))
    });
    const result = await compareViRevisions(input(), harness.deps);
    expect(result).toEqual({ status: 'failed', reason: 'labview-cli-connection-failed' });
    expect(harness.parseReportFile).not.toHaveBeenCalled();
  });

  it('reports blocked-runtime when execution ends not-available', async () => {
    const harness = makeHarness({
      executeReport: vi.fn(async () => ({
        record: record('ready-for-runtime', runtimeExecution('not-available', { reportExists: false })),
        reportFilePath: '/tmp/vihs-test/report.html',
        metadataFilePath: '/tmp/vihs-test/report.metadata.json',
        packetFilePath: '/tmp/vihs-test/report-packet.html'
      }))
    });
    const result = await compareViRevisions(input(), harness.deps);
    expect(result.status).toBe('blocked-runtime');
  });

  it('maps an unexpected primitive error to a failed result', async () => {
    const harness = makeHarness({
      preflight: vi.fn(async () => {
        throw new Error('git not found');
      })
    });
    const result = await compareViRevisions(input(), harness.deps);
    expect(result).toEqual({ status: 'failed', reason: 'git not found' });
  });

  it('rejects an absolute relativePath', async () => {
    const { deps } = makeHarness();
    await expect(
      compareViRevisions(input({ relativePath: '/etc/passwd' }), deps)
    ).rejects.toThrow('repository-relative');
  });

  it('rejects a relativePath that escapes the repository root', async () => {
    const { deps } = makeHarness();
    await expect(
      compareViRevisions(input({ relativePath: '../../secrets.vi' }), deps)
    ).rejects.toThrow('escapes the repository root');
  });

  it('rejects an empty or malformed revision identifier', async () => {
    const { deps } = makeHarness();
    await expect(compareViRevisions(input({ baseHash: '' }), deps)).rejects.toThrow(
      'valid revision identifier'
    );
    await expect(
      compareViRevisions(input({ selectedHash: 'bad hash;rm -rf' }), deps)
    ).rejects.toThrow('valid revision identifier');
  });
});

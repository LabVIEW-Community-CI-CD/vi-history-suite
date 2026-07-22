import { describe, expect, it } from 'vitest';
import {
  resolveEmptySwapOptions,
  buildEmptySwapEvidence,
  deriveReportSha256,
  summarizeComparisonOutcome,
  detectReportDifferences,
  classifyEmptySwapOutcome,
  EMPTY_SWAP_COMPARISON_SCHEMA,
  EMPTY_SWAP_COMPARISON_SCHEMA_VERSION,
  type EmptySwapEvidence
} from '../../src/reporting/comparisonValidation/emptySwapComparisonEvidence';

const DEFAULTS = {
  repoRoot: '/tmp/corpus-default',
  platform: 'linux'
};

function baseEnv(over: Record<string, string | undefined> = {}): Record<string, string | undefined> {
  return {
    ESW_BASE: 'c896d9cfa50bff94557f52ab90490a19a90b89e9',
    ESW_SELECTED: 'd5497bd6ae0542142c5186bbf3b32c0bcb4aba69',
    ...over
  };
}

describe('resolveEmptySwapOptions cross-host inputs (VHS-REQ-711.1)', () => {
  it('resolves provider/platform/bitness/version/image and corpus revisions from env', () => {
    const options = resolveEmptySwapOptions(
      baseEnv({
        ESW_CORPUS: '/repos/empty-swap-corpus',
        ESW_VI_PATH: 'empty.vi',
        ESW_PROVIDER: 'docker',
        ESW_PLATFORM: 'linux',
        ESW_BITNESS: 'x64',
        ESW_LV_VERSION: '2026',
        ESW_IMAGE: 'nationalinstruments/labview:2026q1-linux'
      }),
      DEFAULTS
    );
    expect(options).toEqual({
      repoRoot: '/repos/empty-swap-corpus',
      relativePath: 'empty.vi',
      baseHash: 'c896d9cfa50bff94557f52ab90490a19a90b89e9',
      selectedHash: 'd5497bd6ae0542142c5186bbf3b32c0bcb4aba69',
      provider: 'docker',
      platform: 'linux',
      bitness: 'x64',
      labviewVersion: '2026',
      containerImage: 'nationalinstruments/labview:2026q1-linux'
    });
  });

  it('applies ambient defaults for absent optional values (provider defaults to host)', () => {
    const options = resolveEmptySwapOptions(baseEnv(), DEFAULTS);
    expect(options.provider).toBe('host');
    expect(options.platform).toBe('linux');
    expect(options.bitness).toBe('x64');
    expect(options.labviewVersion).toBe('2026');
    expect(options.relativePath).toBe('empty.vi');
    expect(options.repoRoot).toBe('/tmp/corpus-default');
  });

  it('fails closed when the base revision is absent', () => {
    expect(() =>
      resolveEmptySwapOptions(baseEnv({ ESW_BASE: '' }), DEFAULTS)
    ).toThrow(/ESW_BASE and ESW_SELECTED/);
  });

  it('fails closed when the selected revision is absent', () => {
    expect(() =>
      resolveEmptySwapOptions(baseEnv({ ESW_SELECTED: undefined }), DEFAULTS)
    ).toThrow(/ESW_BASE and ESW_SELECTED/);
  });

  it('rejects an unknown provider', () => {
    expect(() =>
      resolveEmptySwapOptions(baseEnv({ ESW_PROVIDER: 'podman' }), DEFAULTS)
    ).toThrow(/unknown provider/);
  });
});

describe('buildEmptySwapEvidence versioned typed record (VHS-REQ-711.2)', () => {
  it('stamps the versioned schema and null-initializes outcome fields', () => {
    const options = resolveEmptySwapOptions(baseEnv({ ESW_PROVIDER: 'docker' }), DEFAULTS);
    const evidence = buildEmptySwapEvidence(options, '2026-07-22T00:00:00.000Z');
    expect(evidence.$schema).toBe(EMPTY_SWAP_COMPARISON_SCHEMA);
    expect(evidence.schemaVersion).toBe(EMPTY_SWAP_COMPARISON_SCHEMA_VERSION);
    expect(evidence.generatedAt).toBe('2026-07-22T00:00:00.000Z');
    expect(evidence.corpus).toEqual({
      repoRoot: '/tmp/corpus-default',
      relativePath: 'empty.vi',
      baseHash: 'c896d9cfa50bff94557f52ab90490a19a90b89e9',
      selectedHash: 'd5497bd6ae0542142c5186bbf3b32c0bcb4aba69'
    });
    expect(evidence.runtimeState).toBeNull();
    expect(evidence.reportExists).toBe(false);
    expect(evidence.reportSha256).toBeNull();
    expect(evidence.differenceDetected).toBeNull();
    expect(evidence.verdict).toBe('incomplete');
    expect(evidence.error).toBeNull();
  });

  it('carries the container image only for the docker provider', () => {
    const docker = buildEmptySwapEvidence(
      resolveEmptySwapOptions(baseEnv({ ESW_PROVIDER: 'docker' }), DEFAULTS),
      'now'
    );
    expect(docker.containerImage).toBe('nationalinstruments/labview:2026q1-linux');

    const host = buildEmptySwapEvidence(
      resolveEmptySwapOptions(baseEnv({ ESW_PROVIDER: 'host' }), DEFAULTS),
      'now'
    );
    expect(host.containerImage).toBeNull();
  });
});

describe('deriveReportSha256 host-line-ending stability (VHS-REQ-711.3)', () => {
  it('is invariant to CRLF vs LF and trailing whitespace', () => {
    const lf = '<html>\n<body>diff</body>\n</html>\n';
    const crlf = '<html>\r\n<body>diff</body>  \r\n</html>\r\n';
    expect(deriveReportSha256(crlf)).toBe(deriveReportSha256(lf));
  });

  it('changes when meaningful content changes', () => {
    expect(deriveReportSha256('<html>a</html>')).not.toBe(deriveReportSha256('<html>b</html>'));
  });
});

describe('summarizeComparisonOutcome record projection (VHS-REQ-711.4)', () => {
  it('reads the runtime-execution sub-record first', () => {
    const summary = summarizeComparisonOutcome({
      runtimeExecution: {
        state: 'succeeded',
        reportExists: true,
        diagnosticReason: null,
        failureReason: null
      }
    });
    expect(summary).toEqual({
      runtimeState: 'succeeded',
      reportExists: true,
      diagnosticReason: null,
      failureReason: null,
      blockedReason: null
    });
  });

  it('falls back to top-level fields when the sub-record is absent', () => {
    const summary = summarizeComparisonOutcome({
      runtimeExecutionState: 'failed',
      diagnosticReason: 'linux-headless-recursive-load',
      blockedReason: null
    });
    expect(summary.runtimeState).toBe('failed');
    expect(summary.reportExists).toBe(false);
    expect(summary.diagnosticReason).toBe('linux-headless-recursive-load');
  });

  it('yields a well-typed summary for a null record', () => {
    expect(summarizeComparisonOutcome(null)).toEqual({
      runtimeState: null,
      reportExists: false,
      diagnosticReason: null,
      failureReason: null,
      blockedReason: null
    });
  });
});

describe('detectReportDifferences semantic difference detection (VHS-REQ-711.5)', () => {
  it('counts DOM class-attribute headings and reports a real difference', () => {
    const html =
      '<style>summary.difference-heading { color: red; }</style>' +
      '<summary class="difference-heading">First VI vs Second VI</summary>' +
      '<summary class="vi-difference-heading">Front Panel</summary>' +
      '<summary class="difference-cosmetic-heading">Cosmetic</summary>';
    const summary = detectReportDifferences(html);
    expect(summary.genericDifferenceHeadings).toBe(1);
    expect(summary.viDifferenceHeadings).toBe(1);
    expect(summary.cosmeticHeadings).toBe(1);
    expect(summary.hasDifferences).toBe(true);
  });

  it('does not miscount CSS selectors as differences', () => {
    const cssOnly =
      '<style>summary.difference-heading { color: red; } ' +
      'summary.vi-difference-heading { color: blue; }</style>';
    const summary = detectReportDifferences(cssOnly);
    expect(summary.genericDifferenceHeadings).toBe(0);
    expect(summary.viDifferenceHeadings).toBe(0);
    expect(summary.hasDifferences).toBe(false);
  });
});

describe('classifyEmptySwapOutcome fail-closed verdict (VHS-REQ-711.6)', () => {
  function evidence(over: Partial<EmptySwapEvidence>): Parameters<typeof classifyEmptySwapOutcome>[0] {
    return {
      error: null,
      blockedReason: null,
      runtimeState: null,
      reportExists: false,
      differenceDetected: null,
      failureReason: null,
      diagnosticReason: null,
      ...over
    };
  }

  it('returns comparison-verified only when succeeded + report + difference', () => {
    expect(
      classifyEmptySwapOutcome(
        evidence({ runtimeState: 'succeeded', reportExists: true, differenceDetected: true })
      )
    ).toBe('comparison-verified');
  });

  it('does not verify when no difference was detected', () => {
    expect(
      classifyEmptySwapOutcome(
        evidence({ runtimeState: 'succeeded', reportExists: true, differenceDetected: false })
      )
    ).toBe('incomplete');
  });

  it('prioritizes error over every other signal', () => {
    expect(
      classifyEmptySwapOutcome(
        evidence({ error: 'boom', runtimeState: 'succeeded', reportExists: true, differenceDetected: true })
      )
    ).toBe('errored');
  });

  it('reports blocked when a runtime block is present', () => {
    expect(
      classifyEmptySwapOutcome(evidence({ blockedReason: 'docker-daemon-unavailable' }))
    ).toBe('blocked');
  });

  it('reports failed on a runtime failure or diagnostic reason', () => {
    expect(classifyEmptySwapOutcome(evidence({ runtimeState: 'failed' }))).toBe('failed');
    expect(
      classifyEmptySwapOutcome(evidence({ failureReason: 'selected-tree-materialize-failed' }))
    ).toBe('failed');
    expect(
      classifyEmptySwapOutcome(evidence({ diagnosticReason: 'linux-headless-recursive-load' }))
    ).toBe('failed');
  });

  it('reports incomplete for an unproven, unblocked, error-free state', () => {
    expect(classifyEmptySwapOutcome(evidence({}))).toBe('incomplete');
  });
});

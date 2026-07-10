import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts'],
    // Keep the source-evaluation suite deterministic on slower local hosts by
    // admitting a higher explicit timeout instead of relying on the default 5s
    // limit.
    testTimeout: 15000,
    hookTimeout: 15000,
    coverage: {
      reporter: ['text', 'json-summary', 'cobertura'],
      reportsDirectory: 'coverage',
      include: ['src/**/*.ts', 'scripts/mapCoverageToTraceability.js'],
      exclude: [
        'src/extension.ts',
        'src/benchmark/hostLinuxBenchmarkRunner.ts',
        // VHS-REQ-659: VS Code host bindings for the VI preview (custom editor,
        // shared render host, and background cache-warmer service) require the
        // running extension host to exercise; their substantive logic lives in
        // the covered src/reporting/viPreview/* modules. Excluded on the same
        // rationale as src/extension.ts.
        'src/ui/viPreviewEditor.ts',
        'src/ui/viPreviewRenderHost.ts',
        'src/ui/viPreviewCacheWarmerService.ts',
        'src/ui/viPreviewContainerSession.ts',
        'src/ui/viPreviewSessionManager.ts'
      ],
      thresholds: {
        // Evidence-backed global regression floors hold a conservative margin
        // below measured develop actuals (statements 74.97, branches 64.60,
        // functions 80.54, lines 75.02 on the Linux run at v1.21.0; the Ubuntu
        // CI leg historically runs ~1 point lower) so cross-runner variance
        // between the Ubuntu and Windows CI legs cannot redden the gate. Raised
        // toward those actuals to tighten regression protection against silent
        // coverage drift. (VHS-REQ-597.)
        statements: 72,
        branches: 61,
        functions: 79,
        lines: 72,
        // Per-file branch floors for the highest-risk comparison-runtime
        // files, pinned with margin below the lower-runner (Ubuntu) actuals so
        // silent drift on the fail-closed/provider-selection branches fails
        // closed without flaking on cross-runner variance. These files carry
        // platform-divergent paths (e.g. Windows-container staging) whose
        // per-file line coverage legitimately swings ~3% between the Ubuntu and
        // Windows CI legs, so only branches — the metric of interest here — are
        // floored per file; aggregate lines stay protected by the global floor.
        // (VHS-REQ-597; risk-ranked via scripts/mapCoverageToTraceability.js.)
        'src/reporting/comparisonRuntimeLocator.ts': {
          branches: 53
        },
        'src/reporting/comparisonReportRuntimeExecution.ts': {
          branches: 55
        }
      }
    }
  }
});

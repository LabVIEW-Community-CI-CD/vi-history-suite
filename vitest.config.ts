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
      exclude: ['src/extension.ts', 'src/benchmark/hostLinuxBenchmarkRunner.ts'],
      thresholds: {
        // Evidence-backed global regression floors held a conservative margin
        // below measured develop actuals (statements 74.27, branches 62.37,
        // functions 81.33, lines 74.29) so cross-runner variance between the
        // Ubuntu and Windows CI legs cannot redden the gate.
        statements: 70,
        branches: 58,
        functions: 78,
        lines: 70,
        // Per-file floors for the highest-risk comparison-runtime files, pinned
        // just under their current actuals to prevent silent drift on the
        // fail-closed/provider-selection branches without raising the bar.
        // (VHS-REQ-597; risk-ranked via scripts/mapCoverageToTraceability.js.)
        'src/reporting/comparisonRuntimeLocator.ts': {
          branches: 47,
          lines: 60
        },
        'src/reporting/comparisonReportRuntimeExecution.ts': {
          branches: 55,
          lines: 63
        }
      }
    }
  }
});

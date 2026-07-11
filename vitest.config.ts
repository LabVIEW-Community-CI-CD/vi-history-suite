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
      include: ['src/**/*.ts', 'scripts/*.js'],
      exclude: [
        'src/extension.ts',
        'src/benchmark/hostLinuxBenchmarkRunner.ts',
        // The VI semantic MCP server stdio entrypoint is thin stream wiring over
        // the covered, unit-tested handleViSemanticMcpMessage dispatcher;
        // exercising it requires driving process stdin/stdout, so it is excluded
        // on the same rationale as src/extension.ts.
        'src/cli/runViSemanticMcpServer.ts',
        // VHS-REQ-659: VS Code host bindings for the VI preview (custom editor,
        // shared render host, and background cache-warmer service) require the
        // running extension host to exercise; their substantive logic lives in
        // the covered src/reporting/viPreview/* modules. Excluded on the same
        // rationale as src/extension.ts.
        'src/ui/viPreviewEditor.ts',
        'src/ui/viPreviewRenderHost.ts',
        'src/ui/viPreviewCacheWarmerService.ts',
        'src/ui/viPreviewContainerSession.ts',
        'src/ui/viPreviewSessionManager.ts',
        // VHS-REQ-613: dev-only host/CI-infrastructure runner scripts require a
        // real VS Code host, integration host, or git remote/network to
        // exercise, so their thin CLI wrappers cannot be meaningfully unit
        // covered. Excluded on the same rationale as src/extension.ts and the
        // VS Code host bindings; the requirement guard and tool scripts beside
        // them stay measured.
        'scripts/bootstrapLinuxVsCodeHost.js',
        'scripts/runLinuxIntegrationHost.js',
        'scripts/runWindowsIntegrationHost.js',
        'scripts/preparePublicRepoClone.js',
        'scripts/preparePublicTestFixture.js',
        'scripts/publicRepoCloneCore.js'
      ],
      thresholds: {
        // Evidence-backed global regression floors hold a conservative margin
        // below measured develop actuals (statements 82.16, branches 72.32,
        // functions 86.48, lines 82.21 on the local run at v1.33.2; the Ubuntu
        // CI leg historically runs ~1 point lower) so cross-runner variance
        // between the Ubuntu and Windows CI legs cannot redden the gate. Raised
        // toward those actuals to tighten regression protection against silent
        // coverage drift. (VHS-REQ-597.)
        statements: 80,
        branches: 70,
        functions: 84,
        lines: 80,
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

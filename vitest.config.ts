import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts'],
    // The governed Windows-host design gate runs the full covered suite on a
    // slower local host than the lightweight isolated unit lanes; keep the
    // suite deterministic by admitting a higher explicit timeout instead of
    // relying on the default 5s limit.
    testTimeout: 15000,
    hookTimeout: 15000,
    coverage: {
      reporter: ['text', 'json-summary', 'cobertura'],
      reportsDirectory: 'coverage',
      include: ['src/**/*.ts'],
      // The host Linux benchmark runner is governed by retained benchmark proof lanes,
      // not by unit-only coverage over Docker and child_process orchestration.
      exclude: ['src/extension.ts', 'src/benchmark/hostLinuxBenchmarkRunner.ts']
    }
  }
});

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
      include: ['src/**/*.ts'],
      exclude: ['src/extension.ts', 'src/benchmark/hostLinuxBenchmarkRunner.ts']
    }
  }
});

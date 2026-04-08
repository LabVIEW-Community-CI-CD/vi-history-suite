import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts'],
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

// @ts-check

/**
 * Stryker mutation-testing configuration (VHS-REQ-613; advisory).
 *
 * Coverage proves lines execute; mutation testing proves tests actually CATCH
 * regressions. This is scoped to the pure `src/domain` detection core (VI magic
 * signature + probe truncation logic) where surviving mutants directly reveal
 * weak or missing assertions behind requirement-mapped behavior.
 *
 * It is ADVISORY: `thresholds.break` is null, so `npm run test:mutation` never
 * fails the build. The score and surviving-mutant report are an assertion-quality
 * signal for closing verification gaps, mirroring the advisory-first rollout of
 * the coverage and criterion tooling. Later phases can widen `mutate` scope and,
 * with maintainer sign-off, add a scheduled (nightly) run.
 */

/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
const config = {
  packageManager: 'npm',
  testRunner: 'vitest',
  reporters: ['clear-text', 'progress', 'json'],
  coverageAnalysis: 'perTest',
  mutate: ['src/domain/**/*.ts'],
  // Advisory: report the mutation score but never fail closed. Promotion to a
  // gate is a separate maintainer decision.
  thresholds: { high: 80, low: 60, break: null },
  tempDirName: '.stryker-tmp',
  cleanTempDir: true,
  concurrency: 4
};

export default config;

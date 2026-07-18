'use strict';

/*
 * Shared CLI argument parser for the maintainer Vagrant validation drivers.
 *
 * Both scripts/vagrantReleaseValidate.cjs and
 * scripts/vagrantValidationProofDriver.cjs accept the same two flags:
 *   --skip-up            assume the guest is already running (skip `vagrant up`)
 *   --evidence <note>    a custom evidence note for the recorded attestation
 *
 * This parser is pure: it returns `{ options, error }` rather than exiting, so
 * each driver keeps its own fail()/exit convention (and so the logic is
 * unit-testable). It is a maintainer `.cjs` helper under scripts/lib/,
 * intentionally outside the `scripts/*.js` traceability inventory glob and never
 * shipped in the VSIX or run in hosted CI.
 */

/**
 * Parse the shared driver flags.
 * @param {string[]} argv the arguments after the node script (process.argv.slice(2))
 * @returns {{ options: { skipUp: boolean, evidence: string | undefined }, error: string | null }}
 */
function parseDriverArgs(argv) {
  const options = { skipUp: false, evidence: undefined };
  const args = Array.isArray(argv) ? argv : [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--skip-up') {
      options.skipUp = true;
    } else if (arg === '--evidence') {
      const value = args[index + 1];
      if (value === undefined) {
        return { options, error: '--evidence requires a value.' };
      }
      options.evidence = value;
      index += 1;
    } else {
      return { options, error: `Unknown argument: ${arg}` };
    }
  }
  return { options, error: null };
}

module.exports = { parseDriverArgs };

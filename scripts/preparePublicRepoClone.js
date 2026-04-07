#!/usr/bin/env node

const core = require('./publicRepoCloneCore');

const CONFIG = {
  description: 'Clone or refresh a public GitHub or GitLab repo for devcontainer/Codespaces evaluation.',
  requireExplicitRepo: true,
  label: 'public-repo',
  usagePath: 'scripts/preparePublicRepoClone.js'
};

function getUsage() {
  return core.getUsage(CONFIG);
}

function parseArgs(argv) {
  return core.parseArgs(argv);
}

function main(argv = process.argv.slice(2), deps = {}) {
  return core.runPublicRepoClone(argv, deps, CONFIG);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

module.exports = {
  SUPPORTED_PUBLIC_HOSTS: core.SUPPORTED_PUBLIC_HOSTS,
  deriveVisibleTargetRoot: core.deriveVisibleTargetRoot,
  getNextStepMessage: (targetRoot) => core.getNextStepMessage(targetRoot, CONFIG.label),
  getUsage,
  normalizeRepoUrl: core.normalizeRepoUrl,
  parseArgs,
  parseRemoteHeadBranch: core.parseRemoteHeadBranch,
  parseSupportedPublicRepoUrl: core.parseSupportedPublicRepoUrl,
  resolveEffectiveOptions: (parsed, deps = {}) => core.resolveEffectiveOptions(parsed, CONFIG, deps),
  main
};

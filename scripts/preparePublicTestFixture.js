#!/usr/bin/env node

const core = require('./publicRepoCloneCore');

const DEFAULT_REPO_URL = core.DEFAULT_ICON_EDITOR_REPO_URL;
const DEFAULT_BRANCH = core.DEFAULT_ICON_EDITOR_BRANCH;
const DEFAULT_TARGET_ROOT = core.DEFAULT_ICON_EDITOR_TARGET_ROOT;

const CONFIG = {
  defaultRepoUrl: DEFAULT_REPO_URL,
  defaultBranch: DEFAULT_BRANCH,
  defaultTargetRoot: DEFAULT_TARGET_ROOT,
  description: 'Clone or refresh the governed ni/labview-icon-editor helper path for devcontainer/Codespaces evaluation.',
  label: 'public-fixture',
  usagePath: 'scripts/preparePublicTestFixture.js'
};

function getUsage() {
  return core.getUsage(CONFIG);
}

function parseArgs(argv) {
  return core.parseArgs(argv, {
    repoUrl: DEFAULT_REPO_URL,
    branch: DEFAULT_BRANCH,
    targetRoot: DEFAULT_TARGET_ROOT
  });
}

function getNextStepMessage(targetRoot) {
  return core.getNextStepMessage(targetRoot, CONFIG.label);
}

function main(argv = process.argv.slice(2), deps = {}) {
  return core.runPublicRepoClone(argv, deps, CONFIG);
}

if (require.main === module) {
  void Promise.resolve(main()).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  DEFAULT_BRANCH,
  DEFAULT_REPO_URL,
  DEFAULT_TARGET_ROOT,
  getUsage,
  getNextStepMessage,
  parseArgs,
  main
};

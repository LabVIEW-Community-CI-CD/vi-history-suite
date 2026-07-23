#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

// Centralized surface contract for the repo-native documentation workbench.
// `docs/cm/cm-plan.md` ("Documentation Workbench Status") declares the same set;
// the gate fails closed until every surface exists and is coherent so the
// standards detector can only report `supported: true` once they are present.
const DOCKERFILE_RELATIVE_PATH = path.join('docker', 'docs-authoring', 'Dockerfile');
const WORKBENCH_GUIDE_RELATIVE_PATH = path.join('docs', 'documentation-workbench.md');
const PACKAGE_MANIFEST_RELATIVE_PATH = 'package.json';
const DOCS_GATE_SCRIPT_NAME = 'docs:gate';
const DOCS_GATE_SCRIPT_FILE = 'checkDocumentationWorkbench.js';

function toPosix(relativePath) {
  return relativePath.split(path.sep).join('/');
}

const REQUIRED_WORKBENCH_SURFACES = [
  toPosix(DOCKERFILE_RELATIVE_PATH),
  toPosix(WORKBENCH_GUIDE_RELATIVE_PATH),
  `package.json script ${DOCS_GATE_SCRIPT_NAME}`
];

function readFileIfPresent(absolutePath) {
  try {
    return fs.readFileSync(absolutePath, 'utf8');
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

function checkDockerfile(cwd) {
  const content = readFileIfPresent(path.join(cwd, DOCKERFILE_RELATIVE_PATH));
  if (content === null) {
    return {
      name: 'docs-authoring Dockerfile',
      passed: false,
      details: `missing ${toPosix(DOCKERFILE_RELATIVE_PATH)}`
    };
  }
  const hasBaseImage = /^\s*FROM\s+\S+/mu.test(content);
  return {
    name: 'docs-authoring Dockerfile',
    passed: hasBaseImage,
    details: hasBaseImage
      ? `present with a base image (${toPosix(DOCKERFILE_RELATIVE_PATH)})`
      : 'present but missing a FROM base-image directive'
  };
}

function checkWorkbenchGuide(cwd) {
  const content = readFileIfPresent(path.join(cwd, WORKBENCH_GUIDE_RELATIVE_PATH));
  if (content === null) {
    return {
      name: 'documentation workbench guide',
      passed: false,
      details: `missing ${toPosix(WORKBENCH_GUIDE_RELATIVE_PATH)}`
    };
  }
  const missing = [];
  if (!content.includes(toPosix(DOCKERFILE_RELATIVE_PATH))) {
    missing.push(`${toPosix(DOCKERFILE_RELATIVE_PATH)} reference`);
  }
  if (!content.includes(DOCS_GATE_SCRIPT_NAME)) {
    missing.push(`${DOCS_GATE_SCRIPT_NAME} reference`);
  }
  const passed = missing.length === 0;
  return {
    name: 'documentation workbench guide',
    passed,
    details: passed
      ? 'present and references the authoring image and the docs gate'
      : `present but missing: ${missing.join(', ')}`
  };
}

function checkDocsGateScript(cwd) {
  const content = readFileIfPresent(path.join(cwd, PACKAGE_MANIFEST_RELATIVE_PATH));
  if (content === null) {
    return { name: 'docs:gate package script', passed: false, details: 'missing package.json' };
  }
  let manifest;
  try {
    manifest = JSON.parse(content);
  } catch (error) {
    return {
      name: 'docs:gate package script',
      passed: false,
      details: `package.json is not valid JSON: ${error.message}`
    };
  }
  const scriptValue =
    manifest && manifest.scripts ? manifest.scripts[DOCS_GATE_SCRIPT_NAME] : undefined;
  const passed = typeof scriptValue === 'string' && scriptValue.includes(DOCS_GATE_SCRIPT_FILE);
  return {
    name: 'docs:gate package script',
    passed,
    details: passed
      ? `wired to "${scriptValue}"`
      : `package.json scripts.${DOCS_GATE_SCRIPT_NAME} must invoke scripts/${DOCS_GATE_SCRIPT_FILE}`
  };
}

function runDocumentationWorkbenchGate(options = {}) {
  const cwd = options.cwd || process.cwd();
  const checks = [checkDockerfile(cwd), checkWorkbenchGuide(cwd), checkDocsGateScript(cwd)];
  return {
    success: checks.every((check) => check.passed),
    checks
  };
}

function renderResult(result) {
  const lines = ['[docs-gate] Documentation workbench gate results:'];
  for (const check of result.checks) {
    lines.push(`[docs-gate] ${check.passed ? 'PASS' : 'FAIL'} ${check.name}: ${check.details}`);
  }
  lines.push(result.success ? '[docs-gate] Gate passed.' : '[docs-gate] Gate failed.');
  return lines.join('\n');
}

function main() {
  const result = runDocumentationWorkbenchGate();
  process.stdout.write(`${renderResult(result)}\n`);
  return result.success ? 0 : 1;
}

if (require.main === module) {
  process.exitCode = main();
}

module.exports = {
  DOCKERFILE_RELATIVE_PATH,
  WORKBENCH_GUIDE_RELATIVE_PATH,
  DOCS_GATE_SCRIPT_NAME,
  REQUIRED_WORKBENCH_SURFACES,
  checkDockerfile,
  checkWorkbenchGuide,
  checkDocsGateScript,
  main,
  renderResult,
  runDocumentationWorkbenchGate
};

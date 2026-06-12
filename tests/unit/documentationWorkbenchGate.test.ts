import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '..', '..');

const {
  REQUIRED_WORKBENCH_SURFACES,
  checkDockerfile,
  checkWorkbenchGuide,
  checkDocsGateScript,
  renderResult,
  runDocumentationWorkbenchGate
} = require('../../scripts/checkDocumentationWorkbench.js') as {
  REQUIRED_WORKBENCH_SURFACES: string[];
  checkDockerfile: (cwd: string) => { name: string; passed: boolean; details: string };
  checkWorkbenchGuide: (cwd: string) => { name: string; passed: boolean; details: string };
  checkDocsGateScript: (cwd: string) => { name: string; passed: boolean; details: string };
  renderResult: (result: {
    success: boolean;
    checks: Array<{ name: string; passed: boolean; details: string }>;
  }) => string;
  runDocumentationWorkbenchGate: (options?: { cwd?: string }) => {
    success: boolean;
    checks: Array<{ name: string; passed: boolean; details: string }>;
  };
};

const fixtureRoots: string[] = [];

const COHERENT_GUIDE = [
  '# Documentation Workbench',
  '',
  'Build `docker/docs-authoring/Dockerfile` and run `npm run docs:gate`.',
  ''
].join('\n');

const COHERENT_DOCKERFILE = ['FROM node:24-bookworm-slim', 'WORKDIR /workspace', ''].join('\n');

function createFixture(files: Record<string, string>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'docs-gate-'));
  fixtureRoots.push(root);
  for (const [relativePath, body] of Object.entries(files)) {
    const filePath = path.join(root, relativePath);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, body, 'utf8');
  }
  return root;
}

function completeWorkbenchFiles(): Record<string, string> {
  return {
    'docker/docs-authoring/Dockerfile': COHERENT_DOCKERFILE,
    'docs/documentation-workbench.md': COHERENT_GUIDE,
    'package.json': `${JSON.stringify(
      { scripts: { 'docs:gate': 'node scripts/checkDocumentationWorkbench.js' } },
      null,
      2
    )}\n`
  };
}

describe('documentation workbench gate', () => {
  afterEach(() => {
    for (const root of fixtureRoots.splice(0)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('passes for the committed repository surfaces', () => {
    const result = runDocumentationWorkbenchGate({ cwd: repoRoot });

    expect(result.success).toBe(true);
    expect(result.checks.map((check) => check.name)).toEqual([
      'docs-authoring Dockerfile',
      'documentation workbench guide',
      'docs:gate package script'
    ]);
    expect(renderResult(result)).toContain('[docs-gate] Gate passed.');
  });

  it('declares the three required workbench surfaces', () => {
    expect(REQUIRED_WORKBENCH_SURFACES).toEqual([
      'docker/docs-authoring/Dockerfile',
      'docs/documentation-workbench.md',
      'package.json script docs:gate'
    ]);
  });

  it('passes for a coherent fixture with all surfaces present', () => {
    const root = createFixture(completeWorkbenchFiles());

    expect(runDocumentationWorkbenchGate({ cwd: root }).success).toBe(true);
  });

  it('fails closed when the docs-authoring Dockerfile is missing', () => {
    const files = completeWorkbenchFiles();
    delete files['docker/docs-authoring/Dockerfile'];
    const root = createFixture(files);

    const check = checkDockerfile(root);
    expect(check.passed).toBe(false);
    expect(check.details).toContain('missing docker/docs-authoring/Dockerfile');
    expect(runDocumentationWorkbenchGate({ cwd: root }).success).toBe(false);
  });

  it('fails closed when the Dockerfile lacks a base image', () => {
    const files = completeWorkbenchFiles();
    files['docker/docs-authoring/Dockerfile'] = '# no base image directive\nWORKDIR /workspace\n';
    const root = createFixture(files);

    const check = checkDockerfile(root);
    expect(check.passed).toBe(false);
    expect(check.details).toContain('FROM');
  });

  it('fails closed when the workbench guide omits the image or gate references', () => {
    const files = completeWorkbenchFiles();
    files['docs/documentation-workbench.md'] = '# Documentation Workbench\n\nNo references here.\n';
    const root = createFixture(files);

    const check = checkWorkbenchGuide(root);
    expect(check.passed).toBe(false);
    expect(check.details).toContain('docker/docs-authoring/Dockerfile reference');
    expect(check.details).toContain('docs:gate reference');
  });

  it('fails closed when package.json does not wire docs:gate to the gate script', () => {
    const files = completeWorkbenchFiles();
    files['package.json'] = `${JSON.stringify({ scripts: { 'docs:gate': 'echo skip' } }, null, 2)}\n`;
    const root = createFixture(files);

    const check = checkDocsGateScript(root);
    expect(check.passed).toBe(false);
    expect(check.details).toContain('checkDocumentationWorkbench.js');
    expect(runDocumentationWorkbenchGate({ cwd: root }).success).toBe(false);
  });
});

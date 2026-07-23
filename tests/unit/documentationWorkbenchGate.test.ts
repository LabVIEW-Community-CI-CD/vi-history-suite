import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

const repoRoot = path.resolve(__dirname, '..', '..');

const {
  REQUIRED_WORKBENCH_SURFACES,
  checkDockerfile,
  checkWorkbenchGuide,
  checkDocsGateScript,
  main,
  renderResult,
  runDocumentationWorkbenchGate
} = require('../../scripts/checkDocumentationWorkbench.js') as {
  REQUIRED_WORKBENCH_SURFACES: string[];
  checkDockerfile: (cwd: string) => { name: string; passed: boolean; details: string };
  checkWorkbenchGuide: (cwd: string) => { name: string; passed: boolean; details: string };
  checkDocsGateScript: (cwd: string) => { name: string; passed: boolean; details: string };
  main: () => number;
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

  it('rethrows a non-ENOENT read error when the Dockerfile path is a directory', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'docs-gate-eisdir-'));
    fixtureRoots.push(root);
    // Making the Dockerfile path a directory makes fs.readFileSync throw a
    // non-ENOENT error (EISDIR), which readFileIfPresent rethrows instead of
    // treating the surface as absent.
    fs.mkdirSync(path.join(root, 'docker', 'docs-authoring', 'Dockerfile'), { recursive: true });
    expect(() => checkDockerfile(root)).toThrow();
  });

  it('fails closed when the workbench guide is missing entirely', () => {
    const files = completeWorkbenchFiles();
    delete files['docs/documentation-workbench.md'];
    const root = createFixture(files);

    const check = checkWorkbenchGuide(root);
    expect(check.passed).toBe(false);
    expect(check.details).toContain('missing docs/documentation-workbench.md');
  });

  it('fails closed when package.json is missing entirely', () => {
    const files = completeWorkbenchFiles();
    delete files['package.json'];
    const root = createFixture(files);

    const check = checkDocsGateScript(root);
    expect(check.passed).toBe(false);
    expect(check.details).toContain('missing package.json');
  });

  it('fails closed when package.json is not valid JSON', () => {
    const files = completeWorkbenchFiles();
    files['package.json'] = '{ not valid json';
    const root = createFixture(files);

    const check = checkDocsGateScript(root);
    expect(check.passed).toBe(false);
    expect(check.details).toContain('not valid JSON');
  });

  it('fails closed when package.json has no scripts section', () => {
    const files = completeWorkbenchFiles();
    files['package.json'] = `${JSON.stringify({ name: 'example' }, null, 2)}\n`;
    const root = createFixture(files);

    const check = checkDocsGateScript(root);
    expect(check.passed).toBe(false);
    expect(check.details).toContain('must invoke scripts/checkDocumentationWorkbench.js');
  });

  it('defaults to process.cwd() when no cwd option is supplied', () => {
    // No options -> the `options.cwd || process.cwd()` fallback resolves the repo
    // root, whose committed surfaces satisfy the gate.
    const result = runDocumentationWorkbenchGate();
    expect(result.success).toBe(true);
    expect(result.checks).toHaveLength(3);
  });

  it('renders failing checks and a failed gate banner', () => {
    const rendered = renderResult({
      success: false,
      checks: [
        { name: 'ok surface', passed: true, details: 'wired' },
        { name: 'broken surface', passed: false, details: 'missing' }
      ]
    });

    expect(rendered).toContain('[docs-gate] PASS ok surface: wired');
    expect(rendered).toContain('[docs-gate] FAIL broken surface: missing');
    expect(rendered).toContain('[docs-gate] Gate failed.');
  });

  it('main runs the gate against the committed repo and returns zero', () => {
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    try {
      expect(main()).toBe(0);
    } finally {
      writeSpy.mockRestore();
    }
  });
});

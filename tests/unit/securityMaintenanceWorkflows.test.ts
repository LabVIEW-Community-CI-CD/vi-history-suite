import * as fs from 'node:fs';
import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

function readRepoFile(...segments: string[]): string {
  return fs
    .readFileSync(path.resolve(__dirname, '..', '..', ...segments), 'utf8')
    .replace(/\r\n/g, '\n');
}

describe('security maintenance workflows', () => {
  it('keeps Dependabot enabled for npm and GitHub Actions', () => {
    const dependabot = readRepoFile('.github', 'dependabot.yml');

    expect(dependabot).toContain('version: 2');
    expect(dependabot).toContain('package-ecosystem: npm');
    expect(dependabot).toContain('package-ecosystem: github-actions');
    expect(dependabot).toMatch(/interval:\s+weekly/);
    expect(dependabot).toContain('directory: /');
  });

  it('runs CodeQL on main, pull requests, schedule, and manual dispatch', () => {
    const codeql = readRepoFile('.github', 'workflows', 'codeql.yml');

    expect(codeql).toContain('name: CodeQL');
    expect(codeql).toMatch(/push:\n\s+branches:\n\s+- main/);
    expect(codeql).toMatch(/pull_request:\n\s+branches:\n\s+- main/);
    expect(codeql).toContain('schedule:');
    expect(codeql).toContain('workflow_dispatch:');
  });

  it('grants CodeQL only the repository permissions it needs', () => {
    const codeql = readRepoFile('.github', 'workflows', 'codeql.yml');

    expect(codeql).toContain('actions: read');
    expect(codeql).toContain('contents: read');
    expect(codeql).toContain('security-events: write');
    expect(codeql).not.toContain('contents: write');
  });

  it('analyzes the TypeScript extension without adding release gates', () => {
    const codeql = readRepoFile('.github', 'workflows', 'codeql.yml');

    expect(codeql).toContain('github/codeql-action/init@v4');
    expect(codeql).toContain('languages: javascript-typescript');
    expect(codeql).toContain('github/codeql-action/analyze@v4');
    expect(codeql).not.toContain('vsce publish');
  });
});

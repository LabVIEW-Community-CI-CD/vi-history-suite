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
    expect(dependabot).toMatch(/package-ecosystem:\s+npm[\s\S]*target-branch:\s+develop/);
    expect(dependabot).toMatch(
      /package-ecosystem:\s+github-actions[\s\S]*target-branch:\s+develop/
    );
    expect(dependabot).toMatch(/interval:\s+weekly/);
    expect(dependabot).toContain('directory: /');
  });

  it('groups routine npm updates while leaving major updates independently reviewable', () => {
    const dependabot = readRepoFile('.github', 'dependabot.yml');

    expect(dependabot).toMatch(
      /npm-development-minor-patch:[\s\S]*dependency-type:\s+development[\s\S]*update-types:[\s\S]*-\s+minor[\s\S]*-\s+patch/
    );
    expect(dependabot).toMatch(
      /npm-runtime-minor-patch:[\s\S]*dependency-type:\s+production[\s\S]*update-types:[\s\S]*-\s+minor[\s\S]*-\s+patch/
    );
    expect(dependabot).not.toMatch(/^\s+-\s+major\s*$/m);
    expect(dependabot).toMatch(
      /dependency-name:\s+"@types\/node"[\s\S]*version-update:semver-major/
    );
    expect(dependabot).toMatch(
      /dependency-name:\s+"@types\/vscode"[\s\S]*version-update:semver-major[\s\S]*version-update:semver-minor/
    );
  });

  it('runs CodeQL on main, pull requests, a weekly schedule, and manual dispatch', () => {
    const codeql = readRepoFile('.github', 'workflows', 'codeql.yml');

    expect(codeql).toContain('name: CodeQL');
    expect(codeql).toMatch(/push:\n\s+branches:\n\s+- main\n\s+- develop/);
    expect(codeql).toMatch(/pull_request:\n\s+branches:\n\s+- main\n\s+- develop/);
    expect(codeql).toContain('schedule:');
    // VHS-REQ-602 criterion 5: the schedule must be weekly (a cron with a fixed
    // day-of-week and wildcard day-of-month/month), not merely present, so a
    // regression to a daily or other cadence fails closed.
    expect(codeql).toMatch(/schedule:\n\s+- cron: "\d+ \d+ \* \* [0-6]"/);
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

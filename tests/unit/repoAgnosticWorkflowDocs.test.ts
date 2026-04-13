import * as fs from 'node:fs';
import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '..', '..');

function readRepoFile(...segments: string[]): string {
  return fs.readFileSync(path.join(repoRoot, ...segments), 'utf8');
}

describe('repo-agnostic checkbox workflow docs', () => {
  it('aligns the authority docs on repo-agnostic support with governed-evidence depth', () => {
    const readme = readRepoFile('README.md');
    const currentState = readRepoFile('docs', 'product', 'current-state.md');
    const srs = readRepoFile('docs', 'requirements', 'srs.md');
    const rtm = readRepoFile('docs', 'requirements', 'rtm.csv');
    const testPlan = readRepoFile('docs', 'testing', 'test-plan.md');
    const adr = readRepoFile(
      'docs',
      'architecture',
      'adr',
      'ADR-0017-bounded-repo-family-support.md'
    );

    for (const content of [readme, currentState, srs, rtm, testPlan, adr]) {
      expect(content).toContain('repo-agnostic');
    }

    expect(readme).toContain('VI History is available in any trusted Git repository');
    expect(currentState).toContain('Repo-agnostic support with governed-evidence depth');
    expect(srs).toContain('checkbox-selected compare flow');
    expect(rtm).toContain('checkbox-selected compare flow');
    expect(testPlan).toContain('checkbox-selected compare flow available on generic repositories');
  });

  it('aligns the shipped workflow docs on checkbox-only two-commit compare', () => {
    const readme = readRepoFile('README.md');
    const currentState = readRepoFile('docs', 'product', 'current-state.md');
    const srs = readRepoFile('docs', 'requirements', 'srs.md');
    const rtm = readRepoFile('docs', 'requirements', 'rtm.csv');
    const testPlan = readRepoFile('docs', 'testing', 'test-plan.md');
    const bundledSync = readRepoFile('scripts', 'syncBundledDocs.js');

    for (const content of [readme, currentState, srs, rtm, testPlan, bundledSync]) {
      expect(content).toContain('checkbox');
      expect(content).toContain('two');
    }

    expect(srs).toContain('at least two commits as sufficient');
    expect(srs).toContain('explicit compare-preflight pair');
    expect(srs).toContain('oldest retained row explicitly selectable as the base side of a checkbox-selected compare');
    expect(rtm).toContain('two retained commits are enough to use VI History');
    expect(rtm).toContain('explicit compare-preflight pair');
    expect(testPlan).toContain('checkbox-only');
    expect(bundledSync).toContain('the primary and only extension-user compare control');
    expect(bundledSync).toContain('the oldest retained revision is still selectable as the older/base side of a checkbox-selected pair');
    expect(bundledSync).not.toContain('review-scenarios-and-decision-records');
  });
});

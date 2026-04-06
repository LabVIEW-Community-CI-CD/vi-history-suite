import * as fs from 'node:fs';
import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '..', '..');

function readRepoFile(...segments: string[]): string {
  return fs.readFileSync(path.join(repoRoot, ...segments), 'utf8');
}

describe('host-operation matrix docs', () => {
  it('aligns on x64-first then gated x86 host-proof ordering', () => {
    const currentState = readRepoFile('docs', 'product', 'current-state.md');
    const program = readRepoFile(
      'docs',
      'product',
      'execution-programs',
      'PROGRAM-0003-repeatable-benchmark-proof.md'
    );
    const issue = readRepoFile(
      'docs',
      'product',
      'issues',
      'ISSUE-0408-repeatable-benchmark-proof.md'
    );
    const srs = readRepoFile('docs', 'requirements', 'srs.md');
    const rtm = readRepoFile('docs', 'requirements', 'rtm.csv');
    const testPlan = readRepoFile('docs', 'testing', 'test-plan.md');

    for (const content of [currentState, program, issue, srs, rtm, testPlan]) {
      expect(content).toContain('x64');
      expect(content).toContain('x86');
      expect(content).toContain('CreateComparisonReport');
    }

    expect(currentState).toContain('runs the LabVIEW 2026 x64 tranche first and gates the x86 tranche');
    expect(program).toContain('exercise the LabVIEW 2026 x64 host tranche first and gate the x86 tranche');
    expect(issue).toContain('runs the LabVIEW 2026 x64 tranche first and gates the x86 tranche');
    expect(srs).toContain('x64-first and then x86');
    expect(rtm).toContain('x64-first and then x86');
    expect(testPlan).toContain('x64 tranche first');
  });
});

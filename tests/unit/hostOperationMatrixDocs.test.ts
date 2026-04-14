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

  it('retains direct CreateComparisonReport blocker receipts for both supported host bundles', () => {
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
    const packetMarkdown = readRepoFile(
      'docs',
      'product',
      'benchmark-packets',
      'HARNESS-VHS-001-windows-host-create-comparison-proof-2026-04-14.md'
    );
    const packetJson = readRepoFile(
      'docs',
      'product',
      'benchmark-packets',
      'HARNESS-VHS-001-windows-host-create-comparison-proof-2026-04-14.json'
    );
    const rtm = readRepoFile('docs', 'requirements', 'rtm.csv');
    const testPlan = readRepoFile('docs', 'testing', 'test-plan.md');

    for (const content of [currentState, program, issue, packetMarkdown, packetJson]) {
      expect(content).toContain('x64');
      expect(content).toContain('x86');
      expect(content).toContain('command-timed-out');
      expect(content).toContain('LabVIEWCLI.exe');
    }

    for (const content of [currentState, program, issue, packetMarkdown]) {
      expect(content).toContain('LabVIEW.exe');
    }

    expect(packetMarkdown).toContain(
      '.cache/governed-proof/windows-host-create-comparison-proof/2026-04-14/x64/comparison-report-smoke.json'
    );
    expect(packetMarkdown).toContain(
      '.cache/governed-proof/windows-host-create-comparison-proof/2026-04-14/x86/comparison-report-smoke.json'
    );
    expect(packetMarkdown).toContain('3363');
    expect(packetMarkdown).toContain('3364');
    expect(packetMarkdown).toContain('`LabVIEWCLI.exe` was observed while `LabVIEW.exe` was not observed');
    expect(packetMarkdown).toContain('no LabVIEW-related processes were observed at exit');

    const req548Line = rtm
      .split('\n')
      .find((line) => line.startsWith('VHS-REQ-548,'));
    expect(req548Line).toBeDefined();
    expect(req548Line).toContain(',Implemented');
    expect(testPlan).toContain('derived VI Server port (`3363`)');
    expect(testPlan).toContain('derived VI Server port (`3364`)');
  });
});

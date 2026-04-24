import * as fs from 'node:fs';
import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '..', '..');

function readRepoFile(...segments: string[]): string {
  return fs.readFileSync(path.join(repoRoot, ...segments), 'utf8');
}

describe('host-operation matrix docs', () => {
  it('keeps benchmark host ordering historical while the active release scope stays x64 only', () => {
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
    expect(currentState).toContain(
      'Windows x86 / 32-bit LabVIEW remains out of scope for the current released'
    );
    expect(srs).toContain('characterization-only outside the current release scope');
    expect(rtm).toContain('characterization-only outside the current release scope');
    expect(testPlan).toContain('non-release characterization only');
  });

  it('keeps the retained x86/x64 blocker packet historical instead of current release admission', () => {
    const currentState = readRepoFile('docs', 'product', 'current-state.md');
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

    for (const content of [currentState, packetMarkdown, packetJson]) {
      expect(content).toContain('x64');
      expect(content).toContain('x86');
      expect(content).toContain('command-timed-out');
      expect(content).toContain('LabVIEWCLI.exe');
    }

    for (const content of [currentState, packetMarkdown]) {
      expect(content).toContain('LabVIEW.exe');
    }

    expect(currentState).toContain(
      'historical characterization only rather than current `v1.3.0` release'
    );
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
    expect(req548Line).toContain('x64 release host bundle');
    expect(req548Line).toContain('non-blocking characterization only');
    expect(req548Line).toContain(',Implemented');
    expect(testPlan).toContain('derived VI Server port (`3363`)');
    expect(testPlan).toContain('derived VI Server port (`3364`)');
    expect(testPlan).toContain('characterization receipt without');
    expect(testPlan).toContain('current release admission');
  });
});

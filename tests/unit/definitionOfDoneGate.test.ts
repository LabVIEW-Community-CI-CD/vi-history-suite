import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '..', '..');

const {
  REQUIRED_CLOSEOUT_GATES,
  assertOrdered,
  checkStaleDodDeferrals,
  parseCsvLine,
  renderResult,
  runDefinitionOfDoneGate
} = require('../../scripts/checkDefinitionOfDone.js') as {
  REQUIRED_CLOSEOUT_GATES: string[];
  assertOrdered: (
    text: string,
    labels: string[],
    needleForLabel: (label: string) => string
  ) => { passed: boolean; details: string };
  checkStaleDodDeferrals: (cwd: string) => { passed: boolean; details: string };
  parseCsvLine: (line: string) => string[];
  renderResult: (result: { success: boolean; checks: Array<{ name: string; passed: boolean; details: string }> }) => string;
  runDefinitionOfDoneGate: (options?: { cwd?: string }) => {
    success: boolean;
    checks: Array<{ name: string; passed: boolean; details: string }>;
  };
};

const fixtureRoots: string[] = [];

function createFixture(files: Record<string, string>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dod-gate-'));
  fixtureRoots.push(root);
  for (const [relativePath, body] of Object.entries(files)) {
    const filePath = path.join(root, relativePath);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, body, 'utf8');
  }
  return root;
}

describe('Definition-of-Done gate', () => {
  afterEach(() => {
    for (const root of fixtureRoots.splice(0)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('passes for the committed repo contract', () => {
    const result = runDefinitionOfDoneGate({ cwd: repoRoot });

    expect(result.success).toBe(true);
    expect(result.checks.map((check) => check.name)).toEqual([
      'package dod:gate script',
      'CI required step order',
      'closeout local gate order',
      'standards provenance configuration',
      'requirement-target issue template',
      'PR evidence documentation',
      'DoD checker traceability mapping',
      'stale deferred DoD language'
    ]);
    expect(renderResult(result)).toContain('[dod-gate] Gate passed.');
  });

  it('keeps the required closeout gate order explicit', () => {
    expect(REQUIRED_CLOSEOUT_GATES).toEqual([
      'traceability:audit',
      'docs:links',
      'dod:gate',
      'check',
      'test',
      'package'
    ]);
    expect(
      assertOrdered(
        "['traceability:audit']\n['docs:links']\n['dod:gate']\n['check']\n['test']\n['package']",
        REQUIRED_CLOSEOUT_GATES,
        (gate) => `['${gate}'`
      ).passed
    ).toBe(true);
  });

  it('fails ordered checks when a required predecessor moves later', () => {
    const result = assertOrdered(
      "['docs:links']\n['traceability:audit']",
      ['traceability:audit', 'docs:links'],
      (gate) => `['${gate}'`
    );

    expect(result.passed).toBe(false);
    expect(result.details).toContain('docs:links');
  });

  it('detects stale deferred DoD wording in active evidence docs', () => {
    const root = createFixture({
      'docs/requirements/README.md': 'ok\n',
      'docs/testing/test-plan.md': 'Definition-of-Done gate findings remain deferred next-wave\n',
      'docs/requirements/srs.md': 'ok\n',
      'scripts/generateCloseoutEvidence.js': 'ok\n'
    });

    const result = checkStaleDodDeferrals(root);

    expect(result.passed).toBe(false);
    expect(result.details).toContain('docs/testing/test-plan.md');
  });

  it('parses quoted CSV cells for traceability checks', () => {
    expect(parseCsvLine('A,"B, C","D ""quoted"""')).toEqual(['A', 'B, C', 'D "quoted"']);
  });
});

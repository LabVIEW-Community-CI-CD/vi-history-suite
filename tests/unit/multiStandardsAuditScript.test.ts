import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

const repoRoot = path.resolve(__dirname, '..', '..');

const {
  DEFAULT_SAVE_DIR,
  GATE_SCORECARD_PROFILES,
  PORTFOLIO_PROFILE,
  buildRunId,
  parseArgs,
  directDockerSteps,
  profileDockerSteps,
  replaceAuditMounts,
  summarizeGateScorecard,
  summarizePortfolioTable,
  runMultiStandardsAudit
} = require('../../scripts/runMultiStandardsAudit.js') as {
  DEFAULT_SAVE_DIR: string;
  GATE_SCORECARD_PROFILES: string[];
  PORTFOLIO_PROFILE: string;
  buildRunId: (date?: Date) => string;
  parseArgs: (argv: string[]) => {
    image: string;
    requirementsSpecScope: string;
    saveDir: string;
    runId?: string;
    keepSnapshot: boolean;
    help: boolean;
  };
  directDockerSteps: (options: { image: string; requirementsSpecScope: string }) => Array<{
    name: string;
    file: string;
    command: string;
    args: string[];
  }>;
  summarizePortfolioTable: (text: string) => {
    repo?: string;
    overall?: string;
    gates?: string;
    areaScores?: Record<string, number | string>;
    topRisk?: string;
  } | undefined;
  summarizeGateScorecard: (text: string) => Record<string, {
    status?: string;
    confidence?: string;
    missingProof: string[];
  }>;
  profileDockerSteps: (options: { image: string }) => Array<{
    name: string;
    file: string;
    output: string;
    command: string;
    args: string[];
  }>;
  replaceAuditMounts: (args: string[], snapshotPath: string, outputDir: string) => string[];
  runMultiStandardsAudit: (
    argv: string[],
    deps: {
      cwd?: string;
      now?: () => Date;
      spawnSync?: (
        command: string,
        args: string[],
        options: { cwd?: string; encoding?: string; shell?: boolean; timeout?: number }
      ) => { status?: number | null; stdout?: string; stderr?: string; error?: Error };
      createTrackedWorktreeSnapshot?: (repoRoot: string) => {
        mode: string;
        path: string;
        trackedFileCount: number;
        symlinkFiles: string[];
        missingFiles: string[];
        generatedRootsExcluded: string[];
      };
      removeTrackedWorktreeSnapshot?: (snapshot: { path: string }) => void;
    }
  ) => {
    exitCode: number;
    markdown: string;
    context: {
      outputDir: string;
      imageAccess?: string;
      imagePreparation?: Array<{ name: string; status: number }>;
      directChecks: Array<{ status: number }>;
      profiles: Array<{
        status: number;
        portfolio?: {
          tableFile: string;
          overall?: string;
          gates?: string;
          areaScores?: Record<string, number | string>;
          topRisk?: string;
        };
        scorecardDetails?: Record<string, {
          status?: string;
          confidence?: string;
          missingProof: string[];
        }>;
      }>;
      success: boolean;
    };
  };
};

const tempRoots: string[] = [];

function makeTempRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'multi-standards-audit-'));
  tempRoots.push(root);
  return root;
}

function gateScorecard(): string {
  return [
    'Gate Scorecard',
    '| Gate | Status | Confidence | Missing Proof |',
    '| --- | --- | --- | --- |',
    '| coverage | PASS | High | - |',
    '| cm | PASS | High | - |',
    '| req | PASS | High | - |',
    '| arch | PASS | High | - |',
    '| doc | PASS | High | - |',
    '| dod | PASS | Med | - |'
  ].join('\n');
}

function portfolioTable(): string {
  return [
    'Portfolio Table',
    '| Repo | Overall | Gates | REQ | ARCH | TEST | CM | DOC | Top Risk |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    '| target | High | 6P/0F | 5 | 5 | 5 | 5 | 5 | none |'
  ].join('\n');
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe('multi standards audit script', () => {
  it('parses defaults and formats UTC run ids', () => {
    const options = parseArgs([]);

    expect(options.saveDir).toBe(DEFAULT_SAVE_DIR);
    expect(options.requirementsSpecScope).toBe('system');
    expect(options.keepSnapshot).toBe(false);
    expect(buildRunId(new Date('2026-07-14T05:04:04.123Z'))).toBe('20260714T050404Z');
  });

  it('builds direct and profile Docker commands with snapshot and output mounts', () => {
    const options = { image: 'registry/image:tag', requirementsSpecScope: 'system' };
    const directSteps = directDockerSteps(options);
    const profileSteps = profileDockerSteps(options);
    const quickTriageSaveDirIndex = profileSteps[0].args.indexOf('--save-dir');
    const portfolioStep = profileSteps.find((step) => step.name === PORTFOLIO_PROFILE);
    const portfolioSaveDirIndex = portfolioStep?.args.indexOf('--save-dir') ?? -1;

    expect(directSteps.map((step) => step.name)).toEqual([
      'requirements-quality-system',
      'external-user-information'
    ]);
    expect(directSteps[0].args).toContain('scripts/requirements_quality_check.py');
    expect(directSteps[1].args).toContain('scripts/external_user_information_check.py');
    expect(profileSteps.map((step) => step.name)).toEqual([...GATE_SCORECARD_PROFILES, PORTFOLIO_PROFILE]);
    expect(portfolioStep?.args).toContain('portfolio-table');
    expect(profileSteps[0].args[quickTriageSaveDirIndex + 1]).toBe('/out/quick-triage');
    expect(portfolioStep?.args[portfolioSaveDirIndex + 1]).toBe('/out/portfolio-review');
    expect(replaceAuditMounts(profileSteps[0].args, '/snapshot', '/out')).toContain('/snapshot:/target');
    expect(replaceAuditMounts(profileSteps[0].args, '/snapshot', '/out')).toContain('/out:/out');
  });

  it('summarizes portfolio table signals for prioritization output', () => {
    expect(summarizePortfolioTable(portfolioTable())).toEqual({
      repo: 'target',
      overall: 'High',
      gates: '6P/0F',
      areaScores: {
        REQ: 5,
        ARCH: 5,
        TEST: 5,
        CM: 5,
        DOC: 5
      },
      topRisk: 'none'
    });
  });

  it('summarizes gate scorecard confidence and missing proof', () => {
    expect(summarizeGateScorecard(gateScorecard())).toMatchObject({
      coverage: { status: 'PASS', confidence: 'High', missingProof: [] },
      dod: { status: 'PASS', confidence: 'Med', missingProof: [] }
    });

    expect(summarizeGateScorecard([
      'Gate Scorecard',
      '| Gate | Status | Confidence | Missing Proof |',
      '| --- | --- | --- | --- |',
      '| doc | FAIL | Low | docs link evidence; user guide review |'
    ].join('\n'))).toMatchObject({
      doc: {
        status: 'FAIL',
        confidence: 'Low',
        missingProof: ['docs link evidence', 'user guide review']
      }
    });
  });

  it('runs direct checks and all standards profiles from a tracked snapshot', () => {
    const root = makeTempRoot();
    const snapshotPath = path.join(root, 'snapshot');
    fs.mkdirSync(snapshotPath, { recursive: true });
    const calls: Array<{ command: string; args: string[] }> = [];
    const spawnSync = vi.fn((command: string, args: string[]) => {
      calls.push({ command, args });
      if (command === 'docker' && args[0] === 'image') {
        return { status: 0, stdout: '[{"Id":"image"}]' };
      }
      if (args.includes('scripts/requirements_quality_check.py')) {
        return { status: 0, stdout: JSON.stringify({ ok: true, findings: [] }) };
      }
      if (args.includes('scripts/external_user_information_check.py')) {
        return {
          status: 0,
          stdout: JSON.stringify({ ok: true, findings: [], checkedPaths: ['docs/user-guide.md'] })
        };
      }
      if (args.includes('scripts/run_assurance.py')) {
        return {
          status: 0,
          stdout: args.includes('portfolio-table') ? portfolioTable() : gateScorecard()
        };
      }
      return { status: 99, stderr: `unexpected ${command} ${args.join(' ')}` };
    });
    const removeTrackedWorktreeSnapshot = vi.fn();

    const result = runMultiStandardsAudit(['--save-dir', path.join(root, 'evidence'), '--run-id', 'run-1'], {
      cwd: repoRoot,
      spawnSync,
      createTrackedWorktreeSnapshot: () => ({
        mode: 'tracked-worktree-snapshot',
        path: snapshotPath,
        trackedFileCount: 12,
        symlinkFiles: [],
        missingFiles: [],
        generatedRootsExcluded: ['assurance-*-evidence/']
      }),
      removeTrackedWorktreeSnapshot
    });

    expect(result.exitCode).toBe(0);
    expect(result.context.success).toBe(true);
    expect(result.context.directChecks).toHaveLength(2);
    expect(result.context.profiles).toHaveLength(6);
    expect(result.markdown).toContain('External user information: ok (0 finding(s), 1 checked path(s))');
    expect(result.markdown).toContain('quick-triage: coverage=PASS(High), cm=PASS(High), req=PASS(High), arch=PASS(High), doc=PASS(High), dod=PASS(Med)');
    expect(result.markdown).toContain('portfolio-review: overall=High, gates=6P/0F, REQ=5, ARCH=5, TEST=5, CM=5, DOC=5, topRisk=none (see portfolio-review-table.txt)');
    expect(result.context.profiles.find((profile) => profile.scorecardDetails)?.scorecardDetails?.dod).toEqual({
      status: 'PASS',
      confidence: 'Med',
      missingProof: []
    });
    expect(result.context.profiles.find((profile) => profile.portfolio)?.portfolio).toMatchObject({
      tableFile: 'portfolio-review-table.txt',
      overall: 'High',
      gates: '6P/0F',
      topRisk: 'none'
    });
    expect(fs.existsSync(path.join(root, 'evidence', 'run-1', 'audit-summary.json'))).toBe(true);
    expect(fs.existsSync(path.join(root, 'evidence', 'run-1', 'portfolio-review-table.txt'))).toBe(true);
    expect(calls.filter((call) => call.command === 'docker' && call.args[0] === 'run')).toHaveLength(8);
    expect(calls.some((call) => call.args.includes(`${snapshotPath}:/target`))).toBe(true);
    expect(calls.some((call) => call.args.includes(`${path.join(root, 'evidence', 'run-1')}:/out`))).toBe(true);
    expect(removeTrackedWorktreeSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ path: snapshotPath }),
      expect.any(Object)
    );
  });

  it('pulls the default standards image after an inspect miss', () => {
    const root = makeTempRoot();
    const snapshotPath = path.join(root, 'snapshot');
    let inspectCount = 0;
    const spawnSync = vi.fn((command: string, args: string[]) => {
      if (command === 'docker' && args[0] === 'image') {
        inspectCount += 1;
        return inspectCount === 1
          ? { status: 1, stderr: 'No such image' }
          : { status: 0, stdout: '[{"Id":"pulled-image"}]' };
      }
      if (command === 'docker' && args[0] === 'pull') {
        return { status: 0, stdout: 'Downloaded newer image' };
      }
      if (args.includes('scripts/requirements_quality_check.py')) {
        return { status: 0, stdout: JSON.stringify({ ok: true, findings: [] }) };
      }
      if (args.includes('scripts/external_user_information_check.py')) {
        return { status: 0, stdout: JSON.stringify({ ok: true, findings: [], checkedPaths: [] }) };
      }
      if (args.includes('scripts/run_assurance.py')) {
        return { status: 0, stdout: args.includes('portfolio-table') ? portfolioTable() : gateScorecard() };
      }
      return { status: 99, stderr: `unexpected ${command} ${args.join(' ')}` };
    });

    const result = runMultiStandardsAudit(['--save-dir', path.join(root, 'evidence'), '--run-id', 'run-2'], {
      cwd: repoRoot,
      spawnSync,
      createTrackedWorktreeSnapshot: () => ({
        mode: 'tracked-worktree-snapshot',
        path: snapshotPath,
        trackedFileCount: 2,
        symlinkFiles: [],
        missingFiles: [],
        generatedRootsExcluded: []
      }),
      removeTrackedWorktreeSnapshot: vi.fn()
    });

    expect(result.exitCode).toBe(0);
    expect(result.context.imageAccess).toBe('pulled');
    expect(result.context.imagePreparation?.map((step) => step.name)).toEqual([
      'docker-image-inspect',
      'docker-image-pull',
      'docker-image-after-pull'
    ]);
  });
});
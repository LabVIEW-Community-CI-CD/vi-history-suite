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
  summarizeRetainedGateScore,
  summarizeRetainedStandardsCoverage,
  summarizeRetainedStandardsEvidence,
  summarizePortfolioTable,
  buildStandardsScoreFileLegend,
  buildStandardsEvidenceSummary,
  buildStandardsGateStrengthSummary,
  buildStandardsGateDetailSummary,
  renderStandardsCoverageMatrix,
  renderStandardsEvidenceSummary,
  renderStandardsScoreFileLegend,
  renderStandardsGateStrengthSummary,
  renderStandardsGateDetailSummary,
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
    basis?: string;
    standards?: string[];
    missingProof: string[];
  }>;
  summarizeRetainedGateScore: (payload: unknown) => Record<string, {
    status?: string;
    confidence?: string;
    basis?: string;
    standards: string[];
    missingProof: string[];
  }>;
  summarizeRetainedStandardsCoverage: (payload: unknown) => Record<string, {
    score?: number | string;
    confidence?: string;
    standards: string[];
    rationale?: string;
  }>;
  summarizeRetainedStandardsEvidence: (payload: unknown) => Array<{
    id?: string;
    summary?: string;
    standards: string[];
    evidencePaths: string[];
  }>;
  renderStandardsEvidenceSummary: (summary: Array<{
    id?: string;
    summary?: string;
    standards: string[];
    evidencePaths: string[];
    profiles: string[];
    scoreFiles?: string[];
  }>) => string[];
  buildStandardsEvidenceSummary: (profiles: Array<{
    name: string;
    standardsEvidence?: Array<{
      id?: string;
      summary?: string;
      standards: string[];
      evidencePaths: string[];
    }>;
    scoreFile?: string;
  }>) => Array<{
    id?: string;
    summary?: string;
    standards: string[];
    evidencePaths: string[];
    profiles: string[];
    scoreFiles: string[];
  }>;
  buildStandardsScoreFileLegend: (profiles: Array<{
    name: string;
    scoreFile?: string;
  }>) => Array<{
    profile: string;
    scoreFile: string;
  }>;
  buildStandardsGateStrengthSummary: (profiles: Array<{
    name: string;
    standardsEvidence?: Array<{
      id?: string;
      summary?: string;
      standards: string[];
      evidencePaths: string[];
    }>;
    scoreFile?: string;
  }>) => Array<{
    id?: string;
    summary?: string;
    standards: string[];
    profiles: string[];
    scoreFiles: string[];
  }>;
  buildStandardsGateDetailSummary: (profiles: Array<{
    name: string;
    scorecardDetails?: Record<string, {
      status?: string;
      confidence?: string;
      basis?: string;
      standards?: string[];
      missingProof: string[];
    }>;
    scoreFile?: string;
  }>) => Array<{
    gate: string;
    status?: string;
    confidence?: string;
    basis?: string;
    standards: string[];
    missingProof: string[];
    profiles: string[];
    scoreFiles: string[];
  }>;
  renderStandardsGateStrengthSummary: (summary: Array<{
    id?: string;
    summary?: string;
    standards: string[];
    profiles: string[];
    scoreFiles: string[];
  }>) => string[];
  renderStandardsScoreFileLegend: (legend: Array<{
    profile: string;
    scoreFile: string;
  }>) => string[];
  renderStandardsCoverageMatrix: (matrix: Array<{
    profile: string;
    scoreFile?: string;
    areas: Record<string, {
      score?: number | string;
      confidence?: string;
      standards: string[];
      rationale?: string;
    }>;
  }>) => string[];
  renderStandardsGateDetailSummary: (summary: Array<{
    gate: string;
    status?: string;
    confidence?: string;
    basis?: string;
    standards: string[];
    missingProof: string[];
    profiles: string[];
    scoreFiles: string[];
  }>) => string[];
  profileDockerSteps: (options: { image: string }) => Array<{
    name: string;
    file: string;
    scoreFile?: string;
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
        name: string;
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
          basis?: string;
          standards?: string[];
          missingProof: string[];
        }>;
        standardsCoverage?: Record<string, {
          score?: number | string;
          confidence?: string;
          standards: string[];
          rationale?: string;
        }>;
        standardsEvidence?: Array<{
          id?: string;
          summary?: string;
          standards: string[];
          evidencePaths: string[];
        }>;
        scoreFile?: string;
      }>;
      standardsCoverageMatrix?: Array<{
        profile: string;
        scoreFile?: string;
        areas: Record<string, {
          score?: number | string;
          confidence?: string;
          standards: string[];
          rationale?: string;
        }>;
      }>;
      standardsScoreFileLegend?: Array<{
        profile: string;
        scoreFile: string;
      }>;
      standardsEvidenceSummary?: Array<{
        id?: string;
        summary?: string;
        standards: string[];
        evidencePaths: string[];
        profiles: string[];
        scoreFiles: string[];
      }>;
      standardsGateStrengthSummary?: Array<{
        id?: string;
        summary?: string;
        standards: string[];
        profiles: string[];
        scoreFiles: string[];
      }>;
      standardsGateDetailSummary?: Array<{
        gate: string;
        status?: string;
        confidence?: string;
        basis?: string;
        standards: string[];
        missingProof: string[];
        profiles: string[];
        scoreFiles: string[];
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

function profileScore(): string {
  return JSON.stringify({
    areas: {
      REQ: {
        score: 5,
        confidence: 'High',
        standards: ['29148'],
        rationale: 'Requirements are identifiable, testable, and trace to code.'
      },
      ARCH: {
        score: 5,
        confidence: 'High',
        standards: ['42010'],
        rationale: 'Architecture description covers views, stakeholders, concerns, and retained decision rationale.'
      },
      TEST: {
        score: 5,
        confidence: 'High',
        standards: ['29119-2', '29119-3'],
        rationale: 'Testing evidence includes automation, thresholds, artifacts, and gate context.'
      },
      CM: {
        score: 5,
        confidence: 'High',
        standards: ['10007', '12207'],
        rationale: 'CM evidence covers baselines, GitFlow branch governance, release automation, and release evidence retention.'
      },
      DOC: {
        score: 5,
        confidence: 'High',
        standards: ['15289', '26514'],
        rationale: 'Documentation includes information-item coverage, automated link checking, and reusable user-information signals.'
      }
    },
    top_strengths: [
      {
        id: 'area-req',
        summary: 'REQ maturity is 5/5 with High confidence.',
        standards: ['29148'],
        evidence_paths: [
          '.github/instructions/requirements-and-test-docs.instructions.md',
          '.github/prompts/requirement-target-execution.prompt.md',
          '.github/skills/requirements-traceability/assets/requirement-target-scaffold.md'
        ]
      },
      {
        id: 'area-test',
        summary: 'TEST maturity is 5/5 with High confidence.',
        standards: ['29119-2', '29119-3'],
        evidence_paths: [
          '.github/skills/testing-automation/SKILL.md',
          '.github/skills/testing-automation/scripts/run-pr-gates.sh',
          '.github/workflows/ci.yml'
        ]
      },
      {
        id: 'area-doc',
        summary: 'DOC maturity is 5/5 with High confidence.',
        standards: ['15289', '26514'],
        evidence_paths: [
          'docs/user-guide.md',
          'docs/quick-reference.md',
          'docs/information-item-map.md'
        ]
      },
      {
        id: 'gate-coverage',
        summary: 'coverage gate passes with High confidence.',
        standards: ['29119-2', '29119-3'],
        evidence_paths: []
      }
    ],
    gates: {
      coverage: {
        status: 'PASS',
        confidence: 'High',
        basis: 'Require tests, CI evidence, coverage artifacts, thresholds, and PR gate context.',
        standards: ['29119-2', '29119-3'],
        missing: []
      },
      cm: {
        status: 'PASS',
        confidence: 'High',
        basis: 'Require SemVer and baseline rules.',
        standards: ['10007', '12207'],
        missing: []
      },
      req: {
        status: 'PASS',
        confidence: 'High',
        basis: 'Require critical capability IDs and at least one RTM row.',
        standards: ['29148'],
        missing: []
      },
      arch: {
        status: 'PASS',
        confidence: 'High',
        basis: 'Require architecture description and decision rationale.',
        standards: ['42010'],
        missing: []
      },
      doc: {
        status: 'PASS',
        confidence: 'High',
        basis: 'Require link-check evidence and reusable user-information signals.',
        standards: ['15289', '26514'],
        missing: []
      },
      dod: {
        status: 'PASS',
        confidence: 'Med',
        basis: 'Report DoD only when a DoD Gate / dod context is visible.',
        standards: [],
        missing: []
      }
    }
  });
}

function writeProfileScoreFromDockerArgs(args: string[]): void {
  const outputMount = args.find((arg) => arg.endsWith(':/out'));
  const saveDirIndex = args.indexOf('--save-dir');
  if (!outputMount || saveDirIndex < 0) {
    return;
  }
  const outputDir = outputMount.slice(0, -':/out'.length);
  const profileSaveDir = args[saveDirIndex + 1]?.replace(/^\/out\//, '');
  if (!profileSaveDir) {
    return;
  }
  const scoreDir = args.includes('portfolio-table')
    ? path.join(outputDir, profileSaveDir, 'repos', 'target')
    : path.join(outputDir, profileSaveDir, 'target');
  fs.mkdirSync(scoreDir, { recursive: true });
  fs.writeFileSync(path.join(scoreDir, 'score.json'), profileScore(), 'utf8');
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

  it('summarizes retained gate basis and standards from score JSON', () => {
    expect(summarizeRetainedGateScore(JSON.parse(profileScore()))).toMatchObject({
      coverage: {
        status: 'PASS',
        confidence: 'High',
        basis: 'Require tests, CI evidence, coverage artifacts, thresholds, and PR gate context.',
        standards: ['29119-2', '29119-3'],
        missingProof: []
      },
      dod: {
        status: 'PASS',
        confidence: 'Med',
        basis: 'Report DoD only when a DoD Gate / dod context is visible.',
        standards: [],
        missingProof: []
      }
    });
  });

  it('summarizes retained area coverage by standard from score JSON', () => {
    expect(summarizeRetainedStandardsCoverage(JSON.parse(profileScore()))).toMatchObject({
      REQ: {
        score: 5,
        confidence: 'High',
        standards: ['29148'],
        rationale: 'Requirements are identifiable, testable, and trace to code.'
      },
      TEST: {
        score: 5,
        confidence: 'High',
        standards: ['29119-2', '29119-3']
      },
      DOC: {
        score: 5,
        confidence: 'High',
        standards: ['15289', '26514']
      }
    });
  });

  it('summarizes retained standards evidence paths from score JSON', () => {
    expect(summarizeRetainedStandardsEvidence(JSON.parse(profileScore()))).toEqual([
      {
        id: 'area-req',
        summary: 'REQ maturity is 5/5 with High confidence.',
        standards: ['29148'],
        evidencePaths: [
          '.github/instructions/requirements-and-test-docs.instructions.md',
          '.github/prompts/requirement-target-execution.prompt.md',
          '.github/skills/requirements-traceability/assets/requirement-target-scaffold.md'
        ]
      },
      {
        id: 'area-test',
        summary: 'TEST maturity is 5/5 with High confidence.',
        standards: ['29119-2', '29119-3'],
        evidencePaths: [
          '.github/skills/testing-automation/SKILL.md',
          '.github/skills/testing-automation/scripts/run-pr-gates.sh',
          '.github/workflows/ci.yml'
        ]
      },
      {
        id: 'area-doc',
        summary: 'DOC maturity is 5/5 with High confidence.',
        standards: ['15289', '26514'],
        evidencePaths: [
          'docs/user-guide.md',
          'docs/quick-reference.md',
          'docs/information-item-map.md'
        ]
      },
      {
        id: 'gate-coverage',
        summary: 'coverage gate passes with High confidence.',
        standards: ['29119-2', '29119-3'],
        evidencePaths: []
      }
    ]);
  });

  it('escapes retained standards evidence Markdown cells', () => {
    expect(renderStandardsEvidenceSummary([
      {
        id: 'area-req',
        summary: 'REQ proof uses backslash \\ and a | delimiter.',
        standards: ['29148'],
        profiles: ['quick-triage'],
        evidencePaths: ['docs\\requirements|srs.md'],
        scoreFiles: ['quick-triage\\target|score.json']
      }
    ])).toContain('| REQ proof uses backslash \\\\ and a \\| delimiter. | 29148 | quick-triage | docs\\\\requirements\\|srs.md |');
  });

  it('renders a shared standards score file legend', () => {
    const legend = buildStandardsScoreFileLegend([
      { name: 'quick-triage', scoreFile: 'quick-triage/target/score.json' },
      { name: 'quick-triage', scoreFile: 'quick-triage/target/score.json' },
      { name: 'release-gate', scoreFile: 'release-gate\\target|score.json' },
      { name: 'failed-profile' }
    ]);

    expect(legend).toEqual([
      { profile: 'quick-triage', scoreFile: 'quick-triage/target/score.json' },
      { profile: 'release-gate', scoreFile: 'release-gate\\target|score.json' }
    ]);
    expect(renderStandardsScoreFileLegend(legend)).toContain('| release-gate | release-gate\\\\target\\|score.json |');
  });

  it('renders standards coverage matrix without duplicate score-file paths', () => {
    const lines = renderStandardsCoverageMatrix([
      {
        profile: 'quick-triage',
        scoreFile: 'quick-triage/target/score.json',
        areas: {
          REQ: { score: 5, confidence: 'High', standards: ['29148'] },
          ARCH: { score: 5, confidence: 'High', standards: ['42010'] },
          TEST: { score: 5, confidence: 'High', standards: ['29119-2', '29119-3'] },
          CM: { score: 5, confidence: 'High', standards: ['10007', '12207'] },
          DOC: { score: 5, confidence: 'High', standards: ['15289', '26514'] }
        }
      }
    ]);

    expect(lines).toContain('| Profile | REQ | ARCH | TEST | CM | DOC |');
    expect(lines).toContain('| quick-triage | 5/5 High (29148) | 5/5 High (42010) | 5/5 High (29119-2/29119-3) | 5/5 High (10007/12207) | 5/5 High (15289/26514) |');
    expect(lines.join('\n')).not.toContain('quick-triage/target/score.json');
  });

  it('groups retained standards evidence score files by contributing profile', () => {
    expect(buildStandardsEvidenceSummary([
      {
        name: 'quick-triage',
        scoreFile: 'quick-triage/target/score.json',
        standardsEvidence: [
          {
            id: 'area-req',
            summary: 'REQ maturity is 5/5 with High confidence.',
            standards: ['29148'],
            evidencePaths: ['docs/requirements/srs.md']
          }
        ]
      },
      {
        name: 'portfolio-review',
        scoreFile: 'portfolio-review/repos/target/score.json',
        standardsEvidence: [
          {
            id: 'area-req',
            summary: 'REQ maturity is 5/5 with High confidence.',
            standards: ['29148'],
            evidencePaths: ['docs/requirements/srs.md']
          }
        ]
      }
    ])).toEqual([
      {
        id: 'area-req',
        summary: 'REQ maturity is 5/5 with High confidence.',
        standards: ['29148'],
        evidencePaths: ['docs/requirements/srs.md'],
        profiles: ['quick-triage', 'portfolio-review'],
        scoreFiles: ['quick-triage/target/score.json', 'portfolio-review/repos/target/score.json']
      }
    ]);
  });

  it('escapes retained gate strength Markdown cells', () => {
    expect(renderStandardsGateStrengthSummary([
      {
        id: 'gate-req',
        summary: 'req gate uses backslash \\ and a | delimiter.',
        standards: ['29148'],
        profiles: ['quick-triage'],
        scoreFiles: ['quick-triage\\target|score.json']
      }
    ])).toContain('| req gate uses backslash \\\\ and a \\| delimiter. | 29148 | quick-triage |');
  });

  it('keeps differing retained gate strength summaries separate', () => {
    expect(buildStandardsGateStrengthSummary([
      {
        name: 'quick-triage',
        scoreFile: 'quick-triage/target/score.json',
        standardsEvidence: [
          {
            id: 'gate-req',
            summary: 'req gate passes with High confidence.',
            standards: ['29148'],
            evidencePaths: []
          }
        ]
      },
      {
        name: 'release-gate',
        scoreFile: 'release-gate/target/score.json',
        standardsEvidence: [
          {
            id: 'gate-req',
            summary: 'req gate passes with Medium confidence.',
            standards: ['29148'],
            evidencePaths: []
          }
        ]
      }
    ])).toEqual([
      {
        id: 'gate-req',
        summary: 'req gate passes with High confidence.',
        standards: ['29148'],
        profiles: ['quick-triage'],
        scoreFiles: ['quick-triage/target/score.json']
      },
      {
        id: 'gate-req',
        summary: 'req gate passes with Medium confidence.',
        standards: ['29148'],
        profiles: ['release-gate'],
        scoreFiles: ['release-gate/target/score.json']
      }
    ]);
  });

  it('groups and escapes retained gate detail Markdown cells', () => {
    const summary = buildStandardsGateDetailSummary([
      {
        name: 'quick-triage',
        scoreFile: 'quick-triage/target/score.json',
        scorecardDetails: {
          dod: {
            status: 'PASS',
            confidence: 'Med',
            basis: 'DoD basis uses backslash \\ and a | delimiter.',
            standards: [],
            missingProof: []
          }
        }
      },
      {
        name: 'release-gate',
        scoreFile: 'release-gate/target/score.json',
        scorecardDetails: {
          dod: {
            status: 'PASS',
            confidence: 'Med',
            basis: 'DoD basis uses backslash \\ and a | delimiter.',
            standards: [],
            missingProof: []
          }
        }
      }
    ]);

    expect(summary).toEqual([
      {
        gate: 'dod',
        status: 'PASS',
        confidence: 'Med',
        basis: 'DoD basis uses backslash \\ and a | delimiter.',
        standards: [],
        missingProof: [],
        profiles: ['quick-triage', 'release-gate'],
        scoreFiles: ['quick-triage/target/score.json', 'release-gate/target/score.json']
      }
    ]);
    expect(renderStandardsGateDetailSummary(summary)).toContain('| dod | PASS | Med | none | DoD basis uses backslash \\\\ and a \\| delimiter. | - | quick-triage, release-gate |');
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
        writeProfileScoreFromDockerArgs(args);
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
    expect(result.markdown).toContain('## Standards Coverage Matrix');
    expect(result.markdown).toContain('| Profile | REQ | ARCH | TEST | CM | DOC |');
    expect(result.markdown).toContain('| quick-triage | 5/5 High (29148) | 5/5 High (42010) | 5/5 High (29119-2/29119-3) | 5/5 High (10007/12207) | 5/5 High (15289/26514) |');
    expect(result.markdown).toContain('| portfolio-review | 5/5 High (29148) | 5/5 High (42010) | 5/5 High (29119-2/29119-3) | 5/5 High (10007/12207) | 5/5 High (15289/26514) |');
    expect(result.markdown).toContain('## Standards Score File Legend');
    expect(result.markdown).toContain('| portfolio-review | portfolio-review/repos/target/score.json |');
    expect(result.markdown).toContain('## Standards Evidence Summary');
    expect(result.markdown).toContain('| Evidence | Standards | Profiles | Paths |');
    expect(result.markdown).toContain('| REQ maturity is 5/5 with High confidence. | 29148 | quick-triage, release-gate, 26514-review, due-diligence, compliance-uplift, portfolio-review | .github/instructions/requirements-and-test-docs.instructions.md<br>.github/prompts/requirement-target-execution.prompt.md<br>.github/skills/requirements-traceability/assets/requirement-target-scaffold.md |');
    expect(result.markdown).toContain('## Standards Gate Strength Summary');
    expect(result.markdown).toContain('| Gate Strength | Standards | Profiles |');
    expect(result.markdown).toContain('| coverage gate passes with High confidence. | 29119-2/29119-3 | quick-triage, release-gate, 26514-review, due-diligence, compliance-uplift, portfolio-review |');
    expect(result.markdown).toContain('## Standards Gate Detail Summary');
    expect(result.markdown).toContain('| Gate | Status | Confidence | Standards | Basis | Missing Proof | Profiles |');
    expect(result.markdown).toContain('| dod | PASS | Med | none | Report DoD only when a DoD Gate / dod context is visible. | - | quick-triage, release-gate, 26514-review, due-diligence, compliance-uplift, portfolio-review |');
    expect(result.markdown).toContain('portfolio-review: overall=High, gates=6P/0F, REQ=5, ARCH=5, TEST=5, CM=5, DOC=5, topRisk=none (see portfolio-review-table.txt)');
    expect(result.context.profiles.find((profile) => profile.scorecardDetails)?.scorecardDetails?.dod).toEqual({
      status: 'PASS',
      confidence: 'Med',
      basis: 'Report DoD only when a DoD Gate / dod context is visible.',
      standards: [],
      missingProof: []
    });
    expect(result.context.profiles.find((profile) => profile.standardsCoverage)?.standardsCoverage?.TEST).toEqual({
      score: 5,
      confidence: 'High',
      standards: ['29119-2', '29119-3'],
      rationale: 'Testing evidence includes automation, thresholds, artifacts, and gate context.'
    });
    expect(result.context.standardsCoverageMatrix?.find((row) => row.profile === 'quick-triage')?.areas.DOC).toMatchObject({
      score: 5,
      confidence: 'High',
      standards: ['15289', '26514']
    });
    expect(result.context.standardsCoverageMatrix?.find((row) => row.profile === 'portfolio-review')?.scoreFile).toBe('portfolio-review/repos/target/score.json');
    expect(result.context.standardsScoreFileLegend).toEqual([
      { profile: 'quick-triage', scoreFile: 'quick-triage/target/score.json' },
      { profile: 'release-gate', scoreFile: 'release-gate/target/score.json' },
      { profile: '26514-review', scoreFile: '26514-review/target/score.json' },
      { profile: 'due-diligence', scoreFile: 'due-diligence/target/score.json' },
      { profile: 'compliance-uplift', scoreFile: 'compliance-uplift/target/score.json' },
      { profile: 'portfolio-review', scoreFile: 'portfolio-review/repos/target/score.json' }
    ]);
    expect(result.context.profiles.find((profile) => profile.standardsEvidence)?.standardsEvidence?.[0]).toEqual({
      id: 'area-req',
      summary: 'REQ maturity is 5/5 with High confidence.',
      standards: ['29148'],
      evidencePaths: [
        '.github/instructions/requirements-and-test-docs.instructions.md',
        '.github/prompts/requirement-target-execution.prompt.md',
        '.github/skills/requirements-traceability/assets/requirement-target-scaffold.md'
      ]
    });
    expect(result.context.standardsEvidenceSummary?.find((row) => row.id === 'area-doc')).toEqual({
      id: 'area-doc',
      summary: 'DOC maturity is 5/5 with High confidence.',
      standards: ['15289', '26514'],
      evidencePaths: [
        'docs/user-guide.md',
        'docs/quick-reference.md',
        'docs/information-item-map.md'
      ],
      profiles: ['quick-triage', 'release-gate', '26514-review', 'due-diligence', 'compliance-uplift', 'portfolio-review'],
      scoreFiles: [
        'quick-triage/target/score.json',
        'release-gate/target/score.json',
        '26514-review/target/score.json',
        'due-diligence/target/score.json',
        'compliance-uplift/target/score.json',
        'portfolio-review/repos/target/score.json'
      ]
    });
    expect(result.context.standardsGateStrengthSummary?.find((row) => row.id === 'gate-coverage')).toEqual({
      id: 'gate-coverage',
      summary: 'coverage gate passes with High confidence.',
      standards: ['29119-2', '29119-3'],
      profiles: ['quick-triage', 'release-gate', '26514-review', 'due-diligence', 'compliance-uplift', 'portfolio-review'],
      scoreFiles: [
        'quick-triage/target/score.json',
        'release-gate/target/score.json',
        '26514-review/target/score.json',
        'due-diligence/target/score.json',
        'compliance-uplift/target/score.json',
        'portfolio-review/repos/target/score.json'
      ]
    });
    expect(result.context.standardsGateDetailSummary?.find((row) => row.gate === 'dod')).toEqual({
      gate: 'dod',
      status: 'PASS',
      confidence: 'Med',
      basis: 'Report DoD only when a DoD Gate / dod context is visible.',
      standards: [],
      missingProof: [],
      profiles: ['quick-triage', 'release-gate', '26514-review', 'due-diligence', 'compliance-uplift', 'portfolio-review'],
      scoreFiles: [
        'quick-triage/target/score.json',
        'release-gate/target/score.json',
        '26514-review/target/score.json',
        'due-diligence/target/score.json',
        'compliance-uplift/target/score.json',
        'portfolio-review/repos/target/score.json'
      ]
    });
    expect(result.context.profiles.find((profile) => profile.scoreFile)?.scoreFile).toBe('quick-triage/target/score.json');
    expect(result.context.profiles.find((profile) => profile.portfolio)?.portfolio).toMatchObject({
      tableFile: 'portfolio-review-table.txt',
      overall: 'High',
      gates: '6P/0F',
      topRisk: 'none'
    });
    expect(result.context.profiles.find((profile) => profile.portfolio)?.scoreFile).toBe('portfolio-review/repos/target/score.json');
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

  it('clears stale retained profile scores before reruns', () => {
    const root = makeTempRoot();
    const snapshotPath = path.join(root, 'snapshot');
    const outputRoot = path.join(root, 'evidence');
    const staleScorePath = path.join(outputRoot, 'run-1', 'quick-triage', 'target', 'score.json');
    fs.mkdirSync(path.dirname(staleScorePath), { recursive: true });
    fs.writeFileSync(staleScorePath, profileScore(), 'utf8');
    fs.mkdirSync(snapshotPath, { recursive: true });
    const spawnSync = vi.fn((command: string, args: string[]) => {
      if (command === 'docker' && args[0] === 'image') {
        return { status: 0, stdout: '[{"Id":"image"}]' };
      }
      if (args.includes('scripts/requirements_quality_check.py')) {
        return { status: 0, stdout: JSON.stringify({ ok: true, findings: [] }) };
      }
      if (args.includes('scripts/external_user_information_check.py')) {
        return { status: 0, stdout: JSON.stringify({ ok: true, findings: [], checkedPaths: [] }) };
      }
      if (args.includes('scripts/run_assurance.py')) {
        const profileIndex = args.indexOf('--profile');
        const profile = profileIndex >= 0 ? args[profileIndex + 1] : '';
        if (profile === 'quick-triage') {
          return { status: 1, stdout: '', stderr: 'profile failed before score write' };
        }
        writeProfileScoreFromDockerArgs(args);
        return { status: 0, stdout: args.includes('portfolio-table') ? portfolioTable() : gateScorecard() };
      }
      return { status: 99, stderr: `unexpected ${command} ${args.join(' ')}` };
    });

    const result = runMultiStandardsAudit(['--save-dir', outputRoot, '--run-id', 'run-1'], {
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

    const quickTriage = result.context.profiles.find((profile) => profile.name === 'quick-triage');
    expect(result.exitCode).toBe(1);
    expect(quickTriage?.scorecardDetails).toEqual({});
    expect(quickTriage?.scoreFile).toBeUndefined();
    expect(quickTriage?.standardsEvidence).toBeUndefined();
    expect(result.context.standardsEvidenceSummary?.some((row) => row.profiles.includes('quick-triage'))).toBe(false);
    expect(result.context.standardsEvidenceSummary?.some((row) => row.scoreFiles.includes('quick-triage/target/score.json'))).toBe(false);
    expect(result.context.standardsScoreFileLegend?.some((row) => row.profile === 'quick-triage')).toBe(false);
    expect(result.context.standardsGateStrengthSummary?.some((row) => row.profiles.includes('quick-triage'))).toBe(false);
    expect(result.context.standardsGateDetailSummary?.some((row) => row.profiles.includes('quick-triage'))).toBe(false);
    expect(result.markdown).not.toContain('quick-triage dod:');
    expect(fs.existsSync(staleScorePath)).toBe(false);
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
        writeProfileScoreFromDockerArgs(args);
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
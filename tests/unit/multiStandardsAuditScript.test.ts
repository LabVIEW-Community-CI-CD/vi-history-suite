import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

const repoRoot = path.resolve(__dirname, '..', '..');

const {
  DEFAULT_SAVE_DIR,
  GATE_SCORECARD_PROFILES,
  PORTFOLIO_PROFILE,
  MULTI_STANDARDS_AUDIT_SCHEMA_ID,
  MULTI_STANDARDS_AUDIT_JSON_SCHEMA,
  buildRunId,
  parseArgs,
  renderSchema,
  directDockerSteps,
  profileDockerSteps,
  replaceAuditMounts,
  summarizeGateScorecard,
  summarizeRetainedGateScore,
  summarizeRetainedStandardsCoverage,
  summarizeRetainedStandardsEvidence,
  summarizePortfolioTable,
  buildAuditRunProvenanceSummary,
  buildStandardsCoverageRationaleSummary,
  buildStandardsScoreFileLegend,
  buildStandardsEvidenceSummary,
  buildStandardsGateStrengthSummary,
  buildStandardsGateBasisSummary,
  buildStandardsGateDetailSummary,
  renderStandardsCoverageMatrix,
  renderAuditRunProvenanceSummary,
  renderStandardsCoverageRationaleSummary,
  renderStandardsEvidenceSummary,
  renderStandardsScoreFileLegend,
  renderStandardsGateStrengthSummary,
  renderStandardsGateBasisSummary,
  renderStandardsGateDetailSummary,
  renderProfileSignalLines,
  renderDirectCheckEvidenceSummary,
  runMultiStandardsAudit,
  main
} = require('../../scripts/runMultiStandardsAudit.js') as {
  DEFAULT_SAVE_DIR: string;
  GATE_SCORECARD_PROFILES: string[];
  PORTFOLIO_PROFILE: string;
  MULTI_STANDARDS_AUDIT_SCHEMA_ID: string;
  MULTI_STANDARDS_AUDIT_JSON_SCHEMA: { required: string[]; properties: Record<string, unknown> };
  buildRunId: (date?: Date) => string;
  parseArgs: (argv: string[]) => {
    image: string;
    requirementsSpecScope: string;
    saveDir: string;
    runId?: string;
    keepSnapshot: boolean;
    schema: boolean;
    help: boolean;
  };
  renderSchema: (options?: { provenance?: unknown }) => string;
  main: (argv: string[], deps?: Record<string, unknown>) => number;
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
  buildAuditRunProvenanceSummary: (context: {
    snapshot?: {
      mode?: string;
      path?: string;
      trackedFileCount?: number;
      removed?: boolean;
      symlinkFiles?: string[];
      missingFiles?: string[];
      generatedRootsExcluded?: string[];
    };
    imagePreparation?: Array<{
      name: string;
      status: number;
      file?: string;
      command?: string;
    }>;
  }, directCheckSummaries?: Array<{
    name: string;
    status: number;
    file?: string;
    command?: string;
  }>, profileSummaries?: Array<{
    name: string;
    status: number;
    file?: string;
    command?: string;
  }>) => {
    snapshot: {
      mode?: string;
      path?: string;
      trackedFileCount?: number;
      removed?: boolean;
      symlinkFiles: string[];
      missingFiles: string[];
      generatedRootsExcluded: string[];
    };
    commands: Array<{
      stage: string;
      name: string;
      status: number;
      file?: string;
      command?: string;
    }>;
  };
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
  buildStandardsCoverageRationaleSummary: (matrix: Array<{
    profile: string;
    scoreFile?: string;
    areas: Record<string, {
      score?: number | string;
      confidence?: string;
      standards: string[];
      rationale?: string;
    }>;
  }>) => Array<{
    area: string;
    rationale: string;
    standards: string[];
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
  buildStandardsGateBasisSummary: (profiles: Array<{
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
  renderStandardsGateBasisSummary: (summary: Array<{
    gate: string;
    status?: string;
    confidence?: string;
    basis?: string;
    standards: string[];
    profiles: string[];
    scoreFiles: string[];
  }>, completeProfiles?: string[]) => string[];
  renderStandardsScoreFileLegend: (legend: Array<{
    profile: string;
    scoreFile: string;
  }>) => string[];
  renderAuditRunProvenanceSummary: (summary: {
    snapshot?: {
      mode?: string;
      path?: string;
      trackedFileCount?: number;
      removed?: boolean;
      symlinkFiles?: string[];
      missingFiles?: string[];
      generatedRootsExcluded?: string[];
    };
    commands?: Array<{
      stage: string;
      name: string;
      status: number;
      file?: string;
      command?: string;
    }>;
  }) => string[];
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
  renderStandardsCoverageRationaleSummary: (summary: Array<{
    area: string;
    rationale: string;
    standards: string[];
    profiles: string[];
    scoreFiles: string[];
  }>, completeProfiles?: string[]) => string[];
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
  renderProfileSignalLines: (profileSummaries: Array<{
    name: string;
    scorecard?: Record<string, string>;
    scorecardDetails?: Record<string, {
      status?: string;
      confidence?: string;
      missingProof: string[];
    }>;
    portfolio?: {
      tableFile: string;
      overall?: string;
      gates?: string;
      areaScores?: Record<string, number | string>;
      topRisk?: string;
    };
  }>) => string[];
  renderDirectCheckEvidenceSummary: (directCheckSummaries: Array<{
    name: string;
    status: number;
    file: string;
    requirementsQuality?: {
      ok: boolean;
      findingCount?: number;
    };
    externalUserInformation?: {
      ok: boolean;
      findingCount?: number;
      checkedPathCount?: number;
      checkedPaths?: string[];
    };
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
      directChecks: Array<{
        name: string;
        status: number;
        file: string;
        requirementsQuality?: {
          ok: boolean;
          findingCount?: number;
        };
        externalUserInformation?: {
          ok: boolean;
          findingCount?: number;
          checkedPathCount?: number;
          checkedPaths?: string[];
        };
      }>;
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
      standardsCoverageRationaleSummary?: Array<{
        area: string;
        rationale: string;
        standards: string[];
        profiles: string[];
        scoreFiles: string[];
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
      standardsGateBasisSummary?: Array<{
        gate: string;
        status?: string;
        confidence?: string;
        basis?: string;
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

  it('renders direct standards check evidence paths with artifacts', () => {
    expect(renderDirectCheckEvidenceSummary([
      {
        name: 'requirements-quality-system',
        status: 0,
        file: 'requirements-quality-system.json',
        requirementsQuality: { ok: true, findingCount: 0 }
      },
      {
        name: 'external-user-information',
        status: 0,
        file: 'external-user-information.json',
        externalUserInformation: {
          ok: true,
          findingCount: 0,
          checkedPathCount: 2,
          checkedPaths: ['docs\\user|guide.md', 'docs/information-for-users/style-guide.md']
        }
      }
    ])).toEqual([
      '| Check | Artifact | Result | Findings | Checked Paths |',
      '| --- | --- | --- | --- | --- |',
      '| requirements-quality-system | requirements-quality-system.json | ok | 0 | - |',
      '| external-user-information | external-user-information.json | ok | 0 | docs\\\\user\\|guide.md<br>docs/information-for-users/style-guide.md |'
    ]);
  });

  it('renders audit run provenance from retained snapshot and command fields', () => {
    const summary = buildAuditRunProvenanceSummary({
      snapshot: {
        mode: 'tracked-worktree-snapshot',
        path: '/tmp/audit|snapshot\\root',
        trackedFileCount: 12,
        removed: true,
        symlinkFiles: ['.tools/bin/vagrant'],
        missingFiles: ['docs\\missing|file.md'],
        generatedRootsExcluded: ['assurance-*-evidence/', 'out|tests/']
      },
      imagePreparation: [
        {
          name: 'docker-image-inspect',
          status: 0,
          file: 'docker-image-inspect.stdout.json',
          command: 'docker image inspect registry.gitlab.com/example|image'
        }
      ]
    }, [
      {
        name: 'requirements-quality-system',
        status: 0,
        file: 'requirements-quality-system.json',
        command: 'docker run --rm -v /tmp/audit|snapshot\\root:/target image python3 scripts/requirements_quality_check.py'
      }
    ], [
      {
        name: 'quick-triage',
        status: 1,
        file: 'quick-triage-gate-scorecard.txt',
        command: 'docker run image python3 scripts/run_assurance.py --profile quick-triage'
      }
    ]);

    expect(summary.commands).toEqual([
      {
        stage: 'image',
        name: 'docker-image-inspect',
        status: 0,
        file: 'docker-image-inspect.stdout.json',
        command: 'docker image inspect registry.gitlab.com/example|image'
      },
      {
        stage: 'direct-check',
        name: 'requirements-quality-system',
        status: 0,
        file: 'requirements-quality-system.json',
        command: 'docker run --rm -v /tmp/audit|snapshot\\root:/target image python3 scripts/requirements_quality_check.py'
      },
      {
        stage: 'profile',
        name: 'quick-triage',
        status: 1,
        file: 'quick-triage-gate-scorecard.txt',
        command: 'docker run image python3 scripts/run_assurance.py --profile quick-triage'
      }
    ]);

    expect(renderAuditRunProvenanceSummary(summary)).toEqual([
      'Snapshot:',
      '',
      '| Field | Value |',
      '| --- | --- |',
      '| Mode | tracked-worktree-snapshot |',
      '| Path | /tmp/audit\\|snapshot\\\\root |',
      '| Tracked Files | 12 |',
      '| Removed After Run | yes |',
      '| Symlink Files | .tools/bin/vagrant |',
      '| Missing Files | docs\\\\missing\\|file.md |',
      '| Generated Roots Excluded | assurance-*-evidence/<br>out\\|tests/ |',
      '',
      'Commands:',
      '',
      '| Stage | Step | Result | Artifact | Command |',
      '| --- | --- | --- | --- | --- |',
      '| image | docker-image-inspect | pass | docker-image-inspect.stdout.json | docker image inspect registry.gitlab.com/example\\|image |',
      '| direct-check | requirements-quality-system | pass | requirements-quality-system.json | docker run --rm -v /tmp/audit\\|snapshot\\\\root:/target image python3 scripts/requirements_quality_check.py |',
      '| profile | quick-triage | FAIL (1) | quick-triage-gate-scorecard.txt | docker run image python3 scripts/run_assurance.py --profile quick-triage |'
    ]);
  });

  it('compacts complete profile sets in retained summary Markdown only', () => {
    const completeProfiles = ['quick-triage', 'release-gate'];

    expect(renderStandardsEvidenceSummary([
      {
        id: 'area-req',
        summary: 'REQ maturity is 5/5 with High confidence.',
        standards: ['29148'],
        profiles: completeProfiles,
        evidencePaths: ['docs/requirements/srs.md'],
        scoreFiles: ['quick-triage/target/score.json', 'release-gate/target/score.json']
      },
      {
        id: 'area-doc',
        summary: 'DOC maturity is 5/5 with High confidence.',
        standards: ['15289', '26514'],
        profiles: ['quick-triage'],
        evidencePaths: ['docs/user-guide.md'],
        scoreFiles: ['quick-triage/target/score.json']
      }
    ], completeProfiles)).toEqual([
      '| Evidence | Standards | Profiles | Paths |',
      '| --- | --- | --- | --- |',
      '| REQ maturity is 5/5 with High confidence. | 29148 | all profiles | docs/requirements/srs.md |',
      '| DOC maturity is 5/5 with High confidence. | 15289/26514 | quick-triage | docs/user-guide.md |'
    ]);

    expect(renderStandardsGateStrengthSummary([
      {
        id: 'gate-req',
        summary: 'req gate passes with High confidence.',
        standards: ['29148'],
        profiles: completeProfiles,
        scoreFiles: ['quick-triage/target/score.json', 'release-gate/target/score.json']
      }
    ], completeProfiles)).toContain('| req gate passes with High confidence. | 29148 | all profiles |');

    expect(renderStandardsGateDetailSummary([
      {
        gate: 'dod',
        status: 'PASS',
        confidence: 'Med',
        standards: [],
        basis: 'Report DoD only when a DoD Gate / dod context is visible.',
        missingProof: [],
        profiles: completeProfiles,
        scoreFiles: ['quick-triage/target/score.json', 'release-gate/target/score.json']
      }
    ], completeProfiles)).toContain('| dod | PASS | Med | unmapped | Report DoD only when a DoD Gate / dod context is visible. | - | all profiles |');
  });

  it('groups standards coverage matrix rows with identical area scores', () => {
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
      },
      {
        profile: 'release-gate',
        scoreFile: 'release-gate/target/score.json',
        areas: {
          REQ: { score: 5, confidence: 'High', standards: ['29148'] },
          ARCH: { score: 5, confidence: 'High', standards: ['42010'] },
          TEST: { score: 5, confidence: 'High', standards: ['29119-2', '29119-3'] },
          CM: { score: 5, confidence: 'High', standards: ['10007', '12207'] },
          DOC: { score: 5, confidence: 'High', standards: ['15289', '26514'] }
        }
      }
    ]);

    expect(lines).toContain('| Profiles | REQ | ARCH | TEST | CM | DOC |');
    expect(lines).toContain('| quick-triage, release-gate | 5/5 High (29148) | 5/5 High (42010) | 5/5 High (29119-2/29119-3) | 5/5 High (10007/12207) | 5/5 High (15289/26514) |');
    expect(lines.join('\n')).not.toContain('quick-triage/target/score.json');
    expect(lines).toHaveLength(3);
  });

  it('groups retained standards coverage rationale with provenance', () => {
    const summary = buildStandardsCoverageRationaleSummary([
      {
        profile: 'quick-triage',
        scoreFile: 'quick-triage/target/score.json',
        areas: {
          REQ: { score: 5, confidence: 'High', standards: ['29148'], rationale: 'Requirements | trace \\ code.' },
          DOC: { score: 5, confidence: 'High', standards: ['15289', '26514'], rationale: 'Documentation has guided navigation.' }
        }
      },
      {
        profile: 'release-gate',
        scoreFile: 'release-gate/target/score.json',
        areas: {
          REQ: { score: 5, confidence: 'High', standards: ['29148'], rationale: 'Requirements | trace \\ code.' },
          DOC: { score: 4, confidence: 'Med', standards: ['15289', '26514'], rationale: 'Documentation needs stronger task examples.' }
        }
      }
    ]);

    expect(summary).toEqual([
      {
        area: 'REQ',
        rationale: 'Requirements | trace \\ code.',
        standards: ['29148'],
        profiles: ['quick-triage', 'release-gate'],
        scoreFiles: ['quick-triage/target/score.json', 'release-gate/target/score.json']
      },
      {
        area: 'DOC',
        rationale: 'Documentation has guided navigation.',
        standards: ['15289', '26514'],
        profiles: ['quick-triage'],
        scoreFiles: ['quick-triage/target/score.json']
      },
      {
        area: 'DOC',
        rationale: 'Documentation needs stronger task examples.',
        standards: ['15289', '26514'],
        profiles: ['release-gate'],
        scoreFiles: ['release-gate/target/score.json']
      }
    ]);

    expect(renderStandardsCoverageRationaleSummary(summary, ['quick-triage', 'release-gate'])).toEqual([
      '| Area | Rationale | Standards | Profiles |',
      '| --- | --- | --- | --- |',
      '| REQ | Requirements \\| trace \\\\ code. | 29148 | all profiles |',
      '| DOC | Documentation has guided navigation. | 15289/26514 | quick-triage |',
      '| DOC | Documentation needs stronger task examples. | 15289/26514 | release-gate |'
    ]);
  });

  it('groups identical gate-scorecard profile signals without compacting portfolio signals', () => {
    const lines = renderProfileSignalLines([
      {
        name: 'quick-triage',
        scorecard: { coverage: 'PASS', dod: 'PASS' },
        scorecardDetails: {
          coverage: { status: 'PASS', confidence: 'High', missingProof: [] },
          dod: { status: 'PASS', confidence: 'Med', missingProof: [] }
        }
      },
      {
        name: 'release-gate',
        scorecard: { coverage: 'PASS', dod: 'PASS' },
        scorecardDetails: {
          coverage: { status: 'PASS', confidence: 'High', missingProof: [] },
          dod: { status: 'PASS', confidence: 'Med', missingProof: [] }
        }
      },
      {
        name: 'due-diligence',
        scorecard: { coverage: 'PASS', dod: 'PASS' },
        scorecardDetails: {
          coverage: { status: 'PASS', confidence: 'High', missingProof: ['CI evidence'] },
          dod: { status: 'PASS', confidence: 'Med', missingProof: [] }
        }
      },
      {
        name: 'portfolio-review',
        portfolio: {
          tableFile: 'portfolio-review-table.txt',
          overall: 'High',
          gates: '6P/0F',
          areaScores: { REQ: 5, ARCH: 5, TEST: 5, CM: 5, DOC: 5 },
          topRisk: 'none'
        }
      }
    ]);

    expect(lines).toEqual([
      '- quick-triage, release-gate: coverage=PASS(High), dod=PASS(Med)',
      '- due-diligence: coverage=PASS(High) missing=CI evidence, dod=PASS(Med)',
      '- portfolio-review: overall=High, gates=6P/0F, REQ=5, ARCH=5, TEST=5, CM=5, DOC=5, topRisk=none (see portfolio-review-table.txt)'
    ]);
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

  it('groups and escapes retained gate basis Markdown without duplicating detail rows', () => {
    const summary = buildStandardsGateBasisSummary([
      {
        name: 'quick-triage',
        scoreFile: 'quick-triage/target/score.json',
        scorecardDetails: {
          coverage: {
            status: 'PASS',
            confidence: 'High',
            basis: 'Coverage basis uses backslash \\ and a | delimiter.',
            standards: ['29119-2', '29119-3'],
            missingProof: []
          },
          dod: {
            status: 'PASS',
            confidence: 'Med',
            basis: 'DoD basis stays in detail summary.',
            standards: [],
            missingProof: []
          }
        }
      },
      {
        name: 'release-gate',
        scoreFile: 'release-gate/target/score.json',
        scorecardDetails: {
          coverage: {
            status: 'PASS',
            confidence: 'High',
            basis: 'Coverage basis uses backslash \\ and a | delimiter.',
            standards: ['29119-2', '29119-3'],
            missingProof: []
          },
          req: {
            status: 'PASS',
            confidence: 'High',
            basis: 'REQ basis has missing proof and stays in detail summary.',
            standards: ['29148'],
            missingProof: ['RTM evidence']
          },
          arch: {
            status: 'PASS',
            basis: 'ARCH basis has no confidence and stays out of basis summary.',
            standards: ['42010'],
            missingProof: []
          },
          doc: {
            status: 'PASS',
            confidence: '',
            basis: 'DOC basis has blank confidence and stays out of basis summary.',
            standards: ['15289', '26514'],
            missingProof: []
          }
        }
      }
    ]);

    expect(summary).toEqual([
      {
        gate: 'coverage',
        status: 'PASS',
        confidence: 'High',
        basis: 'Coverage basis uses backslash \\ and a | delimiter.',
        standards: ['29119-2', '29119-3'],
        profiles: ['quick-triage', 'release-gate'],
        scoreFiles: ['quick-triage/target/score.json', 'release-gate/target/score.json']
      }
    ]);
    expect(renderStandardsGateBasisSummary(summary, ['quick-triage', 'release-gate'])).toContain('| coverage | PASS | High | 29119-2/29119-3 | Coverage basis uses backslash \\\\ and a \\| delimiter. | all profiles |');
  });

  it('routes unknown confidence gate basis rows to detail summary', () => {
    const detailSummary = buildStandardsGateDetailSummary([
      {
        name: 'release-gate',
        scoreFile: 'release-gate/target/score.json',
        scorecardDetails: {
          arch: {
            status: 'PASS',
            basis: 'ARCH basis has no confidence and stays visible for triage.',
            standards: ['42010'],
            missingProof: []
          },
          doc: {
            status: 'PASS',
            confidence: '',
            basis: 'DOC basis has blank confidence and stays visible for triage.',
            standards: ['15289', '26514'],
            missingProof: []
          }
        }
      }
    ]);

    expect(renderStandardsGateDetailSummary(detailSummary)).toEqual([
      '| Gate | Status | Confidence | Standards | Basis | Missing Proof | Profiles |',
      '| --- | --- | --- | --- | --- | --- | --- |',
      '| arch | PASS | unknown | 42010 | ARCH basis has no confidence and stays visible for triage. | - | release-gate |',
      '| doc | PASS | unknown | 15289/26514 | DOC basis has blank confidence and stays visible for triage. | - | release-gate |'
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
    expect(renderStandardsGateDetailSummary(summary)).toContain('| dod | PASS | Med | unmapped | DoD basis uses backslash \\\\ and a \\| delimiter. | - | quick-triage, release-gate |');
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
    const expectedProfiles = [...GATE_SCORECARD_PROFILES, PORTFOLIO_PROFILE];
    const expectedScoreFiles = [
      ...GATE_SCORECARD_PROFILES.map((profile) => `${profile}/target/score.json`),
      `${PORTFOLIO_PROFILE}/repos/target/score.json`
    ];
    const auditSummaryPath = path.join(root, 'evidence', 'run-1', 'audit-summary.json');
    type RetainedAuditSummary = typeof result.context & {
      $schema: string;
      schemaVersion: number;
      options: { runId: string };
      snapshot: {
        mode: string;
        path: string;
        trackedFileCount: number;
        symlinkFiles: string[];
        missingFiles: string[];
        generatedRootsExcluded: string[];
        removed: boolean;
      };
      imagePreparation: Array<{ name: string; status: number; command: string }>;
      directChecks: Array<(typeof result.context.directChecks)[number] & { command: string }>;
      profiles: Array<(typeof result.context.profiles)[number] & { command: string }>;
    };
    const retainedSummary = JSON.parse(fs.readFileSync(auditSummaryPath, 'utf8')) as RetainedAuditSummary;

    expect(result.exitCode).toBe(0);
    expect(result.context.success).toBe(true);
    expect(result.context.directChecks).toHaveLength(2);
    expect(result.context.profiles).toHaveLength(6);
    expect(Object.keys(retainedSummary)).toEqual([
      '$schema',
      'schemaVersion',
      'options',
      'outputDir',
      'imageAccess',
      'imagePreparation',
      'snapshot',
      'directChecks',
      'profiles',
      'success',
      'standardsCoverageMatrix',
      'standardsCoverageRationaleSummary',
      'standardsScoreFileLegend',
      'standardsEvidenceSummary',
      'standardsGateStrengthSummary',
      'standardsGateBasisSummary',
      'standardsGateDetailSummary'
    ]);
    expect(retainedSummary.schemaVersion).toBe(1);
    expect(retainedSummary.$schema).toBe(MULTI_STANDARDS_AUDIT_SCHEMA_ID);
    // The retained packet self-describes and satisfies the published schema contract (no drift).
    expect(MULTI_STANDARDS_AUDIT_JSON_SCHEMA.required.filter((key) => !(key in retainedSummary))).toEqual([]);
    expect(retainedSummary.$schema).toBe(
      (MULTI_STANDARDS_AUDIT_JSON_SCHEMA.properties.$schema as { const: string }).const
    );
    expect(retainedSummary.options.runId).toBe('run-1');
    expect(retainedSummary.success).toBe(true);
    expect(retainedSummary.snapshot).toMatchObject({
      mode: 'tracked-worktree-snapshot',
      path: snapshotPath,
      trackedFileCount: 12,
      symlinkFiles: [],
      missingFiles: [],
      generatedRootsExcluded: ['assurance-*-evidence/'],
      removed: true
    });
    expect(retainedSummary.imagePreparation).toEqual([
      expect.objectContaining({
        name: 'docker-image-inspect',
        status: 0,
        command: expect.stringContaining('docker image inspect')
      })
    ]);
    expect(retainedSummary.directChecks.map((step) => step.command)).toEqual([
      expect.stringContaining('scripts/requirements_quality_check.py /target --requirements-spec-scope system --json'),
      expect.stringContaining('scripts/external_user_information_check.py /target --json')
    ]);
    expect(retainedSummary.profiles.map((profile) => profile.name)).toEqual(expectedProfiles);
    expect(retainedSummary.profiles.map((profile) => profile.command)).toEqual(
      expectedProfiles.map((profile) => expect.stringContaining(`scripts/run_assurance.py /target --profile ${profile}`))
    );
    expect(result.markdown).toContain('External user information: ok (0 finding(s), 1 checked path(s))');
    expect(result.markdown).toContain('## Audit Run Provenance');
    expect(result.markdown).toContain('| Field | Value |');
    expect(result.markdown).toContain(`| Path | ${snapshotPath.replace(/\\/g, '\\\\').replace(/\|/g, '\\|')} |`);
    expect(result.markdown).toContain('| Generated Roots Excluded | assurance-*-evidence/ |');
    expect(result.markdown).toContain('| Stage | Step | Result | Artifact | Command |');
    expect(result.markdown).toContain('| image | docker-image-inspect | pass | docker-image-inspect.stdout.json | docker image inspect');
    expect(result.markdown).toContain('scripts/requirements_quality_check.py /target --requirements-spec-scope system --json');
    expect(result.markdown).toContain('scripts/run_assurance.py /target --profile quick-triage');
    expect(result.markdown).toContain('## Direct Check Evidence Summary');
    expect(result.markdown).toContain('| requirements-quality-system | requirements-quality-system.json | ok | 0 | - |');
    expect(result.markdown).toContain('| external-user-information | external-user-information.json | ok | 0 | docs/user-guide.md |');
    expect(result.markdown).toContain('quick-triage, release-gate, 26514-review, due-diligence, compliance-uplift: coverage=PASS(High), cm=PASS(High), req=PASS(High), arch=PASS(High), doc=PASS(High), dod=PASS(Med)');
    expect(result.markdown).not.toContain('- quick-triage: coverage=PASS(High)');
    expect(result.markdown).toContain('## Standards Coverage Matrix');
    expect(result.markdown).toContain('| Profiles | REQ | ARCH | TEST | CM | DOC |');
    expect(result.markdown).toContain('| quick-triage, release-gate, 26514-review, due-diligence, compliance-uplift, portfolio-review | 5/5 High (29148) | 5/5 High (42010) | 5/5 High (29119-2/29119-3) | 5/5 High (10007/12207) | 5/5 High (15289/26514) |');
    expect(result.markdown).toContain('## Standards Coverage Rationale Summary');
    expect(result.markdown).toContain('| Area | Rationale | Standards | Profiles |');
    expect(result.markdown).toContain('| TEST | Testing evidence includes automation, thresholds, artifacts, and gate context. | 29119-2/29119-3 | all profiles |');
    expect(result.markdown).toContain('## Standards Score File Legend');
    expect(result.markdown).toContain('| portfolio-review | portfolio-review/repos/target/score.json |');
    expect(result.markdown).toContain('## Standards Evidence Summary');
    expect(result.markdown).toContain('| Evidence | Standards | Profiles | Paths |');
    expect(result.markdown).toContain('| REQ maturity is 5/5 with High confidence. | 29148 | all profiles | .github/instructions/requirements-and-test-docs.instructions.md<br>.github/prompts/requirement-target-execution.prompt.md<br>.github/skills/requirements-traceability/assets/requirement-target-scaffold.md |');
    expect(result.markdown).toContain('## Standards Gate Strength Summary');
    expect(result.markdown).toContain('| Gate Strength | Standards | Profiles |');
    expect(result.markdown).toContain('| coverage gate passes with High confidence. | 29119-2/29119-3 | all profiles |');
    expect(result.markdown).toContain('## Standards Gate Basis Summary');
    expect(result.markdown).toContain('| Gate | Status | Confidence | Standards | Basis | Profiles |');
    expect(result.markdown).toContain('| coverage | PASS | High | 29119-2/29119-3 | Require tests, CI evidence, coverage artifacts, thresholds, and PR gate context. | all profiles |');
    expect(result.markdown).toContain('## Standards Gate Detail Summary');
    expect(result.markdown).toContain('| Gate | Status | Confidence | Standards | Basis | Missing Proof | Profiles |');
    expect(result.markdown).toContain('| dod | PASS | Med | unmapped | Report DoD only when a DoD Gate / dod context is visible. | - | all profiles |');
    expect(result.markdown).toContain('portfolio-review: overall=High, gates=6P/0F, REQ=5, ARCH=5, TEST=5, CM=5, DOC=5, topRisk=none (see portfolio-review-table.txt)');
    expect(result.context.directChecks.find((step) => step.name === 'external-user-information')?.externalUserInformation?.checkedPaths).toEqual(['docs/user-guide.md']);
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
    expect(result.context.standardsCoverageRationaleSummary?.find((row) => row.area === 'TEST')).toEqual({
      area: 'TEST',
      rationale: 'Testing evidence includes automation, thresholds, artifacts, and gate context.',
      standards: ['29119-2', '29119-3'],
      profiles: expectedProfiles,
      scoreFiles: expectedScoreFiles
    });
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
      profiles: expectedProfiles,
      scoreFiles: expectedScoreFiles
    });
    expect(result.context.standardsGateStrengthSummary?.find((row) => row.id === 'gate-coverage')).toEqual({
      id: 'gate-coverage',
      summary: 'coverage gate passes with High confidence.',
      standards: ['29119-2', '29119-3'],
      profiles: expectedProfiles,
      scoreFiles: expectedScoreFiles
    });
    expect(result.context.standardsGateBasisSummary?.find((row) => row.gate === 'coverage')).toEqual({
      gate: 'coverage',
      status: 'PASS',
      confidence: 'High',
      basis: 'Require tests, CI evidence, coverage artifacts, thresholds, and PR gate context.',
      standards: ['29119-2', '29119-3'],
      profiles: expectedProfiles,
      scoreFiles: expectedScoreFiles
    });
    expect(result.context.standardsGateBasisSummary?.some((row) => row.gate === 'dod')).toBe(false);
    expect(result.context.standardsGateDetailSummary?.find((row) => row.gate === 'dod')).toEqual({
      gate: 'dod',
      status: 'PASS',
      confidence: 'Med',
      basis: 'Report DoD only when a DoD Gate / dod context is visible.',
      standards: [],
      missingProof: [],
      profiles: expectedProfiles,
      scoreFiles: expectedScoreFiles
    });
    expect(
      retainedSummary.directChecks.find((step) => step.name === 'external-user-information')?.externalUserInformation?.checkedPaths
    ).toEqual(['docs/user-guide.md']);
    expect(retainedSummary.standardsCoverageRationaleSummary?.find((row) => row.area === 'TEST')).toMatchObject({
      standards: ['29119-2', '29119-3'],
      profiles: expectedProfiles,
      scoreFiles: expectedScoreFiles
    });
    expect(retainedSummary.standardsEvidenceSummary?.find((row) => row.id === 'area-doc')).toMatchObject({
      standards: ['15289', '26514'],
      profiles: expectedProfiles,
      scoreFiles: expectedScoreFiles
    });
    expect(retainedSummary.standardsGateStrengthSummary?.find((row) => row.id === 'gate-coverage')).toMatchObject({
      standards: ['29119-2', '29119-3'],
      profiles: expectedProfiles,
      scoreFiles: expectedScoreFiles
    });
    expect(retainedSummary.standardsGateBasisSummary?.find((row) => row.gate === 'coverage')).toMatchObject({
      standards: ['29119-2', '29119-3'],
      profiles: expectedProfiles,
      scoreFiles: expectedScoreFiles
    });
    expect(retainedSummary.standardsGateDetailSummary?.find((row) => row.gate === 'dod')).toMatchObject({
      standards: [],
      missingProof: [],
      profiles: expectedProfiles,
      scoreFiles: expectedScoreFiles
    });
    expect(result.context.profiles.find((profile) => profile.scoreFile)?.scoreFile).toBe('quick-triage/target/score.json');
    expect(result.context.profiles.find((profile) => profile.portfolio)?.portfolio).toMatchObject({
      tableFile: 'portfolio-review-table.txt',
      overall: 'High',
      gates: '6P/0F',
      topRisk: 'none'
    });
    expect(result.context.profiles.find((profile) => profile.portfolio)?.scoreFile).toBe('portfolio-review/repos/target/score.json');
    expect(fs.existsSync(auditSummaryPath)).toBe(true);
    expect(fs.existsSync(path.join(root, 'evidence', 'run-1', 'portfolio-review-table.txt'))).toBe(true);
    expect(calls.filter((call) => call.command === 'docker' && call.args[0] === 'run')).toHaveLength(8);
    expect(calls.some((call) => call.args.includes(`${snapshotPath}:/target`))).toBe(true);
    expect(calls.some((call) => call.args.includes(`${path.join(root, 'evidence', 'run-1')}:/out`))).toBe(true);
    expect(removeTrackedWorktreeSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ path: snapshotPath }),
      expect.any(Object)
    );
  });

  it('publishes the audit-summary JSON Schema via --schema without running the audit (VHS-REQ-615)', () => {
    const schema = JSON.parse(renderSchema()) as {
      $id: string;
      required: string[];
      properties: { $schema: { const: string }; schemaVersion: { const: number } };
    };
    expect(schema.$id).toBe(MULTI_STANDARDS_AUDIT_SCHEMA_ID);
    expect(schema.properties.$schema.const).toBe(MULTI_STANDARDS_AUDIT_SCHEMA_ID);
    expect(schema.properties.schemaVersion.const).toBe(1);

    // --schema attaches provenance under the shared extension key.
    const withProvenance = JSON.parse(renderSchema({ provenance: { generatedAt: 'x' } })) as Record<string, unknown>;
    expect(withProvenance['x-vi-history-suite-provenance']).toEqual({ generatedAt: 'x' });

    // runMultiStandardsAudit --schema returns the schema markdown without spawning docker.
    const spawnSync = vi.fn();
    const result = runMultiStandardsAudit(['--schema'], { spawnSync });
    expect(result.exitCode).toBe(0);
    expect((JSON.parse(result.markdown) as Record<string, unknown>).$id).toBe(MULTI_STANDARDS_AUDIT_SCHEMA_ID);
    expect(spawnSync).not.toHaveBeenCalled();
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
    expect(result.context.standardsGateBasisSummary?.some((row) => row.profiles.includes('quick-triage'))).toBe(false);
    expect(result.context.standardsGateDetailSummary?.some((row) => row.profiles.includes('quick-triage'))).toBe(false);
    expect(result.markdown).toContain('| REQ maturity is 5/5 with High confidence. | 29148 | release-gate, 26514-review, due-diligence, compliance-uplift, portfolio-review |');
    expect(result.markdown).not.toContain('| all profiles |');
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

// Additional branch coverage for fail-closed guards, skip/merge branches, and
// score-file resolution in the exported pure summarizers.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const genAudit = require('../../scripts/runMultiStandardsAudit.js') as Record<string, any>;

describe('runMultiStandardsAudit summarizer guard + skip/merge branches', () => {
  it('parseArgs rejects positional arguments', () => {
    expect(() => parseArgs(['stray-positional'])).toThrow(/Unknown argument/);
  });

  it('summarizeExternalUserInformation fails closed on non-object payloads and counts findings otherwise', () => {
    expect(genAudit.summarizeExternalUserInformation(null)).toEqual({
      ok: false,
      findingCount: undefined,
      checkedPathCount: undefined,
      checkedPaths: []
    });
    expect(genAudit.summarizeExternalUserInformation('nope')).toMatchObject({ ok: false });
    const ok = genAudit.summarizeExternalUserInformation({ ok: true, findings: [1, 2], checkedPaths: ['a'] });
    expect(ok.ok).toBe(true);
    expect(ok.findingCount).toBe(2);
  });

  it('summarizeRetainedGateScore returns {} for malformed payloads and skips non-object gates', () => {
    expect(summarizeRetainedGateScore(null)).toEqual({});
    expect(summarizeRetainedGateScore({ gates: 'nope' })).toEqual({});
    expect(
      summarizeRetainedGateScore({ gates: { req: { status: 'PASS', confidence: 'High' }, broken: null } })
    ).toEqual({
      req: { status: 'PASS', confidence: 'High', basis: undefined, standards: [], missingProof: [] }
    });
  });

  it('summarizeRetainedStandardsCoverage returns {} for malformed payloads and skips non-object areas', () => {
    expect(summarizeRetainedStandardsCoverage(null)).toEqual({});
    expect(summarizeRetainedStandardsCoverage({ areas: 'nope' })).toEqual({});
    expect(
      summarizeRetainedStandardsCoverage({ areas: { REQ: { score: 5, confidence: 'High' }, broken: null } })
    ).toEqual({
      REQ: { score: 5, confidence: 'High', standards: [], rationale: undefined }
    });
  });

  it('summarizeRetainedStandardsEvidence fails closed and drops empty / non-object strengths', () => {
    expect(summarizeRetainedStandardsEvidence(null)).toEqual([]);
    expect(summarizeRetainedStandardsEvidence({ top_strengths: 'nope' })).toEqual([]);
    expect(
      summarizeRetainedStandardsEvidence({
        top_strengths: [
          null,
          { id: 'kept', summary: 'S', standards: ['29148'], evidence_paths: [] },
          { id: 'dropped' }
        ]
      })
    ).toEqual([{ id: 'kept', summary: 'S', standards: ['29148'], evidencePaths: [] }]);
  });

  it('profileScoreFile resolves the default target path, honors an explicit score file, and no-ops without a save dir', () => {
    expect(genAudit.profileScoreFile({})).toBeUndefined();
    expect(genAudit.profileScoreFile({ saveDir: 'quick-triage' })).toBe('quick-triage/target/score.json');
    expect(genAudit.profileScoreFile({ saveDir: 'quick-triage', scoreFile: 'custom/score.json' })).toBe('custom/score.json');
  });

  it('buildStandardsEvidenceSummary skips items without evidence paths', () => {
    expect(
      buildStandardsEvidenceSummary([
        {
          name: 'quick-triage',
          scoreFile: 'quick-triage/target/score.json',
          standardsEvidence: [
            { id: 'kept', summary: 'has evidence', standards: ['29148'], evidencePaths: ['docs/x.md'] },
            { id: 'skipped', summary: 'no evidence', standards: ['29148'], evidencePaths: [] }
          ]
        }
      ])
    ).toEqual([
      {
        id: 'kept',
        summary: 'has evidence',
        standards: ['29148'],
        evidencePaths: ['docs/x.md'],
        profiles: ['quick-triage'],
        scoreFiles: ['quick-triage/target/score.json']
      }
    ]);
  });

  it('buildStandardsGateStrengthSummary merges an identical strength across profiles and skips empty rows', () => {
    expect(
      buildStandardsGateStrengthSummary([
        {
          name: 'quick-triage',
          scoreFile: 'quick-triage/target/score.json',
          standardsEvidence: [
            { id: 'gate-req', summary: 'req gate passes.', standards: ['29148'], evidencePaths: [] },
            { id: 'noise', summary: '', standards: [], evidencePaths: [] }
          ]
        },
        {
          name: 'release-gate',
          scoreFile: 'release-gate/target/score.json',
          standardsEvidence: [
            { id: 'gate-req', summary: 'req gate passes.', standards: ['29148'], evidencePaths: [] }
          ]
        }
      ])
    ).toEqual([
      {
        id: 'gate-req',
        summary: 'req gate passes.',
        standards: ['29148'],
        profiles: ['quick-triage', 'release-gate'],
        scoreFiles: ['quick-triage/target/score.json', 'release-gate/target/score.json']
      }
    ]);
  });
});

describe('runMultiStandardsAudit: render-helper branch coverage (#2331)', () => {
  // Re-require with a permissive signature so the completeProfiles second arg and
  // synthetic rows can drive the render branches (the shared destructure types
  // omit the optional completeProfiles parameter).
  const rh = require('../../scripts/runMultiStandardsAudit.js') as {
    renderStandardsEvidenceSummary: (summary: unknown, completeProfiles?: unknown) => string[];
    renderStandardsGateStrengthSummary: (summary: unknown, completeProfiles?: unknown) => string[];
    renderStandardsGateBasisSummary: (summary: unknown, completeProfiles?: unknown) => string[];
    renderStandardsGateDetailSummary: (summary: unknown, completeProfiles?: unknown) => string[];
    renderStandardsScoreFileLegend: (legend: unknown) => string[];
    renderStandardsCoverageRationaleSummary: (summary: unknown, completeProfiles?: unknown) => string[];
    renderStandardsCoverageMatrix: (matrix: unknown) => string[];
    renderAuditRunProvenanceSummary: (summary: unknown) => string[];
    renderProfileSignalLines: (profileSummaries: unknown) => string[];
    renderDirectCheckEvidenceSummary: (directCheckSummaries: unknown) => string[];
  };
  const complete = ['quick-triage', 'release-gate'];

  it('renderStandardsEvidenceSummary covers empty, all-profiles, and joined/none rows', () => {
    expect(rh.renderStandardsEvidenceSummary([], complete)).toEqual([]);
    expect(rh.renderStandardsEvidenceSummary(undefined, complete)).toEqual([]);
    const rows = rh
      .renderStandardsEvidenceSummary(
        [
          { summary: 'E1', standards: ['NPM'], profiles: ['quick-triage', 'release-gate'], evidencePaths: ['a', 'b'] },
          { id: 'E2', standards: [], profiles: ['quick-triage'], evidencePaths: [] }
        ],
        complete
      )
      .join('\n');
    expect(rows).toContain('all profiles');
    expect(rows).toContain('a<br>b');
    expect(rows).toContain('quick-triage');
    expect(rows).toContain('none');
  });

  it('renderStandardsGateStrengthSummary covers empty, all-profiles, and none', () => {
    expect(rh.renderStandardsGateStrengthSummary([], complete)).toEqual([]);
    const rows = rh
      .renderStandardsGateStrengthSummary(
        [
          { summary: 'S1', standards: ['A'], profiles: ['quick-triage', 'release-gate'] },
          { id: 'S2', standards: [], profiles: ['quick-triage'] }
        ],
        complete
      )
      .join('\n');
    expect(rows).toContain('all profiles');
    expect(rows).toContain('none');
  });

  it('renderStandardsGateBasisSummary covers value fallbacks and all-profiles', () => {
    expect(rh.renderStandardsGateBasisSummary([], complete)).toEqual([]);
    const rows = rh
      .renderStandardsGateBasisSummary(
        [
          { gate: 'coverage', status: 'PASS', confidence: 'High', standards: ['A'], basis: 'b', profiles: complete },
          { profiles: ['quick-triage'] }
        ],
        complete
      )
      .join('\n');
    expect(rows).toContain('all profiles');
    expect(rows).toContain('unknown');
    expect(rows).toContain('UNKNOWN');
    expect(rows).toContain('none');
  });

  it('renderStandardsGateDetailSummary covers missingProof and unmapped standards', () => {
    expect(rh.renderStandardsGateDetailSummary([], complete)).toEqual([]);
    const rows = rh
      .renderStandardsGateDetailSummary(
        [
          { gate: 'dod', status: 'FAIL', standards: ['A'], missingProof: ['need x', 'need y'], profiles: complete },
          { profiles: ['release-gate'] }
        ],
        complete
      )
      .join('\n');
    expect(rows).toContain('need x<br>need y');
    expect(rows).toContain('unmapped');
    expect(rows).toContain('all profiles');
  });

  it('renderStandardsScoreFileLegend covers empty and value fallbacks', () => {
    expect(rh.renderStandardsScoreFileLegend([])).toEqual([]);
    const rows = rh.renderStandardsScoreFileLegend([{ profile: 'quick-triage', scoreFile: 'f.json' }, {}]).join('\n');
    expect(rows).toContain('quick-triage');
    expect(rows).toContain('| unknown | - |');
  });

  it('renderStandardsCoverageRationaleSummary covers empty, all-profiles, and none', () => {
    expect(rh.renderStandardsCoverageRationaleSummary([], complete)).toEqual([]);
    const rows = rh
      .renderStandardsCoverageRationaleSummary(
        [
          { area: 'REQ', rationale: 'r', standards: ['A'], profiles: complete },
          { profiles: ['quick-triage'] }
        ],
        complete
      )
      .join('\n');
    expect(rows).toContain('all profiles');
    expect(rows).toContain('none');
    expect(rows).toContain('unknown');
  });

  it('renderStandardsCoverageMatrix covers empty, populated cells, and row merging', () => {
    expect(rh.renderStandardsCoverageMatrix([])).toEqual([]);
    const rows = rh
      .renderStandardsCoverageMatrix([
        { profile: 'quick-triage', areas: { REQ: { score: 5, confidence: 'High', standards: ['A'] }, ARCH: undefined } },
        { profile: 'release-gate', areas: { REQ: { score: 5, confidence: 'High', standards: ['A'] }, ARCH: undefined } }
      ])
      .join('\n');
    expect(rows).toContain('quick-triage, release-gate');
    expect(rows).toContain('5/5 High (A)');
  });

  it('renderAuditRunProvenanceSummary covers empty, snapshot, and command rows', () => {
    expect(rh.renderAuditRunProvenanceSummary(undefined)).toEqual([]);
    expect(rh.renderAuditRunProvenanceSummary({ snapshot: {}, commands: [] })).toEqual([]);
    const rows = rh
      .renderAuditRunProvenanceSummary({
        snapshot: {
          mode: 'tracked',
          path: '/snap',
          trackedFileCount: 3,
          removed: false,
          symlinkFiles: ['s'],
          missingFiles: [],
          generatedRootsExcluded: ['out']
        },
        commands: [
          { stage: 'direct', name: 'preflight', status: 0, file: 'p.txt', command: 'x' },
          { stage: 'profile', name: 'gate', status: 2, file: 'g.txt', command: 'y' }
        ]
      })
      .join('\n');
    expect(rows).toContain('| Mode | tracked |');
    expect(rows).toContain('| Removed After Run | no |');
    expect(rows).toContain('pass');
    expect(rows).toContain('FAIL (2)');
  });

  it('renderProfileSignalLines covers scorecard, portfolio, and merged rows', () => {
    const lines = rh.renderProfileSignalLines([
      { name: 'quick-triage', scorecard: { coverage: 'PASS' } },
      { name: 'release-gate', scorecard: { coverage: 'PASS' } },
      {
        name: 'portfolio',
        portfolio: { overall: 'B+', gates: '5/6', areaScores: { REQ: 5, DOC: 3 }, topRisk: 'x', tableFile: 't.md' }
      }
    ]);
    const text = lines.join('\n');
    expect(text).toContain('quick-triage, release-gate: coverage=PASS');
    expect(text).toContain('overall=B+');
    expect(text).toContain('REQ=5');
    expect(text).toContain('see t.md');
  });

  it('renderDirectCheckEvidenceSummary covers requirements-quality, external-user-information, and FAIL', () => {
    expect(rh.renderDirectCheckEvidenceSummary([])).toEqual([]);
    const rows = rh
      .renderDirectCheckEvidenceSummary([
        { name: 'reqQ', file: 'r.json', status: 0, requirementsQuality: { ok: false, findingCount: 3 } },
        {
          name: 'ext',
          file: 'e.json',
          status: 0,
          externalUserInformation: { ok: true, findingCount: 0, checkedPaths: ['docs/a.md'] }
        },
        { name: 'plain', status: 1 }
      ])
      .join('\n');
    expect(rows).toContain('not ok');
    expect(rows).toContain('docs/a.md');
    expect(rows).toContain('FAIL (1)');
  });
});

describe('runMultiStandardsAudit: summarize-helper branch coverage (#2331)', () => {
  const sh = require('../../scripts/runMultiStandardsAudit.js') as {
    summarizeExternalUserInformation: (payload: unknown) => {
      ok: boolean;
      findingCount?: number;
      checkedPathCount?: number;
      checkedPaths: string[];
    };
    summarizePortfolioTable: (text: string) => unknown;
    summarizeGateScorecard: (
      text: string
    ) => Record<string, { status?: string; confidence?: string; missingProof: string[] }>;
    summarizeRetainedGateScore: (payload: unknown) => Record<string, unknown>;
    summarizeRetainedStandardsCoverage: (payload: unknown) => Record<string, unknown>;
    summarizeRetainedStandardsEvidence: (payload: unknown) => unknown[];
    profileScoreFile: (step: unknown) => string | undefined;
  };

  it('summarizeExternalUserInformation defaults on a non-object and counts findings/paths', () => {
    expect(sh.summarizeExternalUserInformation(undefined)).toMatchObject({ ok: false, checkedPaths: [] });
    expect(sh.summarizeExternalUserInformation({ ok: true, findings: [1, 2], checkedPaths: ['a'] })).toMatchObject({
      ok: true,
      findingCount: 2,
      checkedPathCount: 1,
      checkedPaths: ['a']
    });
    expect(sh.summarizeExternalUserInformation({ ok: false })).toMatchObject({
      ok: false,
      findingCount: 0,
      checkedPathCount: 0
    });
  });

  it('summarizePortfolioTable extracts the first data row and coerces numeric area scores', () => {
    const table = [
      'noise',
      '| Repo | Overall | Gates | REQ | ARCH | TEST | CM | DOC | Top Risk |',
      '| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
      '| icon | B+ | 5/6 | 5 | 4 | high | 3 | 2 | none |'
    ].join('\n');
    const portfolio = sh.summarizePortfolioTable(table) as {
      overall: string;
      areaScores: Record<string, unknown>;
      topRisk: string;
    };
    expect(portfolio.overall).toBe('B+');
    expect(portfolio.areaScores.REQ).toBe(5);
    expect(portfolio.areaScores.TEST).toBe('high');
    expect(portfolio.topRisk).toBe('none');
    // A table without the portfolio header columns yields undefined.
    expect(sh.summarizePortfolioTable('| A | B |\n| - | - |\n| 1 | 2 |')).toBeUndefined();
  });

  it('summarizeGateScorecard parses gate rows and missing-proof cells', () => {
    const table = [
      '| Gate | Status | Confidence | Missing Proof |',
      '| --- | --- | --- | --- |',
      '| coverage | PASS | High | - |',
      '| doc | FAIL | High | need a; need b |'
    ].join('\n');
    const details = sh.summarizeGateScorecard(table);
    expect(details.coverage).toMatchObject({ status: 'PASS', missingProof: [] });
    expect(details.doc.missingProof).toEqual(['need a', 'need b']);
    expect(sh.summarizeGateScorecard('no table here')).toEqual({});
  });

  it('summarizeRetained* helpers default on malformed payloads and map valid ones', () => {
    expect(sh.summarizeRetainedGateScore(undefined)).toEqual({});
    expect(
      sh.summarizeRetainedGateScore({
        gates: { coverage: { status: 'PASS', standards: ['A'], missing: ['x'] }, bad: null }
      })
    ).toMatchObject({ coverage: { status: 'PASS', standards: ['A'], missingProof: ['x'] } });

    expect(sh.summarizeRetainedStandardsCoverage({})).toEqual({});
    expect(
      sh.summarizeRetainedStandardsCoverage({ areas: { REQ: { score: 5, standards: ['A'] }, bad: 1 } })
    ).toMatchObject({ REQ: { score: 5, standards: ['A'] } });

    expect(sh.summarizeRetainedStandardsEvidence({})).toEqual([]);
    expect(
      sh.summarizeRetainedStandardsEvidence({
        top_strengths: [{ id: 'g', summary: 's', standards: ['A'], evidence_paths: ['p'] }, 'skip', {}]
      })
    ).toEqual([{ id: 'g', summary: 's', standards: ['A'], evidencePaths: ['p'] }]);
  });

  it('profileScoreFile prefers an explicit score file and defaults otherwise', () => {
    expect(sh.profileScoreFile({})).toBeUndefined();
    expect(sh.profileScoreFile({ saveDir: 'quick-triage' })).toBe('quick-triage/target/score.json');
    expect(sh.profileScoreFile({ saveDir: 'quick-triage', scoreFile: 'custom/score.json' })).toBe('custom/score.json');
  });
});

describe('runMultiStandardsAudit: build-helper merge branch coverage (#2331)', () => {
  const bh = require('../../scripts/runMultiStandardsAudit.js') as {
    buildStandardsScoreFileLegend: (profiles: unknown) => Array<{ profile: string; scoreFile: string }>;
    buildStandardsGateStrengthSummary: (profiles: unknown) => Array<{ profiles: string[]; scoreFiles: string[] }>;
    buildStandardsGateBasisSummary: (profiles: unknown) => Array<{ profiles: string[]; scoreFiles: string[] }>;
    buildStandardsGateDetailSummary: (
      profiles: unknown
    ) => Array<{ profiles: string[]; scoreFiles: string[]; missingProof: string[] }>;
    buildStandardsCoverageRationaleSummary: (matrix: unknown) => Array<{ profiles: string[]; scoreFiles: string[] }>;
  };

  it('buildStandardsScoreFileLegend dedupes identical rows and skips scoreFile-less profiles', () => {
    const rows = bh.buildStandardsScoreFileLegend([
      { name: 'quick-triage', scoreFile: 's.json' },
      { name: 'quick-triage', scoreFile: 's.json' },
      { name: 'release-gate' }
    ]);
    expect(rows).toEqual([{ profile: 'quick-triage', scoreFile: 's.json' }]);
  });

  it('buildStandardsGateStrengthSummary merges a shared gate-strength item across profiles', () => {
    const item = { id: 'g1', summary: 'strong', standards: ['A'], evidencePaths: [] };
    const rows = bh.buildStandardsGateStrengthSummary([
      { name: 'quick-triage', standardsEvidence: [item], scoreFile: 'q.json' },
      { name: 'release-gate', standardsEvidence: [item], scoreFile: 'r.json' }
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].profiles).toEqual(['quick-triage', 'release-gate']);
    expect(rows[0].scoreFiles).toEqual(['q.json', 'r.json']);
  });

  it('buildStandardsGateBasisSummary merges a shared high-confidence gate across profiles', () => {
    const details = {
      scorecardDetails: { coverage: { status: 'PASS', confidence: 'High', basis: 'b', standards: ['A'], missingProof: [] } }
    };
    const rows = bh.buildStandardsGateBasisSummary([
      { name: 'quick-triage', scoreFile: 'q.json', ...details },
      { name: 'release-gate', scoreFile: 'r.json', ...details }
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].profiles).toEqual(['quick-triage', 'release-gate']);
    expect(rows[0].scoreFiles).toEqual(['q.json', 'r.json']);
  });

  it('buildStandardsGateDetailSummary merges a shared lower-confidence gate across profiles', () => {
    const details = {
      scorecardDetails: { doc: { status: 'FAIL', confidence: 'Low', basis: 'b', standards: ['A'], missingProof: ['x'] } }
    };
    const rows = bh.buildStandardsGateDetailSummary([
      { name: 'quick-triage', scoreFile: 'q.json', ...details },
      { name: 'release-gate', scoreFile: 'r.json', ...details }
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].profiles).toEqual(['quick-triage', 'release-gate']);
    expect(rows[0].missingProof).toEqual(['x']);
  });

  it('buildStandardsCoverageRationaleSummary merges a shared area rationale across profiles', () => {
    const areas = { REQ: { rationale: 'because', standards: ['A'] } };
    const rows = bh.buildStandardsCoverageRationaleSummary([
      { profile: 'quick-triage', scoreFile: 'q.json', areas },
      { profile: 'release-gate', scoreFile: 'r.json', areas }
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].profiles).toEqual(['quick-triage', 'release-gate']);
    expect(rows[0].scoreFiles).toEqual(['q.json', 'r.json']);
  });
});

describe('runMultiStandardsAudit: renderMarkdown section-omission coverage (#2331)', () => {
  const rm = require('../../scripts/runMultiStandardsAudit.js') as {
    renderMarkdown: (context: unknown) => string;
  };

  it('omits every optional section for a minimal context', () => {
    const md = rm.renderMarkdown({
      options: { image: 'img:tag', requirementsSpecScope: 'system' },
      outputDir: '/out',
      snapshot: { mode: 'tracked', trackedFileCount: 0, removed: true },
      imagePreparation: [],
      directChecks: [],
      profiles: []
    });
    expect(md).toContain('# Multi-Standard Audit');
    expect(md).toContain('## Command Results');
    expect(md).toContain('## Prioritization Use');
    // With no profile/direct-check data every optional standards section is omitted.
    expect(md).not.toContain('## Standards Coverage Matrix');
    expect(md).not.toContain('## Standards Coverage Rationale Summary');
    expect(md).not.toContain('## Standards Score File Legend');
    expect(md).not.toContain('## Standards Evidence Summary');
    expect(md).not.toContain('## Standards Gate Strength Summary');
    expect(md).not.toContain('## Standards Gate Basis Summary');
    expect(md).not.toContain('## Standards Gate Detail Summary');
    expect(md).not.toContain('## Direct Check Evidence Summary');
    // snapshot.removed=true -> the retained-snapshot line is omitted; no imageAccess.
    expect(md).not.toContain('Snapshot retained');
    expect(md).not.toContain('Docker image access');
  });
});

describe('runMultiStandardsAudit main CLI (#2331)', () => {
  it('writes the rendered markdown to stdout and returns the exit code', () => {
    const out: string[] = [];
    const code = main(['--schema'], { stdout: { write: (s: string) => out.push(s) } });
    expect(code).toBe(0);
    expect(out.join('')).toContain(MULTI_STANDARDS_AUDIT_SCHEMA_ID);
  });

  it('returns 1 and writes the error plus usage to stderr when the audit throws', () => {
    const err: string[] = [];
    const code = main(['--image'], { stdout: { write: () => {} }, stderr: { write: (s: string) => err.push(s) } });
    expect(code).toBe(1);
    expect(err.join('')).toMatch(/Usage:/);
  });

  it('falls back to process.stdout / process.stderr when no stream deps are supplied', () => {
    const outSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    expect(main(['--schema'])).toBe(0);
    expect(outSpy).toHaveBeenCalled();
    outSpy.mockRestore();

    const errSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    expect(main(['--image'])).toBe(1);
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });
});
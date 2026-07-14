import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

const {
  DEFAULT_SAVE_DIR,
  parseArgs,
  parseReviewFinding,
  buildAssuranceState,
  renderAssuranceStateMarkdown,
  resolveAuditSummaryPath,
  runAssuranceState
} = require('../../scripts/generateAssuranceState.js') as {
  DEFAULT_SAVE_DIR: string;
  parseArgs: (argv: string[]) => {
    auditSummary?: string;
    auditRunId?: string;
    saveDir: string;
    runId?: string;
    issueLinks: string[];
    prLinks: string[];
    mergeShas: string[];
    requirements: string[];
    reviewFindings: ReviewFinding[];
    help: boolean;
  };
  parseReviewFinding: (value: string) => ReviewFinding;
  buildAssuranceState: (auditSummary: unknown, options: {
    cwd: string;
    auditSummaryPath: string;
    runId: string;
    generatedAt: string;
    metadata: {
      issueLinks: string[];
      prLinks: string[];
      mergeShas: string[];
      requirements: string[];
      reviewFindings?: ReviewFinding[];
    };
  }) => {
    schemaVersion: number;
    runId: string;
    signalCount: number;
    countsByState: Record<string, number>;
    standards: string[];
    requirements: string[];
    profiles: string[];
    scoreFiles: string[];
    checkedPaths: string[];
    sourceArtifacts: string[];
    reviewFindings: ReviewFinding[];
    issueLinks: string[];
    prLinks: string[];
    mergeShas: string[];
    commandProvenance: Array<{ stage: string; name: string; command?: string }>;
    signals: Array<{
      id: string;
      state: string;
      kind: string;
      title: string;
      confidence?: string;
      basis?: string;
      standards: string[];
      requirements: string[];
      profiles: string[];
      scoreFiles: string[];
      checkedPaths: string[];
      evidencePaths: string[];
      sourceArtifacts: string[];
      issueLinks: string[];
      prLinks: string[];
      mergeShas: string[];
      commandProvenance: Array<{ stage: string; name: string; command?: string }>;
    }>;
  };
  renderAssuranceStateMarkdown: (state: ReturnType<typeof buildAssuranceState>) => string;
  resolveAuditSummaryPath: (options: ReturnType<typeof parseArgs>, cwd: string) => string;
  runAssuranceState: (argv: string[], deps: { cwd?: string; now?: () => Date }) => {
    exitCode: number;
    markdown: string;
    context: {
      outputDir: string;
      state: ReturnType<typeof buildAssuranceState>;
    };
  };
};

type ReviewFinding = {
  state: string;
  url: string;
  title: string;
  source: string;
  basis?: string;
};

const tempRoots: string[] = [];

function makeTempRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'assurance-state-'));
  tempRoots.push(root);
  return root;
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

function writeJson(filePath: string, payload: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function fixtureAuditSummary(): Record<string, unknown> {
  return {
    schemaVersion: 1,
    success: true,
    options: { runId: 'audit-green' },
    snapshot: {
      mode: 'tracked-worktree-snapshot',
      path: '/cache/snapshot',
      trackedFileCount: 12,
      removed: true,
      symlinkFiles: [],
      missingFiles: [],
      generatedRootsExcluded: ['coverage/']
    },
    imagePreparation: [
      { name: 'inspect-default-image', status: 0, file: 'image-inspect.txt', command: 'docker image inspect workbench' }
    ],
    directChecks: [
      {
        name: 'requirements-quality-system',
        status: 0,
        file: 'requirements-quality-system.json',
        command: 'docker run requirements_quality_check.py',
        requirementsQuality: { ok: true, findingCount: 0, summary: 'No requirement findings.' }
      },
      {
        name: 'external-user-information',
        status: 0,
        file: 'external-user-information.json',
        command: 'docker run external_user_information_check.py',
        externalUserInformation: {
          ok: true,
          findingCount: 0,
          checkedPathCount: 2,
          checkedPaths: ['docs/user-guide.md', 'docs/faq.md']
        }
      }
    ],
    profiles: [
      { name: 'quick-triage', status: 0, file: 'quick-triage-gate-scorecard.txt', command: 'docker run run_assurance.py --profile quick-triage', scoreFile: 'quick-triage/target/score.json' }
    ],
    standardsCoverageRationaleSummary: [
      { area: 'REQ', rationale: 'Requirement IDs and RTM rows are retained.', standards: ['29148'], profiles: ['quick-triage'], scoreFiles: ['quick-triage/target/score.json'] }
    ],
    standardsEvidenceSummary: [
      { id: 'req-rtm', summary: 'RTM evidence retained', standards: ['29148'], evidencePaths: ['docs/requirements/rtm.csv'], profiles: ['quick-triage'], scoreFiles: ['quick-triage/target/score.json'] },
      { id: 'closed-finding', state: 'resolved', summary: 'Prior review finding closed', standards: ['29148'], evidencePaths: ['docs/requirements/srs.md'], profiles: ['quick-triage'], scoreFiles: ['quick-triage/target/score.json'] }
    ],
    standardsGateStrengthSummary: [
      { id: 'cm-gate', summary: 'CM gate evidence is complete', standards: ['10007', '12207'], profiles: ['quick-triage'], scoreFiles: ['quick-triage/target/score.json'] }
    ],
    standardsGateBasisSummary: [
      { gate: 'req', status: 'PASS', confidence: 'High', basis: 'Require critical capability IDs and RTM rows.', standards: ['29148'], profiles: ['quick-triage'], scoreFiles: ['quick-triage/target/score.json'] }
    ],
    standardsGateDetailSummary: [
      { gate: 'dod', status: 'PASS', confidence: 'Med', basis: 'Report DoD only when a DoD context is visible.', standards: [], missingProof: [], profiles: ['quick-triage'], scoreFiles: ['quick-triage/target/score.json'] },
      { gate: 'coverage', status: 'FAIL', confidence: 'Low', basis: 'Coverage gate missing proof.', standards: ['29119-2'], missingProof: ['coverage/coverage-summary.json'], profiles: ['quick-triage'], scoreFiles: ['quick-triage/target/score.json'] }
    ]
  };
}

describe('generateAssuranceState script', () => {
  it('parses repeatable provenance options', () => {
    const options = parseArgs([
      '--audit-run-id', 'audit-green',
      '--save-dir', 'state-root',
      '--run-id', 'state-green',
      '--issue-link', 'https://github.com/example/repo/issues/1',
      '--issue-link', 'https://github.com/example/repo/issues/2',
      '--pr-link', 'https://github.com/example/repo/pull/3',
      '--merge-sha', 'abc123',
      '--requirement', 'VHS-REQ-615',
      '--review-finding', JSON.stringify({
        state: 'resolved',
        url: 'https://github.com/example/repo/pull/3#discussion_r1',
        title: 'Post-merge review finding closed',
        source: 'chatgpt-codex-connector',
        basis: 'Fixed by follow-up PR.'
      })
    ]);

    expect(options.auditRunId).toBe('audit-green');
    expect(options.saveDir).toBe('state-root');
    expect(options.runId).toBe('state-green');
    expect(options.issueLinks).toEqual(['https://github.com/example/repo/issues/1', 'https://github.com/example/repo/issues/2']);
    expect(options.prLinks).toEqual(['https://github.com/example/repo/pull/3']);
    expect(options.mergeShas).toEqual(['abc123']);
    expect(options.requirements).toEqual(['VHS-REQ-615']);
    expect(options.reviewFindings).toEqual([
      {
        state: 'resolved',
        url: 'https://github.com/example/repo/pull/3#discussion_r1',
        title: 'Post-merge review finding closed',
        source: 'chatgpt-codex-connector',
        basis: 'Fixed by follow-up PR.'
      }
    ]);
  });

  it('rejects malformed review finding metadata', () => {
    expect(() => parseReviewFinding('{')).toThrow('--review-finding must be JSON');
    expect(() => parseReviewFinding(JSON.stringify({ state: 'done', url: 'https://example.test', title: 'Finding' }))).toThrow('--review-finding state must be one of');
    expect(() => parseReviewFinding(JSON.stringify({ state: 'resolved', title: 'Finding' }))).toThrow('--review-finding url must be a non-empty string');
    expect(() => parseReviewFinding(JSON.stringify({ state: 'resolved', url: 'https://example.test' }))).toThrow('--review-finding title must be a non-empty string');
  });

  it('rejects ambiguous audit summary selectors', () => {
    expect(() => parseArgs(['--audit-summary', 'one.json', '--audit-run-id', 'two'])).toThrow('Use either --audit-summary or --audit-run-id');
  });

  it('builds classified assurance signals with retained provenance', () => {
    const cwd = makeTempRoot();
    const auditPath = path.join(cwd, 'assurance-multi-standards-evidence', 'audit-green', 'audit-summary.json');
    writeJson(auditPath, fixtureAuditSummary());
    const state = buildAssuranceState(fixtureAuditSummary(), {
      cwd,
      auditSummaryPath: auditPath,
      runId: 'state-green',
      generatedAt: '2026-07-14T00:00:00.000Z',
      metadata: {
        issueLinks: ['https://github.com/LabVIEW-Community-CI-CD/vi-history-suite/issues/1102'],
        prLinks: ['https://github.com/LabVIEW-Community-CI-CD/vi-history-suite/pull/1103'],
        mergeShas: ['abc123'],
        requirements: ['VHS-REQ-615']
      }
    });

    expect(state.schemaVersion).toBe(1);
    expect(state.countsByState.green).toBeGreaterThan(0);
    expect(state.countsByState['needs-review']).toBe(1);
    expect(state.countsByState.candidate).toBe(1);
    expect(state.countsByState.resolved).toBe(1);
    expect(state.standards).toEqual(expect.arrayContaining(['29148', '10007', '12207', '29119-2']));
    expect(state.requirements).toEqual(['VHS-REQ-615']);
    expect(state.profiles).toEqual(['quick-triage']);
    expect(state.scoreFiles).toEqual(['quick-triage/target/score.json']);
    expect(state.checkedPaths).toEqual(['docs/user-guide.md', 'docs/faq.md']);
    expect(state.issueLinks).toEqual(['https://github.com/LabVIEW-Community-CI-CD/vi-history-suite/issues/1102']);
    expect(state.prLinks).toEqual(['https://github.com/LabVIEW-Community-CI-CD/vi-history-suite/pull/1103']);
    expect(state.mergeShas).toEqual(['abc123']);
    expect(state.commandProvenance.map((command) => command.stage)).toEqual(['image', 'direct-check', 'direct-check', 'profile']);
    expect(state.sourceArtifacts).toEqual(expect.arrayContaining([
      'assurance-multi-standards-evidence/audit-green/audit-summary.json',
      'assurance-multi-standards-evidence/audit-green/quick-triage/target/score.json'
    ]));

    const directSignal = state.signals.find((signal) => signal.id === 'standards-audit:direct-check:external-user-information');
    expect(directSignal?.state).toBe('green');
    expect(directSignal?.checkedPaths).toEqual(['docs/user-guide.md', 'docs/faq.md']);
    expect(directSignal?.commandProvenance[0].command).toContain('external_user_information_check.py');

    const detailSignal = state.signals.find((signal) => signal.id === 'standards-audit:gate-detail:dod');
    expect(detailSignal?.state).toBe('needs-review');
    expect(detailSignal?.confidence).toBe('Med');

    const candidateSignal = state.signals.find((signal) => signal.id === 'standards-audit:gate-detail:coverage');
    expect(candidateSignal?.state).toBe('candidate');
    expect(candidateSignal?.sourceArtifacts).toContain('assurance-multi-standards-evidence/audit-green/audit-summary.json');

    const resolvedSignal = state.signals.find((signal) => signal.id === 'standards-audit:evidence:closed-finding');
    expect(resolvedSignal?.state).toBe('resolved');
  });

  it('renders a planning-ready Markdown summary', () => {
    const cwd = makeTempRoot();
    const auditPath = path.join(cwd, 'assurance-multi-standards-evidence', 'audit-green', 'audit-summary.json');
    const state = buildAssuranceState(fixtureAuditSummary(), {
      cwd,
      auditSummaryPath: auditPath,
      runId: 'state-green',
      generatedAt: '2026-07-14T00:00:00.000Z',
      metadata: { issueLinks: [], prLinks: [], mergeShas: [], requirements: ['VHS-REQ-615'] }
    });

    const markdown = renderAssuranceStateMarkdown(state);

    expect(markdown).toContain('# Assurance State');
    expect(markdown).toContain('| needs-review | 1 |');
    expect(markdown).toContain('| candidate | 1 |');
    expect(markdown).toContain('Gate detail: dod');
    expect(markdown).toContain('assurance-multi-standards-evidence/audit-green/audit-summary.json');
    expect(markdown).toContain('VHS-REQ-615');
  });

  it('retains post-merge review findings as classified signals (VHS-REQ-615.12)', () => {
    const cwd = makeTempRoot();
    const auditPath = path.join(cwd, 'assurance-multi-standards-evidence', 'audit-green', 'audit-summary.json');
    const auditSummary = fixtureAuditSummary();
    auditSummary.standardsEvidenceSummary = [];
    const reviewFinding = parseReviewFinding(JSON.stringify({
      state: 'resolved',
      url: 'https://github.com/LabVIEW-Community-CI-CD/vi-history-suite/pull/1107#discussion_r3578322495',
      title: 'Avoid fallback when detailed candidates already exist',
      source: 'chatgpt-codex-connector',
      basis: 'Fixed by PR #1109.'
    }));
    const state = buildAssuranceState(auditSummary, {
      cwd,
      auditSummaryPath: auditPath,
      runId: 'state-green',
      generatedAt: '2026-07-14T00:00:00.000Z',
      metadata: {
        issueLinks: ['https://github.com/LabVIEW-Community-CI-CD/vi-history-suite/issues/1110'],
        prLinks: ['https://github.com/LabVIEW-Community-CI-CD/vi-history-suite/pull/1109'],
        mergeShas: ['162cb1cf37dea2d42a60c7ed98cb277b347bf2f9'],
        requirements: ['VHS-REQ-615'],
        reviewFindings: [reviewFinding]
      }
    });

    const signal = state.signals.find((candidate) => candidate.kind === 'post-merge-review');

    expect(state.reviewFindings).toEqual([reviewFinding]);
    expect(state.countsByState.resolved).toBe(1);
    expect(signal?.id).toMatch(/^post-merge-review:chatgpt-codex-connector:avoid-fallback-when-detailed-candidates-already-exist:[a-f0-9]{12}$/);
    expect(signal).toMatchObject({
      state: 'resolved',
      kind: 'post-merge-review',
      title: 'Avoid fallback when detailed candidates already exist',
      status: 'RESOLVED',
      confidence: 'High',
      basis: 'Fixed by PR #1109.',
      evidencePaths: ['https://github.com/LabVIEW-Community-CI-CD/vi-history-suite/pull/1107#discussion_r3578322495'],
      issueLinks: ['https://github.com/LabVIEW-Community-CI-CD/vi-history-suite/issues/1110'],
      prLinks: ['https://github.com/LabVIEW-Community-CI-CD/vi-history-suite/pull/1109'],
      mergeShas: ['162cb1cf37dea2d42a60c7ed98cb277b347bf2f9']
    });

    const markdown = renderAssuranceStateMarkdown(state);
    expect(markdown).toContain('| resolved | 1 |');
    expect(markdown).toContain('Avoid fallback when detailed candidates already exist');
    expect(markdown).toContain('https://github.com/LabVIEW-Community-CI-CD/vi-history-suite/pull/1107#discussion_r3578322495');
  });

  it('keeps same-title review finding signals distinct (VHS-REQ-615.12)', () => {
    const cwd = makeTempRoot();
    const auditPath = path.join(cwd, 'assurance-multi-standards-evidence', 'audit-green', 'audit-summary.json');
    const auditSummary = fixtureAuditSummary();
    auditSummary.standardsEvidenceSummary = [];
    const findings = [
      parseReviewFinding(JSON.stringify({
        state: 'candidate',
        url: 'https://github.com/LabVIEW-Community-CI-CD/vi-history-suite/pull/1107#discussion_r1',
        title: 'Review finding needs follow-up',
        source: 'chatgpt-codex-connector'
      })),
      parseReviewFinding(JSON.stringify({
        state: 'candidate',
        url: 'https://github.com/LabVIEW-Community-CI-CD/vi-history-suite/pull/1108#discussion_r2',
        title: 'Review finding needs follow-up',
        source: 'chatgpt-codex-connector'
      }))
    ];
    const state = buildAssuranceState(auditSummary, {
      cwd,
      auditSummaryPath: auditPath,
      runId: 'state-green',
      generatedAt: '2026-07-14T00:00:00.000Z',
      metadata: {
        issueLinks: ['https://github.com/LabVIEW-Community-CI-CD/vi-history-suite/issues/1110'],
        prLinks: [],
        mergeShas: [],
        requirements: ['VHS-REQ-615'],
        reviewFindings: findings
      }
    });

    const reviewSignals = state.signals.filter((signal) => signal.kind === 'post-merge-review');
    const reviewSignalIds = reviewSignals.map((signal) => signal.id);

    expect(reviewSignals).toHaveLength(2);
    expect(new Set(reviewSignalIds).size).toBe(2);
    expect(reviewSignalIds).toEqual([
      expect.stringMatching(/^post-merge-review:chatgpt-codex-connector:review-finding-needs-follow-up:[a-f0-9]{12}$/),
      expect.stringMatching(/^post-merge-review:chatgpt-codex-connector:review-finding-needs-follow-up:[a-f0-9]{12}$/)
    ]);
    expect(reviewSignals.map((signal) => signal.evidencePaths)).toEqual([
      ['https://github.com/LabVIEW-Community-CI-CD/vi-history-suite/pull/1107#discussion_r1'],
      ['https://github.com/LabVIEW-Community-CI-CD/vi-history-suite/pull/1108#discussion_r2']
    ]);
  });

  it('escapes backslashes before Markdown table pipes', () => {
    const cwd = makeTempRoot();
    const auditPath = path.join(cwd, 'assurance-multi-standards-evidence', 'audit-green', 'audit-summary.json');
    const auditSummary = fixtureAuditSummary();
    auditSummary.standardsGateDetailSummary = [
      {
        gate: 'docs C:\\temp|packet',
        status: 'PASS',
        confidence: 'Med',
        basis: 'Rendered path must stay in one Markdown cell.',
        standards: ['26514'],
        missingProof: [],
        profiles: ['quick-triage'],
        scoreFiles: ['quick-triage/target/score.json']
      }
    ];
    const state = buildAssuranceState(auditSummary, {
      cwd,
      auditSummaryPath: auditPath,
      runId: 'state-green',
      generatedAt: '2026-07-14T00:00:00.000Z',
      metadata: { issueLinks: [], prLinks: [], mergeShas: [], requirements: ['VHS-REQ-615'] }
    });

    const markdown = renderAssuranceStateMarkdown(state);

    expect(markdown).toContain('Gate detail: docs C:\\\\temp\\|packet');
  });

  it('surfaces failed retained commands as candidate signals', () => {
    const cwd = makeTempRoot();
    const auditPath = path.join(cwd, 'assurance-multi-standards-evidence', 'audit-failed', 'audit-summary.json');
    const auditSummary = {
      schemaVersion: 1,
      success: false,
      options: { runId: 'audit-failed' },
      snapshot: { mode: 'tracked-worktree-snapshot', trackedFileCount: 12, removed: true },
      imagePreparation: [
        { name: 'docker-image-inspect', status: 1, file: 'docker-image-inspect.stderr.txt', command: 'docker image inspect missing' }
      ],
      directChecks: [],
      profiles: [
        { name: 'release-gate', status: 2, file: 'release-gate-gate-scorecard.txt', command: 'docker run run_assurance.py --profile release-gate', scoreFile: 'release-gate/target/score.json' }
      ],
      standardsCoverageRationaleSummary: [],
      standardsEvidenceSummary: [],
      standardsGateStrengthSummary: [],
      standardsGateBasisSummary: [],
      standardsGateDetailSummary: []
    };

    const state = buildAssuranceState(auditSummary, {
      cwd,
      auditSummaryPath: auditPath,
      runId: 'state-failed',
      generatedAt: '2026-07-14T00:00:00.000Z',
      metadata: { issueLinks: [], prLinks: [], mergeShas: [], requirements: ['VHS-REQ-615'] }
    });

    expect(state.countsByState.candidate).toBe(2);
    expect(state.signals.map((signal) => signal.id)).toEqual([
      'standards-audit:command:image:docker-image-inspect',
      'standards-audit:command:profile:release-gate'
    ]);
    expect(state.signals[0]).toMatchObject({
      state: 'candidate',
      kind: 'retained-command-failure',
      status: 'FAIL (1)',
      confidence: 'High'
    });
    expect(state.signals[0].commandProvenance).toEqual([
      expect.objectContaining({ stage: 'image', name: 'docker-image-inspect', status: 1 })
    ]);
    expect(state.signals[1].profiles).toEqual(['release-gate']);
    expect(state.signals[1].scoreFiles).toEqual(['release-gate/target/score.json']);
    expect(state.signals[1].sourceArtifacts).toEqual(expect.arrayContaining([
      'assurance-multi-standards-evidence/audit-failed/audit-summary.json',
      'assurance-multi-standards-evidence/audit-failed/release-gate-gate-scorecard.txt',
      'assurance-multi-standards-evidence/audit-failed/release-gate/target/score.json'
    ]));
  });

  it('does not add a summary fallback when detailed candidate signals exist', () => {
    const cwd = makeTempRoot();
    const auditPath = path.join(cwd, 'assurance-multi-standards-evidence', 'audit-direct-finding', 'audit-summary.json');
    const auditSummary = {
      schemaVersion: 1,
      success: false,
      options: { runId: 'audit-direct-finding' },
      snapshot: { mode: 'tracked-worktree-snapshot', trackedFileCount: 12, removed: true },
      imagePreparation: [],
      directChecks: [
        {
          name: 'requirements-quality-system',
          status: 0,
          file: 'requirements-quality-system.json',
          command: 'docker run requirements_quality_check.py',
          requirementsQuality: {
            ok: false,
            findingCount: 1,
            summary: 'One governed requirement has multiple obligations.'
          }
        }
      ],
      profiles: [],
      standardsCoverageRationaleSummary: [],
      standardsEvidenceSummary: [],
      standardsGateStrengthSummary: [],
      standardsGateBasisSummary: [],
      standardsGateDetailSummary: []
    };

    const state = buildAssuranceState(auditSummary, {
      cwd,
      auditSummaryPath: auditPath,
      runId: 'state-direct-finding',
      generatedAt: '2026-07-14T00:00:00.000Z',
      metadata: { issueLinks: [], prLinks: [], mergeShas: [], requirements: ['VHS-REQ-615'] }
    });

    expect(state.countsByState.candidate).toBe(1);
    expect(state.signals.map((signal) => signal.id)).toEqual([
      'standards-audit:direct-check:requirements-quality-system'
    ]);
    expect(state.signals[0]).toMatchObject({
      state: 'candidate',
      kind: 'direct-check',
      status: 'PASS',
      basis: 'One governed requirement has multiple obligations.'
    });
    expect(state.signals.some((signal) => signal.id === 'standards-audit:summary:failed')).toBe(false);
  });

  it('surfaces failed summaries without command details as candidates', () => {
    const cwd = makeTempRoot();
    const auditPath = path.join(cwd, 'assurance-multi-standards-evidence', 'audit-failed', 'audit-summary.json');
    const state = buildAssuranceState({
      schemaVersion: 1,
      success: false,
      options: { runId: 'audit-failed' },
      snapshot: { mode: 'tracked-worktree-snapshot', trackedFileCount: 12, removed: true },
      imagePreparation: [],
      directChecks: [],
      profiles: []
    }, {
      cwd,
      auditSummaryPath: auditPath,
      runId: 'state-failed',
      generatedAt: '2026-07-14T00:00:00.000Z',
      metadata: { issueLinks: [], prLinks: [], mergeShas: [], requirements: ['VHS-REQ-615'] }
    });

    expect(state.countsByState.candidate).toBe(1);
    expect(state.signals).toHaveLength(1);
    expect(state.signals[0]).toMatchObject({
      id: 'standards-audit:summary:failed',
      state: 'candidate',
      kind: 'standards-audit-summary',
      status: 'FAIL',
      confidence: 'High'
    });
    expect(state.signals[0].sourceArtifacts).toEqual([
      'assurance-multi-standards-evidence/audit-failed/audit-summary.json'
    ]);
  });

  it('resolves the latest retained audit summary when no selector is provided', () => {
    const cwd = makeTempRoot();
    const olderPath = path.join(cwd, 'assurance-multi-standards-evidence', 'older', 'audit-summary.json');
    const newerPath = path.join(cwd, 'assurance-multi-standards-evidence', 'newer', 'audit-summary.json');
    writeJson(olderPath, fixtureAuditSummary());
    writeJson(newerPath, fixtureAuditSummary());
    const olderTime = new Date('2026-07-14T00:00:00.000Z');
    const newerTime = new Date('2026-07-14T01:00:00.000Z');
    fs.utimesSync(olderPath, olderTime, olderTime);
    fs.utimesSync(newerPath, newerTime, newerTime);

    const resolved = resolveAuditSummaryPath(parseArgs([]), cwd);

    expect(resolved).toBe(newerPath);
  });

  it('writes assurance-state artifacts from an audit run id', () => {
    const cwd = makeTempRoot();
    const auditPath = path.join(cwd, 'assurance-multi-standards-evidence', 'audit-green', 'audit-summary.json');
    writeJson(auditPath, fixtureAuditSummary());

    const result = runAssuranceState([
      '--audit-run-id', 'audit-green',
      '--run-id', 'state-green',
      '--issue-link', 'https://github.com/LabVIEW-Community-CI-CD/vi-history-suite/issues/1102',
      '--requirement', 'VHS-REQ-615'
    ], { cwd, now: () => new Date('2026-07-14T00:00:00.000Z') });

    const jsonPath = path.join(cwd, DEFAULT_SAVE_DIR, 'state-green', 'assurance-state.json');
    const markdownPath = path.join(cwd, DEFAULT_SAVE_DIR, 'state-green', 'assurance-state.md');
    const json = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    const markdown = fs.readFileSync(markdownPath, 'utf8');

    expect(result.exitCode).toBe(0);
    expect(result.context.outputDir).toBe(path.dirname(jsonPath));
    expect(json.runId).toBe('state-green');
    expect(json.sources[0]).toMatchObject({ type: 'standards-audit', runId: 'audit-green', success: true });
    expect(json.signals.length).toBeGreaterThan(0);
    expect(markdown).toContain('# Assurance State');
    expect(result.markdown).toBe(markdown);
  });
});
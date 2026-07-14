import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

const {
  DEFAULT_SAVE_DIR,
  parseArgs,
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
    help: boolean;
  };
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
      '--requirement', 'VHS-REQ-615'
    ]);

    expect(options.auditRunId).toBe('audit-green');
    expect(options.saveDir).toBe('state-root');
    expect(options.runId).toBe('state-green');
    expect(options.issueLinks).toEqual(['https://github.com/example/repo/issues/1', 'https://github.com/example/repo/issues/2']);
    expect(options.prLinks).toEqual(['https://github.com/example/repo/pull/3']);
    expect(options.mergeShas).toEqual(['abc123']);
    expect(options.requirements).toEqual(['VHS-REQ-615']);
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
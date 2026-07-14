import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

const {
  REQUIREMENTS_HEALTH_SCHEMA_VERSION,
  REQUIREMENTS_HEALTH_SCHEMA_ID,
  REQUIREMENTS_HEALTH_SCHEMA_PROVENANCE_KEY,
  REQUIREMENTS_HEALTH_JSON_SCHEMA,
  ATTENTION_REASON_IDS,
  computeMutationScore,
  attentionReasonsForRequirement,
  aggregateRequirementHealth,
  summarizeRequirementHealth,
  parseArgs,
  outputModeForOptions,
  renderRequirementsHealthJsonSchema,
  markdownCell,
  markdownCodeSpan,
  generatedAtForProvenance,
  buildRequirementsHealthProvenance,
  renderTextProvenance,
  provenanceMarkdownLines,
  resolveOutputPath,
  writeRequirementsHealthOutput,
  verifyRequirementsHealth,
  renderSummary,
  renderStepSummary,
  renderMarkdown,
  renderRequirementsHealthOutput,
  main
} = require('../../scripts/verifyRequirementsHealth.js') as {
  REQUIREMENTS_HEALTH_SCHEMA_VERSION: number;
  REQUIREMENTS_HEALTH_SCHEMA_ID: string;
  REQUIREMENTS_HEALTH_SCHEMA_PROVENANCE_KEY: string;
  REQUIREMENTS_HEALTH_JSON_SCHEMA: Record<string, unknown>;
  ATTENTION_REASON_IDS: { unlinked: string; uncitedCriteria: string; coverageRisk: string };
  computeMutationScore: (report: unknown) => {
    killed: number;
    timeout: number;
    survived: number;
    noCoverage: number;
    score: number | null;
  };
  attentionReasonsForRequirement: (entry: {
    linkState: string;
    criteriaUncited: number;
    coverageRiskFiles?: string[];
  }) => Array<{ reasonId: string; message: string; count?: number; files?: string[] }>;
  aggregateRequirementHealth: (
    linkage: unknown,
    criteria: unknown,
    coverage: unknown
  ) => Array<{
    reqId: string;
    linkState: string;
    criteriaCited: number;
    criteriaTotal: number;
    criteriaUncited: number;
    coverageRiskFiles: string[];
    attentionReasons: Array<{ reasonId: string; message: string; count?: number; files?: string[] }>;
    attention: boolean;
  }>;
  summarizeRequirementHealth: (result: unknown) => {
    status: string;
    healthy: boolean;
    attentionCount: number;
    reasonCounts: { structuralIntegrity: number; unlinked: number; uncitedCriteria: number; coverageRisk: number };
    unavailableSignals: string[];
  };
  parseArgs: (argv?: string[]) => {
    json: boolean;
    markdown: boolean;
    schema: boolean;
    strict: boolean;
    includeProvenance: boolean;
    outputPath?: string;
    positionals: string[];
  };
  outputModeForOptions: (options?: { json?: boolean; markdown?: boolean; schema?: boolean }) => string;
  renderRequirementsHealthJsonSchema: (options?: {
    provenance?: { generatedAt: string; cwd: string; outputMode: string; strict: boolean; argv: string[] };
  }) => string;
  markdownCell: (value?: unknown) => string;
  markdownCodeSpan: (value?: unknown) => string;
  generatedAtForProvenance: (deps?: { now?: () => Date | string; generatedAt?: Date | string }) => string;
  buildRequirementsHealthProvenance: (
    options?: { cwd?: string; json?: boolean; markdown?: boolean; schema?: boolean; strict?: boolean },
    deps?: { cwd?: string; now?: () => Date | string; generatedAt?: Date | string; argv?: string[] }
  ) => { generatedAt: string; cwd: string; outputMode: string; strict: boolean; argv: string[] };
  renderTextProvenance: (provenance?: {
    generatedAt: string;
    cwd: string;
    outputMode: string;
    strict: boolean;
    argv: string[];
  }) => string;
  provenanceMarkdownLines: (provenance?: {
    generatedAt: string;
    cwd: string;
    outputMode: string;
    strict: boolean;
    argv: string[];
  }) => string[];
  resolveOutputPath: (outputPath: string, deps?: { cwd?: string }) => string;
  writeRequirementsHealthOutput: (outputPath: string, content: string, deps?: Record<string, unknown>) => void;
  verifyRequirementsHealth: (cwd?: string, deps?: Record<string, unknown>) => Record<string, unknown>;
  renderSummary: (result: unknown) => string;
  renderStepSummary: (result: unknown) => string;
  renderMarkdown: (result: Record<string, unknown>, options?: Record<string, unknown>) => string;
  renderRequirementsHealthOutput: (
    result: Record<string, unknown>,
    options?: {
      json?: boolean;
      markdown?: boolean;
      strict?: boolean;
      provenance?: { generatedAt: string; cwd: string; outputMode: string; strict: boolean; argv: string[] };
    }
  ) => string;
  main: (argv?: string[], deps?: Record<string, unknown>) => number;
};

const LINKAGE = {
  total: 4,
  linked: ['VHS-REQ-001', 'VHS-REQ-004'],
  unlinked: [{ reqId: 'VHS-REQ-002', testReferences: ['tests/unit/b.test.ts'] }],
  manualOnly: ['VHS-REQ-003']
};

const CRITERIA = {
  totalRequirements: 4,
  totalCriteria: 5,
  citedCriteria: 2,
  uncitedCriteria: 3,
  requirements: [
    {
      reqId: 'VHS-REQ-001',
      criteriaCount: 2,
      criteria: [
        { criterionId: 'VHS-REQ-001.1', ordinal: 1, text: 'a', cited: true },
        { criterionId: 'VHS-REQ-001.2', ordinal: 2, text: 'b', cited: false }
      ]
    },
    {
      reqId: 'VHS-REQ-004',
      criteriaCount: 1,
      criteria: [{ criterionId: 'VHS-REQ-004.1', ordinal: 1, text: 'c', cited: true }]
    }
  ]
};

const CRITERIA_ALL_CITED = {
  totalRequirements: 4,
  totalCriteria: 3,
  citedCriteria: 3,
  uncitedCriteria: 0,
  requirements: [
    {
      reqId: 'VHS-REQ-001',
      criteriaCount: 2,
      criteria: [
        { criterionId: 'VHS-REQ-001.1', ordinal: 1, text: 'a', cited: true },
        { criterionId: 'VHS-REQ-001.2', ordinal: 2, text: 'b', cited: true }
      ]
    },
    {
      reqId: 'VHS-REQ-004',
      criteriaCount: 1,
      criteria: [{ criterionId: 'VHS-REQ-004.1', ordinal: 1, text: 'c', cited: true }]
    }
  ]
};

const INTEGRITY_PASS = { success: true, violationCount: 0, checks: [] };

const COVERAGE_WITH_RISK = {
  riskThreshold: 50,
  mappedBelowThreshold: [{ path: 'src/a.ts', requirementIds: ['VHS-REQ-001'] }]
};

const MUTATION = { killed: 40, timeout: 0, survived: 9, noCoverage: 0, score: 81.63 };

const OUTPUT_FIXTURE = {
  linkage: LINKAGE,
  criteria: CRITERIA,
  integrity: INTEGRITY_PASS,
  coverage: COVERAGE_WITH_RISK,
  mutation: MUTATION
};

describe('requirement verification health (VHS-REQ-601)', () => {
  it('computes the Stryker mutation score from detected over valid mutants', () => {
    const report = {
      files: {
        'a.ts': {
          mutants: [{ status: 'Killed' }, { status: 'Survived' }, { status: 'Timeout' }]
        },
        'b.ts': {
          mutants: [{ status: 'NoCoverage' }, { status: 'Ignored' }, { status: 'CompileError' }]
        }
      }
    };

    const score = computeMutationScore(report);
    expect(score).toMatchObject({ killed: 1, timeout: 1, survived: 1, noCoverage: 1 });
    // detected = 2 (killed + timeout); valid = 4 (detected + survived + noCoverage) => 50%.
    expect(score.score).toBe(50);
  });

  it('returns a null score when there are no valid mutants', () => {
    expect(computeMutationScore({ files: {} }).score).toBeNull();
  });

  it('derives stable attention reason details for machine-readable health JSON', () => {
    expect(
      attentionReasonsForRequirement({
        linkState: 'unlinked',
        criteriaUncited: 2,
        coverageRiskFiles: ['src/a.ts', 'src/b.ts']
      })
    ).toEqual([
      { reasonId: ATTENTION_REASON_IDS.unlinked, message: 'no citing test' },
      {
        reasonId: ATTENTION_REASON_IDS.uncitedCriteria,
        message: '2 uncited criterion/criteria',
        count: 2
      },
      {
        reasonId: ATTENTION_REASON_IDS.coverageRisk,
        message: 'coverage risk (src/a.ts, src/b.ts)',
        files: ['src/a.ts', 'src/b.ts']
      }
    ]);
  });

  it('aggregates per-requirement link state, criterion citation, and coverage risk', () => {
    const requirements = aggregateRequirementHealth(LINKAGE, CRITERIA, COVERAGE_WITH_RISK);

    expect(requirements.map((entry) => entry.reqId)).toEqual([
      'VHS-REQ-001',
      'VHS-REQ-002',
      'VHS-REQ-003',
      'VHS-REQ-004'
    ]);

    const alpha = requirements.find((entry) => entry.reqId === 'VHS-REQ-001');
    expect(alpha).toMatchObject({
      linkState: 'linked',
      criteriaCited: 1,
      criteriaTotal: 2,
      criteriaUncited: 1
    });
    expect(alpha?.coverageRiskFiles).toEqual(['src/a.ts']);
    expect(alpha?.attentionReasons).toEqual([
      {
        reasonId: ATTENTION_REASON_IDS.uncitedCriteria,
        message: '1 uncited criterion/criteria',
        count: 1
      },
      {
        reasonId: ATTENTION_REASON_IDS.coverageRisk,
        message: 'coverage risk (src/a.ts)',
        files: ['src/a.ts']
      }
    ]);
    expect(alpha?.attention).toBe(true); // coverage risk

    expect(requirements.find((entry) => entry.reqId === 'VHS-REQ-002')).toMatchObject({
      linkState: 'unlinked',
      attentionReasons: [{ reasonId: ATTENTION_REASON_IDS.unlinked, message: 'no citing test' }],
      attention: true
    });
    expect(requirements.find((entry) => entry.reqId === 'VHS-REQ-003')).toMatchObject({
      linkState: 'manual',
      attention: false
    });
    expect(requirements.find((entry) => entry.reqId === 'VHS-REQ-004')).toMatchObject({
      attention: false
    });
  });

  it('reports ATTENTION with unlinked and coverage-risk requirements (VHS-REQ-601.17)', () => {
    const result = verifyRequirementsHealth('/repo', {
      linkage: LINKAGE,
      criteria: CRITERIA,
      integrity: INTEGRITY_PASS,
      coverage: COVERAGE_WITH_RISK,
      mutation: MUTATION
    });

    expect(result.activeRequirements).toBe(4);
    expect(result.healthy).toBe(false);
    expect((result.attention as unknown[]).length).toBe(2);
    expect(result.coverage).toMatchObject({ available: true, requirementsWithRisk: 1 });
    expect(result.mutation).toMatchObject({ available: true, score: 81.63 });
    expect(result.summary).toEqual({
      status: 'ATTENTION',
      healthy: false,
      attentionCount: 2,
      reasonCounts: { structuralIntegrity: 0, unlinked: 1, uncitedCriteria: 1, coverageRisk: 1 },
      unavailableSignals: []
    });
  });

  it('summarizes structural integrity failures without requiring per-requirement attention', () => {
    expect(summarizeRequirementHealth({
      healthy: false,
      integrity: { success: false, violationCount: 2 },
      coverage: { available: true },
      mutation: { available: true },
      attention: []
    })).toEqual({
      status: 'ATTENTION',
      healthy: false,
      attentionCount: 0,
      reasonCounts: { structuralIntegrity: 1, unlinked: 0, uncitedCriteria: 0, coverageRisk: 0 },
      unavailableSignals: []
    });
  });

  it('parses output and provenance arguments without treating the output path as the target repository', () => {
    expect(
      parseArgs(['--markdown', '--strict', '--include-provenance', '--output', 'evidence/requirements.md', '/repo'])
    ).toEqual({
      json: false,
      markdown: true,
      schema: false,
      strict: true,
      includeProvenance: true,
      outputPath: 'evidence/requirements.md',
      positionals: ['/repo']
    });
    expect(parseArgs(['--schema', '--output', 'evidence/requirements.schema.json'])).toEqual({
      json: false,
      markdown: false,
      schema: true,
      strict: false,
      includeProvenance: false,
      outputPath: 'evidence/requirements.schema.json',
      positionals: []
    });
    expect(() => parseArgs(['--output'])).toThrow(/requires a value/);
    expect(() => parseArgs(['--unknown'])).toThrow(/Unknown argument/);
    expect(() => parseArgs(['--json', '--markdown'])).toThrow(/Use only one output mode/);
    expect(() => parseArgs(['--schema', '--json'])).toThrow(/Use only one output mode/);
  });

  it('resolves and writes retained report output inside the working directory', () => {
    const cwd = path.resolve('/repo');
    const resolvedOutput = path.join(cwd, 'evidence', 'requirements-health.json');
    const mkdirCalls: unknown[] = [];
    const writeCalls: unknown[] = [];
    const mkdirSync = (...args: unknown[]) => mkdirCalls.push(args);
    const writeFileSync = (...args: unknown[]) => writeCalls.push(args);

    expect(resolveOutputPath('evidence/requirements-health.json', { cwd })).toBe(resolvedOutput);
    expect(() => resolveOutputPath('', { cwd })).toThrow(/non-empty path/);
    expect(() => resolveOutputPath('../requirements-health.json', { cwd })).toThrow(/stay inside/);
    expect(() => resolveOutputPath(resolvedOutput, { cwd })).toThrow(/relative path/);

    writeRequirementsHealthOutput('evidence/requirements-health.json', '{"healthy":true}', {
      cwd,
      mkdirSync,
      writeFileSync
    });

    expect(mkdirCalls).toEqual([[path.dirname(resolvedOutput), { recursive: true }]]);
    expect(writeCalls).toEqual([[resolvedOutput, '{"healthy":true}\n', 'utf8']]);
  });

  it('renders deterministic provenance for retained requirements health evidence', () => {
    const provenance = buildRequirementsHealthProvenance(
      { cwd: '/repo', json: true, strict: true },
      {
        now: () => new Date('2026-07-14T12:00:00.000Z'),
        argv: ['--json', '--strict', '--include-provenance']
      }
    );

    expect(outputModeForOptions({ json: true })).toBe('json');
    expect(outputModeForOptions({ markdown: true })).toBe('markdown');
    expect(outputModeForOptions({ schema: true })).toBe('schema');
    expect(outputModeForOptions()).toBe('text');
    expect(
      buildRequirementsHealthProvenance(
        { cwd: '/repo', schema: true },
        {
          now: () => new Date('2026-07-14T12:00:00.000Z'),
          argv: ['--schema', '--include-provenance']
        }
      )
    ).toEqual({
      generatedAt: '2026-07-14T12:00:00.000Z',
      cwd: path.resolve('/repo'),
      outputMode: 'schema',
      strict: false,
      argv: ['--schema', '--include-provenance']
    });
    expect(generatedAtForProvenance({ generatedAt: new Date('2026-07-14T12:00:00.000Z') })).toBe(
      '2026-07-14T12:00:00.000Z'
    );
    expect(provenance).toEqual({
      generatedAt: '2026-07-14T12:00:00.000Z',
      cwd: path.resolve('/repo'),
      outputMode: 'json',
      strict: true,
      argv: ['--json', '--strict', '--include-provenance']
    });
    expect(renderTextProvenance(provenance)).toBe([
      '[requirements-verify] Provenance',
      'generatedAt: 2026-07-14T12:00:00.000Z',
      `cwd: ${path.resolve('/repo')}`,
      'outputMode: json',
      'strict: true',
      'argv: ["--json","--strict","--include-provenance"]',
      ''
    ].join('\n'));
    expect(provenanceMarkdownLines({ ...provenance, outputMode: 'markdown' })).toEqual([
      '- Generated: `2026-07-14T12:00:00.000Z`',
      `- Cwd: \`${path.resolve('/repo')}\``,
      '- Output: `markdown`',
      '- Strict: `true`',
      '- Verification argv: `["--json","--strict","--include-provenance"]`'
    ]);
    expect(markdownCell('a|b\\c\nd')).toBe('a\\|b\\\\c d');
    expect(markdownCodeSpan('`value`')).toBe('`` `value` ``');
  });

  it('renders the versioned JSON Schema for machine-readable health output', () => {
    const schema = JSON.parse(renderRequirementsHealthJsonSchema()) as {
      $id: string;
      required: string[];
      properties: { $schema: { const: string }; schemaVersion: { const: number }; provenance: { $ref: string } };
      $defs: {
        attentionReason: { properties: { reasonId: { enum: string[] } } };
        provenance: { properties: { outputMode: { enum: string[] } } };
      };
    };

    expect(schema.required).toEqual([
      '$schema',
      'schemaVersion',
      'activeRequirements',
      'integrity',
      'linkage',
      'criteria',
      'coverage',
      'mutation',
      'requirements',
      'attention',
      'healthy',
      'summary'
    ]);
    expect(schema.$id).toBe(REQUIREMENTS_HEALTH_SCHEMA_ID);
    expect(schema.properties.$schema.const).toBe(REQUIREMENTS_HEALTH_SCHEMA_ID);
    expect(schema.properties.schemaVersion.const).toBe(REQUIREMENTS_HEALTH_SCHEMA_VERSION);
    expect(schema.properties.provenance.$ref).toBe('#/$defs/provenance');
    expect(schema.$defs.attentionReason.properties.reasonId.enum).toEqual(Object.values(ATTENTION_REASON_IDS));
    expect(schema.$defs.provenance.properties.outputMode.enum).toEqual(['text', 'json', 'markdown', 'schema']);
    expect(
      (REQUIREMENTS_HEALTH_JSON_SCHEMA.properties as { $schema: { const: string }; schemaVersion: { const: number } })
        .$schema.const
    ).toBe(REQUIREMENTS_HEALTH_SCHEMA_ID);
    expect(
      (REQUIREMENTS_HEALTH_JSON_SCHEMA.properties as { $schema: { const: string }; schemaVersion: { const: number } })
        .schemaVersion.const
    ).toBe(REQUIREMENTS_HEALTH_SCHEMA_VERSION);
  });

  it('adds schema provenance only when requested', () => {
    const provenance = {
      generatedAt: '2026-07-14T12:00:00.000Z',
      cwd: path.resolve('/repo'),
      outputMode: 'schema',
      strict: false,
      argv: ['--schema', '--include-provenance']
    };
    const defaultSchema = JSON.parse(renderRequirementsHealthJsonSchema()) as Record<string, unknown>;
    const schema = JSON.parse(renderRequirementsHealthJsonSchema({ provenance })) as Record<string, unknown>;

    expect(defaultSchema[REQUIREMENTS_HEALTH_SCHEMA_PROVENANCE_KEY]).toBeUndefined();
    expect(schema.$id).toBe(REQUIREMENTS_HEALTH_SCHEMA_ID);
    expect(schema[REQUIREMENTS_HEALTH_SCHEMA_PROVENANCE_KEY]).toEqual(provenance);
  });

  it('renders Markdown evidence with escaped attention details', () => {
    const result = verifyRequirementsHealth('/repo', {
      ...OUTPUT_FIXTURE,
      coverage: { riskThreshold: 75, mappedBelowThreshold: [{ path: 'src/a|b.ts', requirementIds: ['VHS-REQ-001'] }] }
    });

    const markdown = renderMarkdown(result, { strict: true });

    expect(markdown).toContain('## Requirement Verification Health');
    expect(markdown).toContain('- Result: ATTENTION');
    expect(markdown).toContain('- Strict mode: FAIL');
    expect(markdown).toContain('| Coverage risk | 1 requirement(s) below 75% |');
    expect(markdown).toContain(
      '| `VHS-REQ-001` | `uncited-criteria`, `coverage-risk` | 1 uncited criterion/criteria; coverage risk: `src/a\\|b.ts` |'
    );
  });

  it('reports ATTENTION when criterion citations are missing despite clean linkage and coverage (VHS-REQ-601)', () => {
    const result = verifyRequirementsHealth('/repo', {
      linkage: { total: 2, linked: ['VHS-REQ-001', 'VHS-REQ-004'], unlinked: [], manualOnly: [] },
      criteria: CRITERIA,
      integrity: INTEGRITY_PASS,
      coverage: { riskThreshold: 50, mappedBelowThreshold: [] },
      mutation: MUTATION
    });

    expect(result.healthy).toBe(false);
    expect((result.attention as unknown[]).length).toBe(1);
    const summary = renderSummary(result);
    expect(summary).toContain('Overall: ATTENTION');
    expect(summary).toContain('1 uncited criterion/criteria');
    expect(summary).toContain('does not fail CI');
  });

  it('reports HEALTHY when linkage, criterion citation, and coverage are clean', () => {
    const result = verifyRequirementsHealth('/repo', {
      linkage: { total: 2, linked: ['VHS-REQ-001', 'VHS-REQ-004'], unlinked: [], manualOnly: [] },
      criteria: CRITERIA_ALL_CITED,
      integrity: INTEGRITY_PASS,
      coverage: { riskThreshold: 50, mappedBelowThreshold: [] },
      mutation: MUTATION
    });

    expect(result.healthy).toBe(true);
    expect((result.attention as unknown[]).length).toBe(0);
    expect(renderSummary(result)).toContain('Overall: HEALTHY');
  });

  it('marks coverage and mutation unavailable when their artifacts are absent', () => {
    const result = verifyRequirementsHealth('/repo', {
      linkage: { total: 1, linked: ['VHS-REQ-001'], unlinked: [], manualOnly: [] },
      criteria: CRITERIA_ALL_CITED,
      integrity: INTEGRITY_PASS,
      coverage: null,
      mutation: null
    });

    expect(result.coverage).toEqual({ available: false });
    expect(result.mutation).toEqual({ available: false });
    expect(result.healthy).toBe(true);
    expect(result.summary).toEqual({
      status: 'HEALTHY',
      healthy: true,
      attentionCount: 0,
      reasonCounts: { structuralIntegrity: 0, unlinked: 0, uncitedCriteria: 0, coverageRisk: 0 },
      unavailableSignals: ['coverage', 'mutation']
    });
    expect(renderSummary(result)).toContain('Coverage risk: not available');
    expect(renderStepSummary(result)).toContain('Mutation (advisory): not available');
  });

  it('main writes the report and step summary and always returns 0 (advisory)', () => {
    const stdoutChunks: string[] = [];
    const summaryChunks: string[] = [];

    const code = main([], {
      linkage: LINKAGE,
      criteria: CRITERIA,
      integrity: INTEGRITY_PASS,
      coverage: COVERAGE_WITH_RISK,
      mutation: MUTATION,
      stdout: { write: (chunk: string) => stdoutChunks.push(chunk) },
      stepSummaryPath: '/tmp/summary.md',
      appendStepSummary: (_filePath: string, content: string) => summaryChunks.push(content)
    });

    expect(code).toBe(0);
    expect(stdoutChunks.join('')).toContain('[requirements-verify] Overall: ATTENTION');
    expect(summaryChunks.join('')).toContain('## Requirement Verification Health');
  });

  it('main writes retained text output and prints a concise output notice', () => {
    const stdoutChunks: string[] = [];
    const writeCalls: unknown[] = [];

    const code = main(['--output', 'evidence/requirements-health.txt'], {
      ...OUTPUT_FIXTURE,
      cwd: '/repo',
      stdout: { write: (chunk: string) => stdoutChunks.push(chunk) },
      mkdirSync: () => undefined,
      writeFileSync: (...args: unknown[]) => writeCalls.push(args)
    });

    expect(code).toBe(0);
    expect(stdoutChunks.join('')).toBe(
      '[requirements-verify] Wrote report output to evidence/requirements-health.txt\n'
    );
    expect(writeCalls).toHaveLength(1);
    expect(String((writeCalls[0] as unknown[])[1])).toContain('[requirements-verify] Overall: ATTENTION');
  });

  it('main writes retained JSON output using the same machine-readable contract', () => {
    const stdoutChunks: string[] = [];
    const writeCalls: unknown[] = [];

    const code = main(['--json', '--output', 'evidence/requirements-health.json'], {
      ...OUTPUT_FIXTURE,
      cwd: '/repo',
      stdout: { write: (chunk: string) => stdoutChunks.push(chunk) },
      mkdirSync: () => undefined,
      writeFileSync: (...args: unknown[]) => writeCalls.push(args)
    });

    const output = JSON.parse(String((writeCalls[0] as unknown[])[1])) as {
      $schema: string;
      schemaVersion: number;
      summary: { status: string; reasonCounts: { coverageRisk: number } };
      attention: Array<{ attentionReasons: Array<{ reasonId: string }> }>;
    };
    expect(code).toBe(0);
    expect(stdoutChunks.join('')).toBe(
      '[requirements-verify] Wrote report output to evidence/requirements-health.json\n'
    );
    expect(output.$schema).toBe(REQUIREMENTS_HEALTH_SCHEMA_ID);
    expect(output.schemaVersion).toBe(REQUIREMENTS_HEALTH_SCHEMA_VERSION);
    expect(output.summary).toMatchObject({ status: 'ATTENTION', reasonCounts: { coverageRisk: 1 } });
    expect(output.attention[0].attentionReasons.map((reason) => reason.reasonId)).toEqual([
      ATTENTION_REASON_IDS.uncitedCriteria,
      ATTENTION_REASON_IDS.coverageRisk
    ]);
  });

  it('main writes retained Markdown output for paste-ready evidence', () => {
    const stdoutChunks: string[] = [];
    const writeCalls: unknown[] = [];

    const code = main(['--markdown', '--output', 'evidence/requirements-health.md'], {
      ...OUTPUT_FIXTURE,
      cwd: '/repo',
      stdout: { write: (chunk: string) => stdoutChunks.push(chunk) },
      mkdirSync: () => undefined,
      writeFileSync: (...args: unknown[]) => writeCalls.push(args)
    });

    expect(code).toBe(0);
    expect(stdoutChunks.join('')).toBe(
      '[requirements-verify] Wrote report output to evidence/requirements-health.md\n'
    );
    expect(String((writeCalls[0] as unknown[])[1])).toContain('## Requirement Verification Health');
    expect(String((writeCalls[0] as unknown[])[1])).toContain('### Requirements Needing Attention');
  });

  it('main writes retained JSON Schema output without running health aggregation', () => {
    const stdoutChunks: string[] = [];
    const writeCalls: unknown[] = [];

    const code = main(['--schema', '--output', 'evidence/requirements-health.schema.json'], {
      cwd: '/repo',
      linkage: {},
      stdout: { write: (chunk: string) => stdoutChunks.push(chunk) },
      mkdirSync: () => undefined,
      writeFileSync: (...args: unknown[]) => writeCalls.push(args)
    });

    const schema = JSON.parse(String((writeCalls[0] as unknown[])[1])) as {
      $id: string;
      properties: { schemaVersion: { const: number } };
      required: string[];
    };
    expect(code).toBe(0);
    expect(stdoutChunks.join('')).toBe(
      '[requirements-verify] Wrote schema output to evidence/requirements-health.schema.json\n'
    );
    expect(schema.$id).toBe(REQUIREMENTS_HEALTH_SCHEMA_ID);
    expect(schema.properties.schemaVersion.const).toBe(REQUIREMENTS_HEALTH_SCHEMA_VERSION);
    expect(schema.required).toContain('$schema');
    expect(schema.required).toContain('summary');
  });

  it('main writes retained JSON Schema output with provenance when requested', () => {
    const stdoutChunks: string[] = [];
    const writeCalls: unknown[] = [];

    const code = main(['--schema', '--include-provenance', '--output', 'evidence/requirements-health.schema.json'], {
      cwd: '/repo',
      linkage: {},
      now: () => new Date('2026-07-14T12:00:00.000Z'),
      stdout: { write: (chunk: string) => stdoutChunks.push(chunk) },
      mkdirSync: () => undefined,
      writeFileSync: (...args: unknown[]) => writeCalls.push(args)
    });

    const schema = JSON.parse(String((writeCalls[0] as unknown[])[1])) as Record<string, unknown>;
    expect(code).toBe(0);
    expect(stdoutChunks.join('')).toBe(
      '[requirements-verify] Wrote schema output to evidence/requirements-health.schema.json\n'
    );
    expect(schema.$id).toBe(REQUIREMENTS_HEALTH_SCHEMA_ID);
    expect(schema[REQUIREMENTS_HEALTH_SCHEMA_PROVENANCE_KEY]).toEqual({
      generatedAt: '2026-07-14T12:00:00.000Z',
      cwd: path.resolve('/repo'),
      outputMode: 'schema',
      strict: false,
      argv: ['--schema', '--include-provenance', '--output', 'evidence/requirements-health.schema.json']
    });
  });

  it('main includes provenance in retained JSON output when requested', () => {
    const stdoutChunks: string[] = [];
    const writeCalls: unknown[] = [];

    const code = main(['--json', '--include-provenance', '--output', 'evidence/requirements-health.json'], {
      ...OUTPUT_FIXTURE,
      cwd: '/repo',
      now: () => new Date('2026-07-14T12:00:00.000Z'),
      stdout: { write: (chunk: string) => stdoutChunks.push(chunk) },
      mkdirSync: () => undefined,
      writeFileSync: (...args: unknown[]) => writeCalls.push(args)
    });

    const output = JSON.parse(String((writeCalls[0] as unknown[])[1])) as {
      $schema: string;
      schemaVersion: number;
      provenance: { generatedAt: string; cwd: string; outputMode: string; strict: boolean; argv: string[] };
      summary: { status: string };
    };
    expect(code).toBe(0);
    expect(stdoutChunks.join('')).toBe(
      '[requirements-verify] Wrote report output to evidence/requirements-health.json\n'
    );
    expect(output.$schema).toBe(REQUIREMENTS_HEALTH_SCHEMA_ID);
    expect(output.schemaVersion).toBe(REQUIREMENTS_HEALTH_SCHEMA_VERSION);
    expect(output.provenance).toEqual({
      generatedAt: '2026-07-14T12:00:00.000Z',
      cwd: path.resolve('/repo'),
      outputMode: 'json',
      strict: false,
      argv: ['--json', '--include-provenance', '--output', 'evidence/requirements-health.json']
    });
    expect(output.summary.status).toBe('ATTENTION');
  });

  it('main includes provenance in text output when requested', () => {
    const stdoutChunks: string[] = [];

    const code = main(['--strict', '--include-provenance'], {
      ...OUTPUT_FIXTURE,
      cwd: '/repo',
      now: () => new Date('2026-07-14T12:00:00.000Z'),
      stdout: { write: (chunk: string) => stdoutChunks.push(chunk) }
    });

    expect(code).toBe(1);
    expect(stdoutChunks.join('')).toContain('[requirements-verify] Provenance');
    expect(stdoutChunks.join('')).toContain('outputMode: text');
    expect(stdoutChunks.join('')).toContain('strict: true');
    expect(stdoutChunks.join('')).toContain('[requirements-verify] Strict mode: FAILING');
  });

  it('main includes provenance in Markdown output when requested', () => {
    const stdoutChunks: string[] = [];

    const code = main(['--markdown', '--strict', '--include-provenance'], {
      ...OUTPUT_FIXTURE,
      cwd: '/repo',
      now: () => new Date('2026-07-14T12:00:00.000Z'),
      stdout: { write: (chunk: string) => stdoutChunks.push(chunk) }
    });

    expect(code).toBe(1);
    expect(stdoutChunks.join('')).toContain('- Output: `markdown`');
    expect(stdoutChunks.join('')).toContain('- Strict: `true`');
    expect(stdoutChunks.join('')).toContain(
      '- Verification argv: `["--markdown","--strict","--include-provenance"]`'
    );
  });

  it('main rejects unsafe retained output paths', () => {
    const stdoutChunks: string[] = [];
    const stderrChunks: string[] = [];

    const code = main(['--output', '../requirements-health.txt'], {
      ...OUTPUT_FIXTURE,
      cwd: '/repo',
      stdout: { write: (chunk: string) => stdoutChunks.push(chunk) },
      stderr: { write: (chunk: string) => stderrChunks.push(chunk) }
    });

    expect(code).toBe(1);
    expect(stdoutChunks).toEqual([]);
    expect(stderrChunks.join('')).toContain('--output must stay inside the working directory');
  });

  it('exits non-zero under --strict when requirement health is not green (VHS-REQ-601.18)', () => {
    const stdoutChunks: string[] = [];

    const code = main(['--strict'], {
      linkage: LINKAGE,
      criteria: CRITERIA,
      integrity: INTEGRITY_PASS,
      coverage: COVERAGE_WITH_RISK,
      mutation: MUTATION,
      stdout: { write: (chunk: string) => stdoutChunks.push(chunk) }
    });

    expect(code).toBe(1);
    expect(stdoutChunks.join('')).toContain('Strict mode: FAILING');
  });

  it('exits zero under --strict when requirement health is green', () => {
    const stdoutChunks: string[] = [];

    const code = main(['--strict'], {
      linkage: { total: 2, linked: ['VHS-REQ-001', 'VHS-REQ-004'], unlinked: [], manualOnly: [] },
      criteria: CRITERIA_ALL_CITED,
      integrity: INTEGRITY_PASS,
      coverage: { riskThreshold: 50, mappedBelowThreshold: [] },
      mutation: MUTATION,
      stdout: { write: (chunk: string) => stdoutChunks.push(chunk) }
    });

    expect(code).toBe(0);
    expect(stdoutChunks.join('')).toContain('Strict mode: requirement health is green.');
  });

  it('includes the compact summary in --json output', () => {
    const stdoutChunks: string[] = [];

    const code = main(['--json'], {
      linkage: LINKAGE,
      criteria: CRITERIA,
      integrity: INTEGRITY_PASS,
      coverage: COVERAGE_WITH_RISK,
      mutation: MUTATION,
      stdout: { write: (chunk: string) => stdoutChunks.push(chunk) }
    });

    const output = JSON.parse(stdoutChunks.join('')) as {
      $schema: string;
      schemaVersion: number;
      attention: Array<{
        reqId: string;
        attentionReasons: Array<{ reasonId: string; message: string }>;
      }>;
      summary: unknown;
    };
    expect(code).toBe(0);
    expect(output.$schema).toBe(REQUIREMENTS_HEALTH_SCHEMA_ID);
    expect(output.schemaVersion).toBe(REQUIREMENTS_HEALTH_SCHEMA_VERSION);
    expect(
      output.attention.map((entry) => [entry.reqId, entry.attentionReasons.map((reason) => reason.reasonId)])
    ).toEqual([
      ['VHS-REQ-001', [ATTENTION_REASON_IDS.uncitedCriteria, ATTENTION_REASON_IDS.coverageRisk]],
      ['VHS-REQ-002', [ATTENTION_REASON_IDS.unlinked]]
    ]);
    expect(output.summary).toEqual({
      status: 'ATTENTION',
      healthy: false,
      attentionCount: 2,
      reasonCounts: { structuralIntegrity: 0, unlinked: 1, uncitedCriteria: 1, coverageRisk: 1 },
      unavailableSignals: []
    });
  });

  it('keeps provenance out of default JSON unless requested', () => {
    const result = verifyRequirementsHealth('/repo', OUTPUT_FIXTURE);
    const output = JSON.parse(renderRequirementsHealthOutput(result, { json: true })) as {
      $schema: string;
      schemaVersion: number;
      provenance?: unknown;
      summary: { status: string };
    };

    expect(output.$schema).toBe(REQUIREMENTS_HEALTH_SCHEMA_ID);
    expect(output.schemaVersion).toBe(REQUIREMENTS_HEALTH_SCHEMA_VERSION);
    expect(output.provenance).toBeUndefined();
    expect(output.summary.status).toBe('ATTENTION');
  });

  it('verifies the real repository aggregate is healthy', () => {
    const repoRoot = path.resolve(__dirname, '..', '..');
    const result = verifyRequirementsHealth(repoRoot) as {
      activeRequirements: number;
      integrity: { success: boolean };
      linkage: { unlinked: number };
      criteria: { total: number; uncited: number };
      summary: { status: string; attentionCount: number };
    };

    expect(result.activeRequirements).toBeGreaterThan(20);
    expect(result.integrity.success).toBe(true);
    expect(result.linkage.unlinked).toBe(0);
    expect(result.criteria.total).toBeGreaterThan(100);
    expect(result.criteria.uncited).toBe(0);
    expect(result.summary).toMatchObject({ status: 'HEALTHY', attentionCount: 0 });
  });
});

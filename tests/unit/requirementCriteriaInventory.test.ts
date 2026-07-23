import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

interface Criterion {
  criterionId: string;
  ordinal: number;
  text: string;
  cited: boolean;
}

interface CriteriaInventory {
  $schema?: string;
  schemaVersion?: number;
  totalRequirements: number;
  totalCriteria: number;
  citedCriteria: number;
  uncitedCriteria: number;
  requirements: Array<{ reqId: string; criteriaCount: number; criteria: Criterion[] }>;
}

const {
  extractAcceptanceCriteria,
  extractRequirementCriteria,
  criterionIsCited,
  auditRequirementCriteriaInventory,
  renderSummary,
  renderSchema,
  renderStepSummary,
  main,
  CRITERIA_INVENTORY_SCHEMA_ID
} = require('../../scripts/auditRequirementCriteriaInventory.js') as {
  extractAcceptanceCriteria: (blockBody: string) => string[];
  extractRequirementCriteria: (
    srsText: string
  ) => Map<string, { status: string; criteria: string[] }>;
  criterionIsCited: (criterionId: string, testFileContents: string[]) => boolean;
  auditRequirementCriteriaInventory: (
    cwd?: string,
    deps?: { readFile?: (relativePath: string) => string | undefined }
  ) => CriteriaInventory;
  renderSummary: (result: CriteriaInventory, options?: { enforce?: boolean }) => string;
  renderSchema: (options?: { provenance?: unknown }) => string;
  CRITERIA_INVENTORY_SCHEMA_ID: string;
  renderStepSummary: (result: CriteriaInventory, options?: { enforce?: boolean }) => string;
  main: (
    argv?: string[],
    deps?: {
      cwd?: string;
      json?: boolean;
      schema?: boolean;
      includeProvenance?: boolean;
      enforce?: boolean;
      now?: () => Date;
      readFile?: (relativePath: string) => string | undefined;
      stdout?: { write: (chunk: string) => void };
      stepSummaryPath?: string;
      appendStepSummary?: (filePath: string, content: string) => void;
    }
  ) => number;
};

const FIXTURE_SRS = [
  '### VHS-REQ-001: Alpha',
  '',
  '- Status: Active',
  '- Parent: VHS-SYS-REQ-001',
  '- Statement: Alpha statement that wraps',
  '  onto a second line.',
  '- Acceptance Criteria:',
  '  - First alpha criterion.',
  '  - Second alpha criterion that wraps',
  '    onto a continuation line.',
  '  - Third alpha criterion.',
  '- Agent Work Scope:',
  '  - Not a criterion.',
  '',
  '### VHS-REQ-002: Beta',
  '',
  '- Status: Retired',
  '- Acceptance Criteria:',
  '  - Beta criterion that must be ignored because the block is not Active.',
  '',
  '### VHS-REQ-003: Gamma',
  '',
  '- Status: Active',
  '- Acceptance Criteria:',
  '  - Only gamma criterion.',
  '- Verification References:',
  '  - `tests/unit/g.test.ts`',
  ''
].join('\n');

const FIXTURE_RTM =
  'ReqID,ParentID,Status,Area,Title,ImplementationRefs,VerificationRefs,Notes\n' +
  'VHS-REQ-001,VHS-SYS-REQ-001,Active,Area,Alpha,src/a.ts,tests/unit/a.test.ts,ok\n' +
  'VHS-REQ-002,VHS-SYS-REQ-001,Retired,Area,Beta,src/b.ts,tests/unit/b.test.ts,ok\n' +
  'VHS-REQ-003,VHS-SYS-REQ-001,Active,Area,Gamma,src/g.ts,tests/unit/g.test.ts,ok\n';

const FIXTURE_FILES: Record<string, string> = {
  'docs/requirements/srs.md': FIXTURE_SRS,
  'docs/requirements/rtm.csv': FIXTURE_RTM,
  // Cites criterion VHS-REQ-001.2 explicitly, plus the requirement id, to prove
  // criterion-level detection is stricter than requirement-level citation.
  'tests/unit/a.test.ts': "it('checks alpha (VHS-REQ-001, VHS-REQ-001.2)', () => {});",
  // Cites only the requirement id, so none of gamma's criteria are cited.
  'tests/unit/g.test.ts': "it('checks gamma (VHS-REQ-003)', () => {});"
};

function makeReadFile(files: Record<string, string>): (relativePath: string) => string | undefined {
  return (relativePath: string) => files[relativePath];
}

describe('requirement acceptance-criteria inventory (VHS-REQ-601)', () => {
  it('enumerates two-space criterion bullets and joins wrapped continuations', () => {
    const block = FIXTURE_SRS.slice(FIXTURE_SRS.indexOf('### VHS-REQ-001'), FIXTURE_SRS.indexOf('### VHS-REQ-002'));

    expect(extractAcceptanceCriteria(block)).toEqual([
      'First alpha criterion.',
      'Second alpha criterion that wraps onto a continuation line.',
      'Third alpha criterion.'
    ]);
  });

  it('reads status and criteria per requirement block', () => {
    const byRequirement = extractRequirementCriteria(FIXTURE_SRS);

    expect(byRequirement.get('VHS-REQ-001')?.status).toBe('Active');
    expect(byRequirement.get('VHS-REQ-001')?.criteria).toHaveLength(3);
    expect(byRequirement.get('VHS-REQ-002')?.status).toBe('Retired');
    expect(byRequirement.get('VHS-REQ-003')?.criteria).toEqual(['Only gamma criterion.']);
  });

  it('matches a criterion id only on an exact ordinal boundary (.1 does not match .10)', () => {
    expect(criterionIsCited('VHS-REQ-001.1', ['cites VHS-REQ-001.1 here'])).toBe(true);
    expect(criterionIsCited('VHS-REQ-001.1', ['cites VHS-REQ-001.10 here'])).toBe(false);
    expect(criterionIsCited('VHS-REQ-001.10', ['cites VHS-REQ-001.10 here'])).toBe(true);
    expect(criterionIsCited('VHS-REQ-001.2', ['cites VHS-REQ-001 only'])).toBe(false);
  });

  it('inventories Active requirements with positional ids and criterion-level citation (VHS-REQ-601.16)', () => {
    const result = auditRequirementCriteriaInventory('/repo', {
      readFile: makeReadFile(FIXTURE_FILES)
    });

    expect(result.totalRequirements).toBe(2);
    expect(result.totalCriteria).toBe(4);
    expect(result.citedCriteria).toBe(1);
    expect(result.uncitedCriteria).toBe(3);

    const alpha = result.requirements.find((entry) => entry.reqId === 'VHS-REQ-001');
    expect(alpha?.criteria.map((criterion) => criterion.criterionId)).toEqual([
      'VHS-REQ-001.1',
      'VHS-REQ-001.2',
      'VHS-REQ-001.3'
    ]);
    expect(alpha?.criteria.find((criterion) => criterion.criterionId === 'VHS-REQ-001.2')?.cited).toBe(
      true
    );
    expect(alpha?.criteria.find((criterion) => criterion.criterionId === 'VHS-REQ-001.1')?.cited).toBe(
      false
    );

    // Retired VHS-REQ-002 is excluded; gamma is cited only at requirement level.
    expect(result.requirements.map((entry) => entry.reqId)).toEqual(['VHS-REQ-001', 'VHS-REQ-003']);
    const gamma = result.requirements.find((entry) => entry.reqId === 'VHS-REQ-003');
    expect(gamma?.criteria[0].cited).toBe(false);
  });

  it('throws an actionable error when srs.md or rtm.csv cannot be read', () => {
    expect(() => auditRequirementCriteriaInventory('/repo', { readFile: () => undefined })).toThrow(
      /SRS not found/
    );
    expect(() =>
      auditRequirementCriteriaInventory('/repo', {
        readFile: (relativePath) => (relativePath.endsWith('srs.md') ? FIXTURE_SRS : undefined)
      })
    ).toThrow(/RTM not found/);
  });

  it('renders the advisory contract in both summaries', () => {
    const result = auditRequirementCriteriaInventory('/repo', {
      readFile: makeReadFile(FIXTURE_FILES)
    });

    const summary = renderSummary(result);
    expect(summary).toContain('Total acceptance criteria: 4');
    expect(summary).toContain('does not fail CI');

    const stepSummary = renderStepSummary(result);
    expect(stepSummary).toContain('## Requirement Acceptance-Criteria Inventory');
    expect(stepSummary).toContain('| `VHS-REQ-001` | 3 | 1 | 2 |');
    expect(stepSummary).toContain('VHS-REQ-NNN.M');
  });

  it('main writes the report and step summary and always returns 0 (advisory)', () => {
    const stdoutChunks: string[] = [];
    const summaryChunks: string[] = [];

    const code = main([], {
      readFile: makeReadFile(FIXTURE_FILES),
      stdout: { write: (chunk) => stdoutChunks.push(chunk) },
      stepSummaryPath: '/tmp/summary.md',
      appendStepSummary: (_filePath, content) => summaryChunks.push(content)
    });

    expect(code).toBe(0);
    expect(stdoutChunks.join('')).toContain('[requirements-criteria] Total acceptance criteria: 4');
    expect(summaryChunks.join('')).toContain('## Requirement Acceptance-Criteria Inventory');
  });

  it('main emits machine-readable JSON under --json', () => {
    const stdoutChunks: string[] = [];

    const code = main(['--json'], {
      readFile: makeReadFile(FIXTURE_FILES),
      stdout: { write: (chunk) => stdoutChunks.push(chunk) }
    });

    expect(code).toBe(0);
    const parsed = JSON.parse(stdoutChunks.join('')) as CriteriaInventory;
    expect(parsed.totalCriteria).toBe(4);
    expect(parsed.requirements[0].criteria[0].criterionId).toBe('VHS-REQ-001.1');
  });

  it('renders the enforce contract in both summaries', () => {
    const result = auditRequirementCriteriaInventory('/repo', {
      readFile: makeReadFile(FIXTURE_FILES)
    });

    const summary = renderSummary(result, { enforce: true });
    expect(summary).toContain('Enforcing (--enforce)');
    expect(summary).toContain('failing because at least one Active criterion is not cited');
    expect(summary).not.toContain('does not fail CI');

    const stepSummary = renderStepSummary(result, { enforce: true });
    expect(stepSummary).toContain('**Enforced check.**');
    expect(stepSummary).toContain('this step fails when any');
  });

  it('main --enforce fails closed (exit 1) when a criterion is not cited', () => {
    const stdoutChunks: string[] = [];

    const code = main(['--enforce'], {
      readFile: makeReadFile(FIXTURE_FILES),
      stdout: { write: (chunk) => stdoutChunks.push(chunk) }
    });

    expect(code).toBe(1);
    expect(stdoutChunks.join('')).toContain('[requirements-criteria] Enforcing (--enforce): failing');
  });

  it('main --enforce passes (exit 0) when every criterion is cited', () => {
    const stdoutChunks: string[] = [];
    // Cite every alpha and gamma criterion at the criterion level.
    const files: Record<string, string> = {
      ...FIXTURE_FILES,
      'tests/unit/a.test.ts':
        'it("alpha VHS-REQ-001.1 VHS-REQ-001.2 VHS-REQ-001.3", () => {});',
      'tests/unit/g.test.ts': 'it("gamma VHS-REQ-003.1", () => {});'
    };

    const code = main(['--enforce'], {
      readFile: makeReadFile(files),
      stdout: { write: (chunk) => stdoutChunks.push(chunk) }
    });

    expect(code).toBe(0);
    expect(stdoutChunks.join('')).toContain(
      '[requirements-criteria] Enforcing (--enforce): all Active criteria are cited'
    );
  });

  it('main honors deps.enforce as an alternative to the --enforce flag', () => {
    const stdoutChunks: string[] = [];

    const code = main([], {
      enforce: true,
      readFile: makeReadFile(FIXTURE_FILES),
      stdout: { write: (chunk) => stdoutChunks.push(chunk) }
    });

    expect(code).toBe(1);
  });

  it('inventories the real repository with derived positional criterion ids', () => {
    const repoRoot = path.resolve(__dirname, '..', '..');
    const result = auditRequirementCriteriaInventory(repoRoot);

    expect(result.totalRequirements).toBeGreaterThan(20);
    expect(result.totalCriteria).toBeGreaterThan(100);
    const requirementsRow = result.requirements.find((entry) => entry.reqId === 'VHS-REQ-601');
    expect(requirementsRow).toBeDefined();
    expect(requirementsRow?.criteriaCount).toBeGreaterThan(1);
    expect(requirementsRow?.criteria[0].criterionId).toBe('VHS-REQ-601.1');
  });

  it('wires criterion citation enforcement into CI after linkage enforcement (VHS-REQ-601)', () => {
    const repoRoot = path.resolve(__dirname, '..', '..');
    const workflow = fs.readFileSync(path.join(repoRoot, '.github', 'workflows', 'ci.yml'), 'utf8');

    expect(workflow).toContain('name: Enforce requirement criterion citation');
    expect(workflow).toContain('node scripts/auditRequirementCriteriaInventory.js --enforce');

    // The criterion-citation enforce step must run inside the requirements job
    // after structural integrity (cross-references) and requirement-linkage
    // enforcement, so a linkage regression fails before the criterion depth check.
    const orderedSteps = [
      'name: Validate requirements cross-references',
      'name: Enforce requirement verification linkage',
      'name: Enforce requirement criterion citation'
    ];
    const positions = orderedSteps.map((step) => workflow.indexOf(step));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((left, right) => left - right));
  });

  it('emits a self-describing packet aligned with the published schema, with a --schema mode (VHS-REQ-601)', () => {
    const result = auditRequirementCriteriaInventory(path.resolve(__dirname, '..', '..')) as Record<string, unknown>;
    const schema = JSON.parse(renderSchema()) as {
      $id: string;
      required: string[];
      properties: {
        $schema: { const: string };
        schemaVersion: { const: number };
        requirements: { items: { required: string[] } };
      };
    };

    // Self-describing envelope aligned with the schema.
    expect(schema.required.filter((key) => !(key in result))).toEqual([]);
    expect(result.$schema).toBe(schema.properties.$schema.const);
    expect(result.$schema).toBe(CRITERIA_INVENTORY_SCHEMA_ID);
    expect(result.schemaVersion).toBe(schema.properties.schemaVersion.const);

    // Every requirement record carries the schema's required keys.
    const requirements = result.requirements as Array<Record<string, unknown>>;
    expect(requirements.length).toBeGreaterThan(0);
    const reqRequired = schema.properties.requirements.items.required;
    for (const requirement of requirements) {
      expect(reqRequired.filter((key) => !(key in requirement))).toEqual([]);
    }

    // --schema publishes the JSON Schema without running the audit; provenance attaches under the shared key.
    const withProvenance = JSON.parse(renderSchema({ provenance: { generatedAt: 'x' } })) as Record<string, unknown>;
    expect(withProvenance['x-vi-history-suite-provenance']).toEqual({ generatedAt: 'x' });

    const schemaOut: string[] = [];
    const code = main(['--schema'], { cwd: path.resolve(__dirname, '..', '..'), stdout: { write: (t: string) => schemaOut.push(t) } });
    expect(code).toBe(0);
    expect((JSON.parse(schemaOut.join('')) as Record<string, unknown>).$id).toBe(CRITERIA_INVENTORY_SCHEMA_ID);
  });

  it('rejects combining --json and --schema, and honors --include-provenance in text output (VHS-REQ-601)', () => {
    let stderr = '';
    const code = main(['--json', '--schema'], {
      cwd: path.resolve(__dirname, '..', '..'),
      stdout: { write: () => undefined },
      stderr: { write: (t: string) => { stderr += t; } }
    });
    expect(code).toBe(1);
    expect(stderr).toContain('Use only one output mode');

    let textOut = '';
    main(['--include-provenance'], {
      cwd: path.resolve(__dirname, '..', '..'),
      now: () => new Date('2026-07-15T00:00:00.000Z'),
      stdout: { write: (t: string) => { textOut += t; } }
    });
    expect(textOut).toContain('[requirements-criteria] provenance generatedAt: 2026-07-15T00:00:00.000Z');
    expect(textOut).toContain('provenance outputMode: text');
  });
});

describe('requirement acceptance-criteria inventory: additional branch coverage (VHS-REQ-601)', () => {
  it('records an empty status for a requirement heading with no "- Status:" line', () => {
    // Exercises the `statusMatch ? ... : ''` fallback when a heading block omits
    // its Status field.
    const map = extractRequirementCriteria(
      ['### VHS-REQ-050: No Status', '', '- Acceptance Criteria:', '  - Only criterion.', ''].join('\n')
    );
    expect(map.get('VHS-REQ-050')).toEqual({ status: '', criteria: ['Only criterion.'] });
  });

  it('skips RTM rows whose ReqID cell is empty', () => {
    // Exercises the `if (reqId.length === 0) continue` guard: a blank-ReqID row
    // must not create a verification-refs entry.
    const rtmWithBlankRow =
      FIXTURE_RTM + ',VHS-SYS-REQ-001,Active,Area,Blank,src/x.ts,tests/unit/x.test.ts,ok\n';
    const result = auditRequirementCriteriaInventory('/repo', {
      readFile: makeReadFile({ ...FIXTURE_FILES, 'docs/requirements/rtm.csv': rtmWithBlankRow })
    });
    // Only the three real requirements are inventoried; the blank row is ignored.
    expect(result.requirements.map((r) => r.reqId)).toEqual(['VHS-REQ-001', 'VHS-REQ-003']);
  });

  it('stamps provenance with the real clock when no now dep is injected', () => {
    // Exercises the `typeof deps.now === 'function' ? ... : new Date()` fallback.
    let textOut = '';
    const code = main(['--include-provenance'], {
      cwd: '/repo',
      readFile: makeReadFile(FIXTURE_FILES),
      stdout: { write: (t: string) => { textOut += t; } }
    });
    expect(code).toBe(0);
    expect(textOut).toContain('[requirements-criteria] provenance generatedAt:');
    expect(textOut).toContain('provenance outputMode: text');
  });

  it('emits JSON with provenance and outputMode "json" under --json --include-provenance', () => {
    // Exercises the `asJson ? 'json' : 'text'` provenance outputMode branch and
    // the JSON output path.
    let jsonOut = '';
    const code = main(['--json', '--include-provenance'], {
      cwd: '/repo',
      readFile: makeReadFile(FIXTURE_FILES),
      now: () => new Date('2026-07-15T00:00:00.000Z'),
      stdout: { write: (t: string) => { jsonOut += t; } }
    });
    expect(code).toBe(0);
    const parsed = JSON.parse(jsonOut) as { provenance?: { outputMode?: string } };
    expect(parsed.provenance?.outputMode).toBe('json');
  });

  it('publishes the schema with outputMode "schema" under --schema --include-provenance', () => {
    // Exercises the `asSchema ? 'schema' : ...` provenance outputMode branch.
    let schemaOut = '';
    const code = main(['--schema', '--include-provenance'], {
      cwd: '/repo',
      now: () => new Date('2026-07-15T00:00:00.000Z'),
      stdout: { write: (t: string) => { schemaOut += t; } }
    });
    expect(code).toBe(0);
    const parsed = JSON.parse(schemaOut) as Record<string, unknown>;
    expect((parsed['x-vi-history-suite-provenance'] as { outputMode?: string }).outputMode).toBe('schema');
  });

  it('appends the step summary via the default fs writer when none is injected', () => {
    // Exercises the default appendStepSummary arrow (fs.appendFileSync).
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vihs-criteria-'));
    const summaryPath = path.join(dir, 'summary.md');
    try {
      const code = main([], {
        cwd: '/repo',
        readFile: makeReadFile(FIXTURE_FILES),
        stepSummaryPath: summaryPath,
        stdout: { write: () => undefined }
      });
      expect(code).toBe(0);
      expect(fs.readFileSync(summaryPath, 'utf8')).toContain('VHS-REQ-001');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

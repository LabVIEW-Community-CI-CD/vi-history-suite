import * as fs from 'node:fs';
import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

interface Criterion {
  criterionId: string;
  ordinal: number;
  text: string;
  cited: boolean;
}

interface CriteriaInventory {
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
  renderStepSummary,
  main
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
  renderStepSummary: (result: CriteriaInventory, options?: { enforce?: boolean }) => string;
  main: (
    argv?: string[],
    deps?: {
      cwd?: string;
      json?: boolean;
      enforce?: boolean;
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
});

import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

interface LinkageResult {
  total: number;
  linked: string[];
  unlinked: Array<{ reqId: string; testReferences: string[] }>;
  manualOnly: string[];
}

const {
  isCiteableTestReference,
  classifyRequirementLinkage,
  auditRequirementVerificationLinkage,
  renderSummary,
  renderStepSummary,
  main
} = require('../../scripts/auditRequirementVerificationLinkage.js') as {
  isCiteableTestReference: (reference: string) => boolean;
  classifyRequirementLinkage: (
    rtmRows: Array<Record<string, string>>,
    readFile: (relativePath: string) => string | undefined
  ) => Omit<LinkageResult, 'total'>;
  auditRequirementVerificationLinkage: (
    cwd?: string,
    deps?: {
      readFile?: (relativePath: string) => string | undefined;
      stdout?: { write: (chunk: string) => void };
      stepSummaryPath?: string;
      appendStepSummary?: (filePath: string, content: string) => void;
    }
  ) => LinkageResult;
  renderSummary: (result: LinkageResult) => string;
  renderStepSummary: (result: LinkageResult) => string;
  main: (
    argv?: string[],
    deps?: {
      cwd?: string;
      readFile?: (relativePath: string) => string | undefined;
      stdout?: { write: (chunk: string) => void };
      stepSummaryPath?: string;
      appendStepSummary?: (filePath: string, content: string) => void;
    }
  ) => number;
};

const FIXTURE_RTM =
  'ReqID,ParentID,Status,Area,Title,ImplementationRefs,VerificationRefs,Notes\n' +
  'VHS-REQ-001,VHS-SYS-REQ-001,Active,Area,Alpha,src/a.ts,tests/unit/a.test.ts,ok\n' +
  'VHS-REQ-002,VHS-SYS-REQ-001,Active,Area,Beta,src/b.ts,tests/unit/b.test.ts,ok\n' +
  'VHS-REQ-003,VHS-SYS-REQ-001,Active,Area,Gamma,src/c.ts,manual:something,ok\n' +
  'VHS-REQ-004,VHS-SYS-REQ-001,Active,Area,Delta,src/d.ts,tests/unit/c.test.ts;tests/unit/d.test.ts,ok\n';

const FIXTURE_FILES: Record<string, string> = {
  'docs/requirements/rtm.csv': FIXTURE_RTM,
  'tests/unit/a.test.ts': "it('does alpha (VHS-REQ-001)', () => {});",
  'tests/unit/b.test.ts': "it('does beta', () => {});",
  'tests/unit/c.test.ts': "it('does delta part one', () => {});",
  'tests/unit/d.test.ts': "it('does delta part two (VHS-REQ-004)', () => {});"
};

function makeReadFile(files: Record<string, string>): (relativePath: string) => string | undefined {
  return (relativePath: string) => files[relativePath];
}

describe('requirement verification-linkage report (VHS-REQ-601)', () => {
  it('treats only tests/ paths as citeable, ignoring manual/external and stripping anchors', () => {
    expect(isCiteableTestReference('tests/unit/foo.test.ts')).toBe(true);
    expect(isCiteableTestReference('tests/unit/vscodeTestHarness.ts')).toBe(true);
    expect(isCiteableTestReference('tests/unit/foo.test.ts#L10')).toBe(true);
    expect(isCiteableTestReference('manual:something')).toBe(false);
    expect(isCiteableTestReference('external:marketplace')).toBe(false);
    expect(isCiteableTestReference('src/foo.ts')).toBe(false);
  });

  it('classifies linked, unlinked, and manual-only requirements', () => {
    const rows = [
      { ReqID: 'VHS-REQ-001', VerificationRefs: 'tests/unit/a.test.ts' },
      { ReqID: 'VHS-REQ-002', VerificationRefs: 'tests/unit/b.test.ts' },
      { ReqID: 'VHS-REQ-003', VerificationRefs: 'manual:something' },
      { ReqID: 'VHS-REQ-004', VerificationRefs: 'tests/unit/c.test.ts;tests/unit/d.test.ts' }
    ];

    const linkage = classifyRequirementLinkage(rows, makeReadFile(FIXTURE_FILES));

    expect(linkage.linked.sort()).toEqual(['VHS-REQ-001', 'VHS-REQ-004']);
    expect(linkage.unlinked).toEqual([
      { reqId: 'VHS-REQ-002', testReferences: ['tests/unit/b.test.ts'] }
    ]);
    expect(linkage.manualOnly).toEqual(['VHS-REQ-003']);
  });

  it('audits an injected RTM and returns the active-requirement partition', () => {
    const result = auditRequirementVerificationLinkage('/repo', {
      readFile: makeReadFile(FIXTURE_FILES)
    });

    expect(result.total).toBe(4);
    expect(result.linked.sort()).toEqual(['VHS-REQ-001', 'VHS-REQ-004']);
    expect(result.unlinked.map((entry) => entry.reqId)).toEqual(['VHS-REQ-002']);
    expect(result.manualOnly).toEqual(['VHS-REQ-003']);
  });

  it('throws an actionable error when the RTM cannot be read', () => {
    expect(() => auditRequirementVerificationLinkage('/repo', { readFile: () => undefined })).toThrow(
      /RTM not found/
    );
  });

  it('renders the unlinked list and the advisory contract in both summaries', () => {
    const result = auditRequirementVerificationLinkage('/repo', {
      readFile: makeReadFile(FIXTURE_FILES)
    });

    const summary = renderSummary(result);
    expect(summary).toContain('Active requirements: 4');
    expect(summary).toContain('VHS-REQ-002: tests/unit/b.test.ts');
    expect(summary).toContain('does not fail CI');

    const stepSummary = renderStepSummary(result);
    expect(stepSummary).toContain('## Requirement Verification Linkage');
    expect(stepSummary).toContain('| `VHS-REQ-002` | `tests/unit/b.test.ts` |');
    expect(stepSummary).toContain('authoritative');
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
    expect(stdoutChunks.join('')).toContain('[requirements-linkage] Unlinked');
    expect(summaryChunks.join('')).toContain('## Requirement Verification Linkage');
  });

  it('reports VHS-REQ-601 itself as linked on the real repository', () => {
    const repoRoot = path.resolve(__dirname, '..', '..');
    const result = auditRequirementVerificationLinkage(repoRoot);

    expect(result.total).toBeGreaterThan(20);
    expect(result.linked).toContain('VHS-REQ-601');
    expect(result.unlinked.map((entry) => entry.reqId)).not.toContain('VHS-REQ-601');
  });
});

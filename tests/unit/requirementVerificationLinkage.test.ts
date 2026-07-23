import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

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
  renderSummary: (result: LinkageResult, options?: { enforce?: boolean }) => string;
  renderStepSummary: (result: LinkageResult, options?: { enforce?: boolean }) => string;
  main: (
    argv?: string[],
    deps?: {
      cwd?: string;
      enforce?: boolean;
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

  it('renders the unlinked list and the advisory contract in both summaries (VHS-REQ-601.14)', () => {
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

  it('fails closed under --enforce when a requirement is unlinked (VHS-REQ-601, VHS-REQ-601.15)', () => {
    const stdoutChunks: string[] = [];

    const code = main(['--enforce'], {
      readFile: makeReadFile(FIXTURE_FILES),
      stdout: { write: (chunk) => stdoutChunks.push(chunk) }
    });

    expect(code).toBe(1);
    expect(stdoutChunks.join('')).toContain('Enforcing (--enforce): failing');
  });

  it('passes under --enforce when every requirement is linked and manual-only never fails (VHS-REQ-601)', () => {
    const linkedFiles: Record<string, string> = {
      'docs/requirements/rtm.csv':
        'ReqID,ParentID,Status,Area,Title,ImplementationRefs,VerificationRefs,Notes\n' +
        'VHS-REQ-001,VHS-SYS-REQ-001,Active,Area,Alpha,src/a.ts,tests/unit/a.test.ts,ok\n' +
        'VHS-REQ-003,VHS-SYS-REQ-001,Active,Area,Gamma,src/c.ts,manual:something,ok\n',
      'tests/unit/a.test.ts': "it('does alpha (VHS-REQ-001)', () => {});"
    };
    const stdoutChunks: string[] = [];

    const code = main(['--enforce'], {
      readFile: makeReadFile(linkedFiles),
      stdout: { write: (chunk) => stdoutChunks.push(chunk) }
    });

    expect(code).toBe(0);
    expect(stdoutChunks.join('')).toContain(
      'Enforcing (--enforce): all Active requirements are linked.'
    );
  });

  it('renders enforcement wording only when enforcing (VHS-REQ-601)', () => {
    const result = auditRequirementVerificationLinkage('/repo', {
      readFile: makeReadFile(FIXTURE_FILES)
    });

    expect(renderSummary(result, { enforce: true })).toContain('Enforcing (--enforce)');
    expect(renderSummary(result, { enforce: true })).not.toContain('does not fail CI');
    expect(renderSummary(result)).toContain('does not fail CI');
    expect(renderStepSummary(result, { enforce: true })).toContain(
      'this step fails when any Active requirement is unlinked'
    );
    expect(renderStepSummary(result)).toContain('does not fail CI');
  });

  it('skips rows with an empty ReqID and treats a row lacking VerificationRefs as manual-only (VHS-REQ-601)', () => {
    // Empty/absent ReqID exercises the `(row.ReqID || '').trim()` fallback and
    // the `reqId.length === 0` continue; a row with an id but no VerificationRefs
    // exercises the `(row.VerificationRefs || '')` fallback and lands in manual-only.
    const rows = [
      { ReqID: '', VerificationRefs: 'tests/unit/x.test.ts' },
      { VerificationRefs: 'tests/unit/y.test.ts' },
      { ReqID: 'VHS-REQ-050' }
    ];
    const linkage = classifyRequirementLinkage(rows, () => undefined);
    expect(linkage.linked).toEqual([]);
    expect(linkage.unlinked).toEqual([]);
    expect(linkage.manualOnly).toEqual(['VHS-REQ-050']);
  });

  it('omits the manual/external summary line when there are no manual-only requirements (VHS-REQ-601)', () => {
    const result: LinkageResult = { total: 1, linked: ['VHS-REQ-001'], unlinked: [], manualOnly: [] };
    const summary = renderSummary(result);
    expect(summary).not.toContain('Manual/external verification only');
    expect(summary).toContain('does not fail CI');
  });

  it('omits the unlinked step-summary table when there are no unlinked requirements (VHS-REQ-601)', () => {
    const result: LinkageResult = { total: 1, linked: ['VHS-REQ-001'], unlinked: [], manualOnly: [] };
    const stepSummary = renderStepSummary(result);
    expect(stepSummary).not.toContain('### Unlinked requirements');
    expect(stepSummary).toContain('- Unlinked: 0');
  });

  it('main uses the default fs step-summary writer and process.stdout when deps omit them (VHS-REQ-601)', () => {
    // Omitting appendStepSummary exercises the default `fs.appendFileSync` writer
    // (against a real temp file), and omitting stdout exercises the
    // `process.stdout` default; both are the uninjected boundary fallbacks.
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vihs-linkage-'));
    const summaryFile = path.join(tmpDir, 'step-summary.md');
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    try {
      const code = main([], {
        readFile: makeReadFile(FIXTURE_FILES),
        stepSummaryPath: summaryFile
      });
      expect(code).toBe(0);
      expect(fs.readFileSync(summaryFile, 'utf8')).toContain('## Requirement Verification Linkage');
      expect(stdoutSpy.mock.calls.some(([chunk]) => String(chunk).includes('[requirements-linkage]'))).toBe(true);
    } finally {
      stdoutSpy.mockRestore();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('reports VHS-REQ-601 itself as linked on the real repository', () => {
    const repoRoot = path.resolve(__dirname, '..', '..');
    const result = auditRequirementVerificationLinkage(repoRoot);

    expect(result.total).toBeGreaterThan(20);
    expect(result.linked).toContain('VHS-REQ-601');
    expect(result.unlinked.map((entry) => entry.reqId)).not.toContain('VHS-REQ-601');
  });
});

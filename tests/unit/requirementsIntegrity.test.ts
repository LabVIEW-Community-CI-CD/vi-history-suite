import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

const {
  extractSystemRequirementIds,
  checkAnchorResolution,
  checkParentExistence,
  checkInventoryPaths,
  checkReplacementResolution,
  checkRequirementsIntegrity,
  renderStepSummary,
  main
} = require('../../scripts/checkRequirementsIntegrity.js') as {
  extractSystemRequirementIds: (syrsText: string) => Set<string>;
  checkAnchorResolution: (
    idIndexRows: Array<Record<string, string>>,
    srsText: string,
    syrsText: string
  ) => Array<{ subject: string; detail: string }>;
  checkParentExistence: (
    rtmRows: Array<Record<string, string>>,
    systemRequirementIds: Set<string>
  ) => Array<{ subject: string; detail: string }>;
  checkInventoryPaths: (
    inventoryRows: Array<Record<string, string>>,
    cwd: string,
    fileExists: (absolutePath: string) => boolean
  ) => Array<{ subject: string; detail: string }>;
  checkReplacementResolution: (
    idIndexRows: Array<Record<string, string>>
  ) => Array<{ subject: string; detail: string }>;
  checkRequirementsIntegrity: (
    cwd: string,
    deps?: {
      readFile?: (relativePath: string) => string;
      fileExists?: (absolutePath: string) => boolean;
    }
  ) => {
    success: boolean;
    violationCount: number;
    checks: Array<{ key: string; title: string; violations: Array<{ subject: string; detail: string }> }>;
  };
  renderStepSummary: (result: ReturnType<typeof checkRequirementsIntegrity>) => string;
  main: (
    argv?: string[],
    deps?: {
      cwd?: string;
      readFile?: (relativePath: string) => string;
      fileExists?: (absolutePath: string) => boolean;
      stepSummaryPath?: string;
      appendStepSummary?: (filePath: string, content: string) => void;
      stdout?: { write: (chunk: string) => void };
      stderr?: { write: (chunk: string) => void };
    }
  ) => number;
};

const SRS_FIXTURE = '### VHS-REQ-001: Alpha Requirement\n\n### VHS-REQ-002: Beta Requirement\n';
const SYRS_FIXTURE = '### VHS-SYS-REQ-001: System One\n';

function makeFixtureFiles(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    'docs/requirements/srs.md': SRS_FIXTURE,
    'docs/requirements/syrs.md': SYRS_FIXTURE,
    'docs/requirements/rtm.csv':
      'ReqID,ParentID,Status,Area,Title,ImplementationRefs,VerificationRefs,Notes\n' +
      'VHS-REQ-001,VHS-SYS-REQ-001,Active,Area,Alpha Requirement,src/a.ts,tests/a.test.ts,ok\n',
    'docs/requirements/id-index.csv':
      'ID,Kind,Status,CurrentAnchor,ReplacementID,RetirementReason,LegacySource\n' +
      'VHS-REQ-001,Software,Active,srs.md#vhs-req-001-alpha-requirement,,,src\n' +
      'VHS-SYS-REQ-001,System,Active,syrs.md#vhs-sys-req-001-system-one,,,src\n' +
      'VHS-REQ-000,Software,Superseded,,VHS-REQ-001,retired,src\n',
    'docs/requirements/traceability-inventory.csv':
      'Path,Classification,RtmCoverage,Notes\nsrc/a.ts,mapped,Yes,note\n',
    ...overrides
  };
}

function makeReadFile(files: Record<string, string>): (relativePath: string) => string {
  return (relativePath: string) => {
    if (!(relativePath in files)) {
      throw new Error(`unexpected read: ${relativePath}`);
    }
    return files[relativePath];
  };
}

function makeFileExists(cwd: string, existingRelativePaths: string[]): (absolutePath: string) => boolean {
  const existing = new Set(existingRelativePaths.map((p) => path.join(cwd, ...p.split('/'))));
  return (absolutePath: string) => existing.has(absolutePath);
}

describe('requirements cross-reference integrity guard', () => {
  it('extracts Active system requirement IDs from syrs headings', () => {
    const ids = extractSystemRequirementIds('### VHS-SYS-REQ-001: One\n## VHS-SYS-REQ-014: Two\ntext\n');
    expect([...ids].sort()).toEqual(['VHS-SYS-REQ-001', 'VHS-SYS-REQ-014']);
  });

  it('resolves Software anchors against srs.md and System anchors against syrs.md', () => {
    const rows = [
      { ID: 'VHS-REQ-001', Kind: 'Software', Status: 'Active', CurrentAnchor: 'srs.md#vhs-req-001-alpha-requirement' },
      { ID: 'VHS-SYS-REQ-001', Kind: 'System', Status: 'Active', CurrentAnchor: 'syrs.md#vhs-sys-req-001-system-one' },
      { ID: 'VHS-REQ-000', Kind: 'Software', Status: 'Superseded', CurrentAnchor: '' }
    ];
    expect(checkAnchorResolution(rows, SRS_FIXTURE, SYRS_FIXTURE)).toEqual([]);
  });

  it('flags a dangling Software anchor, a wrong-document anchor, and an empty Active anchor', () => {
    const rows = [
      { ID: 'VHS-REQ-002', Kind: 'Software', Status: 'Active', CurrentAnchor: 'srs.md#vhs-req-002-renamed-heading' },
      { ID: 'VHS-SYS-REQ-001', Kind: 'System', Status: 'Active', CurrentAnchor: 'srs.md#vhs-sys-req-001-system-one' },
      { ID: 'VHS-REQ-003', Kind: 'Software', Status: 'Active', CurrentAnchor: '' }
    ];

    const violations = checkAnchorResolution(rows, SRS_FIXTURE, SYRS_FIXTURE);

    expect(violations).toEqual([
      { subject: 'VHS-REQ-002', detail: "CurrentAnchor '#vhs-req-002-renamed-heading' has no matching heading in srs.md" },
      { subject: 'VHS-SYS-REQ-001', detail: "CurrentAnchor target 'srs.md' should be syrs.md" },
      { subject: 'VHS-REQ-003', detail: 'Active row has an empty CurrentAnchor' }
    ]);
  });

  it('flags an RTM ParentID that is not an Active system requirement', () => {
    const systemIds = new Set(['VHS-SYS-REQ-001']);
    const rows = [
      { ReqID: 'VHS-REQ-001', ParentID: 'VHS-SYS-REQ-001' },
      { ReqID: 'VHS-REQ-002', ParentID: 'VHS-SYS-REQ-002' }
    ];

    expect(checkParentExistence(rows, systemIds)).toEqual([
      { subject: 'VHS-REQ-002', detail: "ParentID 'VHS-SYS-REQ-002' is not an Active system requirement in syrs.md" }
    ]);
  });

  it('flags an inventory Path that does not exist on disk', () => {
    const cwd = path.join(path.sep, 'repo');
    const rows = [{ Path: 'src/present.ts' }, { Path: 'src/missing.ts' }, { Path: '' }];

    const violations = checkInventoryPaths(rows, cwd, makeFileExists(cwd, ['src/present.ts']));

    expect(violations).toEqual([
      { subject: 'src/missing.ts', detail: 'inventory Path does not exist on disk' }
    ]);
  });

  it('flags an id-index ReplacementID that is not a defined ID', () => {
    const rows = [
      { ID: 'VHS-REQ-001', ReplacementID: '' },
      { ID: 'VHS-REQ-002', ReplacementID: 'VHS-REQ-001' },
      { ID: 'VHS-REQ-003', ReplacementID: 'VHS-REQ-999' }
    ];

    expect(checkReplacementResolution(rows)).toEqual([
      { subject: 'VHS-REQ-003', detail: "ReplacementID 'VHS-REQ-999' is not a defined id-index ID" }
    ]);
  });

  it('passes when every cross-reference resolves', () => {
    const cwd = path.join(path.sep, 'repo');
    const result = checkRequirementsIntegrity(cwd, {
      readFile: makeReadFile(makeFixtureFiles()),
      fileExists: makeFileExists(cwd, ['src/a.ts'])
    });

    expect(result.violationCount).toBe(0);
    expect(result.success).toBe(true);
  });

  it('renders the runtime contract and violation table for the step summary', () => {
    const cwd = path.join(path.sep, 'repo');
    const files = makeFixtureFiles({
      'docs/requirements/id-index.csv':
        'ID,Kind,Status,CurrentAnchor,ReplacementID,RetirementReason,LegacySource\n' +
        'VHS-REQ-001,Software,Active,srs.md#vhs-req-001-wrong-slug,,,src\n'
    });
    const result = checkRequirementsIntegrity(cwd, {
      readFile: makeReadFile(files),
      fileExists: makeFileExists(cwd, ['src/a.ts'])
    });

    const markdown = renderStepSummary(result);

    expect(markdown).toContain('## Requirements Cross-Reference Integrity');
    expect(markdown).toContain('cross-reference each other consistently');
    expect(markdown).toContain('### Violations');
    expect(markdown).toContain('| anchorResolution | `VHS-REQ-001` |');
  });

  it('main writes the step summary, reports failure on stderr, and returns 1 when a reference is broken', () => {
    const cwd = path.join(path.sep, 'repo');
    const files = makeFixtureFiles({
      'docs/requirements/traceability-inventory.csv':
        'Path,Classification,RtmCoverage,Notes\nsrc/missing.ts,mapped,Yes,note\n'
    });
    const summaryChunks: string[] = [];
    const stderrChunks: string[] = [];
    const stdoutChunks: string[] = [];

    const code = main([], {
      cwd,
      readFile: makeReadFile(files),
      fileExists: makeFileExists(cwd, ['src/a.ts']),
      stepSummaryPath: path.join(cwd, 'summary.md'),
      appendStepSummary: (_filePath, content) => summaryChunks.push(content),
      stdout: { write: (chunk) => stdoutChunks.push(chunk) },
      stderr: { write: (chunk) => stderrChunks.push(chunk) }
    });

    expect(code).toBe(1);
    expect(summaryChunks.join('')).toContain('## Requirements Cross-Reference Integrity');
    expect(stderrChunks.join('')).toContain('Cross-reference integrity check failed');
    expect(stdoutChunks.join('')).toBe('');
  });

  it('main returns 0 and reports success on stdout when every reference resolves', () => {
    const cwd = path.join(path.sep, 'repo');
    const stdoutChunks: string[] = [];

    const code = main([], {
      cwd,
      readFile: makeReadFile(makeFixtureFiles()),
      fileExists: makeFileExists(cwd, ['src/a.ts']),
      stdout: { write: (chunk) => stdoutChunks.push(chunk) }
    });

    expect(code).toBe(0);
    expect(stdoutChunks.join('')).toContain('Cross-reference integrity check passed.');
  });
});

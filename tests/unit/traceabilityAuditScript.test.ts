import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';

const repoRoot = path.resolve(__dirname, '..', '..');

// Import the audit script functions
// eslint-disable-next-line @typescript-eslint/no-var-requires
const auditScript = require('../../scripts/auditTraceabilitySteward.js');

const {
  VALID_CLASSIFICATIONS,
  RETIRED_CLASSIFICATIONS,
  IMPLEMENTATION_GLOBS,
  TEST_GLOBS,
  TRACEABILITY_SURFACE_GLOBS,
  GENERATED_TRACEABILITY_SURFACE_FILES,
  parseCsv,
  splitReferences,
  extractRtmPaths,
  globToRegex,
  findMatchingFiles,
  loadInventory,
  loadRtm,
  auditTraceability
} = auditScript;

function readRepoText(...segments: string[]): string {
  return fs
    .readFileSync(path.join(repoRoot, ...segments), 'utf8')
    .replace(/\r\n/g, '\n');
}

function createAuditFixture(options: {
  files: string[];
  inventoryRows: Array<{ Path: string; Classification: string; RtmCoverage: string; Notes: string }>;
  rtmRows: Array<{
    ReqID: string;
    ParentID: string;
    Status: string;
    Area: string;
    Title: string;
    ImplementationRefs: string;
    VerificationRefs: string;
    Notes: string;
  }>;
}): string {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'traceability-audit-'));

  for (const file of options.files) {
    const filePath = path.join(fixtureRoot, file);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, '// fixture\n', 'utf8');
  }

  const requirementsDir = path.join(fixtureRoot, 'docs', 'requirements');
  fs.mkdirSync(requirementsDir, { recursive: true });

  const inventoryLines = [
    'Path,Classification,RtmCoverage,Notes',
    ...options.inventoryRows.map((row) => `${row.Path},${row.Classification},${row.RtmCoverage},${row.Notes}`)
  ];
  fs.writeFileSync(path.join(requirementsDir, 'traceability-inventory.csv'), `${inventoryLines.join('\n')}\n`, 'utf8');

  const rtmLines = [
    'ReqID,ParentID,Status,Area,Title,ImplementationRefs,VerificationRefs,Notes',
    ...options.rtmRows.map((row) =>
      `${row.ReqID},${row.ParentID},${row.Status},${row.Area},${row.Title},${row.ImplementationRefs},${row.VerificationRefs},${row.Notes}`
    )
  ];
  fs.writeFileSync(path.join(requirementsDir, 'rtm.csv'), `${rtmLines.join('\n')}\n`, 'utf8');

  return fixtureRoot;
}

describe('traceability audit script', () => {
  it('exports valid classification constants (VHS-REQ-601.19)', () => {
    expect(VALID_CLASSIFICATIONS).toContain('mapped');
    expect(VALID_CLASSIFICATIONS).toContain('supporting');
    expect(VALID_CLASSIFICATIONS).toContain('dev-only');
    expect(VALID_CLASSIFICATIONS).toContain('release-ci');
    expect(VALID_CLASSIFICATIONS).toContain('asset-doc');
    expect(VALID_CLASSIFICATIONS).toContain('gap');
    expect(VALID_CLASSIFICATIONS.length).toBe(6);
  });

  it('defines implementation and test glob patterns', () => {
    expect(IMPLEMENTATION_GLOBS).toContain('src/**/*.ts');
    expect(IMPLEMENTATION_GLOBS).toContain('scripts/*.js');
    expect(TEST_GLOBS).toContain('tests/unit/*.ts');
    expect(TEST_GLOBS).toContain('tests/integration/**/*.ts');
    expect(TRACEABILITY_SURFACE_GLOBS).toContain('docs/architecture/**/*.md');
    expect(TRACEABILITY_SURFACE_GLOBS).toContain('docs/requirements/*.md');
    expect(TRACEABILITY_SURFACE_GLOBS).toContain('.github/workflows/*.yml');
    expect(TRACEABILITY_SURFACE_GLOBS).toContain('resources/bundled-docs/**');
    expect(TRACEABILITY_SURFACE_GLOBS).toContain('.devcontainer/**');
    expect(TRACEABILITY_SURFACE_GLOBS).toContain('.vscode/*.json');
    expect(GENERATED_TRACEABILITY_SURFACE_FILES.has('.devcontainer/devcontainer-lock.json')).toBe(true);
  });

  it('parses CSV with quoted fields and semicolons', () => {
    const csv = `Path,Classification,Notes
src/file.ts,mapped,"Note with; semicolon"
src/other.ts,gap,Simple note`;
    const rows = parseCsv(csv);
    expect(rows.length).toBe(2);
    expect(rows[0].Path).toBe('src/file.ts');
    expect(rows[0].Classification).toBe('mapped');
    expect(rows[0].Notes).toBe('Note with; semicolon');
    expect(rows[1].Path).toBe('src/other.ts');
  });

  it('parses CSV with escaped doubled quotes inside a quoted field', () => {
    const rows = parseCsv('Path,Notes\nsrc/a.ts,"He said ""hi"" today"\n');
    expect(rows).toHaveLength(1);
    expect(rows[0].Notes).toBe('He said "hi" today');
  });

  it('parses CSV with CRLF line endings', () => {
    const rows = parseCsv('Path,Classification\r\nsrc/a.ts,mapped\r\nsrc/b.ts,gap\r\n');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ Path: 'src/a.ts', Classification: 'mapped' });
    expect(rows[1]).toMatchObject({ Path: 'src/b.ts', Classification: 'gap' });
  });

  it('returns an empty inventory when the inventory file is absent', () => {
    const missingPath = path.join(os.tmpdir(), 'vihs-missing-traceability-inventory-does-not-exist.csv');
    const inventory = loadInventory(missingPath);
    expect(inventory.rows).toEqual([]);
    expect(inventory.byPath.size).toBe(0);
  });

  it('splits references on semicolons', () => {
    expect(splitReferences('src/a.ts;src/b.ts')).toEqual(['src/a.ts', 'src/b.ts']);
    expect(splitReferences('single.ts')).toEqual(['single.ts']);
    expect(splitReferences('')).toEqual([]);
    expect(splitReferences('  a.ts ; b.ts  ')).toEqual(['a.ts', 'b.ts']);
  });

  it('converts glob patterns to regex', () => {
    expect(globToRegex('src/**/*.ts').test('src/domain/file.ts')).toBe(true);
    expect(globToRegex('src/**/*.ts').test('src/deep/nested/file.ts')).toBe(true);
    expect(globToRegex('scripts/*.js').test('scripts/audit.js')).toBe(true);
    expect(globToRegex('scripts/*.js').test('scripts/nested/audit.js')).toBe(false);
  });

  it('extracts RTM paths from implementation and verification refs', () => {
    const rtmRows = [
      {
        ReqID: 'VHS-REQ-001',
        ImplementationRefs: 'src/file.ts;src/other.ts',
        VerificationRefs: 'tests/unit/file.test.ts;manual:check'
      }
    ];
    const paths = extractRtmPaths(rtmRows);
    expect(paths.has('src/file.ts')).toBe(true);
    expect(paths.has('src/other.ts')).toBe(true);
    expect(paths.has('tests/unit/file.test.ts')).toBe(true);
    expect(paths.has('manual:check')).toBe(false);
  });
});

describe('traceability inventory coherence', () => {
  it('loads the committed traceability inventory', () => {
    const inventoryPath = path.join(repoRoot, 'docs', 'requirements', 'traceability-inventory.csv');
    expect(fs.existsSync(inventoryPath)).toBe(true);

    const inventory = loadInventory(inventoryPath);
    expect(inventory.rows.length).toBeGreaterThan(50);
  });

  it('uses only valid classifications in the inventory', () => {
    const inventoryPath = path.join(repoRoot, 'docs', 'requirements', 'traceability-inventory.csv');
    const inventory = loadInventory(inventoryPath);

    for (const row of inventory.rows) {
      expect(
        VALID_CLASSIFICATIONS.includes(row.Classification),
        `Invalid classification '${row.Classification}' for ${row.Path}`
      ).toBe(true);
    }
  });

  it('has required columns in the inventory CSV', () => {
    const inventoryText = readRepoText('docs', 'requirements', 'traceability-inventory.csv');
    const firstLine = inventoryText.split('\n')[0];
    expect(firstLine).toContain('Path');
    expect(firstLine).toContain('Classification');
    expect(firstLine).toContain('RtmCoverage');
    expect(firstLine).toContain('Notes');
  });

  it('has unique paths in the inventory', () => {
    const inventoryPath = path.join(repoRoot, 'docs', 'requirements', 'traceability-inventory.csv');
    const inventory = loadInventory(inventoryPath);
    const paths = inventory.rows.map((row) => row.Path);
    const uniquePaths = new Set(paths);
    expect(paths.length).toBe(uniquePaths.size);
  });

  it('marks mapped files correctly against RTM', () => {
    const inventoryPath = path.join(repoRoot, 'docs', 'requirements', 'traceability-inventory.csv');
    const rtmPath = path.join(repoRoot, 'docs', 'requirements', 'rtm.csv');

    const inventory = loadInventory(inventoryPath);
    const rtmRows = loadRtm(rtmPath);
    const rtmPaths = extractRtmPaths(rtmRows);

    const mappedRows = inventory.rows.filter((row) => row.Classification === 'mapped');
    for (const row of mappedRows) {
      expect(
        rtmPaths.has(row.Path),
        `Mapped file ${row.Path} is not in RTM`
      ).toBe(true);
    }
  });
});

describe('traceability audit execution', () => {
  let capturedStdout: string;
  let capturedStderr: string;
  const fixtureRoots: string[] = [];

  const mockStdout = {
    write: (text: string) => {
      capturedStdout += text;
    }
  };

  const mockStderr = {
    write: (text: string) => {
      capturedStderr += text;
    }
  };

  beforeEach(() => {
    capturedStdout = '';
    capturedStderr = '';
  });

  afterEach(() => {
    for (const fixtureRoot of fixtureRoots.splice(0)) {
      fs.rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });

  it('runs successfully against the repository baseline', () => {
    const result = auditTraceability({
      cwd: repoRoot,
      stdout: mockStdout,
      stderr: mockStderr
    });

    expect(result.success).toBe(true);
    expect(result.findings.missingInventoryFile).toBe(false);
    expect(result.findings.missingRtmFile).toBe(false);
    expect(result.findings.invalidClassifications.length).toBe(0);
    expect(result.findings.missingInventoryEntries.length).toBe(0);
    expect(result.findings.missingRtmReferences.length).toBe(0);
    expect(result.findings.rtmCoverageMismatches.length).toBe(0);
    expect(result.findings.gapEntriesPresentInRtm.length).toBe(0);
  });

  it('fails closed when the inventory file is missing', () => {
    const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'traceability-audit-'));
    fixtureRoots.push(fixtureRoot);

    const result = auditTraceability({
      cwd: fixtureRoot,
      stdout: mockStdout,
      stderr: mockStderr
    });

    expect(result.success).toBe(false);
    expect(result.findings.missingInventoryFile).toBe(true);
    expect(capturedStderr).toContain('Missing inventory file');
  });

  it('fails closed when the RTM file is missing but the inventory exists', () => {
    const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'traceability-audit-'));
    fixtureRoots.push(fixtureRoot);
    const requirementsDir = path.join(fixtureRoot, 'docs', 'requirements');
    fs.mkdirSync(requirementsDir, { recursive: true });
    fs.writeFileSync(
      path.join(requirementsDir, 'traceability-inventory.csv'),
      'Path,Classification,RtmCoverage,Notes\n',
      'utf8'
    );

    const result = auditTraceability({
      cwd: fixtureRoot,
      stdout: mockStdout,
      stderr: mockStderr
    });

    expect(result.success).toBe(false);
    expect(result.findings.missingInventoryFile).toBe(false);
    expect(result.findings.missingRtmFile).toBe(true);
    expect(capturedStderr).toContain('Missing RTM file');
  });

  it('flags invalid classifications and unmapped implementation/test candidates', () => {
    const fixtureRoot = createAuditFixture({
      files: ['src/bad.ts', 'src/nested/orphan.ts', 'tests/unit/orphan.ts'],
      inventoryRows: [
        { Path: 'src/bad.ts', Classification: 'bogus', RtmCoverage: 'No', Notes: 'invalid classification value' },
        { Path: 'docs/requirements/traceability-inventory.csv', Classification: 'supporting', RtmCoverage: 'No', Notes: 'fixture inventory' },
        { Path: 'docs/requirements/rtm.csv', Classification: 'supporting', RtmCoverage: 'No', Notes: 'fixture rtm' }
      ],
      rtmRows: []
    });
    fixtureRoots.push(fixtureRoot);

    const result = auditTraceability({
      cwd: fixtureRoot,
      stdout: mockStdout,
      stderr: mockStderr
    });

    expect(result.success).toBe(false);
    expect(result.findings.invalidClassifications).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'src/bad.ts', classification: 'bogus' })
      ])
    );
    expect(result.findings.unmappedImplementationCandidates).toContain('src/nested/orphan.ts');
    expect(result.findings.unmappedTestCandidates).toContain('tests/unit/orphan.ts');
    expect(capturedStderr).toContain('Invalid classifications');
    expect(capturedStdout).toContain('Unmapped implementation candidates');
    expect(capturedStdout).toContain('Unmapped test candidates');
  });

  it('reports gap count as informational', () => {
    const result = auditTraceability({
      cwd: repoRoot,
      stdout: mockStdout,
      stderr: mockStderr
    });

    expect(result.findings.gapCount).toBeGreaterThanOrEqual(0);
    expect(result.findings.gapEntriesPresentInRtm.length).toBe(0);
    expect(capturedStdout).toContain('Gap entries pending classification');
  });

  it('reports total inventory entries', () => {
    const result = auditTraceability({
      cwd: repoRoot,
      stdout: mockStdout,
      stderr: mockStderr
    });

    expect(result.findings.totalInventoryEntries).toBeGreaterThan(100);
    expect(capturedStdout).toContain('Total inventory entries');
  });

  it('fails when inventory RtmCoverage disagrees with RTM membership', () => {
    const fixtureRoot = createAuditFixture({
      files: [
        'src/mapped.ts',
        'docs/requirements/README.md'
      ],
      inventoryRows: [
        { Path: 'src/mapped.ts', Classification: 'mapped', RtmCoverage: 'Yes', Notes: 'mapped file should be in RTM' },
        { Path: 'docs/requirements/README.md', Classification: 'asset-doc', RtmCoverage: 'No', Notes: 'not expected in RTM' },
        { Path: 'docs/requirements/traceability-inventory.csv', Classification: 'supporting', RtmCoverage: 'No', Notes: 'fixture inventory' },
        { Path: 'docs/requirements/rtm.csv', Classification: 'supporting', RtmCoverage: 'No', Notes: 'fixture rtm' }
      ],
      rtmRows: [
        {
          ReqID: 'VHS-REQ-TEST-1',
          ParentID: 'VHS-SYS-REQ-TEST-1',
          Status: 'Active',
          Area: 'Requirements',
          Title: 'Fixture row',
          ImplementationRefs: 'docs/requirements/README.md',
          VerificationRefs: '',
          Notes: 'fixture'
        }
      ]
    });
    fixtureRoots.push(fixtureRoot);

    const result = auditTraceability({
      cwd: fixtureRoot,
      stdout: mockStdout,
      stderr: mockStderr
    });

    expect(result.success).toBe(false);
    expect(result.findings.rtmCoverageMismatches).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'src/mapped.ts', rtmCoverage: 'Yes', inRtm: false }),
        expect.objectContaining({ path: 'docs/requirements/README.md', rtmCoverage: 'No', inRtm: true })
      ])
    );
    expect(capturedStderr).toContain('Inventory RtmCoverage mismatches');
  });

  it('fails when gap entries are already represented in RTM', () => {
    const fixtureRoot = createAuditFixture({
      files: ['src/pending.ts'],
      inventoryRows: [
        { Path: 'src/pending.ts', Classification: 'gap', RtmCoverage: 'No', Notes: 'pending requirement mapping' },
        { Path: 'docs/requirements/traceability-inventory.csv', Classification: 'supporting', RtmCoverage: 'No', Notes: 'fixture inventory' },
        { Path: 'docs/requirements/rtm.csv', Classification: 'supporting', RtmCoverage: 'No', Notes: 'fixture rtm' }
      ],
      rtmRows: [
        {
          ReqID: 'VHS-REQ-TEST-2',
          ParentID: 'VHS-SYS-REQ-TEST-2',
          Status: 'Active',
          Area: 'Requirements',
          Title: 'Fixture row',
          ImplementationRefs: 'src/pending.ts',
          VerificationRefs: '',
          Notes: 'fixture'
        }
      ]
    });
    fixtureRoots.push(fixtureRoot);

    const result = auditTraceability({
      cwd: fixtureRoot,
      stdout: mockStdout,
      stderr: mockStderr
    });

    expect(result.success).toBe(false);
    expect(result.findings.gapEntriesPresentInRtm).toEqual(['src/pending.ts']);
    expect(capturedStderr).toContain('Gap entries already represented in RTM');
  });

  it('keeps genuine gap entries informational when they are not in RTM (VHS-REQ-601.21)', () => {
    const fixtureRoot = createAuditFixture({
      files: ['src/pending.ts'],
      inventoryRows: [
        { Path: 'src/pending.ts', Classification: 'gap', RtmCoverage: 'No', Notes: 'pending requirement mapping' },
        { Path: 'docs/requirements/traceability-inventory.csv', Classification: 'supporting', RtmCoverage: 'No', Notes: 'fixture inventory' },
        { Path: 'docs/requirements/rtm.csv', Classification: 'supporting', RtmCoverage: 'No', Notes: 'fixture rtm' }
      ],
      rtmRows: []
    });
    fixtureRoots.push(fixtureRoot);

    const result = auditTraceability({
      cwd: fixtureRoot,
      stdout: mockStdout,
      stderr: mockStderr
    });

    expect(result.success).toBe(true);
    expect(result.findings.gapCount).toBe(1);
    expect(result.findings.gapEntriesPresentInRtm.length).toBe(0);
    expect(capturedStdout).toContain('Gap entries pending classification');
  });

  it('fails closed when an inventory row still carries the retired dev-only classification (VHS-REQ-701.1)', () => {
    const fixtureRoot = createAuditFixture({
      files: ['scripts/helper.js'],
      inventoryRows: [
        { Path: 'scripts/helper.js', Classification: 'dev-only', RtmCoverage: 'No', Notes: 'unmapped maintainer helper' },
        { Path: 'docs/requirements/traceability-inventory.csv', Classification: 'supporting', RtmCoverage: 'No', Notes: 'fixture inventory' },
        { Path: 'docs/requirements/rtm.csv', Classification: 'supporting', RtmCoverage: 'No', Notes: 'fixture rtm' }
      ],
      rtmRows: []
    });
    fixtureRoots.push(fixtureRoot);

    const result = auditTraceability({
      cwd: fixtureRoot,
      stdout: mockStdout,
      stderr: mockStderr
    });

    expect(result.success).toBe(false);
    expect(result.findings.retiredClassifications).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'scripts/helper.js', classification: 'dev-only' })
      ])
    );
    expect(capturedStderr).toContain('Retired classifications (fail closed)');
  });

  it('exposes dev-only as retired so it fails closed while staying parseable (VHS-REQ-701.2)', () => {
    expect([...RETIRED_CLASSIFICATIONS]).toContain('dev-only');
    // Retired classifications remain in the known set so an accidental use is
    // reported precisely rather than as an opaque invalid classification.
    expect(VALID_CLASSIFICATIONS).toContain('dev-only');
  });

  it('flags missing inventory entries across expanded traceability surface (VHS-REQ-601.20, VHS-REQ-601.22)', () => {
    const fixtureRoot = createAuditFixture({
      files: [
        'docs/architecture/overview.md',
        'docs/architecture/adr/ADR-0001.md',
        'docs/requirements/README.md',
        '.github/workflows/ci.yml',
        '.github/ISSUE_TEMPLATE/bug_report.yml',
        'resources/bundled-docs/manifest.json',
        'package.json',
        'vagrant/Vagrantfile',
        '.devcontainer/devcontainer.json',
        '.devcontainer/devcontainer-lock.json',
        '.vscode/tasks.json',
        'README.md'
      ],
      inventoryRows: [
        { Path: 'docs/requirements/traceability-inventory.csv', Classification: 'supporting', RtmCoverage: 'No', Notes: 'fixture inventory' },
        { Path: 'docs/requirements/rtm.csv', Classification: 'supporting', RtmCoverage: 'No', Notes: 'fixture rtm' }
      ],
      rtmRows: []
    });
    fixtureRoots.push(fixtureRoot);

    const result = auditTraceability({
      cwd: fixtureRoot,
      stdout: mockStdout,
      stderr: mockStderr
    });

    expect(result.success).toBe(false);
    expect(result.findings.missingInventoryEntries).toEqual(
      expect.arrayContaining([
        'docs/architecture/overview.md',
        'docs/architecture/adr/ADR-0001.md',
        'docs/requirements/README.md',
        '.github/workflows/ci.yml',
        '.github/ISSUE_TEMPLATE/bug_report.yml',
        'resources/bundled-docs/manifest.json',
        'package.json',
        'vagrant/Vagrantfile',
        '.devcontainer/devcontainer.json',
        '.vscode/tasks.json',
        'README.md'
      ])
    );
    expect(result.findings.missingInventoryEntries).not.toContain('.devcontainer/devcontainer-lock.json');
  });
});

describe('traceability policy documentation', () => {
  it('documents the traceability inventory in requirements README', () => {
    const readme = readRepoText('docs', 'requirements', 'README.md');
    expect(readme).toContain('traceability-inventory.csv');
    expect(readme).toContain('traceability:audit');
  });

  it('documents agent response for unmapped code (VHS-REQ-601.23)', () => {
    const readme = readRepoText('docs', 'requirements', 'README.md');
    expect(readme.toLowerCase()).toContain('unmapped');
    expect(readme).toContain('gap');
  });

  it('defines classification categories', () => {
    const readme = readRepoText('docs', 'requirements', 'README.md');
    expect(readme).toContain('mapped');
    expect(readme).toContain('supporting');
    expect(readme).toContain('dev-only');
    expect(readme).toContain('release-ci');
    expect(readme).toContain('asset-doc');
  });
});

describe('traceability audit residual branch coverage (#2333)', () => {
  const roots: string[] = [];
  const sink = { write: () => undefined };

  afterEach(() => {
    for (const root of roots.splice(0)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('parseCsv drops an all-empty row while keeping rows with content', () => {
    // The blank middle line produces a row whose only cell is empty, so the
    // `currentRow.some(cell => cell.length > 0)` guard takes its false arm.
    const rows = parseCsv('Path,Classification\nsrc/a.ts,mapped\n\nsrc/b.ts,gap\n');
    expect(rows.map((row: { Path: string }) => row.Path)).toEqual(['src/a.ts', 'src/b.ts']);
  });

  it('extractRtmPaths ignores a reference that cleans down to an empty path', () => {
    // '#anchor' has no path segment before the fragment, so cleanReference is ''
    // and the `cleanReference.length > 0` guard takes its false arm.
    const paths = extractRtmPaths([{ ImplementationRefs: '#anchor', VerificationRefs: '' }]);
    expect(paths.size).toBe(0);
  });

  it('records a gap-classified entry that is already represented in the RTM', () => {
    const root = createAuditFixture({
      files: ['src/gap-tracked.ts'],
      inventoryRows: [{ Path: 'src/gap-tracked.ts', Classification: 'gap', RtmCoverage: 'Yes', Notes: 'gap already in rtm' }],
      rtmRows: [
        {
          ReqID: 'VHS-REQ-1',
          ParentID: '',
          Status: '',
          Area: '',
          Title: '',
          ImplementationRefs: 'src/gap-tracked.ts',
          VerificationRefs: '',
          Notes: ''
        }
      ]
    });
    roots.push(root);
    const result = auditTraceability({ cwd: root, stdout: sink, stderr: sink });
    // The gap entry IS in the RTM -> the `if (isInRtm)` true arm records it and
    // the audit fails closed.
    expect(result.findings.gapEntriesPresentInRtm).toContain('src/gap-tracked.ts');
    expect(result.success).toBe(false);
  });

  it('does not flag an implementation file absent from inventory but present in the RTM', () => {
    const root = createAuditFixture({
      files: ['src/rtm-only-impl.ts'],
      inventoryRows: [],
      rtmRows: [
        {
          ReqID: 'VHS-REQ-2',
          ParentID: '',
          Status: '',
          Area: '',
          Title: '',
          ImplementationRefs: 'src/rtm-only-impl.ts',
          VerificationRefs: '',
          Notes: ''
        }
      ]
    });
    roots.push(root);
    const result = auditTraceability({ cwd: root, stdout: sink, stderr: sink });
    // Not in inventory but in the RTM -> the `!rtmPaths.has(file)` guard takes its
    // false arm, so it is not reported as an unmapped implementation candidate.
    expect(result.findings.unmappedImplementationCandidates).not.toContain('src/rtm-only-impl.ts');
  });

  it('does not flag a test file absent from inventory but present in the RTM', () => {
    const root = createAuditFixture({
      files: ['tests/unit/rtm-only.test.ts'],
      inventoryRows: [],
      rtmRows: [
        {
          ReqID: 'VHS-REQ-3',
          ParentID: '',
          Status: '',
          Area: '',
          Title: '',
          ImplementationRefs: '',
          VerificationRefs: 'tests/unit/rtm-only.test.ts',
          Notes: ''
        }
      ]
    });
    roots.push(root);
    const result = auditTraceability({ cwd: root, stdout: sink, stderr: sink });
    expect(result.findings.unmappedTestCandidates).not.toContain('tests/unit/rtm-only.test.ts');
  });

  it('falls back to process.stdout/process.stderr when streams are not injected', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'traceability-nostreams-'));
    roots.push(root);
    const outSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const errSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      // cwd is injected (so the repoRoot fallback is not taken) but stdout/stderr
      // are omitted -> their `?? process.*` fallback arms resolve, and the
      // missing-inventory message is written to the real process.stderr.
      const result = auditTraceability({ cwd: root });
      expect(result.success).toBe(false);
      expect(result.findings.missingInventoryFile).toBe(true);
      expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('Missing inventory file'));
    } finally {
      outSpy.mockRestore();
      errSpy.mockRestore();
    }
  });
});

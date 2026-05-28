import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { describe, expect, it, beforeEach, afterEach } from 'vitest';

const repoRoot = path.resolve(__dirname, '..', '..');

// Import the audit script functions
// eslint-disable-next-line @typescript-eslint/no-var-requires
const auditScript = require('../../scripts/auditTraceabilitySteward.js');

const {
  VALID_CLASSIFICATIONS,
  IMPLEMENTATION_GLOBS,
  TEST_GLOBS,
  TRACEABILITY_SURFACE_GLOBS,
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
  it('exports valid classification constants', () => {
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
    expect(TRACEABILITY_SURFACE_GLOBS).toContain('docs/requirements/*.md');
    expect(TRACEABILITY_SURFACE_GLOBS).toContain('.github/workflows/*.yml');
    expect(TRACEABILITY_SURFACE_GLOBS).toContain('resources/bundled-docs/**');
    expect(TRACEABILITY_SURFACE_GLOBS).toContain('.devcontainer/**');
    expect(TRACEABILITY_SURFACE_GLOBS).toContain('.vscode/*.json');
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

  it('reports gap count as informational', () => {
    const result = auditTraceability({
      cwd: repoRoot,
      stdout: mockStdout,
      stderr: mockStderr
    });

    expect(result.findings.gapCount).toBeGreaterThan(0);
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

  it('keeps genuine gap entries informational when they are not in RTM', () => {
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

  it('flags missing inventory entries across expanded traceability surface', () => {
    const fixtureRoot = createAuditFixture({
      files: [
        'docs/requirements/README.md',
        '.github/workflows/ci.yml',
        '.github/ISSUE_TEMPLATE/bug_report.yml',
        'resources/bundled-docs/manifest.json',
        'package.json',
        'vagrant/Vagrantfile',
        '.devcontainer/devcontainer.json',
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
  });
});

describe('traceability policy documentation', () => {
  it('documents the traceability inventory in requirements README', () => {
    const readme = readRepoText('docs', 'requirements', 'README.md');
    expect(readme).toContain('traceability-inventory.csv');
    expect(readme).toContain('traceability:audit');
  });

  it('documents agent response for unmapped code', () => {
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

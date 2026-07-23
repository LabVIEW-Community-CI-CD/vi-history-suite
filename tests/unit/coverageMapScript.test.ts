import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

type CoverageMap = {
  $schema?: string;
  schemaVersion?: number;
  riskThreshold: number;
  files: Array<{
    path: string;
    classification: string;
    requirementIds: string[];
    lines: { pct: number; missing: number; covered: number };
    branches: { pct: number; missing: number };
    functions: { pct: number; missing: number };
  }>;
  mappedBelowThreshold: Array<{ path: string; requirementIds: string[] }>;
  zeroCoverageSupportingRequirements: Array<{ path: string; requirementIds: string[] }>;
  byRequirement: Array<{
    reqId: string;
    missingLines: number;
    missingBranches: number;
    missingFunctions: number;
  }>;
  byClassification: Array<{ classification: string; fileCount: number }>;
};

const {
  generateCoverageMap,
  parseArgs,
  renderCoverageMapMarkdown,
  renderSchema,
  summarizeEnforcement,
  main,
  isBelowThreshold,
  isBranchMeasurementExempt,
  BRANCH_MEASUREMENT_LIMITED_FILES,
  COVERAGE_MAP_SCHEMA_ID
} = require('../../scripts/mapCoverageToTraceability.js') as {
  parseArgs: (argv: string[]) => {
    coverageSummary: string;
    inventory: string;
    rtm: string;
    riskThreshold: number;
    json: boolean;
    schema: boolean;
    includeProvenance: boolean;
    enforce: boolean;
    repoRoot?: string;
  };
  generateCoverageMap: (options: {
    repoRoot: string;
    coverageSummary?: string;
    inventory?: string;
    rtm?: string;
    riskThreshold?: number;
  }) => CoverageMap;
  renderCoverageMapMarkdown: (map: CoverageMap) => string;
  renderSchema: (options?: { provenance?: unknown }) => string;
  COVERAGE_MAP_SCHEMA_ID: string;
  summarizeEnforcement: (map: CoverageMap) => {
    mappedBelow: number;
    zeroCoverageSupporting: number;
    violations: number;
  };
  main: (argv?: string[]) => number;
  isBelowThreshold: (
    file: {
      path: string;
      lines: { pct: number };
      statements: { pct: number };
      branches: { pct: number };
      functions: { pct: number };
    },
    threshold: number
  ) => boolean;
  isBranchMeasurementExempt: (file: {
    path: string;
    lines: { pct: number };
    statements: { pct: number };
    functions: { pct: number };
  }) => boolean;
  BRANCH_MEASUREMENT_LIMITED_FILES: Set<string>;
};

const { parseCsv } = require('../../scripts/mapCoverageToTraceability.js') as {
  parseCsv: (text: string) => Array<Record<string, string>>;
};

function metric(total: number, covered: number) {
  return {
    total,
    covered,
    skipped: 0,
    pct: total === 0 ? 100 : Number(((covered / total) * 100).toFixed(2))
  };
}

function fileCoverage(
  linesTotal: number,
  linesCovered: number,
  branchesCovered = linesCovered > 0 ? 1 : 0,
  functionsCovered = linesCovered > 0 ? 2 : 0
) {
  return {
    lines: metric(linesTotal, linesCovered),
    statements: metric(linesTotal, linesCovered),
    branches: metric(4, branchesCovered),
    functions: metric(5, functionsCovered)
  };
}

function writeFixture() {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vihs-coverage-map-'));
  fs.mkdirSync(path.join(repoRoot, 'coverage'), { recursive: true });
  fs.mkdirSync(path.join(repoRoot, 'docs', 'requirements'), { recursive: true });
  fs.mkdirSync(path.join(repoRoot, 'src'), { recursive: true });

  const lowMappedPath = path.join(repoRoot, 'src', 'lowMapped.ts');
  const coveredMappedPath = path.join(repoRoot, 'src', 'coveredMapped.ts');
  const supportingPath = path.join(repoRoot, 'src', 'supportingRisk.ts');
  fs.writeFileSync(lowMappedPath, 'export const low = true;\n', 'utf8');
  fs.writeFileSync(coveredMappedPath, 'export const covered = true;\n', 'utf8');
  fs.writeFileSync(supportingPath, 'export const support = true;\n', 'utf8');

  fs.writeFileSync(
    path.join(repoRoot, 'coverage', 'coverage-summary.json'),
    JSON.stringify(
      {
        total: {
          lines: metric(30, 14),
          statements: metric(30, 14),
          branches: metric(12, 3),
          functions: metric(15, 6)
        },
        [lowMappedPath]: fileCoverage(10, 4),
        [coveredMappedPath]: fileCoverage(10, 10, 4, 5),
        [supportingPath]: fileCoverage(10, 0)
      },
      null,
      2
    ),
    'utf8'
  );
  fs.writeFileSync(
    path.join(repoRoot, 'docs', 'requirements', 'traceability-inventory.csv'),
    [
      'Path,Classification,RtmCoverage,Notes',
      'src/lowMapped.ts,mapped,Yes,Primary low-coverage mapped implementation.',
      'src/coveredMapped.ts,mapped,Yes,Well-covered mapped implementation.',
      'src/supportingRisk.ts,supporting,No,Supports VHS-REQ-610 dashboard review evidence.'
    ].join('\n'),
    'utf8'
  );
  fs.writeFileSync(
    path.join(repoRoot, 'docs', 'requirements', 'rtm.csv'),
    [
      'ReqID,ParentID,Status,Area,Title,ImplementationRefs,VerificationRefs,Notes',
      'VHS-REQ-613,VHS-SYS-REQ-017,Active,CI And Developer Environment,Coverage Intelligence,src/lowMapped.ts;src/coveredMapped.ts,tests/unit/coverageMapScript.test.ts,Maps coverage to traceability.'
    ].join('\n'),
    'utf8'
  );

  return repoRoot;
}

describe('coverage traceability map script', () => {
  it('parses coverage map arguments with safe defaults and threshold overrides', () => {
    const options = parseArgs(['--risk-threshold', '60', '--json']);

    expect(options.coverageSummary).toBe(path.join('coverage', 'coverage-summary.json'));
    expect(options.inventory).toBe(path.join('docs', 'requirements', 'traceability-inventory.csv'));
    expect(options.rtm).toBe(path.join('docs', 'requirements', 'rtm.csv'));
    expect(options.riskThreshold).toBe(60);
    expect(options.json).toBe(true);
  });

  it('joins coverage, inventory, and RTM records into requirement risk facts (VHS-REQ-613.1, VHS-REQ-613.2, VHS-REQ-613.3)', () => {
    const repoRoot = writeFixture();

    const map = generateCoverageMap({ repoRoot, riskThreshold: 50 });
    const requirementRisk = map.byRequirement.find((entry) => entry.reqId === 'VHS-REQ-613');

    expect(map.files.map((file) => file.path)).toEqual([
      'src/coveredMapped.ts',
      'src/lowMapped.ts',
      'src/supportingRisk.ts'
    ]);
    expect(map.mappedBelowThreshold.map((file) => file.path)).toEqual(['src/lowMapped.ts']);
    expect(map.mappedBelowThreshold[0].requirementIds).toContain('VHS-REQ-613');
    expect(map.zeroCoverageSupportingRequirements.map((file) => file.path)).toEqual([
      'src/supportingRisk.ts'
    ]);
    expect(map.zeroCoverageSupportingRequirements[0].requirementIds).toContain('VHS-REQ-610');
    expect(requirementRisk?.missingLines).toBe(6);
    expect(requirementRisk?.missingBranches).toBe(3);
    expect(requirementRisk?.missingFunctions).toBe(3);
    expect(map.byClassification.find((entry) => entry.classification === 'supporting')?.fileCount).toBe(
      1
    );
  });

  it('renders GitHub-ready Markdown for low mapped and zero supporting risk (VHS-REQ-613.2, VHS-REQ-613.3)', () => {
    const repoRoot = writeFixture();
    const markdown = renderCoverageMapMarkdown(generateCoverageMap({ repoRoot }));

    expect(markdown).toContain('# Coverage Traceability Map');
    expect(markdown).toContain('## Mapped Files Below Risk Threshold');
    expect(markdown).toContain('| src/lowMapped.ts | VHS-REQ-613 | mapped |');
    expect(markdown).toContain('## Zero-Coverage Supporting Files Tied To Requirements');
    expect(markdown).toContain('| src/supportingRisk.ts | VHS-REQ-610 | supporting |');
    expect(markdown).toContain('| VHS-REQ-613 | 2 | 6 |');
  });

  it('emits a self-describing packet aligned with the published schema, with a --schema mode (VHS-REQ-613)', () => {
    const repoRoot = writeFixture();
    const map = generateCoverageMap({ repoRoot, riskThreshold: 50 }) as unknown as Record<string, unknown>;
    const schema = JSON.parse(renderSchema()) as {
      $id: string;
      required: string[];
      properties: { $schema: { const: string }; schemaVersion: { const: number } };
    };

    // Self-describing envelope aligned with the schema's required contract.
    expect(schema.required.filter((key) => !(key in map))).toEqual([]);
    expect(map.$schema).toBe(schema.properties.$schema.const);
    expect(map.$schema).toBe(COVERAGE_MAP_SCHEMA_ID);
    expect(map.schemaVersion).toBe(schema.properties.schemaVersion.const);

    // --schema publishes the JSON Schema and attaches provenance under the shared key.
    expect(schema.$id).toBe(COVERAGE_MAP_SCHEMA_ID);
    const withProvenance = JSON.parse(renderSchema({ provenance: { generatedAt: 'x' } })) as Record<string, unknown>;
    expect(withProvenance['x-vi-history-suite-provenance']).toEqual({ generatedAt: 'x' });
  });

  it('fails closed when retained coverage evidence is missing (VHS-REQ-613.7)', () => {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vihs-coverage-map-missing-'));
    fs.mkdirSync(path.join(repoRoot, 'docs', 'requirements'), { recursive: true });
    fs.writeFileSync(
      path.join(repoRoot, 'docs', 'requirements', 'traceability-inventory.csv'),
      'Path,Classification,RtmCoverage,Notes\n',
      'utf8'
    );
    fs.writeFileSync(
      path.join(repoRoot, 'docs', 'requirements', 'rtm.csv'),
      'ReqID,ParentID,Status,Area,Title,ImplementationRefs,VerificationRefs,Notes\n',
      'utf8'
    );

    expect(() => generateCoverageMap({ repoRoot })).toThrow('Run npm test first');
  });

  it('parses the enforce flag with an advisory default', () => {
    expect(parseArgs(['--enforce']).enforce).toBe(true);
    expect(parseArgs([]).enforce).toBe(false);
  });

  it('rejects combining --json and --schema, and honors --include-provenance in markdown output (VHS-REQ-613)', () => {
    const repoRoot = writeFixture();
    const originalWrite = process.stdout.write.bind(process.stdout);
    let captured = '';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (process.stdout as any).write = (chunk: string) => {
      captured += chunk;
      return true;
    };
    try {
      captured = '';
      const conflictCode = main(['--json', '--schema', '--repo-root', repoRoot]);
      expect(conflictCode).toBe(1);

      captured = '';
      main(['--include-provenance', '--repo-root', repoRoot]);
      expect(captured).toContain('## Provenance');
      expect(captured).toContain('- provenance outputMode: markdown');
    } finally {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (process.stdout as any).write = originalWrite;
    }
  });

  it('summarizes enforcement risk from mapped-below-threshold and zero-coverage supporting files', () => {
    const repoRoot = writeFixture();
    const map = generateCoverageMap({ repoRoot, riskThreshold: 50 });

    expect(summarizeEnforcement(map)).toEqual({
      mappedBelow: 1,
      zeroCoverageSupporting: 1,
      violations: 2
    });

    const cleanMap: CoverageMap = {
      ...map,
      mappedBelowThreshold: [],
      zeroCoverageSupportingRequirements: []
    };
    expect(summarizeEnforcement(cleanMap)).toEqual({
      mappedBelow: 0,
      zeroCoverageSupporting: 0,
      violations: 0
    });
  });

  it('fails closed under --enforce when requirement-mapped or supporting risk exists (VHS-REQ-613.4)', () => {
    const repoRoot = writeFixture();
    expect(main(['--enforce', '--repo-root', repoRoot])).toBe(1);
  });

  it('rejects positional arguments and non-numeric or negative risk thresholds', () => {
    expect(() => parseArgs(['unexpected-positional'])).toThrow(
      'Unknown argument: unexpected-positional'
    );
    expect(() => parseArgs(['--risk-threshold', 'not-a-number'])).toThrow(
      '--risk-threshold must be a non-negative number'
    );
    expect(() => parseArgs(['--risk-threshold', '-5'])).toThrow(
      '--risk-threshold must be a non-negative number'
    );
  });

  it('parses quoted CSV cells with escaped quotes and CRLF line endings', () => {
    const rows = parseCsv('Path,Notes\r\n"src/a.ts","a, ""quoted"", b"\r\n');
    expect(rows).toEqual([{ Path: 'src/a.ts', Notes: 'a, "quoted", b' }]);
  });

  it('orders multiple mapped-below and zero-coverage supporting files deterministically', () => {
    const repoRoot = writeMultiRiskFixture();
    try {
      const map = generateCoverageMap({ repoRoot, riskThreshold: 50 });
      // mappedBelowThreshold sorts by descending total missing units, so lowA
      // (14 missing) precedes lowB (12 missing) — exercising the comparator.
      expect(map.mappedBelowThreshold.map((file) => file.path)).toEqual([
        'src/lowA.ts',
        'src/lowB.ts'
      ]);
      // zeroCoverageSupportingRequirements sorts ascending by path.
      expect(map.zeroCoverageSupportingRequirements.map((file) => file.path)).toEqual([
        'src/supportA.ts',
        'src/supportB.ts'
      ]);
    } finally {
      fs.rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  it('renders empty-state Markdown rows when no mapped-below or zero-coverage risk exists', () => {
    const repoRoot = writeFixture();
    try {
      const map = generateCoverageMap({ repoRoot, riskThreshold: 50 });
      const markdown = renderCoverageMapMarkdown({
        ...map,
        mappedBelowThreshold: [],
        zeroCoverageSupportingRequirements: []
      });
      const emptyRows = markdown
        .split('\n')
        .filter((line) => line === '| - | - | - | - | - | - | 0 | 0 | 0 |');
      expect(emptyRows.length).toBe(2);
    } finally {
      fs.rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  it('supports help, schema, json, and enforce-success output modes through main', () => {
    const cleanRepoRoot = writeCleanFixture();
    const originalWrite = process.stdout.write.bind(process.stdout);
    let captured = '';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (process.stdout as any).write = (chunk: string) => {
      captured += chunk;
      return true;
    };
    try {
      captured = '';
      expect(main(['--help'])).toBe(0);
      expect(captured).toContain('Usage: node scripts/mapCoverageToTraceability.js');

      captured = '';
      expect(main(['--schema'])).toBe(0);
      expect(captured).toContain(COVERAGE_MAP_SCHEMA_ID);

      captured = '';
      expect(main(['--json', '--repo-root', cleanRepoRoot])).toBe(0);
      expect(JSON.parse(captured).provenance).toBeUndefined();

      captured = '';
      expect(main(['--json', '--include-provenance', '--repo-root', cleanRepoRoot])).toBe(0);
      const parsed = JSON.parse(captured) as { provenance: { outputMode: string }; riskThreshold: number };
      expect(parsed.provenance.outputMode).toBe('json');
      expect(parsed.riskThreshold).toBe(85);

      captured = '';
      expect(main(['--enforce', '--repo-root', cleanRepoRoot])).toBe(0);
      expect(captured).toContain('no requirement-mapped file below');
    } finally {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (process.stdout as any).write = originalWrite;
      fs.rmSync(cleanRepoRoot, { recursive: true, force: true });
    }
  });
});

describe('branch-measurement exemption (VHS-REQ-613)', () => {
  const exemptPath = 'scripts/auditCustomizationGovernance.js';

  function fileAt(
    pct: { l?: number; s?: number; b: number; f?: number },
    at: string = exemptPath
  ) {
    return {
      path: at,
      lines: { pct: pct.l ?? 100 },
      statements: { pct: pct.s ?? 100 },
      branches: { pct: pct.b },
      functions: { pct: pct.f ?? 100 }
    };
  }

  it('lists only the documented branch-measurement-limited file', () => {
    expect(BRANCH_MEASUREMENT_LIMITED_FILES.has(exemptPath)).toBe(true);
  });

  it('waives ONLY the branch metric for a listed file while lines/statements/functions are 100%', () => {
    const file = fileAt({ b: 81.6 });
    expect(isBranchMeasurementExempt(file)).toBe(true);
    // Below-branch alone no longer flags the file at an 85% threshold.
    expect(isBelowThreshold(file, 85)).toBe(false);
  });

  it('re-enforces the branch floor (fail-closed) when any non-branch metric drops below 100%', () => {
    for (const drop of [{ l: 99.9 }, { s: 99.9 }, { f: 99.9 }]) {
      const file = fileAt({ b: 81.6, ...drop });
      expect(isBranchMeasurementExempt(file)).toBe(false);
      expect(isBelowThreshold(file, 85)).toBe(true);
    }
  });

  it('keeps the exemption branch-only: a listed file below threshold on functions still fails closed', () => {
    const file = fileAt({ b: 100, f: 80 });
    expect(isBelowThreshold(file, 85)).toBe(true);
  });

  it('does not exempt an unlisted file with low branch coverage', () => {
    const file = fileAt({ b: 81.6 }, 'src/somethingElse.ts');
    expect(isBranchMeasurementExempt(file)).toBe(false);
    expect(isBelowThreshold(file, 85)).toBe(true);
  });
});

function writeMultiRiskFixture(): string {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vihs-coverage-map-multi-'));
  fs.mkdirSync(path.join(repoRoot, 'coverage'), { recursive: true });
  fs.mkdirSync(path.join(repoRoot, 'docs', 'requirements'), { recursive: true });
  fs.mkdirSync(path.join(repoRoot, 'src'), { recursive: true });

  const lowA = path.join(repoRoot, 'src', 'lowA.ts');
  const lowB = path.join(repoRoot, 'src', 'lowB.ts');
  const supportA = path.join(repoRoot, 'src', 'supportA.ts');
  const supportB = path.join(repoRoot, 'src', 'supportB.ts');
  for (const filePath of [lowA, lowB, supportA, supportB]) {
    fs.writeFileSync(filePath, 'export const value = true;\n', 'utf8');
  }

  fs.writeFileSync(
    path.join(repoRoot, 'coverage', 'coverage-summary.json'),
    JSON.stringify(
      {
        total: {
          lines: metric(40, 6),
          statements: metric(40, 6),
          branches: metric(16, 2),
          functions: metric(20, 4)
        },
        [lowA]: fileCoverage(10, 2),
        [lowB]: fileCoverage(10, 4),
        [supportA]: fileCoverage(10, 0),
        [supportB]: fileCoverage(10, 0)
      },
      null,
      2
    ),
    'utf8'
  );
  fs.writeFileSync(
    path.join(repoRoot, 'docs', 'requirements', 'traceability-inventory.csv'),
    [
      'Path,Classification,RtmCoverage,Notes',
      'src/lowA.ts,mapped,Yes,Low mapped A.',
      'src/lowB.ts,mapped,Yes,Low mapped B.',
      'src/supportA.ts,supporting,No,Supports VHS-REQ-610 dashboard evidence.',
      'src/supportB.ts,supporting,No,Supports VHS-REQ-611 dashboard evidence.'
    ].join('\n'),
    'utf8'
  );
  fs.writeFileSync(
    path.join(repoRoot, 'docs', 'requirements', 'rtm.csv'),
    [
      'ReqID,ParentID,Status,Area,Title,ImplementationRefs,VerificationRefs,Notes',
      'VHS-REQ-613,VHS-SYS-REQ-017,Active,CI And Developer Environment,Coverage Intelligence,src/lowA.ts;src/lowB.ts,tests/unit/coverageMapScript.test.ts,Maps coverage.'
    ].join('\n'),
    'utf8'
  );

  return repoRoot;
}

function writeCleanFixture(): string {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vihs-coverage-map-clean-'));
  fs.mkdirSync(path.join(repoRoot, 'coverage'), { recursive: true });
  fs.mkdirSync(path.join(repoRoot, 'docs', 'requirements'), { recursive: true });
  fs.mkdirSync(path.join(repoRoot, 'src'), { recursive: true });

  const coveredMappedPath = path.join(repoRoot, 'src', 'coveredMapped.ts');
  fs.writeFileSync(coveredMappedPath, 'export const covered = true;\n', 'utf8');

  fs.writeFileSync(
    path.join(repoRoot, 'coverage', 'coverage-summary.json'),
    JSON.stringify(
      {
        total: {
          lines: metric(10, 10),
          statements: metric(10, 10),
          branches: metric(4, 4),
          functions: metric(5, 5)
        },
        [coveredMappedPath]: fileCoverage(10, 10, 4, 5)
      },
      null,
      2
    ),
    'utf8'
  );
  fs.writeFileSync(
    path.join(repoRoot, 'docs', 'requirements', 'traceability-inventory.csv'),
    [
      'Path,Classification,RtmCoverage,Notes',
      'src/coveredMapped.ts,mapped,Yes,Well-covered mapped implementation.'
    ].join('\n'),
    'utf8'
  );
  fs.writeFileSync(
    path.join(repoRoot, 'docs', 'requirements', 'rtm.csv'),
    [
      'ReqID,ParentID,Status,Area,Title,ImplementationRefs,VerificationRefs,Notes',
      'VHS-REQ-613,VHS-SYS-REQ-017,Active,CI And Developer Environment,Coverage Intelligence,src/coveredMapped.ts,tests/unit/coverageMapScript.test.ts,Maps coverage.'
    ].join('\n'),
    'utf8'
  );

  return repoRoot;
}

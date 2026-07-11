import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

type CoverageMap = {
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
  summarizeEnforcement,
  main
} = require('../../scripts/mapCoverageToTraceability.js') as {
  parseArgs: (argv: string[]) => {
    coverageSummary: string;
    inventory: string;
    rtm: string;
    riskThreshold: number;
    json: boolean;
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
  summarizeEnforcement: (map: CoverageMap) => {
    mappedBelow: number;
    zeroCoverageSupporting: number;
    violations: number;
  };
  main: (argv?: string[]) => number;
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

  it('joins coverage, inventory, and RTM records into requirement risk facts', () => {
    const repoRoot = writeFixture();

    const map = generateCoverageMap({ repoRoot, riskThreshold: 50 });

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
    expect(map.byRequirement.find((entry) => entry.reqId === 'VHS-REQ-613')?.missingLines).toBe(6);
    expect(map.byClassification.find((entry) => entry.classification === 'supporting')?.fileCount).toBe(
      1
    );
  });

  it('renders GitHub-ready Markdown for low mapped and zero supporting risk', () => {
    const repoRoot = writeFixture();
    const markdown = renderCoverageMapMarkdown(generateCoverageMap({ repoRoot }));

    expect(markdown).toContain('# Coverage Traceability Map');
    expect(markdown).toContain('## Mapped Files Below Risk Threshold');
    expect(markdown).toContain('| src/lowMapped.ts | VHS-REQ-613 | mapped |');
    expect(markdown).toContain('## Zero-Coverage Supporting Files Tied To Requirements');
    expect(markdown).toContain('| src/supportingRisk.ts | VHS-REQ-610 | supporting |');
    expect(markdown).toContain('| VHS-REQ-613 | 2 | 6 |');
  });

  it('fails closed when retained coverage evidence is missing', () => {
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

  it('fails closed under --enforce when requirement-mapped or supporting risk exists', () => {
    const repoRoot = writeFixture();
    expect(main(['--enforce', '--repo-root', repoRoot])).toBe(1);
  });
});

import { describe, expect, it } from 'vitest';

const {
  parseCsvRows,
  checkCsv,
  checkRequirementsCsvColumns,
  renderSummary,
  renderStepSummary,
  main
} = require('../../scripts/checkRequirementsCsvColumns.js') as {
  parseCsvRows: (text: string) => Array<{ lineNumber: number; cells: string[] }>;
  checkCsv: (text: string) => {
    header: string[];
    expectedColumns: number;
    dataRowCount: number;
    ids: string[];
    violations: Array<{ lineNumber: number; id: string; columns: number; expectedColumns: number }>;
  };
  checkRequirementsCsvColumns: (
    cwd: string,
    deps?: {
      readFile?: (filePath: string) => string;
      targets?: Array<{ relativePath: string; identityLabel: string; isRequirementIndex?: boolean }>;
    }
  ) => {
    success: boolean;
    violationCount: number;
    files: Array<{
      relativePath: string;
      identityLabel: string;
      isRequirementIndex: boolean;
      expectedColumns: number;
      dataRowCount: number;
      ids: string[];
      violations: Array<{ lineNumber: number; id: string; columns: number; expectedColumns: number }>;
    }>;
  };
  renderSummary: (result: ReturnType<typeof checkRequirementsCsvColumns>) => string;
  renderStepSummary: (result: ReturnType<typeof checkRequirementsCsvColumns>) => string;
  main: (
    argv?: string[],
    deps?: {
      cwd?: string;
      readFile?: (filePath: string) => string;
      targets?: Array<{ relativePath: string; identityLabel: string; isRequirementIndex?: boolean }>;
      stepSummaryPath?: string;
      appendStepSummary?: (filePath: string, content: string) => void;
      stdout?: { write: (chunk: string) => void };
      stderr?: { write: (chunk: string) => void };
    }
  ) => number;
};

function makeReadFile(files: Record<string, string>): (filePath: string) => string {
  return (filePath: string) => {
    const key = filePath.replace(/\\/g, '/');
    const match = Object.keys(files).find((candidate) => key.endsWith(candidate));
    if (!match) {
      throw new Error(`unexpected read: ${filePath}`);
    }
    return files[match];
  };
}

describe('requirements CSV column-integrity guard', () => {
  it('counts quote-aware columns and preserves commas inside quoted fields', () => {
    const rows = parseCsvRows('A,B,C\n1,"has, comma",3\n');

    expect(rows).toHaveLength(2);
    expect(rows[0].cells).toEqual(['A', 'B', 'C']);
    expect(rows[1].cells).toEqual(['1', 'has, comma', '3']);
    expect(rows[1].lineNumber).toBe(2);
  });

  it('handles doubled-quote escaping and CRLF line endings', () => {
    const rows = parseCsvRows('A,B\r\n"say ""hi""","ok"\r\n');

    expect(rows[1].cells).toEqual(['say "hi"', 'ok']);
  });

  it('flags a data row whose unquoted field adds columns', () => {
    const result = checkCsv('ReqID,Notes\nVHS-REQ-001,"quoted, safe"\nVHS-REQ-002,unquoted, leaks\n');

    expect(result.expectedColumns).toBe(2);
    expect(result.dataRowCount).toBe(2);
    expect(result.violations).toEqual([
      { lineNumber: 3, id: 'VHS-REQ-002', columns: 3, expectedColumns: 2 }
    ]);
  });

  it('passes when every row matches the header column count', () => {
    const result = checkCsv('ReqID,Notes\nVHS-REQ-001,"quoted, safe"\nVHS-REQ-002,plain\n');

    expect(result.violations).toEqual([]);
  });

  it('validates every configured requirements CSV through injected reads', () => {
    const result = checkRequirementsCsvColumns('/repo', {
      readFile: makeReadFile({
        'a.csv': 'ReqID,Notes\nVHS-REQ-001,ok\nVHS-REQ-002,bad, extra\n',
        'b.csv': 'Path,Notes\nsrc/x.ts,fine\n'
      }),
      targets: [
        { relativePath: 'a.csv', identityLabel: 'ReqID', isRequirementIndex: true },
        { relativePath: 'b.csv', identityLabel: 'Path' }
      ]
    });

    expect(result.success).toBe(false);
    expect(result.violationCount).toBe(1);
    expect(result.files[0].violations[0]).toMatchObject({ id: 'VHS-REQ-002', columns: 3, expectedColumns: 2 });
    expect(result.files[1].violations).toEqual([]);
    expect(result.files[0].ids).toEqual(['VHS-REQ-001', 'VHS-REQ-002']);
  });

  it('renders the runtime contract, requirement IDs, and violation table for the step summary', () => {
    const result = checkRequirementsCsvColumns('/repo', {
      readFile: makeReadFile({ 'a.csv': 'ReqID,Notes\nVHS-REQ-001,ok\nVHS-REQ-002,bad, extra\n' }),
      targets: [{ relativePath: 'a.csv', identityLabel: 'ReqID', isRequirementIndex: true }]
    });

    const markdown = renderStepSummary(result);

    expect(markdown).toContain('## Requirements CSV Integrity');
    expect(markdown).toContain('must have exactly the same number of columns as its header');
    expect(markdown).toContain('Requirements validated at runtime');
    expect(markdown).toContain('VHS-REQ-001, VHS-REQ-002');
    expect(markdown).toContain('### Malformed rows');
    expect(markdown).toContain('| `a.csv` | 3 | `VHS-REQ-002` | 3 | 2 |');
  });

  it('main writes the step summary, reports failure on stderr, and returns 1 when malformed', () => {
    const summaryChunks: string[] = [];
    const stderrChunks: string[] = [];
    const stdoutChunks: string[] = [];

    const code = main([], {
      cwd: '/repo',
      readFile: makeReadFile({ 'a.csv': 'ReqID,Notes\nVHS-REQ-001,bad, extra\n' }),
      targets: [{ relativePath: 'a.csv', identityLabel: 'ReqID', isRequirementIndex: true }],
      stepSummaryPath: '/tmp/step-summary.md',
      appendStepSummary: (_filePath, content) => summaryChunks.push(content),
      stdout: { write: (chunk) => stdoutChunks.push(chunk) },
      stderr: { write: (chunk) => stderrChunks.push(chunk) }
    });

    expect(code).toBe(1);
    expect(summaryChunks.join('')).toContain('## Requirements CSV Integrity');
    expect(stderrChunks.join('')).toContain('Column-integrity check failed');
    expect(stdoutChunks.join('')).toBe('');
  });

  it('main returns 0 and reports success on stdout when all rows are aligned', () => {
    const stdoutChunks: string[] = [];

    const code = main([], {
      cwd: '/repo',
      readFile: makeReadFile({ 'a.csv': 'ReqID,Notes\nVHS-REQ-001,"quoted, safe"\n' }),
      targets: [{ relativePath: 'a.csv', identityLabel: 'ReqID', isRequirementIndex: true }],
      stdout: { write: (chunk) => stdoutChunks.push(chunk) }
    });

    expect(code).toBe(0);
    expect(stdoutChunks.join('')).toContain('Column-integrity check passed.');
    expect(renderSummary({ success: true, violationCount: 0, files: [] })).toContain('passed');
  });
});

import { describe, expect, it } from 'vitest';

import {
  runDesignGate,
  readDesignGateCoverageFocus
} from '../../src/tooling/designGateRunner';

describe('designGateRunner', () => {
  it('executes the governed plan, retains the report, and derives the next focus', async () => {
    const writes = new Map<string, string>();
    const calls: string[] = [];
    const repoRoot = '/tmp/vi-history-suite';

    const report = await runDesignGate(repoRoot, {
      now: () => '2026-04-02T00:00:00.000Z',
      runStep: async (_command, _args, _cwd, id, title) => {
        calls.push(id);
        return {
          id,
          title,
          command: 'stub',
          args: [],
          exitCode: 0,
          durationMs: 10,
          stdout:
            id === 'standards-assurance'
              ? 'Executive Brief\n- Gate summary: 5 PASS, 0 FAIL, 1 N/A\n'
              : 'ok',
          stderr: ''
        };
      },
      readFile: async (filePath) => {
        if (filePath.endsWith('coverage/coverage-summary.json')) {
          return JSON.stringify({
            total: {
              lines: { pct: 42.72 }
            },
            '/tmp/vi-history-suite/src/cli/runDesignGate.ts': {
              lines: { pct: 0, covered: 0, total: 136 }
            },
            '/tmp/vi-history-suite/src/indexing/viEligibilityIndexer.ts': {
              lines: { pct: 20.6, covered: 41, total: 199 }
            }
          });
        }

        throw new Error(`unexpected file read: ${filePath}`);
      },
      mkdir: async () => undefined,
      writeFile: async (filePath, contents) => {
        writes.set(filePath, contents);
      }
    });

    expect(calls).toEqual([
      'unit-and-coverage',
      'extension-host-integration',
      'canonical-harness-smoke',
      'standards-assurance'
    ]);
    expect(report.status).toBe('pass');
    expect(report.assuranceGateSummary).toBe('5 PASS, 0 FAIL, 1 N/A');
    expect(report.nextFocus).toBe('src/cli/runDesignGate.ts (0.0% lines)');
    expect(report.coverageFocus?.[0]?.relativePath).toBe('src/cli/runDesignGate.ts');
    expect(
      writes.get('/tmp/vi-history-suite/.cache/design-gate/latest-report.md')
    ).toContain('## Coverage Focus');
    expect(
      writes.get('/tmp/vi-history-suite/.cache/design-gate/latest-report.json')
    ).toContain('"nextFocus": "src/cli/runDesignGate.ts (0.0% lines)"');
  });

  it('stops after a failing step and still retains a fail report', async () => {
    const writes = new Map<string, string>();
    const calls: string[] = [];

    const report = await runDesignGate('/tmp/vi-history-suite', {
      now: () => '2026-04-02T00:00:00.000Z',
      runStep: async (_command, _args, _cwd, id, title) => {
        calls.push(id);
        return {
          id,
          title,
          command: 'stub',
          args: [],
          exitCode: id === 'extension-host-integration' ? 1 : 0,
          durationMs: 5,
          stdout: 'step-output',
          stderr: ''
        };
      },
      readFile: async (filePath) => {
        if (filePath.endsWith('coverage/coverage-summary.json')) {
          return JSON.stringify({
            '/tmp/vi-history-suite/src/commands/openViHistoryCommand.ts': {
              lines: { pct: 0, covered: 0, total: 134 }
            }
          });
        }

        throw new Error(`unexpected file read: ${filePath}`);
      },
      mkdir: async () => undefined,
      writeFile: async (filePath, contents) => {
        writes.set(filePath, contents);
      }
    });

    expect(calls).toEqual(['unit-and-coverage', 'extension-host-integration']);
    expect(report.status).toBe('fail');
    expect(report.nextFocus).toBe('src/commands/openViHistoryCommand.ts (0.0% lines)');
    expect(
      writes.get('/tmp/vi-history-suite/.cache/design-gate/latest-report.json')
    ).toContain('"status": "fail"');
  });

  it('reports an explicit unavailable reason when coverage focus facts cannot be read', async () => {
    await expect(
      readDesignGateCoverageFocus('/tmp/vi-history-suite', async () => {
        throw new Error('missing coverage summary');
      })
    ).resolves.toEqual({
      status: 'unavailable',
      reason:
        'coverage-summary-unavailable:/tmp/vi-history-suite/coverage/coverage-summary.json:Error: missing coverage summary'
    });
  });
});

import { EventEmitter } from 'node:events';

import { describe, expect, it, vi } from 'vitest';

import {
  persistDesignGateReport,
  runDesignGate,
  readDesignGateCoverageFocus,
  spawnDesignGateStep
} from '../../src/tooling/designGateRunner';
import { DesignGateReport } from '../../src/tooling/designGate';

class FakeReadable extends EventEmitter {}

class FakeChildProcess extends EventEmitter {
  stdout = new FakeReadable();
  stderr = new FakeReadable();
}

function createWritableCollector() {
  const writes: string[] = [];

  return {
    writes,
    writer: {
      write(text: string) {
        writes.push(text);
        return true;
      }
    }
  };
}

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

  it('reports an explicit unavailable reason when the coverage summary lacks governed src entries', async () => {
    await expect(
      readDesignGateCoverageFocus('/tmp/vi-history-suite', async () =>
        JSON.stringify({
          total: {
            lines: { pct: 84.2, covered: 42, total: 50 }
          },
          '/tmp/vi-history-suite/tests/unit/designGateRunner.test.ts': {
            lines: { pct: 100, covered: 10, total: 10 }
          }
        })
      )
    ).resolves.toEqual({
      status: 'unavailable',
      reason:
        'no-src-coverage-entries:/tmp/vi-history-suite/coverage/coverage-summary.json'
    });
  });

  it('creates the retained report directory recursively before writing JSON and Markdown reports', async () => {
    const operations: string[] = [];
    const writes = new Map<string, string>();
    const report: DesignGateReport = {
      generatedAt: '2026-04-02T00:00:00.000Z',
      repoRoot: '/tmp/vi-history-suite',
      status: 'pass',
      assuranceGateSummary: '5 PASS, 0 FAIL, 1 N/A',
      nextFocus: 'src/tooling/designGateRunner.ts (47.8% lines)',
      coverageFocus: [
        {
          relativePath: 'src/tooling/designGateRunner.ts',
          linesPct: 47.79,
          linesCovered: 76,
          linesTotal: 159
        }
      ],
      steps: []
    };

    await persistDesignGateReport(
      report.repoRoot,
      report,
      async (directoryPath, options) => {
        operations.push(`mkdir:${directoryPath}:${JSON.stringify(options)}`);
      },
      async (filePath, contents) => {
        operations.push(`write:${filePath}`);
        writes.set(filePath, contents);
      }
    );

    expect(operations).toEqual([
      'mkdir:/tmp/vi-history-suite/.cache/design-gate:{"recursive":true}',
      'write:/tmp/vi-history-suite/.cache/design-gate/latest-report.json',
      'write:/tmp/vi-history-suite/.cache/design-gate/latest-report.md'
    ]);
    expect(
      writes.get('/tmp/vi-history-suite/.cache/design-gate/latest-report.json')
    ).toContain('"status": "pass"');
    expect(
      writes.get('/tmp/vi-history-suite/.cache/design-gate/latest-report.md')
    ).toContain('# Design Gate Report');
  });

  it('retains spawned-step stdout, stderr, and duration while streaming both channels', async () => {
    const child = new FakeChildProcess();
    const spawnImpl = vi.fn().mockReturnValue(child);
    const stdoutCollector = createWritableCollector();
    const stderrCollector = createWritableCollector();
    const nowMs = vi.fn<() => number>().mockReturnValueOnce(100).mockReturnValueOnce(140);

    const resultPromise = spawnDesignGateStep(
      'npm',
      ['run', 'test'],
      '/tmp/vi-history-suite',
      'unit-and-coverage',
      'Unit tests and coverage',
      {
        spawnImpl,
        stdout: stdoutCollector.writer,
        stderr: stderrCollector.writer,
        nowMs
      }
    );

    child.stdout.emit('data', 'stdout line\n');
    child.stderr.emit('data', 'stderr line\n');
    child.emit('close', 0);

    await expect(resultPromise).resolves.toEqual({
      id: 'unit-and-coverage',
      title: 'Unit tests and coverage',
      command: 'npm',
      args: ['run', 'test'],
      exitCode: 0,
      durationMs: 40,
      stdout: 'stdout line\n',
      stderr: 'stderr line\n'
    });
    expect(stdoutCollector.writes).toEqual(['stdout line\n']);
    expect(stderrCollector.writes).toEqual(['stderr line\n']);
    expect(spawnImpl).toHaveBeenCalledWith('npm', ['run', 'test'], {
      cwd: '/tmp/vi-history-suite',
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe']
    });
  });

  it('fails closed when a spawned step emits a process error or closes without an exit code', async () => {
    const errorChild = new FakeChildProcess();
    const errorResultPromise = spawnDesignGateStep(
      'npm',
      ['run', 'test:integration'],
      '/tmp/vi-history-suite',
      'extension-host-integration',
      'VS Code extension-host integration',
      {
        spawnImpl: vi.fn().mockReturnValue(errorChild),
        nowMs: vi.fn<() => number>().mockReturnValueOnce(200).mockReturnValueOnce(230),
        stdout: createWritableCollector().writer,
        stderr: createWritableCollector().writer
      }
    );
    errorChild.stdout.emit('data', 'partial stdout\n');
    errorChild.emit('error', new Error('spawn failed'));
    errorChild.emit('close', 0);

    await expect(errorResultPromise).resolves.toMatchObject({
      exitCode: 1,
      durationMs: 30,
      stdout: 'partial stdout\n',
      stderr: expect.stringContaining('Error: spawn failed')
    });

    const nullCloseChild = new FakeChildProcess();
    const nullCloseResultPromise = spawnDesignGateStep(
      'python3',
      ['tool.py'],
      '/tmp/vi-history-suite',
      'standards-assurance',
      'Standards assurance',
      {
        spawnImpl: vi.fn().mockReturnValue(nullCloseChild),
        nowMs: vi.fn<() => number>().mockReturnValueOnce(500).mockReturnValueOnce(560),
        stdout: createWritableCollector().writer,
        stderr: createWritableCollector().writer
      }
    );
    nullCloseChild.emit('close', null);

    await expect(nullCloseResultPromise).resolves.toMatchObject({
      exitCode: 1,
      durationMs: 60,
      stdout: '',
      stderr: ''
    });
  });
});

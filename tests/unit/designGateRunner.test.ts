import * as fs from 'node:fs/promises';
import { EventEmitter } from 'node:events';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  persistDesignGateReport,
  readDesignGateNextTranche,
  runDesignGate,
  readDesignGateCoverageFocus,
  resolveDesignGateAssuranceScriptPath,
  spawnDesignGateStep
} from '../../src/tooling/designGateRunner';
import { DesignGateReport } from '../../src/tooling/designGate';

class FakeReadable extends EventEmitter {}

class FakeChildProcess extends EventEmitter {
  stdout = new FakeReadable();
  stderr = new FakeReadable();
  kill = vi.fn().mockReturnValue(true);
}

const tempDirectories: string[] = [];

async function createTempRepoRoot(): Promise<string> {
  const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'vihs-design-gate-'));
  tempDirectories.push(repoRoot);
  return repoRoot;
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

afterEach(async () => {
  await Promise.all(
    tempDirectories.splice(0, tempDirectories.length).map((directory) =>
      fs.rm(directory, { recursive: true, force: true })
    )
  );
});

describe('designGateRunner', () => {
  it('executes the governed plan, retains the report, and derives the next focus', async () => {
    const writes = new Map<string, string[]>();
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
        const normalizedFilePath = filePath.replace(/\\/g, '/');
        if (normalizedFilePath.endsWith('coverage/coverage-summary.json')) {
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
        const entries = writes.get(filePath) ?? [];
        entries.push(contents);
        writes.set(filePath, entries);
      }
    });

    expect(calls).toEqual([
      'branch-governance-baseline',
      'design-contract',
      'unit-and-coverage',
      'extension-host-integration',
      'canonical-harness-smoke',
      'documentation-continuous-integration',
      'standards-assurance'
    ]);
    expect(report.status).toBe('pass');
    expect(report.completionState).toBe('complete');
    expect(report.assuranceGateSummary).toBe('5 PASS, 0 FAIL, 1 N/A');
    expect(report.nextFocus).toBe('src/cli/runDesignGate.ts (0.0% lines)');
    expect(report.coverageFocus?.[0]?.relativePath).toBe('src/cli/runDesignGate.ts');
    const markdownWrites =
      writes.get(path.join('/tmp/vi-history-suite', '.cache', 'design-gate', 'latest-report.md')) ?? [];
    const jsonWrites =
      writes.get(path.join('/tmp/vi-history-suite', '.cache', 'design-gate', 'latest-report.json')) ?? [];
    expect(markdownWrites.length).toBe(7);
    expect(jsonWrites.length).toBe(7);
    expect(markdownWrites.some((contents) => contents.includes('## Coverage Focus'))).toBe(true);
    expect(
      markdownWrites.some((contents) =>
        contents.includes('Pending step: standards-assurance (Standards assurance)')
      )
    ).toBe(true);
    expect(
      jsonWrites.some((contents) => contents.includes('"completionState": "running"'))
    ).toBe(true);
    expect(jsonWrites.at(-1)).toContain('"completionState": "complete"');
    expect(jsonWrites.at(-1)).toContain('"nextFocus": "src/cli/runDesignGate.ts (0.0% lines)"');
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
        const normalizedFilePath = filePath.replace(/\\/g, '/');
        if (normalizedFilePath.endsWith('coverage/coverage-summary.json')) {
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

    expect(calls).toEqual([
      'branch-governance-baseline',
      'design-contract',
      'unit-and-coverage',
      'extension-host-integration'
    ]);
    expect(report.status).toBe('fail');
    expect(report.completionState).toBe('complete');
    expect(report.nextFocus).toBe('src/commands/openViHistoryCommand.ts (0.0% lines)');
    expect(
      writes.get(path.join('/tmp/vi-history-suite', '.cache', 'design-gate', 'latest-report.json'))
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
        `coverage-summary-unavailable:${path.join('/tmp/vi-history-suite', 'coverage', 'coverage-summary.json')}:Error: missing coverage summary`
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
        `no-src-coverage-entries:${path.join('/tmp/vi-history-suite', 'coverage', 'coverage-summary.json')}`
    });
  });

  it('retains an explicit unavailable coverage reason and omits nextFocus when source coverage facts are unavailable', async () => {
    const writes = new Map<string, string>();

    const report = await runDesignGate('/tmp/vi-history-suite', {
      now: () => '2026-04-02T00:00:00.000Z',
      runStep: async (_command, _args, _cwd, id, title) => ({
        id,
        title,
        command: 'stub',
        args: [],
        exitCode: 0,
        durationMs: 5,
        stdout:
          id === 'standards-assurance'
            ? 'Executive Brief\n- Gate summary: 5 PASS, 0 FAIL, 1 N/A\n'
            : 'ok',
        stderr: ''
      }),
      readFile: async () =>
        JSON.stringify({
          total: {
            lines: { pct: 84.2, covered: 42, total: 50 }
          },
          '/tmp/vi-history-suite/tests/unit/designGateRunner.test.ts': {
            lines: { pct: 100, covered: 10, total: 10 }
          }
        }),
      mkdir: async () => undefined,
      writeFile: async (filePath, contents) => {
        writes.set(filePath, contents);
      }
    });

    expect(report.coverageFocus).toBeUndefined();
    expect(report.coverageFocusUnavailableReason).toBe(
      `no-src-coverage-entries:${path.join('/tmp/vi-history-suite', 'coverage', 'coverage-summary.json')}`
    );
    expect(report.nextFocus).toBeUndefined();
    expect(
      writes.get(path.join('/tmp/vi-history-suite', '.cache', 'design-gate', 'latest-report.json'))
    ).toContain(
      `"coverageFocusUnavailableReason": "no-src-coverage-entries:${path.join('/tmp/vi-history-suite', 'coverage', 'coverage-summary.json').replace(/\\/g, '\\\\')}"`
    );
    expect(
      writes.get(path.join('/tmp/vi-history-suite', '.cache', 'design-gate', 'latest-report.md'))
    ).toContain(
      `Coverage focus unavailable: no-src-coverage-entries:${path.join('/tmp/vi-history-suite', 'coverage', 'coverage-summary.json')}`
    );
    expect(
      writes.get(path.join('/tmp/vi-history-suite', '.cache', 'design-gate', 'latest-report.md'))
    ).not.toContain('Next focus:');
  });

  it('derives the next product tranche from the governed development queue after line coverage is saturated', async () => {
    const writes = new Map<string, string>();

    const report = await runDesignGate('/tmp/vi-history-suite', {
      now: () => '2026-04-02T00:00:00.000Z',
      runStep: async (_command, _args, _cwd, id, title) => ({
        id,
        title,
        command: 'stub',
        args: [],
        exitCode: 0,
        durationMs: 5,
        stdout:
          id === 'standards-assurance'
            ? 'Executive Brief\n- Gate summary: 5 PASS, 0 FAIL, 1 N/A\n'
            : 'ok',
        stderr: ''
      }),
      readFile: async (filePath) => {
        const normalizedFilePath = filePath.replace(/\\/g, '/');
        if (normalizedFilePath.endsWith('coverage/coverage-summary.json')) {
          return JSON.stringify({
            '/tmp/vi-history-suite/src/indexing/viEligibilityIndexer.ts': {
              lines: { pct: 100, covered: 227, total: 227 }
            }
          });
        }

        if (normalizedFilePath.endsWith('docs/product/development-queue.json')) {
          return JSON.stringify([
            {
              id: 'TRANCHE-001',
              title: 'Wire report preflight into report runtime planning and storage integration',
              status: 'active',
              source: 'authoritative research',
              summary: 'summary'
            }
          ]);
        }

        throw new Error(`unexpected file read: ${filePath}`);
      },
      mkdir: async () => undefined,
      writeFile: async (filePath, contents) => {
        writes.set(filePath, contents);
      }
    });

    expect(report.nextFocus).toBeUndefined();
    expect(report.nextTranche).toBe(
      'TRANCHE-001: Wire report preflight into report runtime planning and storage integration'
    );
    expect(
      writes.get(path.join('/tmp/vi-history-suite', '.cache', 'design-gate', 'latest-report.md'))
    ).toContain(
      'Next tranche: TRANCHE-001: Wire report preflight into report runtime planning and storage integration'
    );
  });

  it('reports an explicit unavailable reason when the governed development queue cannot yield a next tranche', async () => {
    await expect(
      readDesignGateNextTranche('/tmp/vi-history-suite', async () => '[]')
    ).resolves.toEqual({
      status: 'unavailable',
      reason: `no-active-or-queued-development-tranche:${path.join('/tmp/vi-history-suite', 'docs', 'product', 'development-queue.json')}`
    });
  });

  it('reports an explicit unavailable reason when the governed development queue cannot be read', async () => {
    await expect(
      readDesignGateNextTranche('/tmp/vi-history-suite', async () => {
        throw new Error('missing queue');
      })
    ).resolves.toEqual({
      status: 'unavailable',
      reason:
        `development-queue-unavailable:${path.join('/tmp/vi-history-suite', 'docs', 'product', 'development-queue.json')}:Error: missing queue`
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
      `mkdir:${path.join('/tmp/vi-history-suite', '.cache', 'design-gate')}:{"recursive":true}`,
      `write:${path.join('/tmp/vi-history-suite', '.cache', 'design-gate', 'latest-report.json')}`,
      `write:${path.join('/tmp/vi-history-suite', '.cache', 'design-gate', 'latest-report.md')}`
    ]);
    expect(
      writes.get(path.join('/tmp/vi-history-suite', '.cache', 'design-gate', 'latest-report.json'))
    ).toContain('"status": "pass"');
    expect(
      writes.get(path.join('/tmp/vi-history-suite', '.cache', 'design-gate', 'latest-report.md'))
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

  it(
    'uses default filesystem-backed coverage reads and report persistence when helper overrides are omitted',
    async () => {
    const repoRoot = await createTempRepoRoot();
    const coverageRoot = path.join(repoRoot, 'coverage');
    await fs.mkdir(coverageRoot, { recursive: true });
    await fs.writeFile(
      path.join(coverageRoot, 'coverage-summary.json'),
      JSON.stringify({
        total: {
          lines: { pct: 94.38, covered: 84, total: 89 }
        },
        [path.join(repoRoot, 'src/services/viHistoryModel.ts')]: {
          lines: { pct: 86.95, covered: 40, total: 46 }
        }
      })
    );

    const report = await runDesignGate(repoRoot, {
      runStep: async (_command, _args, _cwd, id, title) => ({
        id,
        title,
        command: 'stub',
        args: [],
        exitCode: 0,
        durationMs: 5,
        stdout:
          id === 'standards-assurance'
            ? 'Executive Brief\n- Gate summary: 5 PASS, 0 FAIL, 1 N/A\n'
            : 'ok',
        stderr: ''
      })
    });

    expect(report.status).toBe('pass');
    expect(Date.parse(report.generatedAt)).not.toBeNaN();
    expect(report.nextFocus).toBe('src/services/viHistoryModel.ts (87.0% lines)');

    const persistedJson = JSON.parse(
      await fs.readFile(path.join(repoRoot, '.cache', 'design-gate', 'latest-report.json'), 'utf8')
    );
    const persistedMarkdown = await fs.readFile(
      path.join(repoRoot, '.cache', 'design-gate', 'latest-report.md'),
      'utf8'
    );

    expect(persistedJson.nextFocus).toBe('src/services/viHistoryModel.ts (87.0% lines)');
    expect(persistedMarkdown).toContain('Next focus: src/services/viHistoryModel.ts (87.0% lines)');
    },
    15000
  );

  it('mirrors a mounted Windows assurance skill into repo-local storage before execution', async () => {
    const repoRoot = await createTempRepoRoot();
    const sourceRoot = path.join(repoRoot, 'mounted-skill-source');
    const sourceScripts = path.join(sourceRoot, 'scripts');
    const sourceScriptPath = path.join(sourceScripts, 'run_assurance.py');
    await fs.mkdir(sourceScripts, { recursive: true });
    await fs.writeFile(sourceScriptPath, '#!/usr/bin/env python3\nprint("ok")\n');
    await fs.writeFile(path.join(sourceRoot, 'SKILL.md'), '# skill\n');

    const resolvedPath = await resolveDesignGateAssuranceScriptPath(repoRoot, {
      assuranceScriptCandidates: [sourceScriptPath],
      realpath: async (targetPath) =>
        targetPath === sourceScriptPath
          ? '/mnt/c/Users/sveld/.codex/skills/repo-standards-review/scripts/run_assurance.py'
          : targetPath,
      copyDirectory: async (_sourcePath, targetPath) => {
        await fs.cp(sourceRoot, targetPath, { recursive: true, force: true });
      }
    });

    expect(resolvedPath).toBe(
      path.join(
        repoRoot,
        '.cache',
        'design-gate',
        'assurance-skill',
        'repo-standards-review',
        'scripts',
        'run_assurance.py'
      )
    );
    await expect(fs.readFile(resolvedPath, 'utf8')).resolves.toContain('print("ok")');
  });

  it('ignores late child-process events after the spawned step has already settled', async () => {
    const child = new FakeChildProcess();
    const resultPromise = spawnDesignGateStep(
      'npm',
      ['run', 'test'],
      '/tmp/vi-history-suite',
      'unit-and-coverage',
      'Unit tests and coverage',
      {
        spawnImpl: vi.fn().mockReturnValue(child),
        nowMs: vi.fn<() => number>().mockReturnValueOnce(100).mockReturnValueOnce(125),
        stdout: createWritableCollector().writer,
        stderr: createWritableCollector().writer
      }
    );

    child.stdout.emit('data', 'stdout line\n');
    child.emit('close', 0);

    await expect(resultPromise).resolves.toMatchObject({
      exitCode: 0,
      durationMs: 25,
      stdout: 'stdout line\n',
      stderr: ''
    });

    child.stderr.emit('data', 'late stderr\n');
    child.emit('error', new Error('late failure'));
  });

  it('uses the default wall clock when spawned steps omit an injected time source', async () => {
    const child = new FakeChildProcess();
    const spawnImpl = vi.fn().mockReturnValue(child);
    const stdoutCollector = createWritableCollector();
    const stderrCollector = createWritableCollector();
    const dateNowSpy = vi
      .spyOn(Date, 'now')
      .mockReturnValueOnce(1000)
      .mockReturnValueOnce(1025);

    const resultPromise = spawnDesignGateStep(
      'npm',
      ['run', 'design:gate'],
      '/tmp/vi-history-suite',
      'design-gate',
      'Design gate',
      {
        spawnImpl,
        stdout: stdoutCollector.writer,
        stderr: stderrCollector.writer
      }
    );

    child.stdout.emit('data', 'design gate stdout\n');
    child.stderr.emit('data', 'design gate stderr\n');
    child.emit('close', 0);

    await expect(resultPromise).resolves.toEqual({
      id: 'design-gate',
      title: 'Design gate',
      command: 'npm',
      args: ['run', 'design:gate'],
      exitCode: 0,
      durationMs: 25,
      stdout: 'design gate stdout\n',
      stderr: 'design gate stderr\n'
    });
    expect(dateNowSpy).toHaveBeenCalledTimes(2);
  });

  it('fails closed when a spawned step exceeds its timeout budget', async () => {
    const child = new FakeChildProcess();
    let timeoutCallback: (() => void) | undefined;
    const setTimeoutImpl = vi.fn((callback: () => void) => {
      timeoutCallback = callback;
      return {} as never;
    });
    const clearTimeoutImpl = vi.fn();

    const resultPromise = spawnDesignGateStep(
      'python3',
      ['tool.py'],
      '/tmp/vi-history-suite',
      'standards-assurance',
      'Standards assurance',
      {
        spawnImpl: vi.fn().mockReturnValue(child),
        nowMs: vi.fn<() => number>().mockReturnValueOnce(100).mockReturnValueOnce(160),
        stdout: createWritableCollector().writer,
        stderr: createWritableCollector().writer,
        timeoutMs: 5000,
        setTimeoutImpl: setTimeoutImpl as never,
        clearTimeoutImpl: clearTimeoutImpl as never
      }
    );

    timeoutCallback?.();

    await expect(resultPromise).resolves.toMatchObject({
      exitCode: 124,
      durationMs: 60,
      stdout: '',
      stderr: expect.stringContaining('design gate step timed out after 5000ms')
    });
    expect(child.kill).toHaveBeenCalledWith('SIGKILL');
  });
});

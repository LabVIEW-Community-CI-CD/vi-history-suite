import { describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  createLvkitViScanProvider,
  type LvkitViScanDeps,
  type LvkitViScanInput
} from '../../src/semantic/lvkit/lvkitViScanProvider';
import type { LvkitGeneratedModule } from '../../src/semantic/lvkit/lvkitViScanModel';
import type { LvkitLocation } from '../../src/semantic/lvkit/lvkitLocator';

// VHS-REQ-714: single-VI lvkit scan orchestrator. All lvkit/Python/filesystem
// collaborators are injected so these tests never run lvkit or read a real VI.

const INPUT: LvkitViScanInput = {
  repositoryRoot: '/repo',
  relativePath: 'resource/PrintToSingleFileHtml/Make path absolute.vi',
  runtime: 'host-native'
};

const AVAILABLE: LvkitLocation = {
  available: true,
  invocation: { command: 'lvkit', argsPrefix: [], source: 'path' }
};

const GENERATED: LvkitGeneratedModule[] = [
  { relativePath: 'make_path_absolute/__init__.py', python: '' },
  {
    relativePath: 'make_path_absolute/klass/make_path_absolute.py',
    python: 'def make_path_absolute():\n    return 1\n'
  }
];

function baseDeps(over: Partial<LvkitViScanDeps> = {}): LvkitViScanDeps {
  return {
    locate: () => AVAILABLE,
    readViBytes: vi.fn(async () => Buffer.from('vi-bytes')),
    makeTempDir: vi.fn(() => mkdtemp(path.join(os.tmpdir(), 'vihs-lvkit-scan-test-'))),
    removeDir: vi.fn((dir: string) => rm(dir, { recursive: true, force: true })),
    execFileAsync: vi.fn(async () => ({ stdout: '', stderr: '' })),
    readGeneratedModules: vi.fn(async () => GENERATED),
    now: () => new Date('2026-07-24T11:02:31.000Z'),
    ...over
  };
}

// VHS-REQ-714.3: the injectable-collaborator provider materializes the staged VI,
// runs a single-VI/LabVIEW-free/isolated lvkit generate, returns a typed result,
// and always cleans up its temporary workspace.
describe('createLvkitViScanProvider (VHS-REQ-714.3)', () => {
  it('returns blocked-runtime when lvkit is not available', async () => {
    const scan = createLvkitViScanProvider({
      locate: () => ({ available: false, reason: 'lvkit-not-found: install it' })
    });
    const result = await scan(INPUT);
    expect(result.status).toBe('blocked-runtime');
    if (result.status === 'blocked-runtime') {
      expect(result.reason).toContain('lvkit-not-found');
    }
  });

  it('returns blocked-preflight when the relativePath escapes the repository root', async () => {
    const scan = createLvkitViScanProvider(baseDeps());
    const result = await scan({ ...INPUT, relativePath: '../evil.vi' });
    expect(result.status).toBe('blocked-preflight');
    if (result.status === 'blocked-preflight') {
      expect(result.reason).toContain('invalid-repository-target');
    }
  });

  it('returns blocked-preflight when the runtime label is empty', async () => {
    const scan = createLvkitViScanProvider(baseDeps());
    const result = await scan({ ...INPUT, runtime: '   ' });
    expect(result.status).toBe('blocked-preflight');
    if (result.status === 'blocked-preflight') {
      expect(result.reason).toContain('runtime');
    }
  });

  it('returns blocked-preflight when the VI bytes cannot be read', async () => {
    const scan = createLvkitViScanProvider(
      baseDeps({
        readViBytes: vi.fn(async () => {
          throw new Error('ENOENT');
        })
      })
    );
    const result = await scan(INPUT);
    expect(result.status).toBe('blocked-preflight');
    if (result.status === 'blocked-preflight') {
      expect(result.reason).toContain('vi-read-failed');
    }
  });

  it('returns failed when lvkit exits non-zero, and still cleans up the workspace', async () => {
    const removeDir = vi.fn((dir: string) => rm(dir, { recursive: true, force: true }));
    const scan = createLvkitViScanProvider(
      baseDeps({
        removeDir,
        execFileAsync: vi.fn(async () => {
          throw Object.assign(new Error('generate failed'), { code: 2, stdout: '', stderr: 'boom' });
        })
      })
    );
    const result = await scan(INPUT);
    expect(result.status).toBe('failed');
    if (result.status === 'failed') {
      expect(result.reason).toContain('lvkit-generate-failed (exit 2)');
      expect(result.reason).toContain('boom');
    }
    expect(removeDir).toHaveBeenCalledTimes(1);
  });

  it('returns failed when the generated output cannot be read', async () => {
    const scan = createLvkitViScanProvider(
      baseDeps({
        readGeneratedModules: vi.fn(async () => {
          throw new Error('read blew up');
        })
      })
    );
    const result = await scan(INPUT);
    expect(result.status).toBe('failed');
    if (result.status === 'failed') {
      expect(result.reason).toContain('lvkit-output-read-failed');
    }
  });

  it('returns failed when lvkit produced an empty tree (envelope fails closed)', async () => {
    const scan = createLvkitViScanProvider(
      baseDeps({ readGeneratedModules: vi.fn(async () => []) })
    );
    const result = await scan(INPUT);
    expect(result.status).toBe('failed');
    if (result.status === 'failed') {
      expect(result.reason).toContain('lvkit-scan-envelope-invalid');
    }
  });

  it('completes with a populated envelope on success', async () => {
    const scan = createLvkitViScanProvider(baseDeps());
    const result = await scan(INPUT);
    expect(result.status).toBe('completed');
    if (result.status === 'completed') {
      const { envelope } = result;
      expect(envelope.schema).toBe('vi-history-suite/lvkit-vi-scan@v1');
      expect(envelope.viPath).toBe('resource/PrintToSingleFileHtml/Make path absolute.vi');
      expect(envelope.runtime).toBe('host-native');
      expect(envelope.generatedAt).toBe('2026-07-24T11:02:31.000Z');
      expect(envelope.lvkitSource).toBe('path');
      expect(envelope.moduleCount).toBe(2);
      expect(envelope.primaryModule?.relativePath).toBe(
        'make_path_absolute/klass/make_path_absolute.py'
      );
    }
  });

  it('signs the VI content with a sha256 signature by default', async () => {
    const scan = createLvkitViScanProvider(baseDeps());
    const result = await scan(INPUT);
    const expected = `sha256:${createHash('sha256').update(Buffer.from('vi-bytes')).digest('hex')}`;
    expect(result.status).toBe('completed');
    if (result.status === 'completed') {
      expect(result.envelope.contentSignature).toBe(expected);
    }
  });

  it('invokes lvkit generate as a single-VI, LabVIEW-free, isolated run', async () => {
    const execFileAsync = vi.fn(async () => ({ stdout: '', stderr: '' }));
    const scan = createLvkitViScanProvider(baseDeps({ execFileAsync }));
    await scan(INPUT);
    expect(execFileAsync).toHaveBeenCalledTimes(1);
    const [command, args] = execFileAsync.mock.calls[0];
    expect(command).toBe('lvkit');
    expect(args).toContain('generate');
    expect(args).toContain('--load-mode');
    expect(args).toContain('none');
    expect(args).toContain('--no-auto-vilib');
    expect(args).toContain('--project-root');
    expect(args).toContain('-o');
    // The materialized VI keeps its original base name so lvkit's slug is meaningful.
    const generateIndex = args.indexOf('generate');
    expect(args[generateIndex + 1].replace(/\\/g, '/')).toMatch(/\/Make path absolute\.vi$/);
  });

  it('removes the temporary workspace on the success path', async () => {
    const removeDir = vi.fn((dir: string) => rm(dir, { recursive: true, force: true }));
    const scan = createLvkitViScanProvider(baseDeps({ removeDir }));
    await scan(INPUT);
    expect(removeDir).toHaveBeenCalledTimes(1);
  });

  it('returns blocked-preflight when the runtime is not a string', async () => {
    const scan = createLvkitViScanProvider(baseDeps());
    const result = await scan({ ...INPUT, runtime: undefined as never });
    expect(result.status).toBe('blocked-preflight');
    if (result.status === 'blocked-preflight') {
      expect(result.reason).toContain('runtime');
    }
  });

  it('describes a non-Error rejection from the VI reader', async () => {
    const scan = createLvkitViScanProvider(
      baseDeps({
        readViBytes: vi.fn(async () => {
          // eslint-disable-next-line no-throw-literal
          throw 'disk gremlin';
        })
      })
    );
    const result = await scan(INPUT);
    expect(result.status).toBe('blocked-preflight');
    if (result.status === 'blocked-preflight') {
      expect(result.reason).toContain('vi-read-failed: disk gremlin');
    }
  });

  it('describes a non-Error rejection from the generated-module reader', async () => {
    const scan = createLvkitViScanProvider(
      baseDeps({
        readGeneratedModules: vi.fn(async () => {
          // eslint-disable-next-line no-throw-literal
          throw 'output gremlin';
        })
      })
    );
    const result = await scan(INPUT);
    expect(result.status).toBe('failed');
    if (result.status === 'failed') {
      expect(result.reason).toContain('lvkit-output-read-failed: output gremlin');
    }
  });

  it('converts a temporary-workspace failure into a typed failed result', async () => {
    const removeDir = vi.fn((dir: string) => rm(dir, { recursive: true, force: true }));
    const scan = createLvkitViScanProvider(
      baseDeps({
        removeDir,
        makeTempDir: vi.fn(async () => {
          throw new Error('ENOSPC: no space left on device');
        })
      })
    );
    const result = await scan(INPUT);
    expect(result.status).toBe('failed');
    if (result.status === 'failed') {
      expect(result.reason).toContain('lvkit-scan-workspace-failed');
      expect(result.reason).toContain('ENOSPC');
    }
    // No temp dir was created, so cleanup must not run.
    expect(removeDir).not.toHaveBeenCalled();
  });

  it('serializes the lvkit subprocess on the shared local-runtime lock (VHS-REQ-669)', async () => {
    const release = vi.fn();
    const acquireLocalRuntimeSlot = vi.fn(async () => release);
    const scan = createLvkitViScanProvider(baseDeps({ acquireLocalRuntimeSlot }));
    const result = await scan(INPUT);
    expect(result.status).toBe('completed');
    expect(acquireLocalRuntimeSlot).toHaveBeenCalledTimes(1);
    // Default lock key targets the canonical host-native VI Server port (3363).
    expect(String(acquireLocalRuntimeSlot.mock.calls[0][0])).toContain('3363');
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('releases the shared lock even when lvkit exits non-zero (VHS-REQ-669)', async () => {
    const release = vi.fn();
    const scan = createLvkitViScanProvider(
      baseDeps({
        acquireLocalRuntimeSlot: vi.fn(async () => release),
        execFileAsync: vi.fn(async () => {
          throw Object.assign(new Error('generate failed'), { code: 2, stdout: '', stderr: 'boom' });
        })
      })
    );
    const result = await scan(INPUT);
    expect(result.status).toBe('failed');
    expect(release).toHaveBeenCalledTimes(1);
  });
});

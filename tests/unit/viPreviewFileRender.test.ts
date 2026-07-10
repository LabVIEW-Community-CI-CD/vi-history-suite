import * as path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { renderViPreviewForFile } from '../../src/reporting/viPreview/viPreviewFileRender';
import type { RunViPreviewCommandResult } from '../../src/reporting/viPreview/viPreviewExecution';

function makeDeps(
  run: RunViPreviewCommandResult,
  outputExists: boolean,
  html = '<HTML></HTML>',
  sources: { relativePath: string; sizeBytes: number }[] = []
) {
  return {
    createWorkspaceDirectory: vi.fn().mockResolvedValue('/tmp/ws'),
    listSourceFiles: vi.fn().mockResolvedValue(sources),
    ensureDirectory: vi.fn().mockResolvedValue(undefined),
    copyFile: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn().mockResolvedValue(html),
    removeDirectory: vi.fn().mockResolvedValue(undefined),
    execution: {
      runCommand: vi.fn().mockResolvedValue(run),
      pathExists: vi.fn().mockResolvedValue(outputExists)
    }
  };
}

const hostRuntime = { provider: 'host-native' as const, labviewCliPath: '/usr/local/bin/LabVIEWCLI' };

describe('renderViPreviewForFile', () => {
  it('stages the VI, reads the produced HTML, and cleans up the workspace', async () => {
    const deps = makeDeps({ exitCode: 0, stdout: '', stderr: '' }, true, '<HTML>doc</HTML>');
    const result = await renderViPreviewForFile(
      { runtime: hostRuntime, viFilePath: '/repo/My VI.vi', operationDirectory: '/ops' },
      deps
    );

    expect(result.outcome).toBe('rendered');
    expect(result.html).toBe('<HTML>doc</HTML>');
    // VI staged under the workspace "vi/" root with its original basename.
    expect(deps.copyFile).toHaveBeenCalledWith('/repo/My VI.vi', path.join('/tmp/ws', 'vi', 'My VI.vi'));
    expect(deps.readFile).toHaveBeenCalledWith(path.join('/tmp/ws', 'preview.html'));
    expect(deps.removeDirectory).toHaveBeenCalledWith('/tmp/ws');
  });

  it('stages sibling LabVIEW source files as a dependency tree and skips non-source files', async () => {
    const deps = makeDeps({ exitCode: 0, stdout: '', stderr: '' }, true, '<HTML>doc</HTML>', [
      { relativePath: 'Foo.vi', sizeBytes: 10 },
      { relativePath: 'support/Sub.vi', sizeBytes: 20 },
      { relativePath: 'notes.txt', sizeBytes: 5 }
    ]);
    const result = await renderViPreviewForFile(
      { runtime: hostRuntime, viFilePath: '/repo/Foo.vi', operationDirectory: '/ops' },
      deps
    );

    expect(result.outcome).toBe('rendered');
    expect(deps.copyFile).toHaveBeenCalledWith('/repo/Foo.vi', path.join('/tmp/ws', 'vi', 'Foo.vi'));
    expect(deps.copyFile).toHaveBeenCalledWith(
      path.join('/repo', 'support', 'Sub.vi'),
      path.join('/tmp/ws', 'vi', 'support', 'Sub.vi')
    );
    expect(deps.copyFile).not.toHaveBeenCalledWith(path.join('/repo', 'notes.txt'), expect.anything());
  });

  it('propagates a failure outcome and still removes the workspace', async () => {
    const deps = makeDeps({ exitCode: 1, stdout: '', stderr: 'broke' }, false);
    const result = await renderViPreviewForFile(
      { runtime: hostRuntime, viFilePath: '/repo/Foo.vi', operationDirectory: '/ops' },
      deps
    );

    expect(result.outcome).toBe('failed');
    expect(result.failureReason).toBe('command-exited-nonzero');
    expect(result.stderr).toBe('broke');
    expect(result.html).toBeUndefined();
    expect(deps.readFile).not.toHaveBeenCalled();
    expect(deps.removeDirectory).toHaveBeenCalledWith('/tmp/ws');
  });

  it('propagates a blocked outcome without running and still cleans up', async () => {
    const deps = makeDeps({ exitCode: 0, stdout: '', stderr: '' }, true);
    const result = await renderViPreviewForFile(
      { runtime: { provider: 'linux-container' }, viFilePath: '/repo/Foo.vi', operationDirectory: '/ops' },
      deps
    );

    expect(result.outcome).toBe('blocked');
    expect(result.failureReason).toBe('container-image-unavailable');
    expect(deps.execution.runCommand).not.toHaveBeenCalled();
    expect(deps.removeDirectory).toHaveBeenCalledWith('/tmp/ws');
  });

  it('serves a cache hit without staging or running LabVIEW', async () => {
    const deps = makeDeps({ exitCode: 0, stdout: '', stderr: '' }, true, '<HTML>fresh</HTML>', [
      { relativePath: 'Foo.vi', sizeBytes: 10, mtimeMs: 111 }
    ]);
    const cache = {
      get: vi.fn().mockResolvedValue('<HTML>cached</HTML>'),
      set: vi.fn().mockResolvedValue(undefined)
    };
    const result = await renderViPreviewForFile(
      { runtime: hostRuntime, viFilePath: '/repo/Foo.vi', operationDirectory: '/ops' },
      { ...deps, cache }
    );

    expect(result.outcome).toBe('rendered');
    expect(result.cached).toBe(true);
    expect(result.html).toBe('<HTML>cached</HTML>');
    expect(deps.createWorkspaceDirectory).not.toHaveBeenCalled();
    expect(deps.execution.runCommand).not.toHaveBeenCalled();
    expect(cache.set).not.toHaveBeenCalled();
  });

  it('renders and populates the cache on a miss', async () => {
    const deps = makeDeps({ exitCode: 0, stdout: '', stderr: '' }, true, '<HTML>fresh</HTML>', [
      { relativePath: 'Foo.vi', sizeBytes: 10, mtimeMs: 111 }
    ]);
    const cache = {
      get: vi.fn().mockResolvedValue(undefined),
      set: vi.fn().mockResolvedValue(undefined)
    };
    const result = await renderViPreviewForFile(
      { runtime: hostRuntime, viFilePath: '/repo/Foo.vi', operationDirectory: '/ops' },
      { ...deps, cache }
    );

    expect(result.outcome).toBe('rendered');
    expect(result.cached).toBe(false);
    expect(result.html).toBe('<HTML>fresh</HTML>');
    expect(deps.execution.runCommand).toHaveBeenCalledOnce();
    expect(cache.set).toHaveBeenCalledOnce();
  });

  it('uses an injected execute override instead of the default executor', async () => {
    const deps = makeDeps({ exitCode: 0, stdout: '', stderr: '' }, true, '<HTML>via-exec</HTML>', [
      { relativePath: 'Foo.vi', sizeBytes: 10, mtimeMs: 1 }
    ]);
    const execute = vi
      .fn()
      .mockResolvedValue({ outcome: 'rendered', reportFilePath: '/tmp/ws/preview.html' });
    const result = await renderViPreviewForFile(
      { runtime: hostRuntime, viFilePath: '/repo/Foo.vi', operationDirectory: '/ops' },
      { ...deps, execute }
    );

    expect(result.outcome).toBe('rendered');
    expect(result.html).toBe('<HTML>via-exec</HTML>');
    expect(execute).toHaveBeenCalledWith('/tmp/ws', 'vi/Foo.vi', 'preview.html');
    expect(deps.execution.runCommand).not.toHaveBeenCalled();
  });

  it('stages the enclosing project tree so cross-directory dependencies resolve', async () => {
    const deps = makeDeps({ exitCode: 0, stdout: '', stderr: '' }, true, '<HTML>doc</HTML>');
    const resolveStagingBaseDirectory = vi.fn().mockResolvedValue('/repo/proj');
    const listSourceFiles = vi.fn().mockResolvedValue([
      { relativePath: 'App.lvproj', sizeBytes: 5 },
      { relativePath: 'subsys/Main.vi', sizeBytes: 10 },
      { relativePath: 'shared/Helper.vi', sizeBytes: 10 }
    ]);
    const execute = vi
      .fn()
      .mockResolvedValue({ outcome: 'rendered', reportFilePath: '/tmp/ws/preview.html' });
    const result = await renderViPreviewForFile(
      { runtime: hostRuntime, viFilePath: '/repo/proj/subsys/Main.vi', operationDirectory: '/ops' },
      { ...deps, resolveStagingBaseDirectory, listSourceFiles, execute }
    );

    expect(result.outcome).toBe('rendered');
    expect(listSourceFiles).toHaveBeenCalledWith('/repo/proj');
    // Project tree staged preserving layout; the VI keeps its project-relative path
    // so its `../shared/Helper.vi` reference resolves at load time.
    expect(execute).toHaveBeenCalledWith('/tmp/ws', 'vi/subsys/Main.vi', 'preview.html');
    expect(deps.copyFile).toHaveBeenCalledWith(
      path.join('/repo/proj', 'subsys', 'Main.vi'),
      path.join('/tmp/ws', 'vi', 'subsys', 'Main.vi')
    );
    expect(deps.copyFile).toHaveBeenCalledWith(
      path.join('/repo/proj', 'shared', 'Helper.vi'),
      path.join('/tmp/ws', 'vi', 'shared', 'Helper.vi')
    );
  });
});

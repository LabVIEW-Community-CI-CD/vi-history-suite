import * as path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import {
  materializeRevisionViTree,
  parseLsTreeOutput
} from '../../src/git/revisionViTree';

describe('parseLsTreeOutput', () => {
  it('parses blob entries with sizes and ignores trees and malformed lines', () => {
    const stdout = [
      '100644 blob a1b2c3\t   1234\tlib/Foo.vi', // note: real output separates size before tab
      '100644 blob deadbeef 20\tlib/Sub.vi',
      '040000 tree feedface -\tlib/nested',
      'garbage line',
      ''
    ].join('\n');
    const entries = parseLsTreeOutput(stdout);
    // The first line's size column is malformed by the inline comment split; rely
    // on the canonical second line and the tree exclusion.
    expect(entries.some((entry) => entry.repoRelativePath === 'lib/Sub.vi' && entry.sizeBytes === 20)).toBe(true);
    expect(entries.some((entry) => entry.repoRelativePath === 'lib/nested')).toBe(false);
  });

  it('parses canonical git ls-tree -r -l output', () => {
    const stdout = '100644 blob 0abc 10\tFoo.vi\n100644 blob 1def 20\tsupport/Sub.vi\n';
    expect(parseLsTreeOutput(stdout)).toEqual([
      { repoRelativePath: 'Foo.vi', sizeBytes: 10 },
      { repoRelativePath: 'support/Sub.vi', sizeBytes: 20 }
    ]);
  });
});

describe('materializeRevisionViTree (VHS-REQ-659.15)', () => {
  function makeDeps(tree: { repoRelativePath: string; sizeBytes: number }[]) {
    return {
      listTreeFiles: vi.fn().mockResolvedValue(tree),
      readBlob: vi.fn(async (_rev: string, repoRelativePath: string) => Buffer.from(`blob:${repoRelativePath}`)),
      ensureDirectory: vi.fn().mockResolvedValue(undefined),
      writeFile: vi.fn().mockResolvedValue(undefined)
    };
  }

  it('materializes the VI plus sibling source files from a subdirectory', async () => {
    const deps = makeDeps([
      { repoRelativePath: 'lib/Foo.vi', sizeBytes: 10 },
      { repoRelativePath: 'lib/Sub.vi', sizeBytes: 20 },
      { repoRelativePath: 'lib/notes.txt', sizeBytes: 5 },
      { repoRelativePath: 'lib/deep/Bar.ctl', sizeBytes: 8 }
    ]);
    const result = await materializeRevisionViTree(
      { revisionId: 'abc123', relativePath: 'lib/Foo.vi', destinationDirectory: '/dest' },
      deps
    );

    expect(result.strategy).toBe('dependency-tree');
    expect(result.viFilePath).toBe(path.join('/dest', 'Foo.vi'));
    expect(deps.listTreeFiles).toHaveBeenCalledWith('abc123', '');
    expect(deps.readBlob).toHaveBeenCalledWith('abc123', 'lib/Foo.vi');
    expect(deps.readBlob).toHaveBeenCalledWith('abc123', 'lib/Sub.vi');
    expect(deps.readBlob).toHaveBeenCalledWith('abc123', 'lib/deep/Bar.ctl');
    expect(deps.readBlob).not.toHaveBeenCalledWith('abc123', 'lib/notes.txt');
    expect(deps.writeFile).toHaveBeenCalledWith(path.join('/dest', 'deep', 'Bar.ctl'), expect.any(Buffer));
    expect(result.stagedFileCount).toBe(3);
  });

  it('falls back to single-file when the tree listing fails, still fetching the VI', async () => {
    const deps = makeDeps([]);
    deps.listTreeFiles.mockRejectedValue(new Error('no tree'));
    const result = await materializeRevisionViTree(
      { revisionId: 'abc', relativePath: 'lib/Foo.vi', destinationDirectory: '/dest' },
      deps
    );

    expect(result.strategy).toBe('single-file');
    expect(deps.readBlob).toHaveBeenCalledWith('abc', 'lib/Foo.vi');
    expect(deps.writeFile).toHaveBeenCalledWith(path.join('/dest', 'Foo.vi'), expect.any(Buffer));
    expect(result.stagedFileCount).toBe(1);
  });

  it('skips a missing sibling but throws when the VI blob is unavailable', async () => {
    const missingSibling = makeDeps([
      { repoRelativePath: 'Foo.vi', sizeBytes: 10 },
      { repoRelativePath: 'Sub.vi', sizeBytes: 20 }
    ]);
    missingSibling.readBlob.mockImplementation(async (_rev: string, repoRelativePath: string) => {
      if (repoRelativePath === 'Sub.vi') {
        throw new Error('gone');
      }
      return Buffer.from('vi');
    });
    const ok = await materializeRevisionViTree(
      { revisionId: 'r', relativePath: 'Foo.vi', destinationDirectory: '/dest' },
      missingSibling
    );
    expect(ok.stagedFileCount).toBe(1);

    const missingVi = makeDeps([{ repoRelativePath: 'Foo.vi', sizeBytes: 10 }]);
    missingVi.readBlob.mockRejectedValue(new Error('gone'));
    await expect(
      materializeRevisionViTree(
        { revisionId: 'r', relativePath: 'Foo.vi', destinationDirectory: '/dest' },
        missingVi
      )
    ).rejects.toThrow(/Failed to read VI/);
  });

  it('widens to the enclosing project so cross-directory dependencies materialize', async () => {
    const deps = makeDeps([
      { repoRelativePath: 'App.lvproj', sizeBytes: 5 },
      { repoRelativePath: 'lib/Foo.vi', sizeBytes: 10 },
      { repoRelativePath: 'shared/Dep.vi', sizeBytes: 12 }
    ]);
    const result = await materializeRevisionViTree(
      { revisionId: 'rev', relativePath: 'lib/Foo.vi', destinationDirectory: '/dest' },
      deps
    );

    expect(result.strategy).toBe('dependency-tree');
    // The VI keeps its project-relative path so its cross-directory reference to
    // shared/Dep.vi resolves in the materialized tree.
    expect(result.viFilePath).toBe(path.join('/dest', 'lib', 'Foo.vi'));
    expect(deps.listTreeFiles).toHaveBeenCalledWith('rev', '');
    expect(deps.readBlob).toHaveBeenCalledWith('rev', 'lib/Foo.vi');
    expect(deps.readBlob).toHaveBeenCalledWith('rev', 'shared/Dep.vi');
    expect(deps.writeFile).toHaveBeenCalledWith(path.join('/dest', 'shared', 'Dep.vi'), expect.any(Buffer));
    expect(result.stagedFileCount).toBe(3);
  });
});

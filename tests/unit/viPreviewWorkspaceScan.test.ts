import { describe, expect, it } from 'vitest';

import {
  DEFAULT_WORKSPACE_SCAN_EXCLUDES,
  isViPreviewTargetFile,
  listWorkspaceViFiles,
  type ViPreviewWorkspaceDirEntry,
  type ViPreviewWorkspaceScanFsDeps
} from '../../src/reporting/viPreview/viPreviewWorkspaceScan';

/**
 * A deterministic in-memory tree keyed by directory path. Each value is the
 * list of immediate children. Paths are POSIX-joined so assertions are
 * separator-agnostic on every OS.
 */
function treeFs(tree: Record<string, ViPreviewWorkspaceDirEntry[]>): ViPreviewWorkspaceScanFsDeps {
  return {
    listDirectory: async (directory) => {
      if (!(directory in tree)) {
        throw new Error(`ENOENT ${directory}`);
      }
      return tree[directory];
    },
    joinPath: (directory, name) => `${directory}/${name}`
  };
}

function dir(name: string): ViPreviewWorkspaceDirEntry {
  return { name, isDirectory: true, isFile: false };
}
function file(name: string): ViPreviewWorkspaceDirEntry {
  return { name, isDirectory: false, isFile: true };
}

describe('isViPreviewTargetFile (VHS-REQ-671.1)', () => {
  it('accepts LabVIEW preview-target extensions case-insensitively', () => {
    expect(isViPreviewTargetFile('Widget.vi')).toBe(true);
    expect(isViPreviewTargetFile('Template.VIT')).toBe(true);
    expect(isViPreviewTargetFile('Malleable.vim')).toBe(true);
    expect(isViPreviewTargetFile('Control.CTL')).toBe(true);
  });

  it('rejects non-VI files', () => {
    expect(isViPreviewTargetFile('README.md')).toBe(false);
    expect(isViPreviewTargetFile('project.lvproj')).toBe(false);
    expect(isViPreviewTargetFile('vi.txt')).toBe(false);
  });
});

describe('listWorkspaceViFiles (VHS-REQ-671.1)', () => {
  it('recursively enumerates VI files, sorted, joined from the root', async () => {
    const fs = treeFs({
      '/repo': [dir('a'), dir('b'), file('Top.vi'), file('notes.md')],
      '/repo/a': [file('Beta.ctl'), file('Alpha.vi')],
      '/repo/b': [dir('c'), file('Mid.vim')],
      '/repo/b/c': [file('Deep.vit')]
    });
    const found = await listWorkspaceViFiles('/repo', fs);
    expect(found).toEqual([
      '/repo/Top.vi',
      '/repo/a/Alpha.vi',
      '/repo/a/Beta.ctl',
      '/repo/b/Mid.vim',
      '/repo/b/c/Deep.vit'
    ]);
  });

  it('skips the default excluded directories at every level', async () => {
    const fs = treeFs({
      '/repo': [dir('node_modules'), dir('.git'), dir('out'), dir('dist'), dir('.vscode-test'), dir('src'), file('Root.vi')],
      '/repo/node_modules': [file('Dep.vi')],
      '/repo/.git': [file('Hook.vi')],
      '/repo/out': [file('Built.vi')],
      '/repo/dist': [file('Packed.vi')],
      '/repo/.vscode-test': [file('Fixture.vi')],
      '/repo/src': [file('Real.vi')]
    });
    const found = await listWorkspaceViFiles('/repo', fs);
    expect(found).toEqual(['/repo/Root.vi', '/repo/src/Real.vi']);
    // Sanity: the default exclude set is the warmer's set.
    expect(DEFAULT_WORKSPACE_SCAN_EXCLUDES).toContain('node_modules');
  });

  it('honors a custom exclude set', async () => {
    const fs = treeFs({
      '/repo': [dir('vendor'), file('Root.vi')],
      '/repo/vendor': [file('Third.vi')]
    });
    const found = await listWorkspaceViFiles('/repo', fs, { excludeDirectories: ['vendor'] });
    expect(found).toEqual(['/repo/Root.vi']);
  });

  it('bounds recursion by maxDepth', async () => {
    const fs = treeFs({
      '/repo': [dir('one'), file('L0.vi')],
      '/repo/one': [dir('two'), file('L1.vi')],
      '/repo/one/two': [file('L2.vi')]
    });
    const found = await listWorkspaceViFiles('/repo', fs, { maxDepth: 1 });
    expect(found).toEqual(['/repo/L0.vi', '/repo/one/L1.vi']);
  });

  it('applies a positive count limit after sorting', async () => {
    const fs = treeFs({
      '/repo': [file('C.vi'), file('A.vi'), file('B.vi')]
    });
    const found = await listWorkspaceViFiles('/repo', fs, { limit: 2 });
    expect(found).toEqual(['/repo/A.vi', '/repo/B.vi']);
  });

  it('never throws on an unreadable directory (it contributes nothing)', async () => {
    const fs = treeFs({
      '/repo': [dir('ok'), dir('broken'), file('Root.vi')],
      '/repo/ok': [file('Fine.vi')]
      // '/repo/broken' intentionally absent -> listDirectory throws
    });
    const found = await listWorkspaceViFiles('/repo', fs);
    expect(found).toEqual(['/repo/Root.vi', '/repo/ok/Fine.vi']);
  });

  it('returns [] when the root itself is unreadable', async () => {
    const fs = treeFs({});
    expect(await listWorkspaceViFiles('/missing', fs)).toEqual([]);
  });
});

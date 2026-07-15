import * as path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import {
  parseGitPreviewRef,
  resolveViPreviewRenderSource,
  type ResolveViPreviewRenderSourceDeps
} from '../../src/reporting/viPreview/viPreviewRenderSource';

// path.join keeps fixtures separator-agnostic across host OSes.
const WORKING_VI = path.join(path.sep, 'workspace', 'repo', 'Dequeue Trace.vi');
const TEMP_DIR = path.join(path.sep, 'tmp', 'vihs-vi-preview-src-abc');
const MATERIALIZED_PATH = path.join(TEMP_DIR, 'Dequeue Trace.vi');
const TREE_VI_PATH = path.join(path.sep, 'tmp', 'vihs-vi-preview-tree-xyz', 'Dequeue Trace.vi');
const BLOB_BYTES = new Uint8Array([0x52, 0x53, 0x52, 0x43]);

function makeDeps(
  overrides: Partial<ResolveViPreviewRenderSourceDeps> = {}
): ResolveViPreviewRenderSourceDeps & {
  readBytes: ReturnType<typeof vi.fn>;
  createTempDirectory: ReturnType<typeof vi.fn>;
  writeFile: ReturnType<typeof vi.fn>;
  removeDirectory: ReturnType<typeof vi.fn>;
} {
  return {
    readBytes: vi.fn(async () => BLOB_BYTES),
    createTempDirectory: vi.fn(async () => TEMP_DIR),
    writeFile: vi.fn(async () => {}),
    removeDirectory: vi.fn(async () => {}),
    joinPath: (directory: string, name: string) => path.join(directory, name),
    ...overrides
  };
}

describe('resolveViPreviewRenderSource (VHS-REQ-659.8)', () => {
  it('renders a file URI in place without reading bytes or creating a temp copy', async () => {
    const deps = makeDeps();

    const source = await resolveViPreviewRenderSource({ scheme: 'file', fsPath: WORKING_VI }, deps);

    expect(source.renderPath).toBe(WORKING_VI);
    expect(source.materialized).toBe(false);
    expect(deps.readBytes).not.toHaveBeenCalled();
    expect(deps.createTempDirectory).not.toHaveBeenCalled();
    expect(deps.writeFile).not.toHaveBeenCalled();
    await expect(source.cleanup()).resolves.toBeUndefined();
    expect(deps.removeDirectory).not.toHaveBeenCalled();
  });

  it('materializes a non-file (git) base URI to a temp copy that preserves the basename', async () => {
    const deps = makeDeps();

    const source = await resolveViPreviewRenderSource({ scheme: 'git', fsPath: WORKING_VI }, deps);

    expect(source.materialized).toBe(true);
    expect(deps.readBytes).toHaveBeenCalledTimes(1);
    expect(deps.createTempDirectory).toHaveBeenCalledTimes(1);
    expect(source.renderPath).toBe(MATERIALIZED_PATH);
    expect(deps.writeFile).toHaveBeenCalledWith(MATERIALIZED_PATH, BLOB_BYTES);
  });

  it('cleanup removes the materialized temp directory for a non-file URI', async () => {
    const deps = makeDeps();

    const source = await resolveViPreviewRenderSource({ scheme: 'git', fsPath: WORKING_VI }, deps);
    await source.cleanup();

    expect(deps.removeDirectory).toHaveBeenCalledWith(TEMP_DIR);
  });

  it('cleanup never throws when temp removal fails (leftover reclaimed by the OS)', async () => {
    const deps = makeDeps({
      removeDirectory: vi.fn(async () => {
        throw new Error('EBUSY');
      })
    });

    const source = await resolveViPreviewRenderSource({ scheme: 'git', fsPath: WORKING_VI }, deps);

    await expect(source.cleanup()).resolves.toBeUndefined();
  });

  it('falls back to a default VI filename when a non-file URI has no basename', async () => {
    const deps = makeDeps();

    const source = await resolveViPreviewRenderSource({ scheme: 'untitled', fsPath: '' }, deps);

    expect(source.renderPath).toBe(path.join(TEMP_DIR, 'preview.vi'));
    expect(deps.writeFile).toHaveBeenCalledWith(path.join(TEMP_DIR, 'preview.vi'), BLOB_BYTES);
  });
});

describe('resolveViPreviewRenderSource dependency-tree base render (VHS-REQ-659.8)', () => {
  it('renders the materialized dependency tree and skips single-blob materialization', async () => {
    const treeCleanup = vi.fn(async () => {});
    const materializeTree = vi.fn(async () => ({ viFilePath: TREE_VI_PATH, cleanup: treeCleanup }));
    const deps = makeDeps({ materializeTree });

    const source = await resolveViPreviewRenderSource({ scheme: 'git', fsPath: WORKING_VI }, deps);

    expect(materializeTree).toHaveBeenCalledTimes(1);
    expect(source.materialized).toBe(true);
    expect(source.renderPath).toBe(TREE_VI_PATH);
    // The dependency tree owns its own scratch dir, so the single-blob path is skipped.
    expect(deps.readBytes).not.toHaveBeenCalled();
    expect(deps.createTempDirectory).not.toHaveBeenCalled();
    expect(deps.writeFile).not.toHaveBeenCalled();

    await source.cleanup();
    expect(treeCleanup).toHaveBeenCalledTimes(1);
    expect(deps.removeDirectory).not.toHaveBeenCalled();
  });

  it('falls back to single-blob materialization when the tree cannot be resolved (undefined)', async () => {
    const materializeTree = vi.fn(async () => undefined);
    const deps = makeDeps({ materializeTree });

    const source = await resolveViPreviewRenderSource({ scheme: 'git', fsPath: WORKING_VI }, deps);

    expect(materializeTree).toHaveBeenCalledTimes(1);
    expect(source.renderPath).toBe(MATERIALIZED_PATH);
    expect(deps.readBytes).toHaveBeenCalledTimes(1);
    expect(deps.writeFile).toHaveBeenCalledWith(MATERIALIZED_PATH, BLOB_BYTES);
  });

  it('falls back to single-blob materialization when tree materialization throws', async () => {
    const materializeTree = vi.fn(async () => {
      throw new Error('git unavailable');
    });
    const deps = makeDeps({ materializeTree });

    const source = await resolveViPreviewRenderSource({ scheme: 'git', fsPath: WORKING_VI }, deps);

    expect(source.renderPath).toBe(MATERIALIZED_PATH);
    expect(deps.readBytes).toHaveBeenCalledTimes(1);
    expect(deps.writeFile).toHaveBeenCalledWith(MATERIALIZED_PATH, BLOB_BYTES);
  });

  it('never invokes tree materialization for a file URI', async () => {
    const materializeTree = vi.fn(async () => ({ viFilePath: TREE_VI_PATH, cleanup: vi.fn(async () => {}) }));
    const deps = makeDeps({ materializeTree });

    const source = await resolveViPreviewRenderSource({ scheme: 'file', fsPath: WORKING_VI }, deps);

    expect(source.renderPath).toBe(WORKING_VI);
    expect(source.materialized).toBe(false);
    expect(materializeTree).not.toHaveBeenCalled();
  });
});

describe('parseGitPreviewRef (VHS-REQ-659.8)', () => {
  it('extracts an explicit commit ref from the git URI query', () => {
    const query = JSON.stringify({ path: '/repo/Dequeue Trace.vi', ref: 'abc1234' });
    expect(parseGitPreviewRef({ scheme: 'git', query })).toBe('abc1234');
  });

  it('normalizes the working-tree base refs (empty, "~", "HEAD", whitespace) to HEAD', () => {
    for (const ref of ['', '~', 'HEAD', '  ']) {
      const query = JSON.stringify({ ref });
      expect(parseGitPreviewRef({ scheme: 'git', query })).toBe('HEAD');
    }
  });

  it('returns undefined for a non-git scheme', () => {
    const query = JSON.stringify({ ref: 'abc1234' });
    expect(parseGitPreviewRef({ scheme: 'file', query })).toBeUndefined();
  });

  it('returns undefined when the query is empty or unparseable', () => {
    expect(parseGitPreviewRef({ scheme: 'git', query: '' })).toBeUndefined();
    expect(parseGitPreviewRef({ scheme: 'git', query: 'not json' })).toBeUndefined();
  });

  it('returns undefined when the ref is missing or not a string', () => {
    expect(parseGitPreviewRef({ scheme: 'git', query: JSON.stringify({ path: '/x' }) })).toBeUndefined();
    expect(parseGitPreviewRef({ scheme: 'git', query: JSON.stringify({ ref: 42 }) })).toBeUndefined();
  });
});

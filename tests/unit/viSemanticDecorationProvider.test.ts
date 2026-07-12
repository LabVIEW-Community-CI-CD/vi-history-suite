/**
 * Unit tests for the Source Control semantic change decoration provider
 * (VHS-REQ-660).
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('vscode', async () => {
  const { defaultVsCodeTestHarness } = await import('./vscodeTestHarness');
  return defaultVsCodeTestHarness.vscode;
});

import * as vscode from 'vscode';

import {
  computeViSemanticNarrativeCacheKey,
  type StoredViSemanticNarrative,
  type ViSemanticNarrativeCache
} from '../../src/semantic/viSemanticNarrativeCache';
import {
  isViSourceFile,
  registerViSemanticDecorationProvider,
  resolveViSemanticFileDecoration,
  VI_SEMANTIC_DECORATION_BADGE,
  ViSemanticFileDecorationProvider,
  type ViSemanticDecorationProviderDeps
} from '../../src/ui/viSemanticDecorationProvider';
import { defaultVsCodeTestHarness } from './vscodeTestHarness';

beforeEach(() => {
  defaultVsCodeTestHarness.reset();
});

describe('resolveViSemanticFileDecoration (VHS-REQ-660.3)', () => {
  it('returns the badge and the narrative tooltip when a narrative is stored', () => {
    const fields = resolveViSemanticFileDecoration({
      narrative: 'The block diagram differs.',
      changedSurfaces: ['block-diagram']
    });
    expect(fields?.badge).toBe(VI_SEMANTIC_DECORATION_BADGE);
    expect(fields?.tooltip).toContain('The block diagram differs.');
  });

  it('returns undefined when there is no narrative or the narrative is blank', () => {
    expect(resolveViSemanticFileDecoration(undefined)).toBeUndefined();
    expect(
      resolveViSemanticFileDecoration({ narrative: '   ', changedSurfaces: [] })
    ).toBeUndefined();
  });
});

describe('isViSourceFile', () => {
  it('recognizes VI source extensions and rejects others', () => {
    expect(isViSourceFile('/repo/A.vi')).toBe(true);
    expect(isViSourceFile('/repo/A.ctl')).toBe(true);
    expect(isViSourceFile('/repo/A.vit')).toBe(true);
    expect(isViSourceFile('/repo/A.txt')).toBe(false);
  });
});

function createCacheWith(entry?: {
  key: string;
  value: StoredViSemanticNarrative;
}): ViSemanticNarrativeCache {
  return {
    get: vi.fn(async (key: string) => (entry && key === entry.key ? entry.value : undefined)),
    set: vi.fn(async () => undefined)
  };
}

function baseDeps(
  overrides: Partial<ViSemanticDecorationProviderDeps> = {}
): ViSemanticDecorationProviderDeps {
  return {
    isTrusted: () => true,
    cache: createCacheWith(),
    resolveRepositoryRoot: vi.fn(async () => '/repo'),
    resolveBlobId: vi.fn(async (_root: string, ref: string) =>
      ref === 'HEAD' ? 'HEADSIG' : 'WORKSIG'
    ),
    ...overrides
  };
}

describe('ViSemanticFileDecorationProvider.provideFileDecoration (VHS-REQ-660.3, VHS-REQ-660.4)', () => {
  it('decorates a VI whose current HEAD and worktree signatures match a cached narrative', async () => {
    const key = computeViSemanticNarrativeCacheKey('Widget.vi', 'HEADSIG', 'WORKSIG');
    const provider = new ViSemanticFileDecorationProvider(
      baseDeps({
        cache: createCacheWith({
          key,
          value: { narrative: 'The block diagram differs.', changedSurfaces: ['block-diagram'] }
        })
      })
    );

    const decoration = await provider.provideFileDecoration(vscode.Uri.file('/repo/Widget.vi'));

    expect(decoration?.badge).toBe(VI_SEMANTIC_DECORATION_BADGE);
    expect(String(decoration?.tooltip)).toContain('The block diagram differs.');
  });

  it('returns no decoration when no cached narrative matches the current signatures', async () => {
    const provider = new ViSemanticFileDecorationProvider(baseDeps());
    expect(await provider.provideFileDecoration(vscode.Uri.file('/repo/Widget.vi'))).toBeUndefined();
  });

  it('returns no decoration in an untrusted workspace (VHS-REQ-660.4, VHS-REQ-012)', async () => {
    const resolveRepositoryRoot = vi.fn(async () => '/repo');
    const provider = new ViSemanticFileDecorationProvider(
      baseDeps({ isTrusted: () => false, resolveRepositoryRoot })
    );

    expect(await provider.provideFileDecoration(vscode.Uri.file('/repo/Widget.vi'))).toBeUndefined();
    expect(resolveRepositoryRoot).not.toHaveBeenCalled();
  });

  it('returns no decoration for non-VI files', async () => {
    const provider = new ViSemanticFileDecorationProvider(baseDeps());
    expect(await provider.provideFileDecoration(vscode.Uri.file('/repo/notes.txt'))).toBeUndefined();
  });

  it('returns no decoration when the VI is absent at HEAD or in the worktree', async () => {
    const provider = new ViSemanticFileDecorationProvider(
      baseDeps({
        resolveBlobId: vi.fn(async (_root: string, ref: string) =>
          ref === 'HEAD' ? undefined : 'WORKSIG'
        )
      })
    );
    expect(await provider.provideFileDecoration(vscode.Uri.file('/repo/Widget.vi'))).toBeUndefined();
  });
});

describe('ViSemanticFileDecorationProvider.refresh (VHS-REQ-660.5)', () => {
  it('fires onDidChangeFileDecorations for the refreshed target', () => {
    const provider = new ViSemanticFileDecorationProvider(baseDeps());
    const listener = vi.fn();
    provider.onDidChangeFileDecorations(listener);

    const uri = vscode.Uri.file('/repo/Widget.vi');
    provider.refresh(uri);

    expect(listener).toHaveBeenCalledWith(uri);
  });
});

describe('registerViSemanticDecorationProvider (VHS-REQ-660.5)', () => {
  it('registers the provider with the window and tracks disposables', () => {
    const context = defaultVsCodeTestHarness.createContext();

    const provider = registerViSemanticDecorationProvider(
      context as unknown as vscode.ExtensionContext,
      baseDeps()
    );

    expect(provider).toBeInstanceOf(ViSemanticFileDecorationProvider);
    expect(vscode.window.registerFileDecorationProvider).toHaveBeenCalledTimes(1);
    expect(context.subscriptions.length).toBeGreaterThanOrEqual(1);
  });
});

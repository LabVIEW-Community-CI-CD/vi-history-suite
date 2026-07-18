import * as path from 'node:path';

import * as vscode from 'vscode';

import { computeViSemanticNarrativeCacheKey } from '../semantic/viSemanticNarrativeCache';
import type {
  StoredViSemanticNarrative,
  ViSemanticNarrativeCache
} from '../semantic/viSemanticNarrativeCache';

/**
 * VHS-REQ-660: Source Control semantic change hover.
 *
 * A {@link vscode.FileDecorationProvider} that annotates a changed VI with a
 * small badge plus a hover tooltip carrying the cached semantic "what changed"
 * narrative, shown across the Source Control, Explorer, and editor-tab
 * surfaces. The decoration is served only from the narrative cache and is
 * gated on workspace trust, so a hover never triggers or blocks on a LabVIEW
 * comparison. It surfaces the working-tree change (HEAD versus the uncommitted
 * VI): the provider matches a cached narrative only while its base and selected
 * signatures still equal the VI's current HEAD and working-tree signatures. A
 * modified VI without a cached narrative shows a subtle pending badge that
 * prompts a comparison, so the feature is discoverable before one is run.
 */

/** Ref token asking the signature resolver for the current working-tree blob. */
export const VI_SEMANTIC_WORKTREE_REF = 'WORKTREE';
/** Ref token asking the signature resolver for the HEAD-committed blob. */
export const VI_SEMANTIC_HEAD_REF = 'HEAD';

/** Single-glyph badge marking a VI with an available semantic change summary. */
export const VI_SEMANTIC_DECORATION_BADGE = 'Δ';

/**
 * Subtle badge marking a modified VI whose semantic summary has not been
 * produced yet, prompting the reviewer to run a comparison.
 */
export const VI_SEMANTIC_PENDING_BADGE = '·';

/** Hover text shown on a modified VI that has no cached semantic summary yet. */
export const VI_SEMANTIC_PENDING_TOOLTIP =
  'VI changed — run Compare in VI History to see a semantic change summary.';

const VI_SOURCE_EXTENSIONS = new Set(['.vi', '.vit', '.vim', '.ctl']);

export function isViSourceFile(fsPath: string): boolean {
  return VI_SOURCE_EXTENSIONS.has(path.extname(fsPath).toLowerCase());
}

export interface ViSemanticFileDecorationFields {
  badge: string;
  tooltip: string;
}

/**
 * Pure decision function. When a semantic narrative is cached for the VI's
 * current change, returns the narrative badge and hover. Otherwise, when the VI
 * is modified relative to HEAD (`isChanged`), returns the subtle pending badge
 * that prompts a comparison. Returns undefined when there is nothing to show:
 * an unchanged VI, or a modified VI carrying a blank narrative.
 */
export function resolveViSemanticFileDecoration(
  stored: StoredViSemanticNarrative | undefined,
  isChanged = false
): ViSemanticFileDecorationFields | undefined {
  if (stored && stored.narrative.trim().length > 0) {
    return {
      badge: VI_SEMANTIC_DECORATION_BADGE,
      tooltip: `VI change: ${stored.narrative}`
    };
  }
  if (isChanged) {
    return {
      badge: VI_SEMANTIC_PENDING_BADGE,
      tooltip: VI_SEMANTIC_PENDING_TOOLTIP
    };
  }
  return undefined;
}

export interface ViSemanticDecorationProviderDeps {
  /** Workspace-trust gate; the provider decorates nothing when untrusted. */
  isTrusted: () => boolean;
  cache: ViSemanticNarrativeCache;
  /** Resolves the Git repository root that owns a file, or undefined. */
  resolveRepositoryRoot: (fsPath: string) => Promise<string | undefined>;
  /**
   * Resolves an opaque content signature (a Git blob id) for a file at a ref.
   * `ref` is {@link VI_SEMANTIC_HEAD_REF} (the HEAD-committed content) or
   * {@link VI_SEMANTIC_WORKTREE_REF} (the current on-disk content). Returns
   * undefined when the file is absent at that ref.
   */
  resolveBlobId: (
    repositoryRoot: string,
    ref: string,
    relativePath: string
  ) => Promise<string | undefined>;
}

export class ViSemanticFileDecorationProvider implements vscode.FileDecorationProvider {
  private readonly emitter = new vscode.EventEmitter<vscode.Uri | vscode.Uri[] | undefined>();

  readonly onDidChangeFileDecorations = this.emitter.event;

  constructor(private readonly deps: ViSemanticDecorationProviderDeps) {}

  /** Signals VS Code to re-query decorations (all, or a specific target). */
  refresh(target?: vscode.Uri | vscode.Uri[]): void {
    this.emitter.fire(target);
  }

  async provideFileDecoration(uri: vscode.Uri): Promise<vscode.FileDecoration | undefined> {
    if (!this.deps.isTrusted() || uri.scheme !== 'file' || !isViSourceFile(uri.fsPath)) {
      return undefined;
    }

    const repositoryRoot = await this.deps.resolveRepositoryRoot(uri.fsPath);
    if (!repositoryRoot) {
      return undefined;
    }

    const relativePath = path.relative(repositoryRoot, uri.fsPath).replace(/\\/g, '/');
    const [headSignature, worktreeSignature] = await Promise.all([
      this.deps.resolveBlobId(repositoryRoot, VI_SEMANTIC_HEAD_REF, relativePath),
      this.deps.resolveBlobId(repositoryRoot, VI_SEMANTIC_WORKTREE_REF, relativePath)
    ]);
    if (!headSignature || !worktreeSignature) {
      return undefined;
    }

    const isChanged = headSignature !== worktreeSignature;
    const stored = await this.deps.cache.get(
      computeViSemanticNarrativeCacheKey(relativePath, headSignature, worktreeSignature)
    );
    const fields = resolveViSemanticFileDecoration(stored, isChanged);
    if (!fields) {
      return undefined;
    }
    return new vscode.FileDecoration(fields.badge, fields.tooltip);
  }

  dispose(): void {
    this.emitter.dispose();
  }
}

export function registerViSemanticDecorationProvider(
  context: vscode.ExtensionContext,
  deps: ViSemanticDecorationProviderDeps
): ViSemanticFileDecorationProvider {
  const provider = new ViSemanticFileDecorationProvider(deps);
  context.subscriptions.push(vscode.window.registerFileDecorationProvider(provider));
  context.subscriptions.push(provider);
  return provider;
}

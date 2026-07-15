import * as path from 'node:path';

/**
 * VHS-REQ-659: resolve the on-disk file a VI preview should render for a given
 * editor document URI.
 *
 * The preview renders by handing an on-disk path to LabVIEW. For a `file` URI
 * that path is the document's own `fsPath`. But a Source Control diff opens the
 * base (committed) side as a non-`file` URI — the built-in Git provider uses the
 * `git` scheme — whose bytes live in the Git blob, NOT on disk. There `fsPath`
 * still resolves to the working-tree file, so the base and modified sides would
 * render identically. For any non-`file` scheme we read the document bytes
 * through the VS Code filesystem API (mirroring the non-file probe path in
 * `viMagic`) and materialize them to a throwaway temp file, so each diff side
 * renders its own content. Filesystem access is injected so the decision is
 * unit-testable without a real filesystem or VS Code host.
 */

/** Minimal URI shape the resolver needs (satisfied by `vscode.Uri`). */
export interface ViPreviewRenderSourceUri {
  scheme: string;
  fsPath: string;
}

export interface ResolveViPreviewRenderSourceDeps {
  /** Reads the full document bytes for a non-`file` URI (e.g. via `workspace.fs.readFile`). */
  readBytes: () => Promise<Uint8Array>;
  /** Creates and returns a fresh throwaway directory (e.g. via `fs.mkdtemp`). */
  createTempDirectory: () => Promise<string>;
  writeFile: (filePath: string, data: Uint8Array) => Promise<void>;
  removeDirectory: (directory: string) => Promise<void>;
  /** Joins a directory and a file name (host `path.join`). */
  joinPath: (directory: string, name: string) => string;
}

export interface ViPreviewRenderSource {
  /** Absolute on-disk path to hand to the renderer. */
  renderPath: string;
  /** True when the content was materialized to a temp file (a non-`file` URI). */
  materialized: boolean;
  /** Removes any materialized temp content; a no-op for `file` URIs. Never throws. */
  cleanup: () => Promise<void>;
}

/** Fallback name when a non-`file` URI carries no usable basename. */
const FALLBACK_VI_FILENAME = 'preview.vi';

const NO_OP_CLEANUP = async (): Promise<void> => {
  /* on-disk file URIs own nothing to clean up */
};

/**
 * Returns the file the preview should render for `uri`. A `file` URI renders in
 * place; any other scheme is materialized to a temp copy that the caller must
 * dispose via the returned `cleanup`.
 */
export async function resolveViPreviewRenderSource(
  uri: ViPreviewRenderSourceUri,
  deps: ResolveViPreviewRenderSourceDeps
): Promise<ViPreviewRenderSource> {
  if (uri.scheme === 'file') {
    return { renderPath: uri.fsPath, materialized: false, cleanup: NO_OP_CLEANUP };
  }

  // Preserve the VI's basename and extension so LabVIEW sees the real file name;
  // the URI path carries it even for non-`file` schemes.
  const fileName = path.basename(uri.fsPath) || FALLBACK_VI_FILENAME;
  const bytes = await deps.readBytes();
  const directory = await deps.createTempDirectory();
  const renderPath = deps.joinPath(directory, fileName);
  await deps.writeFile(renderPath, bytes);

  return {
    renderPath,
    materialized: true,
    cleanup: async () => {
      try {
        await deps.removeDirectory(directory);
      } catch {
        /* best-effort: a leftover temp directory is reclaimed by the OS */
      }
    }
  };
}

/**
 * VHS-REQ-659: preview render-mode selection.
 *
 * A successful single-VI render produces NI's flat `PrintToSingleFileHtml`
 * document. The preview can display it two ways:
 *
 *  - **interactive** — build a {@link ViPreviewFramesModel} from the flat
 *    export's block-diagram images ({@link buildFramesModelFromFlatExport}) and
 *    render the scripted in-place case-stepper viewer
 *    ({@link buildViPreviewFramesViewerHtml}).
 *  - **document** — the existing static, script-free flat webview
 *    ({@link buildViPreviewWebviewHtml}) with its strict CSP.
 *
 * This module is the pure decision + assembly layer between them: given the
 * rendered LabVIEW HTML, the requested mode, and a per-load nonce, it returns
 * the finished webview document plus the mode actually used. The interactive
 * mode falls back to the document mode when the export yields no extractable
 * block-diagram frames (e.g. a control `.ctl` with no diagram), so a viewer
 * request can never produce an empty pane. Keeping selection pure makes the
 * fallback logic unit-testable without a webview host.
 */

import { buildFramesModelFromFlatExport } from './viPreviewFlatFrames';
import { buildViPreviewFramesViewerHtml } from './viPreviewFramesViewer';
import { buildViPreviewWebviewHtml } from './viPreviewWebview';

/** Which preview presentation to produce for a rendered document. */
export type ViPreviewRenderMode = 'interactive' | 'document';

export interface SelectViPreviewDocumentOptions {
  /** The rendered LabVIEW `PrintToSingleFileHtml` document. */
  labviewHtml: string;
  /** Requested presentation. */
  mode: ViPreviewRenderMode;
  /**
   * Per-load nonce for the interactive viewer's CSP (required only for
   * interactive mode; the webview host must pass the same nonce to the webview).
   */
  nonce?: string;
}

export interface SelectedViPreviewDocument {
  /** The finished webview document HTML. */
  html: string;
  /** The presentation actually used (may differ from the request on fallback). */
  mode: ViPreviewRenderMode;
}

/**
 * Assembles the webview document for a rendered preview in the requested mode.
 * Returns the document mode unchanged for `document`, and for `interactive`
 * either the frames viewer (when frames extract and a nonce is supplied) or a
 * graceful fallback to the document mode.
 */
export function selectViPreviewDocument(
  options: SelectViPreviewDocumentOptions
): SelectedViPreviewDocument {
  const documentFallback = (): SelectedViPreviewDocument => ({
    html: buildViPreviewWebviewHtml({ kind: 'rendered', labviewHtml: options.labviewHtml }),
    mode: 'document'
  });

  if (options.mode !== 'interactive') {
    return documentFallback();
  }

  // The interactive viewer runs inline script under a nonce CSP; without a nonce
  // it cannot be built safely, so fall back rather than emit an unusable pane.
  if (!options.nonce) {
    return documentFallback();
  }

  const model = buildFramesModelFromFlatExport(options.labviewHtml);
  if (!model) {
    return documentFallback();
  }

  return {
    html: buildViPreviewFramesViewerHtml(model, options.nonce),
    mode: 'interactive'
  };
}

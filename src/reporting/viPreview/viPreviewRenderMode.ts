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
 * the finished webview document plus the mode actually used. For interactive
 * mode it prefers a position-aware coordinate frames payload when supplied
 * (explicitly, or via an inert island embedded in the rendered HTML;
 * {@link buildFramesModelFromCoordinateJson}) and otherwise reconstructs from
 * the flat export. The interactive
 * mode falls back to the document mode when the export yields no extractable
 * block-diagram frames (e.g. a control `.ctl` with no diagram) or when the
 * reconstructed frames model is too low-fidelity to present faithfully (a
 * complex, coordinate-less diagram; see {@link assessFramesModelFidelity}), so a
 * viewer request can never produce an empty or misleading pane. Keeping
 * selection pure makes the fallback logic unit-testable without a webview host.
 */

import { buildFramesModelFromFlatExport, assessFramesModelFidelity } from './viPreviewFlatFrames';
import {
  buildFramesModelFromCoordinateJson,
  extractEmbeddedCoordinateFramesJson
} from './viPreviewFramesModel';
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
  /**
   * Optional position-aware ("PrintToImagesJson") frames payload (JSON string or
   * parsed value) carrying the diagram's real coordinates. When present, valid,
   * and interactive mode is requested with a nonce, it is PREFERRED over the
   * coordinate-less flat-export reconstruction and renders the interactive viewer
   * directly (no size-grouping fidelity gate — a coordinate model is faithful by
   * construction). When omitted, an inert coordinate island embedded in
   * `labviewHtml` (see {@link extractEmbeddedCoordinateFramesJson}) is used as a
   * fallback source. Absent/invalid payloads fall back to the flat-export path.
   */
  coordinateFramesJson?: string | unknown;
}

export interface SelectedViPreviewDocument {
  /** The finished webview document HTML. */
  html: string;
  /** The presentation actually used (may differ from the request on fallback). */
  mode: ViPreviewRenderMode;
  /**
   * When an `interactive` request was downgraded to `document`, a concise reason
   * (e.g. the diagram is too complex to reconstruct faithfully). Undefined when
   * the returned mode matches the request or `document` was requested outright.
   */
  fallbackReason?: string;
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
  const documentFallback = (fallbackReason?: string, notice?: string): SelectedViPreviewDocument => ({
    html: buildViPreviewWebviewHtml({ kind: 'rendered', labviewHtml: options.labviewHtml, notice }),
    mode: 'document',
    ...(fallbackReason ? { fallbackReason } : {})
  });

  if (options.mode !== 'interactive') {
    return documentFallback();
  }

  // The interactive viewer runs inline script under a nonce CSP; without a nonce
  // it cannot be built safely, so fall back rather than emit an unusable pane.
  if (!options.nonce) {
    return documentFallback();
  }

  // Prefer a position-aware coordinate model when available: it carries the
  // diagram's real geometry, so it renders the interactive viewer faithfully even
  // for complex diagrams the flat reconstruction would reject. The payload is
  // taken from the explicit option first, else from an inert island the export
  // may have embedded in the rendered HTML (which survives the render cache
  // unchanged, so cold == warm with no cache-format change).
  const coordinateSource =
    options.coordinateFramesJson !== undefined
      ? options.coordinateFramesJson
      : extractEmbeddedCoordinateFramesJson(options.labviewHtml);
  if (coordinateSource !== undefined) {
    const coordinateModel = buildFramesModelFromCoordinateJson(coordinateSource);
    if (coordinateModel) {
      return {
        html: buildViPreviewFramesViewerHtml(coordinateModel, options.nonce),
        mode: 'interactive'
      };
    }
    // An absent/invalid coordinate payload is not fatal — fall through to the
    // flat-export path below (which may itself fall back to the document view).
  }

  const model = buildFramesModelFromFlatExport(options.labviewHtml);
  if (!model) {
    return documentFallback();
  }

  // The flat export carries no node coordinates, so a complex diagram
  // reconstructs into a large, misleading vertical stack. When the model is too
  // low-fidelity to present faithfully, fall back to the faithful flat document
  // view rather than an interactive layout that misrepresents the diagram, and
  // tell the user why the interactive stepper was skipped.
  const fidelity = assessFramesModelFidelity(model);
  if (!fidelity.faithful) {
    const reason =
      fidelity.reason ?? 'the diagram is too complex to reconstruct faithfully from the flat export';
    return documentFallback(
      reason,
      `Showing the full flat preview. The interactive block-diagram viewer was skipped because ${reason}.`
    );
  }

  return {
    html: buildViPreviewFramesViewerHtml(model, options.nonce),
    mode: 'interactive'
  };
}

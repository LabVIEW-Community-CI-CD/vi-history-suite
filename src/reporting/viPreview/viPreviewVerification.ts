import type { ViPreviewRuntimeSelection } from './viPreviewExecution';
import {
  renderViPreviewForFile,
  type RenderViPreviewForFileDeps,
  type RenderViPreviewForFileResult
} from './viPreviewFileRender';

/**
 * VHS-REQ-659: durable verification for single-VI preview rendering.
 *
 * The preview feature is otherwise only exercised by throwaway drivers and
 * VS Code host glue that CI cannot run. This pure core renders a known sample VI
 * through the resolved preview runtime and summarizes the outcome into a proof
 * object, so both the `vihs` proof CLI (driven on the maintainer runner) and the
 * VS Code integration test can produce the same repeatable evidence. It is pure
 * (filesystem/process boundaries are injected via `RenderViPreviewForFileDeps`)
 * so the summary logic stays unit-testable without a LabVIEW runtime.
 */

export interface ViPreviewVerificationProof {
  /** Render outcome for the sample VI. */
  outcome: 'rendered' | 'blocked' | 'failed';
  /** Runtime provider that produced (or blocked) the render. */
  provider: string;
  /** Absolute path of the sample VI that was rendered. */
  sampleViPath: string;
  /** Size of the produced HTML document (0 when not rendered). */
  htmlBytes: number;
  /** Inline base64-PNG images embedded in the document (0 when not rendered). */
  inlineImageCount: number;
  /** True when the document was served from the render cache. */
  cached: boolean;
  /** Failure/blocked reason, when the outcome was not `rendered`. */
  failureReason?: string;
  /** Truncated render stderr, when the outcome was not `rendered` (for triage). */
  stderr?: string;
}

/**
 * Counts the inline base64-PNG data URIs NI's `PrintToSingleFileHtml` embeds
 * (connector pane, front panel, block diagram, subVI icons, hierarchy). A real
 * render always embeds at least one; zero means nothing was actually rendered.
 */
export function countInlinePreviewImages(html: string | undefined): number {
  if (!html) {
    return 0;
  }
  return (html.match(/data:image\/png;base64,/g) ?? []).length;
}

/** Summarizes a render result into a proof object. */
export function summarizeViPreviewRender(
  runtimeProvider: string,
  sampleViPath: string,
  result: RenderViPreviewForFileResult
): ViPreviewVerificationProof {
  return {
    outcome: result.outcome,
    provider: runtimeProvider,
    sampleViPath,
    htmlBytes: result.html?.length ?? 0,
    inlineImageCount: countInlinePreviewImages(result.html),
    cached: result.cached ?? false,
    failureReason: result.failureReason,
    stderr: result.stderr ? result.stderr.slice(-4000) : undefined
  };
}

/**
 * A verification passes only when the sample VI actually rendered to a
 * self-contained document with at least one embedded image — an empty or
 * image-less document does not prove the renderer worked.
 */
export function isViPreviewVerificationPassing(proof: ViPreviewVerificationProof): boolean {
  return proof.outcome === 'rendered' && proof.inlineImageCount > 0;
}

export interface VerifyViPreviewRenderOptions {
  runtime: ViPreviewRuntimeSelection;
  /** Absolute path to the sample VI to render as the verification input. */
  sampleViPath: string;
  /** Directory that contains the `PrintToSingleFileHtml/` operation folder. */
  operationDirectory: string;
}

/**
 * Renders the sample VI through the resolved runtime and returns a proof object.
 * Never throws for a render failure — a failure is reported as a `failed`/
 * `blocked` proof so callers can emit it as evidence rather than crash.
 */
export async function verifyViPreviewRender(
  options: VerifyViPreviewRenderOptions,
  deps: RenderViPreviewForFileDeps
): Promise<ViPreviewVerificationProof> {
  const result = await renderViPreviewForFile(
    {
      runtime: options.runtime,
      viFilePath: options.sampleViPath,
      operationDirectory: options.operationDirectory
    },
    deps
  );
  return summarizeViPreviewRender(options.runtime.provider, options.sampleViPath, result);
}

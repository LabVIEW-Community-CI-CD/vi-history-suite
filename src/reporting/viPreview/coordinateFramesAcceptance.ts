import {
  buildFramesModelFromCoordinateJson,
  extractEmbeddedCoordinateFramesJson,
  EMBEDDED_COORDINATE_FRAMES_ISLAND_ID,
  type ViPreviewFramesModel
} from './viPreviewFramesModel';

/**
 * VHS-REQ-703.9 (epic #2262): acceptance predicate for the coordinate-frames
 * preview export.
 *
 * Pixel-precise correlation region overlays depend on a LabVIEW-authored preview
 * export that embeds an `lvr-coordinate-frames` JSON island in its rendered HTML
 * (the consumer side — {@link extractEmbeddedCoordinateFramesJson} /
 * {@link buildFramesModelFromCoordinateJson} — already ships). This module is the
 * reusable, deterministic predicate that grades a rendered HTML document against
 * that contract: does it carry a valid, non-empty, geometry-bearing island? A
 * CI or maintainer harness uses it to PASS/FAIL a real render, so the emitter has
 * an automatic acceptance gate. Pure and dependency-free (no runtime, no DOM),
 * so it is unit-testable without a LabVIEW render.
 */

/** A stable, machine-readable reason a render fails coordinate-frames acceptance. */
export type CoordinateFramesIssueId =
  | 'island-absent'
  | 'island-unparseable'
  | 'frames-empty'
  | 'no-frame-geometry'
  | 'no-frame-images';

/** The graded assessment of a rendered HTML document's coordinate-frames island. */
export interface CoordinateFramesAssessment {
  /** True only when the island is present, parses, and is fit for region overlays. */
  accepted: boolean;
  /** True when the `lvr-coordinate-frames` island is present in the HTML at all. */
  islandPresent: boolean;
  /** Total normalized frames (0 when absent/unparseable/empty). */
  frameCount: number;
  /** Frames whose rectangle has a positive width AND height (real geometry). */
  framesWithGeometry: number;
  /** Frames carrying a non-empty inline image. */
  framesWithImages: number;
  /** Resolved root frame index, or null when there is no model. */
  rootIndex: number | null;
  /** Stable issue ids explaining a non-accepted assessment (empty when accepted). */
  issues: CoordinateFramesIssueId[];
}

/** The island element id the LabVIEW export must use (re-exported for harness use). */
export const COORDINATE_FRAMES_ISLAND_ID = EMBEDDED_COORDINATE_FRAMES_ISLAND_ID;

function gradeModel(model: ViPreviewFramesModel): {
  framesWithGeometry: number;
  framesWithImages: number;
} {
  let framesWithGeometry = 0;
  let framesWithImages = 0;
  for (const frame of model.frames) {
    if (frame.rect.width > 0 && frame.rect.height > 0) {
      framesWithGeometry += 1;
    }
    if (typeof frame.image === 'string' && frame.image.length > 0) {
      framesWithImages += 1;
    }
  }
  return { framesWithGeometry, framesWithImages };
}

/**
 * Grades a rendered LabVIEW HTML document against the coordinate-frames export
 * contract. `accepted` is true only when the island is present, parses into a
 * non-empty frames model, at least one frame carries real geometry (positive
 * width and height — the whole point of the coordinate export), and at least one
 * frame carries an image. Every failure mode is reported with a stable issue id
 * so a harness can print actionable evidence.
 */
export function assessCoordinateFramesIsland(html: string): CoordinateFramesAssessment {
  const raw = typeof html === 'string' ? extractEmbeddedCoordinateFramesJson(html) : undefined;
  if (raw === undefined) {
    return {
      accepted: false,
      islandPresent: false,
      frameCount: 0,
      framesWithGeometry: 0,
      framesWithImages: 0,
      rootIndex: null,
      issues: ['island-absent']
    };
  }

  const model = buildFramesModelFromCoordinateJson(raw);
  if (model === undefined) {
    // The island tag is present but its JSON is unparseable or not a frames array.
    return {
      accepted: false,
      islandPresent: true,
      frameCount: 0,
      framesWithGeometry: 0,
      framesWithImages: 0,
      rootIndex: null,
      issues: ['island-unparseable']
    };
  }

  const frameCount = model.frames.length;
  if (frameCount === 0) {
    return {
      accepted: false,
      islandPresent: true,
      frameCount: 0,
      framesWithGeometry: 0,
      framesWithImages: 0,
      rootIndex: model.rootIndex,
      issues: ['frames-empty']
    };
  }

  const { framesWithGeometry, framesWithImages } = gradeModel(model);
  const issues: CoordinateFramesIssueId[] = [];
  if (framesWithGeometry === 0) {
    issues.push('no-frame-geometry');
  }
  if (framesWithImages === 0) {
    issues.push('no-frame-images');
  }

  return {
    accepted: issues.length === 0,
    islandPresent: true,
    frameCount,
    framesWithGeometry,
    framesWithImages,
    rootIndex: model.rootIndex,
    issues
  };
}

/** One-line, human-readable summary of an assessment for harness/log output. */
export function describeCoordinateFramesAssessment(assessment: CoordinateFramesAssessment): string {
  if (assessment.accepted) {
    return (
      `coordinate-frames island ACCEPTED: ${assessment.frameCount} frame(s), ` +
      `${assessment.framesWithGeometry} with geometry, ${assessment.framesWithImages} with images ` +
      `(root #${assessment.rootIndex}).`
    );
  }
  const detail = assessment.islandPresent
    ? `island present but not acceptable (${assessment.frameCount} frame(s))`
    : `no ${COORDINATE_FRAMES_ISLAND_ID} island in the rendered HTML`;
  return `coordinate-frames island REJECTED: ${detail}; issues: ${assessment.issues.join(', ')}.`;
}

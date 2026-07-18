/**
 * Pure helpers for turning the overview "side-by-side" difference images
 * embedded in a self-contained NI comparison report into uploadable payloads.
 *
 * The comparison report is a single self-contained HTML whose overview images
 * are inlined as `data:` URIs. GitHub strips `data:` image URIs from rendered
 * comments, so to show a block-diagram/front-panel diff *inline* in a PR
 * comment the images must be decoded and hosted at a fetchable URL. This module
 * is the dependency-free decode/selection step; the hosting (upload) and
 * rendering live elsewhere so this stays fully unit-testable with no network.
 */

/** A decoded overview difference image ready to upload to an image host. */
export interface OverviewImageUpload {
  /** Human label, e.g. "Block Diagram — changed". */
  caption: string;
  /** MIME type parsed from the data URI, e.g. `image/png`. */
  contentType: string;
  /** Base64 payload (no `data:` prefix), suitable for the GitHub contents API. */
  base64: string;
}

/** The overview-section shape this module needs (structurally matches the NI parser). */
export interface OverviewImageSource {
  caption: string;
  images: readonly { sourceRelativePath: string }[];
}

/**
 * Parses a `data:<mime>;base64,<payload>` image URI into its content type and
 * base64 payload, or returns `null` when the string is not a base64 image data
 * URI (for example a plain file path in a non-self-contained report).
 */
export function parseImageDataUri(src: string): { contentType: string; base64: string } | null {
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,([\s\S]+)$/.exec(src.trim());
  if (!match) {
    return null;
  }
  const base64 = match[2].replace(/\s+/g, '');
  if (base64.length === 0) {
    return null;
  }
  return { contentType: match[1], base64 };
}

/**
 * Selects and decodes the overview difference images from parsed report
 * overview sections, capped at `maxImages` (the overview images are the
 * block-diagram/front-panel comparison shots a reviewer wants; per-change detail
 * thumbnails are excluded by construction). Non-data-URI sources are skipped.
 * Each section's images are labeled base/changed by position.
 */
export function collectOverviewImageUploads(
  sections: readonly OverviewImageSource[],
  maxImages = 6
): OverviewImageUpload[] {
  const uploads: OverviewImageUpload[] = [];
  for (const section of sections) {
    const caption = section.caption.trim();
    section.images.forEach((image, index) => {
      if (uploads.length >= maxImages) {
        return;
      }
      const parsed = parseImageDataUri(image.sourceRelativePath);
      if (!parsed) {
        return;
      }
      const side = section.images.length === 2 ? (index === 0 ? ' — base' : ' — changed') : '';
      uploads.push({
        caption: `${caption.length > 0 ? caption : 'Comparison'}${side}`,
        contentType: parsed.contentType,
        base64: parsed.base64
      });
    });
    if (uploads.length >= maxImages) {
      break;
    }
  }
  return uploads;
}

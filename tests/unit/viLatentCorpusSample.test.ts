import { describe, expect, it } from 'vitest';

import { buildViSemanticComparisonModelFromHtml } from '../../src/semantic/viSemanticModel';
import {
  buildViLatentCorpusSample,
  type ViLatentCorpusProvenance
} from '../../src/semantic/viLatentCorpusSample';
import {
  VI_LATENT_CORPUS_SAMPLE_SCHEMA_ID,
  VI_PREVIEW_REGION_CORRELATION_SCHEMA_ID,
  validateViSemanticDocument
} from '../../src/semantic/viSemanticSchemas';

/** A real minimal PNG header (signature + IHDR width/height) so `readPngDimensions`
 * resolves the fixture's pixel size and byte-exact content matching still works. */
function pngHeader(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(24);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  bytes.set([0x00, 0x00, 0x00, 0x0d], 8); // IHDR length (13)
  bytes.set([0x49, 0x48, 0x44, 0x52], 12); // "IHDR"
  bytes.set([(width >>> 24) & 0xff, (width >>> 16) & 0xff, (width >>> 8) & 0xff, width & 0xff], 16);
  bytes.set(
    [(height >>> 24) & 0xff, (height >>> 16) & 0xff, (height >>> 8) & 0xff, height & 0xff],
    20
  );
  return bytes;
}

function pngDataUri(width: number, height: number): string {
  return `data:image/png;base64,${Buffer.from(pngHeader(width, height)).toString('base64')}`;
}

const CHANGED_MODEL = buildViSemanticComparisonModelFromHtml(
  `<h1 class="report-title">R</h1>
   <h2 class="section-header">Detailed Information</h2>
   <details><summary class="difference-heading">3. Block Diagram objects</summary>
     <ol>
       <li class="diff-detail">SubVI "X.vi" - added at (1570,358)</li>
       <li class="diff-detail">SubVI "Y.vi" - deleted at (10,20)</li>
     </ol></details>`,
  {}
);

const EMPTY_MODEL = buildViSemanticComparisonModelFromHtml(
  `<h1 class="report-title">R</h1>`,
  {}
);

const PROVENANCE: ViLatentCorpusProvenance = {
  viPath: 'resource/plugins/lv_icon.vi',
  baseRevision: '537683a',
  headRevision: 'fc09736',
  runtime: { engine: 'labview-cli', provider: 'docker', bitness: 'x64', version: '2026q1' }
};

describe('buildViLatentCorpusSample (VHS-REQ-703.16)', () => {
  it('round-trips provenance and marks the comparison report always available', () => {
    const sample = buildViLatentCorpusSample({ provenance: PROVENANCE, model: CHANGED_MODEL });
    expect(sample.schema).toBe(VI_LATENT_CORPUS_SAMPLE_SCHEMA_ID);
    expect(sample.provenance).toEqual(PROVENANCE);
    expect(sample.artifacts.comparisonReportAvailable).toBe(true);
    expect(sample.correlation.schema).toBe(VI_PREVIEW_REGION_CORRELATION_SCHEMA_ID);
    expect(sample.correlation.entries).toHaveLength(2);
  });

  it('reports preview availability honestly from the supplied preview images', () => {
    const withHead = buildViLatentCorpusSample({
      provenance: PROVENANCE,
      model: CHANGED_MODEL,
      previewImages: { head: [pngDataUri(40, 30)] }
    });
    expect(withHead.artifacts.basePreviewAvailable).toBe(false);
    expect(withHead.artifacts.headPreviewAvailable).toBe(true);
    expect(withHead.previewImageCounts).toEqual({ base: 0, head: 1 });

    const noPreviews = buildViLatentCorpusSample({ provenance: PROVENANCE, model: CHANGED_MODEL });
    expect(noPreviews.artifacts.basePreviewAvailable).toBe(false);
    expect(noPreviews.artifacts.headPreviewAvailable).toBe(false);
  });

  it('validates against the published vi-latent-corpus-sample@v1 schema', () => {
    const sample = buildViLatentCorpusSample({
      provenance: PROVENANCE,
      model: CHANGED_MODEL,
      previewImages: { head: [pngDataUri(40, 30)] },
      resolveDifferenceImage: (s) => (s.id === 'X.vi' ? pngDataUri(40, 30) : undefined)
    });
    const result = validateViSemanticDocument(sample);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    // The byte-exact association was serialized into the sample, with the pixel
    // size resolved from the real PNG header.
    expect(sample.imageAssociations).toHaveLength(1);
    expect(sample.imageAssociations[0]).toMatchObject({
      id: 'X.vi',
      side: 'head',
      pixelSize: { width: 40, height: 30 }
    });
  });

  it('yields an empty-but-valid sample for a no-difference model', () => {
    const sample = buildViLatentCorpusSample({ provenance: PROVENANCE, model: EMPTY_MODEL });
    expect(sample.correlation.entries).toEqual([]);
    expect(sample.imageAssociations).toEqual([]);
    expect(validateViSemanticDocument(sample).valid).toBe(true);
  });

  it('keeps changes diagram-space-only when no locator is injected (no fabricated pixels)', () => {
    const sample = buildViLatentCorpusSample({ provenance: PROVENANCE, model: CHANGED_MODEL });
    expect(sample.correlation.totals.locatedRegionCount).toBe(0);
    expect(sample.correlation.totals.diagramOnlyRegionCount).toBe(2);
    for (const entry of sample.correlation.entries) {
      expect(entry.located).toBe(false);
      expect(entry.regions).toEqual([]);
    }
  });

  it('keeps same-name object occurrences uniquely joinable via sourceIndex', () => {
    // Two calls to the same-named SubVI collide on id; sourceIndex disambiguates.
    const twoOfSameName = buildViSemanticComparisonModelFromHtml(
      `<h1 class="report-title">R</h1>
       <h2 class="section-header">Detailed Information</h2>
       <details><summary class="difference-heading">3. Block Diagram objects</summary>
         <ol>
           <li class="diff-detail">SubVI "X.vi" - added at (10,20)</li>
           <li class="diff-detail">SubVI "X.vi" - added at (30,40)</li>
         </ol></details>`,
      {}
    );
    const sample = buildViLatentCorpusSample({ provenance: PROVENANCE, model: twoOfSameName });
    expect(sample.correlation.entries.map((e) => e.id)).toEqual(['X.vi', 'X.vi']);
    // Same id, but distinct stable occurrence keys in report order.
    expect(sample.correlation.entries.map((e) => e.sourceIndex)).toEqual([0, 1]);
    expect(validateViSemanticDocument(sample).valid).toBe(true);
  });

  it('carries the association occurrence key matching its correlation entry', () => {
    const sample = buildViLatentCorpusSample({
      provenance: PROVENANCE,
      model: CHANGED_MODEL,
      previewImages: { head: [pngDataUri(40, 30)] },
      resolveDifferenceImage: (s) => (s.id === 'X.vi' ? pngDataUri(40, 30) : undefined)
    });
    const assoc = sample.imageAssociations[0];
    const matchingEntry = sample.correlation.entries.find((e) => e.sourceIndex === assoc.sourceIndex);
    expect(matchingEntry?.id).toBe(assoc.id);
  });

  it('takes preview availability from provider metadata when supplied (VHS-REQ-703.17)', () => {
    const sample = buildViLatentCorpusSample({
      provenance: PROVENANCE,
      model: CHANGED_MODEL,
      previewAvailability: {
        base: { available: false },
        head: { available: true, inlineImageCount: 3 }
      }
    });
    // Provider metadata is the source of truth (no raw bytes threaded).
    expect(sample.artifacts.basePreviewAvailable).toBe(false);
    expect(sample.artifacts.headPreviewAvailable).toBe(true);
    expect(sample.previewImageCounts).toEqual({ base: 0, head: 3 });
    expect(validateViSemanticDocument(sample).valid).toBe(true);
  });

  it('omits unobserved runtime facts rather than serializing undefined', () => {
    const sample = buildViLatentCorpusSample({
      provenance: {
        viPath: 'a.vi',
        baseRevision: 'aaa',
        headRevision: 'bbb',
        runtime: { engine: 'labview-cli' }
      },
      model: EMPTY_MODEL
    });
    expect(sample.provenance.runtime).toEqual({ engine: 'labview-cli' });
    expect(Object.prototype.hasOwnProperty.call(sample.provenance.runtime, 'provider')).toBe(false);
    expect(validateViSemanticDocument(sample).valid).toBe(true);
  });
});

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

/** Minimal 1x1-ish PNG data URI whose payload is stable for byte-exact matching. */
function pngDataUri(width: number, height: number): string {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  const payload = Buffer.concat([Buffer.from('IHDR-'), ihdr]).toString('base64');
  return `data:image/png;base64,${payload}`;
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
    // The byte-exact association was serialized into the sample.
    expect(sample.imageAssociations).toHaveLength(1);
    expect(sample.imageAssociations[0]).toMatchObject({ id: 'X.vi', side: 'head' });
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

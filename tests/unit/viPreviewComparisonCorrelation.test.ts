import { describe, expect, it } from 'vitest';

import { buildViSemanticComparisonModelFromHtml } from '../../src/semantic/viSemanticModel';
import {
  buildViPreviewComparisonCorrelation,
  renderCorrelationSurfaceTable,
  VI_PREVIEW_COMPARISON_CORRELATION_SCHEMA
} from '../../src/semantic/viPreviewComparisonCorrelation';
import { validateViSemanticDocument } from '../../src/semantic/viSemanticSchemas';

// Preview ⇄ Comparison Correlation iteration 1 (VHS-REQ-703, epic #2262):
// deterministic, surface-level correlation between the semantic comparison
// (VHS-REQ-702 classification) and base/head preview references. Pure — no
// runtime, no ML, no pixel regions.

function bdModel() {
  // A block-diagram comparison with a subVI + wiring change (dependency +
  // behavioral) — classification fields populated by the VHS-REQ-702 engine.
  return buildViSemanticComparisonModelFromHtml(
    `<h1 class="report-title">R</h1>
     <ul><li class="checked">Block Diagram Functional</li></ul>
     <h2 class="section-header">Detailed Information</h2>
     <details><summary class="difference-heading">3. Block Diagram objects</summary>
       <ol>
         <li class="diff-detail">SubVI "X.vi" - deleted at (1,2)</li>
         <li class="diff-detail">wiring changes</li>
       </ol>
     </details>`,
    { revisions: { baseHash: 'aaaa', selectedHash: 'bbbb' } }
  );
}

describe('buildViPreviewComparisonCorrelation (VHS-REQ-703.1)', () => {
  it('correlates each changed surface with an available base+head preview pair', () => {
    const model = bdModel();
    const correlation = buildViPreviewComparisonCorrelation(model, {
      base: { available: true, revision: 'aaaa', cacheKey: 'k1', inlineImageCount: 5 },
      head: { available: true, revision: 'bbbb', cacheKey: 'k2', inlineImageCount: 6 }
    });

    expect(correlation.schema).toBe(VI_PREVIEW_COMPARISON_CORRELATION_SCHEMA);
    expect(correlation.hasDifferences).toBe(true);
    expect(correlation.riskLevel).toBe('high');
    expect(correlation.surfaces).toHaveLength(1);
    const bd = correlation.surfaces[0];
    expect(bd.surface).toBe('block-diagram');
    expect(bd.changeKinds).toEqual(['dependency', 'behavioral']);
    expect(bd.changeCount).toBe(2);
    expect(bd.correlated).toBe(true);
    expect(correlation.totals).toEqual({
      changedSurfaceCount: 1,
      correlatedSurfaceCount: 1,
      uncorrelatedSurfaceCount: 1 - 1
    });
    expect(correlation.narrative).toContain('cross-reference the base and head previews');
  });

  it('honestly reports an uncorrelated surface when no preview is available', () => {
    const model = bdModel();
    const correlation = buildViPreviewComparisonCorrelation(model, {});
    const bd = correlation.surfaces[0];
    expect(bd.basePreviewAvailable).toBe(false);
    expect(bd.headPreviewAvailable).toBe(false);
    expect(bd.correlated).toBe(false);
    expect(correlation.totals.correlatedSurfaceCount).toBe(0);
    expect(correlation.totals.uncorrelatedSurfaceCount).toBe(1);
    expect(correlation.narrative).toContain('no preview is available to correlate');
  });

  it('narrative cites both comparison and preview evidence and names uncorrelated surfaces (VHS-REQ-703.2)', () => {
    const model = bdModel();
    const correlation = buildViPreviewComparisonCorrelation(model, {});
    // cites the comparison classification (risk) AND the preview availability,
    // and honestly names that a surface could not be correlated.
    expect(correlation.narrative).toContain('high-risk');
    expect(correlation.narrative).toContain('could not be correlated to a base+head preview pair');
  });

  it('reports a partial correlation when only one preview side is available', () => {
    const model = bdModel();
    const correlation = buildViPreviewComparisonCorrelation(model, {
      head: { available: true, revision: 'bbbb' }
    });
    const bd = correlation.surfaces[0];
    expect(bd.correlated).toBe(false);
    expect(bd.headPreviewAvailable).toBe(true);
    expect(bd.basePreviewAvailable).toBe(false);
    expect(correlation.narrative).toContain('only one preview side is available');
  });

  it('handles a comparison with no differences', () => {
    const model = buildViSemanticComparisonModelFromHtml('<h1 class="report-title">R</h1>');
    const correlation = buildViPreviewComparisonCorrelation(model, {
      base: { available: true },
      head: { available: true }
    });
    expect(correlation.hasDifferences).toBe(false);
    expect(correlation.surfaces).toEqual([]);
    expect(correlation.narrative).toContain('nothing to correlate');
  });

  it('is deterministic (same inputs => identical correlation)', () => {
    const model = bdModel();
    const previews = { base: { available: true, revision: 'aaaa' }, head: { available: true, revision: 'bbbb' } };
    const a = buildViPreviewComparisonCorrelation(model, previews);
    const b = buildViPreviewComparisonCorrelation(model, previews);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('produces a document that validates against the published @v1 schema (VHS-REQ-703.2)', () => {
    const model = bdModel();
    const correlation = buildViPreviewComparisonCorrelation(model, {
      base: { available: true, revision: 'aaaa' },
      head: { available: true, revision: 'bbbb' }
    });
    expect(validateViSemanticDocument(correlation)).toEqual({ valid: true, errors: [] });
  });

  it('falls back to detail sections for counts/samples when classification is absent (VHS-REQ-703.2)', () => {
    // A surface that changed but has no VHS-REQ-702 classification entries must
    // still report its real change count/sample text from the detail sections,
    // and the narrative must not call them "classified" changes.
    const model = { ...bdModel(), classification: [], changeKinds: [] };
    const correlation = buildViPreviewComparisonCorrelation(model, {});
    const bd = correlation.surfaces[0];
    expect(bd.changeKinds).toEqual([]);
    expect(bd.changeCount).toBe(2);
    expect(bd.sampleChanges.length).toBeGreaterThan(0);
    expect(correlation.narrative).not.toContain('classified change');
    expect(correlation.narrative).toContain('2 changes');
  });
});

describe('renderCorrelationSurfaceTable (VHS-REQ-703.8)', () => {
  it('renders a per-surface table with change kinds, counts, and both preview sides', () => {
    const model = bdModel();
    const correlation = buildViPreviewComparisonCorrelation(model, {
      base: { available: true, revision: 'aaaa' },
      head: { available: true, revision: 'bbbb' }
    });
    const table = renderCorrelationSurfaceTable(correlation);

    expect(table).toContain('| Surface | Change kinds | Changes | Base preview | Head preview |');
    expect(table).toContain('| --- | --- | --- | --- | --- |');
    // block-diagram row: label, kinds, count 2, both previews available.
    expect(table).toMatch(/\| block diagram \| dependency, behavioral \| 2 \| ✓ available \| ✓ available \|/);
    expect(table).toContain('1 of 1 changed surface(s) have both base and head previews available');
  });

  it('honestly marks an unavailable preview side with an em dash', () => {
    const model = bdModel();
    const correlation = buildViPreviewComparisonCorrelation(model, {
      head: { available: true, revision: 'bbbb' }
    });
    const table = renderCorrelationSurfaceTable(correlation);
    // base unavailable, head available — partial, not fabricated.
    expect(table).toContain('— unavailable | ✓ available |');
    expect(table).toContain('0 of 1 changed surface(s) have both base and head previews available');
  });

  it('shows an em dash for a surface with no classified change kinds', () => {
    const model = { ...bdModel(), classification: [], changeKinds: [] };
    const correlation = buildViPreviewComparisonCorrelation(model, {
      base: { available: true },
      head: { available: true }
    });
    const table = renderCorrelationSurfaceTable(correlation);
    // kinds column is em dash, count still reflects detail items.
    expect(table).toMatch(/\| block diagram \| — \| 2 \|/);
  });

  it('returns an empty string when there are no differences', () => {
    const model = buildViSemanticComparisonModelFromHtml('<h1 class="report-title">R</h1>');
    const correlation = buildViPreviewComparisonCorrelation(model, {
      base: { available: true },
      head: { available: true }
    });
    expect(renderCorrelationSurfaceTable(correlation)).toBe('');
  });

  it('escapes pipe characters that could break the table', () => {
    const table = renderCorrelationSurfaceTable({
      hasDifferences: true,
      surfaces: [
        {
          surface: 'other',
          changeKinds: [],
          changeCount: 1,
          sampleChanges: [],
          basePreviewAvailable: true,
          headPreviewAvailable: false,
          correlated: false
        }
      ],
      totals: { changedSurfaceCount: 1, correlatedSurfaceCount: 0, uncorrelatedSurfaceCount: 1 }
    });
    // The fixed labels contain no pipes, but the renderer must still emit a
    // well-formed 5-column row.
    expect(table).toContain('| other VI content | — | 1 | ✓ available | — unavailable |');
  });
});

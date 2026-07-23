import { describe, expect, it } from 'vitest';

import { buildViSemanticComparisonModelFromHtml } from '../../src/semantic/viSemanticModel';
import type { ViChangeKind } from '../../src/semantic/viSemanticModel';
import {
  buildViPreviewComparisonCorrelation,
  renderCorrelationNarrative,
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

    expect(table).toContain(
      '| Surface | Change kinds | Changes | Base preview | Head preview | Diagram coordinates |'
    );
    expect(table).toContain('| --- | --- | --- | --- | --- | --- |');
    // block-diagram row: label, kinds, count 2, both previews available, and the
    // deleted subVI's diagram coordinate surfaced (VHS-REQ-703.11).
    expect(table).toMatch(
      /\| block diagram \| dependency, behavioral \| 2 \| ✓ available \| ✓ available \| X\.vi \(1,2\) \|/
    );
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

  it('escapes pipe and backslash characters that could break the table', () => {
    const table = renderCorrelationSurfaceTable({
      hasDifferences: true,
      surfaces: [
        {
          surface: 'other',
          // Inject a backslash and a pipe into a change kind (via a cast) to
          // prove both are escaped; real enum kinds contain neither, but the
          // renderer must not let any cell value break the table or leave an
          // incompletely escaped backslash.
          changeKinds: ['a\\b|c' as unknown as ViChangeKind],
          changeCount: 1,
          sampleChanges: [],
          basePreviewAvailable: true,
          headPreviewAvailable: false,
          correlated: false
        }
      ],
      totals: { changedSurfaceCount: 1, correlatedSurfaceCount: 0, uncorrelatedSurfaceCount: 1 }
    });
    // Backslash is escaped first (\\), then the pipe (\|), keeping a well-formed
    // row with no incomplete escaping. The coordinate cell is an em dash (none).
    expect(table).toContain('| other VI content | a\\\\b\\|c | 1 | ✓ available | — unavailable | — |');
  });

  it('surfaces per-object diagram coordinates honestly, bounded and labeled (VHS-REQ-703.11)', () => {
    const model = bdModel();
    const correlation = buildViPreviewComparisonCorrelation(model, {
      base: { available: true, revision: 'aaaa' },
      head: { available: true, revision: 'bbbb' }
    });
    const bd = correlation.surfaces[0];
    // Only the coordinate-bearing item is surfaced (the wiring change is not).
    expect(bd.coordinateChanges).toEqual([
      {
        text: 'SubVI "X.vi" - deleted at (1,2)',
        changeType: 'deleted',
        objectKind: 'SubVI',
        objectName: 'X.vi',
        coordinate: { x: 1, y: 2 }
      }
    ]);
    // The correlation with coordinate data still validates against @v1.
    expect(validateViSemanticDocument(correlation)).toEqual({ valid: true, errors: [] });
  });

  it('omits coordinateChanges when no detail item carries a coordinate (VHS-REQ-703.11)', () => {
    const model = buildViSemanticComparisonModelFromHtml(
      `<h1 class="report-title">R</h1>
       <h2 class="section-header">Detailed Information</h2>
       <details><summary class="difference-heading">3. Block Diagram objects</summary>
         <ol><li class="diff-detail">wiring changes</li></ol></details>`,
      {}
    );
    const correlation = buildViPreviewComparisonCorrelation(model, {});
    expect(correlation.surfaces[0].coordinateChanges).toBeUndefined();
    // The surface table shows an em dash in the Diagram coordinates cell. Assert
    // the block-diagram row's LAST cell specifically (a loose `.* | — |` could
    // match the Change kinds em dash instead of the Diagram coordinates cell).
    const bdRow = renderCorrelationSurfaceTable(correlation)
      .split('\n')
      .find((line) => line.startsWith('| block diagram |'));
    expect(bdRow).toBeDefined();
    const cells = (bdRow as string).split('|').map((cell) => cell.trim());
    // cells[0] and the trailing cell are empty (leading/trailing pipes); the
    // last content cell is the Diagram coordinates column.
    expect(cells[cells.length - 2]).toBe('—');
  });

  it('renders both endpoints of a moved object as from→to (VHS-REQ-703.11)', () => {
    const model = buildViSemanticComparisonModelFromHtml(
      `<h1 class="report-title">R</h1>
       <h2 class="section-header">Detailed Information</h2>
       <details><summary class="difference-heading">3. Block Diagram objects</summary>
         <ol><li class="diff-detail">SubVI "Y.vi" - moved from (10,20) to (30,40)</li></ol></details>`,
      {}
    );
    const correlation = buildViPreviewComparisonCorrelation(model, {
      base: { available: true },
      head: { available: true }
    });
    const change = correlation.surfaces[0].coordinateChanges?.[0];
    expect(change?.changeType).toBe('moved');
    expect(change?.fromCoordinate).toEqual({ x: 10, y: 20 });
    expect(change?.coordinate).toEqual({ x: 30, y: 40 });
    // The table cell keeps BOTH endpoints, not just the destination.
    expect(renderCorrelationSurfaceTable(correlation)).toContain('Y.vi (10,20)→(30,40)');
  });

  it('summarizes more than three coordinate changes with a bounded "+N more" suffix (VHS-REQ-703.11)', () => {
    const model = buildViSemanticComparisonModelFromHtml(
      `<h1 class="report-title">R</h1>
       <h2 class="section-header">Detailed Information</h2>
       <details><summary class="difference-heading">3. Block Diagram objects</summary>
         <ol>
           <li class="diff-detail">SubVI "A.vi" - added at (1,1)</li>
           <li class="diff-detail">SubVI "B.vi" - added at (2,2)</li>
           <li class="diff-detail">SubVI "C.vi" - added at (3,3)</li>
           <li class="diff-detail">SubVI "D.vi" - added at (4,4)</li>
         </ol></details>`,
      {}
    );
    const correlation = buildViPreviewComparisonCorrelation(model, {
      base: { available: true },
      head: { available: true }
    });
    const bdRow = renderCorrelationSurfaceTable(correlation)
      .split('\n')
      .find((line) => line.startsWith('| block diagram |'));
    // Only the first three coordinate entries are shown; the remainder is bounded
    // to a "+1 more" suffix (the remainder > 0 arm of renderCoordinateCell).
    expect(bdRow).toContain('+1 more');
  });

  it('labels a coordinate change by its change type when object name and kind are absent (VHS-REQ-703.11)', () => {
    const table = renderCorrelationSurfaceTable({
      hasDifferences: true,
      surfaces: [
        {
          surface: 'block-diagram',
          changeKinds: [],
          changeCount: 1,
          sampleChanges: [],
          basePreviewAvailable: true,
          headPreviewAvailable: true,
          correlated: true,
          coordinateChanges: [
            // No objectName and no objectKind: the cell label falls through the
            // `?? ` chain to the change type.
            { text: 'added at (3,4)', changeType: 'added', coordinate: { x: 3, y: 4 } }
          ]
        }
      ],
      totals: { changedSurfaceCount: 1, correlatedSurfaceCount: 1, uncorrelatedSurfaceCount: 0 }
    });
    const bdRow = table.split('\n').find((line) => line.startsWith('| block diagram |'));
    expect(bdRow).toContain('added (3,4)');
  });
});

describe('buildViPreviewComparisonCorrelation defensive and multi-surface branches (VHS-REQ-703)', () => {
  it('tolerates a model whose classification and detailSections are not arrays', () => {
    // Defensive guards: a malformed model with non-array classification/detail
    // sections still yields a valid surface-only correlation (no coordinates).
    const model = {
      ...bdModel(),
      classification: undefined,
      detailSections: undefined
    } as unknown as Parameters<typeof buildViPreviewComparisonCorrelation>[0];
    const correlation = buildViPreviewComparisonCorrelation(model, {
      base: { available: true },
      head: { available: true }
    });
    const bd = correlation.surfaces[0];
    expect(bd.surface).toBe('block-diagram');
    expect(bd.changeCount).toBe(0);
    expect(bd.coordinateChanges).toBeUndefined();
  });

  it('skips detail sections of other surfaces and tolerates a matching section with no itemGeometry', () => {
    const model = {
      ...bdModel(),
      changedSurfaces: ['block-diagram'],
      classification: [],
      detailSections: [
        // A different surface -> skipped by the surface guard.
        { surface: 'front-panel', items: ['fp'], itemGeometry: [{ text: 'fp', changeType: 'other', coordinate: { x: 9, y: 9 } }] },
        // Matching surface but no itemGeometry -> the `?? []` fallback.
        { surface: 'block-diagram', items: ['bd1'], itemGeometry: undefined },
        // Matching surface with a real coordinate.
        { surface: 'block-diagram', items: ['bd2'], itemGeometry: [{ text: 'SubVI - deleted at (3,4)', changeType: 'deleted', coordinate: { x: 3, y: 4 } }] }
      ]
    } as unknown as Parameters<typeof buildViPreviewComparisonCorrelation>[0];
    const correlation = buildViPreviewComparisonCorrelation(model, {
      base: { available: true },
      head: { available: true }
    });
    const bd = correlation.surfaces[0];
    expect(bd.changeCount).toBe(2);
    // Only the block-diagram coordinate is collected (the front-panel section is skipped).
    expect(bd.coordinateChanges).toEqual([
      { text: 'SubVI - deleted at (3,4)', changeType: 'deleted', coordinate: { x: 3, y: 4 } }
    ]);
  });
});

describe('renderCorrelationNarrative unclassified risk (VHS-REQ-703.2)', () => {
  it("labels a difference with no risk level as 'unclassified'", () => {
    const correlation = buildViPreviewComparisonCorrelation(bdModel(), {});
    const narrative = renderCorrelationNarrative({ ...correlation, riskLevel: undefined });
    expect(narrative).toContain('unclassified change');
  });
});

describe('renderCorrelationSurfaceTable move-source-only coordinate (VHS-REQ-703.11)', () => {
  it('renders the source point when a move records only its origin', () => {
    const table = renderCorrelationSurfaceTable({
      hasDifferences: true,
      surfaces: [
        {
          surface: 'block-diagram',
          changeKinds: [],
          changeCount: 1,
          sampleChanges: [],
          basePreviewAvailable: true,
          headPreviewAvailable: true,
          correlated: true,
          coordinateChanges: [
            // fromCoordinate only (no destination) -> the `else if (fromCoordinate)` arm.
            { text: 'SubVI "Y.vi" - moved from (10,20)', changeType: 'moved', objectName: 'Y.vi', fromCoordinate: { x: 10, y: 20 } }
          ]
        }
      ],
      totals: { changedSurfaceCount: 1, correlatedSurfaceCount: 1, uncorrelatedSurfaceCount: 0 }
    });
    expect(table).toContain('Y.vi (10,20)');
  });
});

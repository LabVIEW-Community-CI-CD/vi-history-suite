import { describe, expect, it } from 'vitest';

import {
  buildViSemanticComparisonModel,
  buildViSemanticComparisonModelFromHtml,
  deriveViChangeSurface,
  renderViSemanticNarrative,
  VI_SEMANTIC_COMPARISON_SCHEMA
} from '../../src/semantic/viSemanticModel';
import { parseNiComparisonReportHtml } from '../../src/dashboard/niComparisonReportParser';

function niReportHtml(): string {
  return `<!DOCTYPE html>
  <html>
    <body>
      <h1 class="report-title">LabVIEW VI Comparison Report</h1>
      <p class="generation-time">5/4/2026 11:01:16 AM</p>
      <details>
        <summary class="difference-heading">
          <div class="dropdown-left">First VI: C:\\repo\\Widget.vi</div>
          <div class="dropdown-right">Second VI: C:\\repo\\Widget.vi</div>
        </summary>
        <table class="difference">
          <tr class="compared-vi-image-captions"><td class="compared-vi-image-caption">Block Diagram Overview</td></tr>
          <tr class="compared-images"><td><img class="difference-image" src="assets/block.png"/></td></tr>
          <tr class="compared-vi-image-captions"><td class="compared-vi-image-caption">Front Panel Overview</td></tr>
          <tr class="compared-images"><td><img class="difference-image" src="assets/front.png"/></td></tr>
        </table>
      </details>
      <ul class="inclusion-list">
        <li class="checked">Front Panel</li>
        <li class="unchecked">VI Attribute</li>
      </ul>
      <h2 class="section-header">Detailed Information</h2>
      <details open>
        <summary class="difference-heading">1. VI Attribute - Miscellaneous</summary>
        <ol>
          <li class="diff-detail">VI Version : changed from "21.0" to "20.0"</li>
          <li class="diff-detail">Connector pane changed</li>
        </ol>
      </details>
    </body>
  </html>`;
}

function emptyReportHtml(): string {
  return `<!DOCTYPE html>
  <html>
    <body>
      <h1 class="report-title">LabVIEW VI Comparison Report</h1>
    </body>
  </html>`;
}

describe('viSemanticModel', () => {
  describe('deriveViChangeSurface', () => {
    it.each([
      ['Block Diagram Overview', 'block-diagram'],
      ['Front Panel Overview', 'front-panel'],
      ['Connector pane changed', 'connector-pane'],
      ['VI Attribute - Miscellaneous', 'vi-attributes'],
      ['Icon and other content', 'other']
    ])('maps %s to the %s surface', (text, expected) => {
      expect(deriveViChangeSurface(text)).toBe(expected);
    });
  });

  it('projects a parsed report onto the versioned semantic model', () => {
    const model = buildViSemanticComparisonModelFromHtml(niReportHtml(), {
      reportFilePath: '/reports/widget/report.html',
      revisions: { baseHash: 'a1', selectedHash: 'b2' },
      runtime: { provider: 'host-native', engine: 'labview-cli', labviewVersion: '2026', bitness: 'x64' }
    });

    expect(model.schema).toBe(VI_SEMANTIC_COMPARISON_SCHEMA);
    expect(model.vi.title).toBe('LabVIEW VI Comparison Report');
    expect(model.vi.firstViPath).toBe('C:\\repo\\Widget.vi');
    expect(model.revisions).toEqual({ baseHash: 'a1', selectedHash: 'b2' });
    expect(model.runtime?.labviewVersion).toBe('2026');
    expect(model.hasDifferences).toBe(true);

    // Surfaces are ordered and de-duplicated: front panel, block diagram, and
    // VI attributes all appear (the block-diagram detail item also implies
    // connector-pane, since the item text names it).
    expect(model.changedSurfaces).toEqual(
      expect.arrayContaining(['front-panel', 'block-diagram', 'vi-attributes'])
    );

    expect(model.attributes.included).toEqual(['Front Panel']);
    expect(model.attributes.excluded).toEqual(['VI Attribute']);

    expect(model.overviewSections).toEqual([
      { surface: 'block-diagram', caption: 'Block Diagram Overview', imageCount: 1 },
      { surface: 'front-panel', caption: 'Front Panel Overview', imageCount: 1 }
    ]);

    expect(model.detailSections[0]).toMatchObject({
      surface: 'vi-attributes',
      heading: '1. VI Attribute - Miscellaneous',
      itemCount: 2
    });

    expect(model.totals).toMatchObject({
      overviewImageCount: 2,
      detailSectionCount: 1,
      detailItemCount: 2,
      includedAttributeCount: 1,
      excludedAttributeCount: 1
    });

    expect(model.narrative).toContain('front panel');
    expect(model.narrative).toContain('block diagram');
    expect(model.narrative).toContain('2 detailed changes across 1 section');
    expect(model.narrative).toContain('Compared attributes: Front Panel.');
    expect(model.narrative).toContain('Excluded from comparison: VI Attribute.');
  });

  it('reports no differences for an empty comparison report', () => {
    const model = buildViSemanticComparisonModelFromHtml(emptyReportHtml());
    expect(model.hasDifferences).toBe(false);
    expect(model.changedSurfaces).toEqual([]);
    expect(model.narrative).toBe(
      'No LabVIEW differences were detected between the two revisions.'
    );
  });

  it('renders a single-surface narrative with singular grammar', () => {
    const report = parseNiComparisonReportHtml(
      `<h1 class="report-title">R</h1>
       <h2 class="section-header">Detailed Information</h2>
       <details><summary class="difference-heading">Block Diagram</summary>
         <ol><li class="diff-detail">Wire changed</li></ol>
       </details>`,
      'report.html'
    );
    const model = buildViSemanticComparisonModel({ report });
    expect(model.changedSurfaces).toEqual(['block-diagram']);
    expect(model.narrative).toContain('The block diagram differs.');
    expect(model.narrative).toContain('1 detailed change across 1 section');
  });

  it('keeps renderViSemanticNarrative pure and consistent with the built model', () => {
    const report = parseNiComparisonReportHtml(niReportHtml(), 'report.html');
    const model = buildViSemanticComparisonModel({ report });
    const { narrative, ...withoutNarrative } = model;
    expect(narrative).toBe(renderViSemanticNarrative(withoutNarrative));
  });
});

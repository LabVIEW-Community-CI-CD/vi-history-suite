// Requirement coverage: VHS-REQ-662 (VI semantic comparison model and agent MCP
// surface). Verifies the versioned comparison model and the single shared
// what-changed narrative (VHS-REQ-662.1).
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

/**
 * Real National Instruments LabVIEW 2026 Q1 `CreateComparisonReport` output,
 * produced by an actual linux-container comparison run. Base64 image payloads
 * and the CSS block are elided (irrelevant to structural parsing); every
 * structural element is verbatim. This is the regression anchor that proves the
 * parser and semantic model handle genuine NI output, not just hand-authored
 * fixtures.
 */
function realNiReport2026q1Html(): string {
  return `<!DOCTYPE html>
<html>
<head> <meta charset="utf-8"> <title>LabVIEW VI Comparison Report</title>
<style>/* elided */</style>
</head>
<body>
<div class="report">
<h1 class="report-title">LabVIEW VI Comparison Report</h1>
<p class="generation-time">18:42:50 07/11/2026</p>
<div class="compared-VIs">
<details><summary class="difference-heading"><div class="dropdown-left">First VI: /workspace/staging/vis/PrintToSingleFileHtml/left-beb638030570-RunOperation.vi</div><div class="dropdown-right">Second VI: /workspace/staging/vis/PrintToSingleFileHtml/right-331865a071c8-RunOperation.vi</div></summary>
<table class="difference"><tr class="compared-vi-image-captions"><td class="compared-vi-image-caption">Front Panel Overview</td></tr>
<tr class="compared-images"><td class="diff-image">
<img class="difference-image" src="data:image/png;base64,PLACEHOLDER"/>
</td><td class="difference-divider"></td><td class="diff-image">
<img class="difference-image" src="data:image/png;base64,PLACEHOLDER"/>
</td></tr><tr class="compared-vi-image-captions"><td class="compared-vi-image-caption">Block Diagram Overview</td></tr>
<tr class="compared-images"><td class="diff-image">
<img class="difference-image" src="data:image/png;base64,PLACEHOLDER"/>
</td><td class="difference-divider"></td><td class="diff-image">
<img class="difference-image" src="data:image/png;base64,PLACEHOLDER"/>
</td></tr></table></details>
</div>
<div class="included-attributes">
<ul class="inclusion-list">
<li class="checked">Front Panel</li>
<li class="checked">Front Panel Position/Size</li>
<li class="checked">Block Diagram Functional</li>
<li class="checked">Block Diagram Cosmetic</li>
<li class="checked">VI Attribute</li>
</ul>
</div>
<h2 class="section-header">Detailed Information</h2>
<details open>

<summary class="difference-heading">1. Front Panel - LabVIEW Object</summary>
<table class="difference"><tr class="compared-vi-image-captions"><td class="compared-vi-image-caption">/workspace/staging/vis/PrintToSingleFileHtml/left-beb638030570-RunOperation.vi</td><td class="difference-divider"></td><td class="compared-vi-image-caption">/workspace/staging/vis/PrintToSingleFileHtml/right-331865a071c8-RunOperation.vi</td></tr><tr class="compared-images"><td class="diff-image">
<img class="difference-image" src="data:image/png;base64,PLACEHOLDER" alt="">
</td><td class="difference-divider"></td><td class="diff-image">
<img class="difference-image" src="data:image/png;base64,PLACEHOLDER" alt="">
</td></tr></table>
<ol class="detailed-description-list" type="A">
<li class="diff-detail">LabVIEW Object "PrintToSingleFileHtml in" - data value : changed from "<tt>(???)</tt>" to "<tt>(PrintToSingleFileHtml.lvclass: {parameters =&gt; {VI =&gt; &quot;&quot;, OutputPath =&gt; &quot;&quot;, overwrite =&gt; False, create output folder =&gt; False}, log output =&gt; &quot;&quot;} {Logger =&gt; (Logger.lvclass: {Logger information =&gt; {Log File Path =&gt; &quot;&quot;, Verbosity =&gt; Default, Append to log file? =&gt; False}}), Working Path Directory =&gt; &quot;/&quot;})</tt>"</li>
<li class="diff-detail">LabVIEW Object "PrintToSingleFileHtml in" - default data value : changed from "<tt>(???)</tt>" to "<tt>(PrintToSingleFileHtml.lvclass: {parameters =&gt; {VI =&gt; &quot;&quot;, OutputPath =&gt; &quot;&quot;, overwrite =&gt; False, create output folder =&gt; False}, log output =&gt; &quot;&quot;} {Logger =&gt; (Logger.lvclass: {Logger information =&gt; {Log File Path =&gt; &quot;&quot;, Verbosity =&gt; Default, Append to log file? =&gt; False}}), Working Path Directory =&gt; &quot;/&quot;})</tt>"</li>
</ol>
</details>
<details open>

<summary class="difference-heading">2. Front Panel - LabVIEW Object</summary>
<table class="difference"><tr class="compared-vi-image-captions"><td class="compared-vi-image-caption">/workspace/staging/vis/PrintToSingleFileHtml/left-beb638030570-RunOperation.vi</td><td class="difference-divider"></td><td class="compared-vi-image-caption">/workspace/staging/vis/PrintToSingleFileHtml/right-331865a071c8-RunOperation.vi</td></tr><tr class="compared-images"><td class="diff-image">
<img class="difference-image" src="data:image/png;base64,PLACEHOLDER" alt="">
</td><td class="difference-divider"></td><td class="diff-image">
<img class="difference-image" src="data:image/png;base64,PLACEHOLDER" alt="">
</td></tr></table>
<ol class="detailed-description-list" type="A">
<li class="diff-detail">LabVIEW Object "PrintToSingleFileHtml out" - data value : changed from "<tt>(???)</tt>" to "<tt>(PrintToSingleFileHtml.lvclass: {parameters =&gt; {VI =&gt; &quot;&quot;, OutputPath =&gt; &quot;&quot;, overwrite =&gt; False, create output folder =&gt; False}, log output =&gt; &quot;&quot;} {Logger =&gt; (Logger.lvclass: {Logger information =&gt; {Log File Path =&gt; &quot;&quot;, Verbosity =&gt; Default, Append to log file? =&gt; False}}), Working Path Directory =&gt; &quot;/&quot;})</tt>"</li>
<li class="diff-detail">LabVIEW Object "PrintToSingleFileHtml out" - default data value : changed from "<tt>(???)</tt>" to "<tt>(PrintToSingleFileHtml.lvclass: {parameters =&gt; {VI =&gt; &quot;&quot;, OutputPath =&gt; &quot;&quot;, overwrite =&gt; False, create output folder =&gt; False}, log output =&gt; &quot;&quot;} {Logger =&gt; (Logger.lvclass: {Logger information =&gt; {Log File Path =&gt; &quot;&quot;, Verbosity =&gt; Default, Append to log file? =&gt; False}}), Working Path Directory =&gt; &quot;/&quot;})</tt>"</li>
</ol>
</details>
</div>
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

    // changedSurfaces reflects NI's itemized detail heading
    // ("VI Attribute - Miscellaneous"), not the always-present overview
    // captions, so the front panel and block diagram are not reported as
    // changed when only a VI attribute differs.
    expect(model.changedSurfaces).toEqual(['vi-attributes']);

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

    expect(model.narrative).toBe(
      '2 detailed changes across 1 section (VI Attribute - Miscellaneous). ' +
        'Compared attributes: Front Panel. Excluded from comparison: VI Attribute.'
    );
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

  it('populates additive change-classification fields (VHS-REQ-702.4)', () => {
    const report = parseNiComparisonReportHtml(
      `<h1 class="report-title">R</h1>
       <ul><li class="checked">Block Diagram Functional</li></ul>
       <h2 class="section-header">Detailed Information</h2>
       <details><summary class="difference-heading">3. Block Diagram objects</summary>
         <ol>
           <li class="diff-detail">SubVI "VisibleTextMarker.vi" - added at (1570,358)</li>
           <li class="diff-detail">wiring changes</li>
           <li class="diff-detail">Boolean Constant "Visible" - added at (1538,393)</li>
         </ol>
       </details>`,
      'report.html'
    );
    const model = buildViSemanticComparisonModel({ report });

    expect(model.schema).toBe(VI_SEMANTIC_COMPARISON_SCHEMA);
    expect(model.riskLevel).toBe('high');
    expect(model.riskRationale).toContain('dependency');
    expect(model.changeKinds).toEqual(['dependency', 'behavioral', 'structural']);
    expect(model.classificationConfidence).toBe('high');
    expect(model.classification).toEqual([
      { surface: 'block-diagram', kind: 'dependency', text: 'SubVI "VisibleTextMarker.vi" - added at (1570,358)' },
      { surface: 'block-diagram', kind: 'behavioral', text: 'wiring changes' },
      { surface: 'block-diagram', kind: 'structural', text: 'Boolean Constant "Visible" - added at (1538,393)' }
    ]);
  });

  it('populates additive per-item detail geometry from the comparison text (VHS-REQ-703.10)', () => {
    const report = parseNiComparisonReportHtml(
      `<h1 class="report-title">R</h1>
       <ul><li class="checked">Block Diagram Functional</li></ul>
       <h2 class="section-header">Detailed Information</h2>
       <details><summary class="difference-heading">3. Block Diagram objects</summary>
         <ol>
           <li class="diff-detail">SubVI "VisibleTextMarker.vi" - added at (1570,358)</li>
           <li class="diff-detail">wiring changes</li>
         </ol>
       </details>`,
      'report.html'
    );
    const model = buildViSemanticComparisonModel({ report });
    const section = model.detailSections[0];

    // itemGeometry is additive and index-aligned with items. Default to []
    // (the field is optional at the type level) so the assertion stays strict.
    const itemGeometry = section.itemGeometry ?? [];
    expect(itemGeometry).toHaveLength(section.items.length);
    expect(itemGeometry[0]).toEqual({
      text: 'SubVI "VisibleTextMarker.vi" - added at (1570,358)',
      changeType: 'added',
      objectKind: 'SubVI',
      objectName: 'VisibleTextMarker.vi',
      coordinate: { x: 1570, y: 358 }
    });
    // A wiring line carries no coordinate/kind — recorded honestly, text retained.
    expect(itemGeometry[1]).toEqual({ text: 'wiring changes', changeType: 'other' });
  });

  it('omits classification detail but stays low-risk when there are no differences (VHS-REQ-702.4)', () => {
    const model = buildViSemanticComparisonModelFromHtml(emptyReportHtml());
    expect(model.classification).toEqual([]);
    expect(model.changeKinds).toEqual([]);
    expect(model.riskLevel).toBe('low');
    expect(model.classificationConfidence).toBe('low');
  });

  it('derives changed surfaces from detail headings across multiple surfaces', () => {
    const report = parseNiComparisonReportHtml(
      `<h1 class="report-title">R</h1>
       <h2 class="section-header">Detailed Information</h2>
       <details><summary class="difference-heading">1. Front Panel - Control</summary>
         <ol><li class="diff-detail">Caption changed</li></ol>
       </details>
       <details><summary class="difference-heading">2. Block Diagram - Wire</summary>
         <ol><li class="diff-detail">Wire rerouted</li></ol>
       </details>`,
      'report.html'
    );
    const model = buildViSemanticComparisonModel({ report });
    expect(model.changedSurfaces).toEqual(['front-panel', 'block-diagram']);
    expect(model.narrative).toContain('The front panel and block diagram differ.');
  });

  it('falls back to overview captions when there are no detail sections', () => {
    const report = parseNiComparisonReportHtml(
      `<h1 class="report-title">R</h1>
       <table class="difference">
         <tr class="compared-vi-image-captions"><td class="compared-vi-image-caption">Block Diagram Overview</td></tr>
         <tr class="compared-images"><td><img class="difference-image" src="a.png"/></td></tr>
       </table>`,
      'report.html'
    );
    const model = buildViSemanticComparisonModel({ report });
    expect(model.detailSections).toEqual([]);
    expect(model.changedSurfaces).toEqual(['block-diagram']);
  });

  it('parses real NI 2026 Q1 container output into an accurate narrative', () => {
    const model = buildViSemanticComparisonModelFromHtml(realNiReport2026q1Html(), {
      revisions: { baseHash: 'beb638030570', selectedHash: '331865a071c8' }
    });

    expect(model.vi.title).toBe('LabVIEW VI Comparison Report');
    expect(model.hasDifferences).toBe(true);

    // Only front-panel objects are itemized as changed. NI still renders both
    // overview captions, but changedSurfaces reflects the detail headings, so
    // the block diagram is not falsely reported as changed.
    expect(model.changedSurfaces).toEqual(['front-panel']);
    expect(model.overviewSections.map((section) => section.caption)).toEqual([
      'Front Panel Overview',
      'Block Diagram Overview'
    ]);
    expect(model.attributes.included).toEqual([
      'Front Panel',
      'Front Panel Position/Size',
      'Block Diagram Functional',
      'Block Diagram Cosmetic',
      'VI Attribute'
    ]);
    expect(model.attributes.excluded).toEqual([]);
    expect(model.totals).toMatchObject({
      overviewImageCount: 4,
      detailSectionCount: 2,
      detailItemCount: 4,
      includedAttributeCount: 5,
      excludedAttributeCount: 0
    });
    expect(model.narrative).toContain('The front panel differs.');
    expect(model.narrative).not.toContain('block diagram differ');
    expect(model.narrative).toContain('4 detailed changes across 2 sections');
  });

  it('keeps renderViSemanticNarrative pure and consistent with the built model', () => {
    const report = parseNiComparisonReportHtml(niReportHtml(), 'report.html');
    const model = buildViSemanticComparisonModel({ report });
    const { narrative, ...withoutNarrative } = model;
    expect(narrative).toBe(renderViSemanticNarrative(withoutNarrative));
  });
});

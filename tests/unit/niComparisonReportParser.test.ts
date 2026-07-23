import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  parseNiComparisonReportFile,
  parseNiComparisonReportHtml
} from '../../src/dashboard/niComparisonReportParser';

describe('parseNiComparisonReportHtml', () => {
  it('extracts overview images, included attributes, and detailed sections from an NI report (VHS-REQ-610.3)', () => {
    const report = parseNiComparisonReportHtml(
      `<!DOCTYPE html>
      <html>
      <body>
      <div class="report">
      <h1 class="report-title">LabVIEW VI Comparison Report</h1>
      <p class="generation-time">4/1/2026 11:01:16 AM</p>
      <div class="compared-VIs">
      <details><summary class="difference-heading"><div class="dropdown-left">First VI: C:\\compare\\Base.vi</div><div class="dropdown-right">Second VI: C:\\compare\\Head.vi</div></summary>
      <table class="difference">
      <tr class="compared-vi-image-captions"><td class="compared-vi-image-caption">Front Panel Overview</td></tr>
      <tr class="compared-images"><td class="diff-image"><img class="difference-image" src="compare-report-winhost_files/fp_1.png"/></td><td class="difference-divider"></td><td class="diff-image"><img class="difference-image" src="compare-report-winhost_files/fp_2.png"/></td></tr>
      </table></details>
      </div>
      <div class="included-attributes">
      <ul class="inclusion-list">
      <li class="checked">Front Panel</li>
      <li class="unchecked">VI Attribute</li>
      </ul>
      </div>
      <h2 class="section-header">Detailed Information</h2>
      <details open>
      <summary class="difference-heading">1. VI Attribute - Miscellaneous</summary>
      <ol class="detailed-description-list" type="A">
      <li class="diff-detail">VI Version : changed from "21.0" to "20.0"</li>
      </ol>
      </details>
      </div>
      </body>
      </html>`,
      '/workspace/reports/diff-report-Base.vi.html'
    );

    expect(report.reportTitle).toBe('LabVIEW VI Comparison Report');
    expect(report.generationTime).toBe('4/1/2026 11:01:16 AM');
    expect(report.firstViPath).toBe('C:\\compare\\Base.vi');
    expect(report.secondViPath).toBe('C:\\compare\\Head.vi');
    expect(report.overviewImageCount).toBe(2);
    expect(report.detailItemCount).toBe(1);
    expect(report.overviewSections[0]).toEqual({
      caption: 'Front Panel Overview',
      images: [
        {
          position: 0,
          sourceRelativePath: 'compare-report-winhost_files/fp_1.png',
          sourceFilePath: path.resolve('/workspace/reports', 'compare-report-winhost_files/fp_1.png')
        },
        {
          position: 1,
          sourceRelativePath: 'compare-report-winhost_files/fp_2.png',
          sourceFilePath: path.resolve('/workspace/reports', 'compare-report-winhost_files/fp_2.png')
        }
      ]
    });
    expect(report.includedAttributes).toEqual([
      {
        label: 'Front Panel',
        included: true
      },
      {
        label: 'VI Attribute',
        included: false
      }
    ]);
    expect(report.detailSections).toEqual([
      {
        heading: '1. VI Attribute - Miscellaneous',
        items: ['VI Version : changed from "21.0" to "20.0"']
      }
    ]);
  });

  it('decodes named, numeric, and non-breaking-space entities without double-decoding (VHS-REQ-610.3)', () => {
    const report = parseNiComparisonReportHtml(
      `<!DOCTYPE html>
      <html>
      <body>
      <div class="report">
      <h1 class="report-title">Label&nbsp;with&#32;spaces &amp; &#x2018;quotes&#x2019;</h1>
      <h2 class="section-header">Detailed Information</h2>
      <details open>
      <summary class="difference-heading">1. Detail</summary>
      <ol class="detailed-description-list" type="A">
      <li class="diff-detail">Literal entity stays escaped: &amp;lt;tag&amp;gt;</li>
      </ol>
      </details>
      </div>
      </body>
      </html>`,
      '/workspace/reports/diff-report-Base.vi.html'
    );

    // &nbsp; and &#32; -> spaces; &amp; -> &; &#x2018;/&#x2019; -> curly quotes.
    expect(report.reportTitle).toBe('Label with spaces & \u2018quotes\u2019');
    // &amp;lt; must decode to the literal `&lt;`, NOT be double-decoded to `<`.
    expect(report.detailSections[0].items).toEqual(['Literal entity stays escaped: &lt;tag&gt;']);
  });
});

describe('parseNiComparisonReportFile (VHS-REQ-610.3)', () => {
  it('parses a report read through the injected readFile boundary', async () => {
    const readFile = (async () =>
      '<h1 class="report-title">Injected Report</h1>') as unknown as typeof fs.readFile;
    const report = await parseNiComparisonReportFile('/virtual/report.html', { readFile });
    expect(report.reportTitle).toBe('Injected Report');
  });

  it('reads a real on-disk report with the default fs.readFile', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'vihs-ni-report-'));
    const reportFilePath = path.join(directory, 'diff-report.html');
    await fs.writeFile(reportFilePath, '<h1 class="report-title">On Disk Report</h1>', 'utf8');
    try {
      const report = await parseNiComparisonReportFile(reportFilePath);
      expect(report.reportTitle).toBe('On Disk Report');
    } finally {
      await fs.rm(directory, { recursive: true, force: true });
    }
  });
});

describe('parseNiComparisonReportHtml edge cases (VHS-REQ-610.3)', () => {
  it('yields no detail sections when the report omits the Detailed Information header', () => {
    // No `Detailed Information` <h2> => the split has no [1] segment, so the
    // `?? ''` fallback yields an empty detailed-information body.
    const report = parseNiComparisonReportHtml(
      '<h1 class="report-title">No Details</h1>',
      '/workspace/reports/diff.html'
    );
    expect(report.detailSections).toEqual([]);
    expect(report.detailItemCount).toBe(0);
  });

  it('keeps a detail section that has items but an empty heading', () => {
    // The <details> block has diff-detail items but no difference-heading summary,
    // so the filter must evaluate `section.items.length > 0` after an empty heading.
    const report = parseNiComparisonReportHtml(
      `<h1 class="report-title">Empty Heading</h1>
       <h2 class="section-header">Detailed Information</h2>
       <details><li class="diff-detail">Orphan detail without a heading</li></details>`,
      '/workspace/reports/diff.html'
    );
    expect(report.detailSections).toEqual([
      { heading: '', items: ['Orphan detail without a heading'] }
    ]);
  });

  it('leaves out-of-range numeric and unknown named entities un-decoded', () => {
    // &#x110000; is above the Unicode maximum (fromCodePoint fallback) and
    // &frobnicate; is not a known named entity (`decoded ?? match` fallback).
    const report = parseNiComparisonReportHtml(
      '<h1 class="report-title">Bad &#x110000; and &frobnicate; entities</h1>',
      '/workspace/reports/diff.html'
    );
    expect(report.reportTitle).toBe('Bad &#x110000; and &frobnicate; entities');
  });
});

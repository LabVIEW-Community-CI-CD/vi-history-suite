import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

import { parseNiComparisonReportHtml } from '../../src/dashboard/niComparisonReportParser';

describe('parseNiComparisonReportHtml', () => {
  it('extracts overview images, included attributes, and detailed sections from an NI report', () => {
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
});

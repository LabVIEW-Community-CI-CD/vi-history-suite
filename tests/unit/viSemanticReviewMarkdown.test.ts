import { describe, expect, it } from 'vitest';

import type { ViSemanticHistory } from '../../src/semantic/viSemanticHistory';
import { buildViSemanticComparisonModelFromHtml } from '../../src/semantic/viSemanticModel';
import {
  codeSpan,
  renderViSemanticComparisonMarkdown,
  renderViSemanticHistoryMarkdown
} from '../../src/semantic/viSemanticReviewMarkdown';

const REPORT_HTML = `<!DOCTYPE html>
<html><body>
  <h1 class="report-title">LabVIEW VI Comparison Report</h1>
  <ul class="inclusion-list"><li class="checked">Front Panel</li><li class="unchecked">VI Attribute</li></ul>
  <h2 class="section-header">Detailed Information</h2>
  <details><summary class="difference-heading">1. Front Panel - Control</summary>
    <ol><li class="diff-detail">Caption changed</li></ol>
  </details>
</body></html>`;

describe('renderViSemanticComparisonMarkdown', () => {
  it('renders a review-ready block with heading, narrative, and facts', () => {
    const model = buildViSemanticComparisonModelFromHtml(REPORT_HTML, {
      revisions: { baseHash: 'aaaa111', selectedHash: 'bbbb222' }
    });
    const md = renderViSemanticComparisonMarkdown(model);
    expect(md).toContain('### VI comparison: LabVIEW VI Comparison Report');
    expect(md).toContain('The front panel differs.');
    expect(md).toContain('- **Changed surfaces:** front panel');
    expect(md).toContain('- **Compared attributes:** Front Panel');
    expect(md).toContain('- **Excluded attributes:** VI Attribute');
    expect(md).toContain('- **Detailed changes:** 1 across 1 section');
    expect(md).toContain('- **Revisions:** `aaaa111` -> `bbbb222`');
  });

  it('omits fact lines for a no-difference comparison', () => {
    const model = buildViSemanticComparisonModelFromHtml('<h1 class="report-title">R</h1>');
    const md = renderViSemanticComparisonMarkdown(model);
    expect(md).toContain('### VI comparison: R');
    expect(md).toContain('No LabVIEW differences were detected');
    expect(md).not.toContain('Changed surfaces');
  });
});

describe('renderViSemanticHistoryMarkdown', () => {
  function sampleHistory(): ViSemanticHistory {
    return {
      schema: 'vi-history-suite/vi-semantic-history@v1',
      vi: { relativePath: 'vis/Widget.vi', title: 'Widget.vi' },
      repositoryRoot: '/repo',
      revisionCount: 3,
      comparedStepCount: 2,
      steps: [
        {
          baseHash: 'bbbb',
          selectedHash: 'cccc2222',
          authorDate: '',
          authorName: 'Dev',
          subject: 'tweak | panel',
          status: 'completed',
          hasDifferences: true,
          changedSurfaces: ['front-panel'],
          narrative: 'The front panel differs.'
        },
        {
          baseHash: 'aaaa',
          selectedHash: 'bbbb1111',
          authorDate: '',
          authorName: 'Dev',
          subject: 'blocked step',
          status: 'blocked-selection',
          hasDifferences: false,
          changedSurfaces: [],
          narrative: 'Comparison blocked-selection: docker',
          reason: 'docker'
        }
      ],
      totals: {
        changingStepCount: 1,
        frontPanelChangeCount: 1,
        blockDiagramChangeCount: 0,
        connectorPaneChangeCount: 0,
        viAttributeChangeCount: 0,
        blockedOrFailedStepCount: 1
      },
      narrative: 'Across 2 compared revisions of Widget.vi, 1 changed the VI.'
    };
  }

  it('renders a heading, narrative, and a per-transition table', () => {
    const md = renderViSemanticHistoryMarkdown(sampleHistory());
    expect(md).toContain('### VI history: Widget.vi');
    expect(md).toContain('Across 2 compared revisions of Widget.vi');
    expect(md).toContain('| Revision | Changed | Surfaces |');
    // Pipes in the subject are escaped so the table stays valid.
    expect(md).toContain('`cccc2222` tweak \\| panel');
    expect(md).toContain('yes | front panel');
    // A blocked step surfaces its status and no surfaces.
    expect(md).toContain('`bbbb1111` blocked step');
    expect(md).toContain('blocked-selection | -');
  });

  it('escapes backslashes before pipes in table cells', () => {
    const history = sampleHistory();
    history.steps[0].subject = 'path C:\\a | b';
    const md = renderViSemanticHistoryMarkdown(history);
    // Backslash is doubled first, then the pipe is escaped.
    expect(md).toContain('path C:\\\\a \\| b');
  });
});

describe('codeSpan', () => {
  it('wraps plain text in a single-backtick span', () => {
    expect(codeSpan('src/A.vi')).toBe('`src/A.vi`');
  });

  it('uses a longer fence than any backtick run in the content', () => {
    expect(codeSpan('a`b')).toBe('``a`b``');
    expect(codeSpan('a``b')).toBe('```a``b```');
  });

  it('pads with a space when the content starts or ends with a backtick', () => {
    expect(codeSpan('`x')).toBe('`` `x ``');
    expect(codeSpan('x`')).toBe('`` x` ``');
  });
});

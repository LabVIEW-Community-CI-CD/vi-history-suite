import { describe, expect, it } from 'vitest';

import { renderHistoryPanelHtml } from '../../src/ui/historyPanel';
import { ViHistoryViewModel } from '../../src/services/viHistoryModel';

function createTestViewModel(
  commits: Array<{ hash: string; previousHash?: string }> = []
): ViHistoryViewModel {
  return {
    repositoryName: 'test-repo',
    repositoryRoot: '/path/to/repo',
    repositoryUrl: 'https://github.com/test/repo',
    relativePath: 'Examples/Test.vi',
    signature: 'LVIN',
    eligible: true,
    commits: commits.map((commit, index) => ({
      hash: commit.hash,
      previousHash: commit.previousHash,
      authorName: 'Test Author',
      authorEmail: 'test@example.com',
      authorDate: '2025-01-01',
      subject: `Commit ${index + 1}`
    })),
    surfaceCapabilities: {
      comparisonGenerationAvailable: true,
      documentationAvailable: true
    }
  };
}

describe('explicitComparePairWorkflow HTML rendering (VHS-REQ-133)', () => {
  describe('compare button starts disabled until user selects exactly two revisions', () => {
    it('renders compare button with disabled attribute by default (no initial selection)', () => {
      const model = createTestViewModel([
        { hash: 'abc123', previousHash: 'def456' },
        { hash: 'def456' }
      ]);
      const html = renderHistoryPanelHtml(model);

      expect(html).toContain('data-testid="history-action-compare-selected"');
      expect(html).toContain('id="history-action-compare-selected"');
      expect(html).toMatch(
        /<button[^>]*id="history-action-compare-selected"[^>]*disabled[^>]*>Compare<\/button>/
      );
    });

    it('renders selection checkboxes for each retained revision row', () => {
      const model = createTestViewModel([
        { hash: 'abc12345', previousHash: 'def45678' },
        { hash: 'def45678' }
      ]);
      const html = renderHistoryPanelHtml(model);

      expect(html).toContain('data-testid="history-commit-select"');
      expect(html).toContain('data-hash="abc12345"');
      expect(html).toContain('data-hash="def45678"');
    });

    it('renders commit-index attribute for selection ordering', () => {
      const model = createTestViewModel([
        { hash: 'newer123', previousHash: 'older456' },
        { hash: 'older456' }
      ]);
      const html = renderHistoryPanelHtml(model);

      expect(html).toContain('data-commit-index="0"');
      expect(html).toContain('data-commit-index="1"');
    });
  });

  describe('compare controls remain explicit user actions and do not auto-generate reports', () => {
    it('does not render any auto-compare or auto-generate attributes', () => {
      const model = createTestViewModel([
        { hash: 'abc123', previousHash: 'def456' },
        { hash: 'def456' }
      ]);
      const html = renderHistoryPanelHtml(model);

      expect(html).not.toContain('auto-compare');
      expect(html).not.toContain('auto-generate');
      expect(html).not.toContain('onload="generateComparisonReport"');
    });

    it('renders explicit compare command attribute requiring user click action', () => {
      const model = createTestViewModel([
        { hash: 'abc123', previousHash: 'def456' },
        { hash: 'def456' }
      ]);
      const html = renderHistoryPanelHtml(model);

      expect(html).toContain('data-command="generateComparisonReportFromSelection"');
    });

    it('does not auto-trigger compare when the selection state changes', () => {
      const model = createTestViewModel([
        { hash: 'abc123', previousHash: 'def456' },
        { hash: 'def456' }
      ]);
      const html = renderHistoryPanelHtml(model);

      const fnStart = html.indexOf('function updateCompareSelectionState()');
      expect(fnStart).toBeGreaterThan(-1);

      // Extract the function body by tracking brace depth.
      const fragment = html.slice(fnStart);
      let depth = 0;
      let fnEnd = -1;
      for (let i = fragment.indexOf('{'); i < fragment.length; i++) {
        if (fragment[i] === '{') depth++;
        else if (fragment[i] === '}') {
          depth--;
          if (depth === 0) {
            fnEnd = i + 1;
            break;
          }
        }
      }
      const fnBody = fragment.slice(0, fnEnd);

      // Selecting the second revision only enables the button; it never posts a
      // message or generates a report on its own.
      expect(fnBody).not.toContain('vscode.postMessage');
      expect(fnBody).not.toContain('generateComparisonReportFromSelection');
      expect(fnBody).toContain('updateCompareButtonState');
    });
  });

  describe('two distinct revisions resolve to a newer=selected / older=base pair', () => {
    it('resolves the lower-commit-index revision as selected and the higher as base', () => {
      const model = createTestViewModel([
        { hash: 'newer123', previousHash: 'older456' },
        { hash: 'older456' }
      ]);
      const html = renderHistoryPanelHtml(model);

      // The selection helper sorts checked rows by commit index ascending, so the
      // newer commit (index 0) becomes selectedHash and the older becomes baseHash.
      expect(html).toContain('function resolveSelectedPair()');
      expect(html).toContain('selectedHash: ranked[0].hash');
      expect(html).toContain('baseHash: ranked[1].hash');
    });

    it('includes the selection JavaScript helpers', () => {
      const model = createTestViewModel([
        { hash: 'abc123', previousHash: 'def456' },
        { hash: 'def456' }
      ]);
      const html = renderHistoryPanelHtml(model);

      expect(html).toContain('function updateCompareSelectionState()');
      expect(html).toContain('function resolveSelectedPair()');
      expect(html).toContain('function updateCompareButtonState(enabled)');
      expect(html).toContain('function handleCommitSelectionChange(target)');
      expect(html).toContain("addEventListener('change'");
    });

    it('caps the selection at two revisions', () => {
      const model = createTestViewModel([
        { hash: 'abc123', previousHash: 'def456' },
        { hash: 'def456' }
      ]);
      const html = renderHistoryPanelHtml(model);

      // A third checkbox is unchecked so only two revisions can ever be selected.
      expect(html).toContain('if (checked.length > 2)');
      expect(html).toContain('target.checked = false');
    });
  });

  describe('disabled selection when comparison generation is not available', () => {
    it('renders disabled checkboxes when comparisonGenerationAvailable is false', () => {
      const model: ViHistoryViewModel = {
        ...createTestViewModel([
          { hash: 'abc123', previousHash: 'def456' },
          { hash: 'def456' }
        ]),
        surfaceCapabilities: {
          comparisonGenerationAvailable: false
        }
      };
      const html = renderHistoryPanelHtml(model);

      expect(html).toMatch(/<input[^>]*data-testid="history-commit-select"[^>]*disabled[^>]*\/>/);
    });

    it('keeps the compare button disabled when comparison generation is unavailable', () => {
      const model: ViHistoryViewModel = {
        ...createTestViewModel([
          { hash: 'abc123', previousHash: 'def456' },
          { hash: 'def456' }
        ]),
        surfaceCapabilities: {
          comparisonGenerationAvailable: false
        }
      };
      const html = renderHistoryPanelHtml(model);

      expect(html).toContain('const compareSelectionEnabled = false');
      expect(html).toMatch(/id="history-action-compare-selected"[^>]*disabled/);
    });
  });
});

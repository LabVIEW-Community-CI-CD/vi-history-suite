import { describe, expect, it } from 'vitest';

import {
  HistoryPanelComparePreflightState,
  renderHistoryPanelHtml
} from '../../src/ui/historyPanel';
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

describe('explicitComparePairWorkflow HTML rendering', () => {
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
        /<button[^>]*data-testid="history-action-compare-selected"[^>]*disabled[^>]*>Compare<\/button>/
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

    it('renders guidance for explicit selection workflow', () => {
      const model = createTestViewModel([
        { hash: 'abc123', previousHash: 'def456' },
        { hash: 'def456' }
      ]);
      const html = renderHistoryPanelHtml(model);

      expect(html).toContain('Select exactly two retained revisions');
    });

    it('does not auto-trigger compare when selection state changes via updateComparePreflightSelectionState', () => {
      const model = createTestViewModel([
        { hash: 'abc123', previousHash: 'def456' },
        { hash: 'def456' }
      ]);
      const html = renderHistoryPanelHtml(model);

      const fnStart = html.indexOf('function updateComparePreflightSelectionState()');
      expect(fnStart).toBeGreaterThan(-1);

      // Extract the function body by tracking brace depth (handles multiline content correctly)
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

      expect(fnBody).not.toContain('vscode.postMessage');
      expect(fnBody).not.toContain('generateComparisonReportFromSelection');
      expect(fnBody).toContain('updateCompareButtonState(true)');
      expect(fnBody).toContain('updateCompareButtonState(false)');
    });
  });

  describe('runtime preflight status remains visible even when compare generation is blocked', () => {
    it('renders compare preflight section with status when preflight is ready', () => {
      const model = createTestViewModel([
        { hash: 'abc123', previousHash: 'def456' },
        { hash: 'def456' }
      ]);
      const preflightState: HistoryPanelComparePreflightState = {
        status: 'ready',
        provider: 'host',
        labviewVersion: 'LabVIEW 2025',
        labviewBitness: 'x64',
        nextAction: 'Select two revisions, then choose Compare.',
        cliHint: 'Runtime is ready.'
      };
      const html = renderHistoryPanelHtml(model, undefined, preflightState);

      expect(html).toContain('data-testid="history-compare-preflight"');
      expect(html).toContain('data-state="ready"');
      expect(html).toContain('data-testid="history-compare-preflight-provider"');
      expect(html).toContain('host');
      expect(html).toContain('LabVIEW 2025');
      expect(html).toContain('x64');
    });

    it('renders compare preflight section with blocked state but still visible status', () => {
      const model = createTestViewModel([
        { hash: 'abc123', previousHash: 'def456' },
        { hash: 'def456' }
      ]);
      const preflightState: HistoryPanelComparePreflightState = {
        status: 'blocked',
        provider: 'host',
        labviewVersion: 'Unset',
        labviewBitness: 'Unset',
        nextAction: 'Use the generated settings CLI to configure runtime.',
        cliHint: 'Use the generated settings CLI to update provider settings.',
        warningMessage: 'Runtime settings need attention.'
      };
      const html = renderHistoryPanelHtml(model, undefined, preflightState);

      expect(html).toContain('data-testid="history-compare-preflight"');
      expect(html).toContain('data-state="blocked"');
      expect(html).toContain('data-testid="history-compare-preflight-provider"');
      expect(html).toContain('data-testid="history-compare-preflight-version"');
      expect(html).toContain('data-testid="history-compare-preflight-bitness"');
      expect(html).toContain('host');
      expect(html).toContain('Unset');
    });

    it('renders compare preflight CLI hint even when runtime is blocked', () => {
      const model = createTestViewModel([
        { hash: 'abc123', previousHash: 'def456' },
        { hash: 'def456' }
      ]);
      const preflightState: HistoryPanelComparePreflightState = {
        status: 'blocked',
        provider: 'host',
        labviewVersion: 'Unset',
        labviewBitness: 'Unset',
        nextAction: 'Use the generated settings CLI to configure runtime.',
        cliHint: 'Use the generated settings CLI to update provider settings.'
      };
      const html = renderHistoryPanelHtml(model, undefined, preflightState);

      expect(html).toContain('data-testid="history-compare-preflight-cli-hint"');
      expect(html).toContain('Use the generated settings CLI');
    });

    it('renders compare preflight details section for selected/base pair visibility', () => {
      const model = createTestViewModel([
        { hash: 'abc123', previousHash: 'def456' },
        { hash: 'def456' }
      ]);
      const html = renderHistoryPanelHtml(model);

      expect(html).toContain('data-testid="history-compare-preflight-selected"');
      expect(html).toContain('data-testid="history-compare-preflight-base"');
      expect(html).toContain('Selected commit:');
      expect(html).toContain('Base commit:');
    });

    it('renders selected/base ordering explanation in preflight details', () => {
      const model = createTestViewModel([
        { hash: 'abc123', previousHash: 'def456' },
        { hash: 'def456' }
      ]);
      const html = renderHistoryPanelHtml(model);

      expect(html).toContain('data-testid="history-compare-preflight-ordering"');
      expect(html).toContain('The newer of the two selected revisions becomes <code>selected</code>');
      expect(html).toContain('the older becomes <code>base</code>');
    });
  });

  describe('two distinct revisions produce a reviewable selected/base pair before Compare is enabled', () => {
    it('renders compare preflight summary placeholder before user selection', () => {
      const model = createTestViewModel([
        { hash: 'abc123', previousHash: 'def456' },
        { hash: 'def456' }
      ]);
      const html = renderHistoryPanelHtml(model);

      expect(html).toContain('data-testid="history-compare-preflight-summary"');
      expect(html).toContain('id="compare-preflight-summary"');
    });

    it('renders compare preflight next-action guidance', () => {
      const model = createTestViewModel([
        { hash: 'abc123', previousHash: 'def456' },
        { hash: 'def456' }
      ]);
      const html = renderHistoryPanelHtml(model);

      expect(html).toContain('data-testid="history-compare-preflight-next-action"');
      expect(html).toContain('id="compare-preflight-next-action"');
    });

    it('renders primary instruction for explicit pair selection', () => {
      const model = createTestViewModel([
        { hash: 'abc123', previousHash: 'def456' },
        { hash: 'def456' }
      ]);
      const html = renderHistoryPanelHtml(model);

      expect(html).toContain('data-testid="history-primary-instruction"');
      expect(html).toContain('Select exactly two retained revisions');
      expect(html).toContain('then choose <code>Compare</code>');
    });

    it('includes JavaScript for updateComparePreflightSelectionState function', () => {
      const model = createTestViewModel([
        { hash: 'abc123', previousHash: 'def456' },
        { hash: 'def456' }
      ]);
      const html = renderHistoryPanelHtml(model);

      expect(html).toContain('function updateComparePreflightSelectionState()');
      expect(html).toContain('function resolveSelectedPair()');
      expect(html).toContain('function updateCompareButtonState(enabled)');
    });

    it('includes JavaScript handling for checkbox change events', () => {
      const model = createTestViewModel([
        { hash: 'abc123', previousHash: 'def456' },
        { hash: 'def456' }
      ]);
      const html = renderHistoryPanelHtml(model);

      expect(html).toContain('function handleCommitSelectionChange(target)');
      expect(html).toContain('addEventListener(\'change\'');
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

    it('renders unavailable preflight state when comparison generation is disabled', () => {
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

      expect(html).toContain('data-state="unavailable"');
      expect(html).toContain('unavailable in this build');
    });
  });
});

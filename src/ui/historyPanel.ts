import {
  ViHistoryCommit,
  ViHistoryRepositorySupport,
  ViHistoryViewModel
} from '../services/viHistoryModel';
import { HistoryPanelActionSummary } from './historyPanelTracker';

interface CompareRuntimeDetailItem {
  label: string;
  value: string;
}

export interface HistoryPanelComparePreflightState {
  status: 'ready' | 'blocked' | 'unavailable';
  provider: string;
  labviewVersion: string;
  labviewBitness: string;
  nextAction: string;
  cliHint: string;
  warningMessage?: string;
}

/**
 * Represents a candidate revision for explicit compare pair selection.
 */
export interface CompareRevisionCandidate {
  hash: string;
  commitIndex: number;
}

/**
 * Represents a resolved selected/base compare pair.
 */
export interface ResolvedComparePair {
  selectedHash: string;
  baseHash: string;
}

/**
 * Describes the compare selection state based on the number of selected revisions.
 */
export type CompareSelectionState =
  | { count: 0; status: 'no-selection' }
  | { count: 1; status: 'need-one-more'; selectedHash: string }
  | { count: 2; status: 'pair-ready'; pair: ResolvedComparePair }
  | { count: number; status: 'too-many' };

/**
 * Resolves an array of selected revision candidates into a compare pair.
 * Returns the pair when exactly two valid, distinct candidates are provided;
 * the candidate with the lower commitIndex becomes `selectedHash` (newer commit),
 * and the candidate with the higher commitIndex becomes `baseHash` (older commit).
 * Returns undefined when fewer or more than two valid candidates are provided.
 */
export function resolveSelectedComparePair(
  candidates: readonly CompareRevisionCandidate[]
): ResolvedComparePair | undefined {
  const validCandidates = candidates.filter(
    (candidate) => candidate.hash.length > 0 && Number.isFinite(candidate.commitIndex)
  );

  if (validCandidates.length !== 2) {
    return undefined;
  }

  const [first, second] = validCandidates;
  if (first.hash === second.hash) {
    return undefined;
  }

  const sorted = [...validCandidates].sort(
    (left, right) => left.commitIndex - right.commitIndex
  );

  return {
    selectedHash: sorted[0].hash,
    baseHash: sorted[1].hash
  };
}

/**
 * Derives the compare selection state from selected revision candidates.
 * This function mirrors the webview JavaScript selection logic for testability.
 */
export function deriveCompareSelectionState(
  candidates: readonly CompareRevisionCandidate[]
): CompareSelectionState {
  const validCandidates = candidates.filter(
    (candidate) => candidate.hash.length > 0 && Number.isFinite(candidate.commitIndex)
  );

  if (validCandidates.length === 0) {
    return { count: 0, status: 'no-selection' };
  }

  if (validCandidates.length === 1) {
    return { count: 1, status: 'need-one-more', selectedHash: validCandidates[0].hash };
  }

  if (validCandidates.length === 2) {
    const pair = resolveSelectedComparePair(validCandidates);
    if (pair) {
      return { count: 2, status: 'pair-ready', pair };
    }
    return { count: 2, status: 'too-many' };
  }

  return { count: validCandidates.length, status: 'too-many' };
}

export function renderHistoryPanelHtml(
  model: ViHistoryViewModel,
  lastActionSummary?: HistoryPanelActionSummary,
  comparePreflightState?: HistoryPanelComparePreflightState
): string {
  const capabilities = model.surfaceCapabilities ?? {};
  const support = model.repositorySupport;
  const showBenchmarkStatus = capabilities.benchmarkStatusAvailable === true;
  const showHumanReviewSubmission = capabilities.humanReviewSubmissionAvailable !== false;
  const newestCommit = model.commits[0];
  const oldestCommit = model.commits[model.commits.length - 1];
  const historyWindowSummary = renderHistoryWindowSummary(model);
  const latestCompareRuntime = deriveInitialCompareRuntimeStatus(lastActionSummary);
  const comparisonSelectionEnabled = capabilities.comparisonGenerationAvailable !== false;
  const effectiveComparePreflightState = deriveComparePreflightState(
    comparisonSelectionEnabled,
    comparePreflightState
  );
  const initialComparePreflightSummary = deriveInitialComparePreflightSummary(
    effectiveComparePreflightState
  );
  const documentationButton =
    capabilities.documentationAvailable !== false
      ? '<button data-testid="history-action-documentation" data-command="openDocumentation" data-page-id="user-workflow">Open docs</button>'
      : '<button data-testid="history-action-documentation" disabled>Open docs</button>';
  const benchmarkStatusButton = showBenchmarkStatus
    ? '<button data-testid="history-action-benchmark-status" data-command="openBenchmarkStatus">Open benchmark status</button>'
    : '';
  const reviewGuidanceBenchmarkStep = showBenchmarkStatus
    ? '<li data-testid="history-guidance-step">Use <code>Open benchmark status</code> on the canonical Windows 11 host when you need the retained Windows baseline plus the live or completed Linux benchmark state inside VS Code instead of background processes or shell logs.</li>'
    : '';
  const reviewGuidanceHumanReviewStep = showHumanReviewSubmission
    ? '<li data-testid="history-guidance-step">Use <code>Submit host review</code> after the manual right-click pass on the canonical Windows 11 host machine from the deterministic local fixture workspace, not a OneDrive-backed path, so the result is retained to a stable latest-review manifest future sessions can consume automatically.</li>'
    : '';
  const reviewSubmissionHtml = showHumanReviewSubmission
    ? renderHumanReviewSubmissionSection()
    : '';
  const repositorySupportHtml = support
    ? renderRepositorySupportSection(support)
    : '';
  const rows = model.commits
    .map((commit: ViHistoryCommit, index: number) => {
      const selectCheckbox = `<input data-testid="history-commit-select" type="checkbox" data-hash="${escapeHtml(commit.hash)}" ${
        comparisonSelectionEnabled ? '' : 'disabled'
      } />`;

      return `
        <tr data-testid="history-row" data-commit-index="${index}">
          <td data-testid="history-commit-select-cell">${selectCheckbox}</td>
          <td data-testid="history-commit-hash"><code>${escapeHtml(commit.hash.slice(0, 8))}</code></td>
          <td data-testid="history-commit-date">${escapeHtml(commit.authorDate)}</td>
          <td data-testid="history-commit-author">${escapeHtml(commit.authorName)}</td>
          <td data-testid="history-commit-subject">${escapeHtml(commit.subject)}</td>
          <td data-testid="history-commit-body" class="commit-body">${renderCommitBodyCell(commit)}</td>
          <td data-testid="history-commit-actions">
            <button data-testid="history-action-open" data-command="openCommit" data-hash="${escapeHtml(commit.hash)}">Open@commit</button>
            <button data-testid="history-action-copy" data-command="copyHash" data-hash="${escapeHtml(commit.hash)}">Copy hash</button>
          </td>
        </tr>
      `;
    })
    .join('\n');

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>VI History</title>
    <style>
      body {
        font-family: var(--vscode-font-family);
        color: var(--vscode-foreground);
        background: var(--vscode-editor-background);
        padding: 16px;
      }
      .meta {
        display: grid;
        grid-template-columns: repeat(2, minmax(240px, 1fr));
        gap: 8px 16px;
        margin-bottom: 16px;
      }
      table {
        width: 100%;
        border-collapse: collapse;
      }
      th, td {
        border-bottom: 1px solid var(--vscode-panel-border);
        padding: 8px;
        text-align: left;
        vertical-align: top;
      }
      button {
        margin-right: 8px;
        margin-bottom: 6px;
      }
      .status {
        margin-bottom: 16px;
        padding: 12px;
        border: 1px solid var(--vscode-panel-border);
      }
      .packet {
        display: grid;
        grid-template-columns: repeat(2, minmax(240px, 1fr));
        gap: 8px 16px;
        margin-bottom: 16px;
        padding: 12px;
        border: 1px solid var(--vscode-panel-border);
      }
      .limitations {
        margin-bottom: 16px;
        padding: 12px;
        border-left: 4px solid var(--vscode-textLink-foreground);
      }
      .guidance {
        margin-bottom: 16px;
        padding: 12px;
        border: 1px dashed var(--vscode-panel-border);
      }
      .guidance ol {
        margin: 8px 0 0 20px;
        padding: 0;
      }
      .guidance li {
        margin-bottom: 6px;
      }
      .confidence {
        margin-bottom: 16px;
        padding: 12px;
        border: 1px solid var(--vscode-panel-border);
      }
      .confidence-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(240px, 1fr));
        gap: 8px 16px;
        margin-top: 8px;
      }
      .review-submit {
        margin-bottom: 16px;
        padding: 12px;
        border: 1px solid var(--vscode-panel-border);
      }
      .review-submit-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(240px, 1fr));
        gap: 8px 16px;
        margin-top: 10px;
      }
      .review-submit label {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .review-submit textarea {
        min-height: 90px;
        resize: vertical;
      }
      .review-submit ul {
        margin: 8px 0 0 20px;
        padding: 0;
      }
      .review-submit li {
        margin-bottom: 4px;
      }
      .review-submit select,
      .review-submit textarea {
        color: var(--vscode-input-foreground);
        background: var(--vscode-input-background);
        border: 1px solid var(--vscode-input-border, var(--vscode-panel-border));
        padding: 8px;
        font: inherit;
      }
      .review-submit-status {
        margin-top: 10px;
        padding: 8px;
        border-left: 4px solid var(--vscode-textLink-foreground);
        background: color-mix(in srgb, var(--vscode-editor-background) 85%, var(--vscode-textLink-foreground) 15%);
      }
    </style>
  </head>
  <body>
    <div class="status" data-testid="history-status">
      <strong>Eligibility:</strong> <span data-testid="history-status-eligibility">${model.eligible ? 'Eligible' : 'Not eligible'}</span><br />
      <strong>Signature:</strong> <span data-testid="history-status-signature">${escapeHtml(model.signature)}</span><br />
      <strong>Commits:</strong> <span data-testid="history-status-commit-count">${model.commits.length}</span><br />
      <strong>History window:</strong> <span data-testid="history-status-history-window">${escapeHtml(historyWindowSummary)}</span><br />
      <button data-testid="history-action-copy-review-packet" data-command="copyReviewPacket">Copy review packet</button>
      ${documentationButton}
      ${benchmarkStatusButton}
    </div>
    <div class="status" data-testid="history-compare-runtime-status" id="compare-runtime-status" data-state="${escapeHtml(latestCompareRuntime.status)}" role="status" aria-live="polite">
      <strong>Latest compare runtime:</strong><br />
      <span data-testid="history-compare-runtime-summary" id="compare-runtime-summary">${escapeHtml(latestCompareRuntime.summary)}</span><br />
      <span data-testid="history-compare-runtime-next-action" id="compare-runtime-next-action">${escapeHtml(latestCompareRuntime.nextAction)}</span>
      <details data-testid="history-compare-runtime-details" id="compare-runtime-details">
        <summary>Runtime details</summary>
        ${renderCompareRuntimeDetails(latestCompareRuntime.details)}
      </details>
    </div>
    <div class="status" data-testid="history-compare-preflight" id="compare-preflight" data-state="${escapeHtml(effectiveComparePreflightState.status)}" role="status" aria-live="polite">
      <strong>Compare preflight:</strong><br />
      <span data-testid="history-compare-preflight-summary" id="compare-preflight-summary">${escapeHtml(initialComparePreflightSummary)}</span><br />
      <span data-testid="history-compare-preflight-next-action" id="compare-preflight-next-action">${escapeHtml(effectiveComparePreflightState.nextAction)}</span>
      <div data-testid="history-primary-instruction"><strong>Quick start:</strong> Select exactly two retained revisions, then choose <code>Compare</code>.</div>
      <details data-testid="history-compare-preflight-details" id="compare-preflight-details">
        <summary>Selected pair and runtime settings</summary>
        <div data-testid="history-compare-preflight-ordering"><em>The newer of the two selected revisions becomes <code>selected</code> and the older becomes <code>base</code>.</em></div>
        <div data-testid="history-compare-preflight-selected"><strong>Selected commit:</strong> <span id="compare-preflight-selected-value">Not selected yet.</span></div>
        <div data-testid="history-compare-preflight-base"><strong>Base commit:</strong> <span id="compare-preflight-base-value">Not selected yet.</span></div>
        <div data-testid="history-compare-preflight-provider"><strong>Provider:</strong> <span id="compare-preflight-provider-value">${escapeHtml(effectiveComparePreflightState.provider)}</span></div>
        <div data-testid="history-compare-preflight-version"><strong>LabVIEW version:</strong> <span id="compare-preflight-version-value">${escapeHtml(effectiveComparePreflightState.labviewVersion)}</span></div>
        <div data-testid="history-compare-preflight-bitness"><strong>LabVIEW bitness:</strong> <span id="compare-preflight-bitness-value">${escapeHtml(effectiveComparePreflightState.labviewBitness)}</span></div>
      </details>
      <div data-testid="history-compare-preflight-cli-hint" id="compare-preflight-cli-hint">${escapeHtml(effectiveComparePreflightState.cliHint)}</div>
      <button data-testid="history-action-compare-selected" id="history-action-compare-selected" data-command="generateComparisonReportFromSelection" disabled>Compare</button>
    </div>
    <table data-testid="history-table">
      <thead>
        <tr>
          <th>Select</th>
          <th>Commit</th>
          <th>Date</th>
          <th>Author</th>
          <th>Subject</th>
          <th>Commit body</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
    <details class="packet" data-testid="history-review-packet">
      <summary>Review facts</summary>
      <div data-testid="history-chronology-order"><strong>Order:</strong> Newest commit first</div>
      <div data-testid="history-retained-span"><strong>Retained revisions:</strong> ${model.commits.length}</div>
      <div data-testid="history-review-window"><strong>Window:</strong> ${escapeHtml(historyWindowSummary)}</div>
      <div data-testid="history-newest-commit"><strong>Newest:</strong> ${renderCommitSummary(newestCommit)}</div>
      <div data-testid="history-oldest-commit"><strong>Oldest:</strong> ${renderCommitSummary(oldestCommit)}</div>
    </details>
    <details class="meta" data-testid="history-meta">
      <summary>Repository facts</summary>
      <div data-testid="history-meta-repository"><strong>Repository:</strong> ${escapeHtml(model.repositoryName)}</div>
      <div data-testid="history-meta-root"><strong>Root:</strong> ${escapeHtml(model.repositoryRoot)}</div>
      <div data-testid="history-meta-origin"><strong>Origin:</strong> ${escapeHtml(model.repositoryUrl ?? 'Unavailable')}</div>
      <div data-testid="history-meta-path"><strong>Path:</strong> ${escapeHtml(model.relativePath)}</div>
      <div data-testid="history-meta-surface"><strong>Surface:</strong> VI History</div>
      <div data-testid="history-meta-support"><strong>Repo support:</strong> ${escapeHtml(support?.supportLabel ?? 'Not classified in this build')}</div>
    </details>
    ${repositorySupportHtml}
    <details class="limitations" data-testid="history-binary-limitations">
      <summary>Binary review limits</summary>
      <strong>Binary review limits:</strong> Git-backed LabVIEW VI revisions are binary artifacts. This surface retains chronology and commit facts; pairwise compare actions use retained LabVIEW comparison-report evidence and installed tooling instead of plain text diff.
    </details>
    <details class="guidance" data-testid="history-review-guidance">
      <summary>Reviewer guidance</summary>
      <strong>Reviewer guidance:</strong>
      <ol>
        <li data-testid="history-guidance-step">Use the newest/oldest packet to confirm the retained review window before acting on a specific revision.</li>
        <li data-testid="history-guidance-step">Use the commit checkboxes to select exactly two retained revisions, then review the compare preflight section before choosing <code>Compare</code>.</li>
        <li data-testid="history-guidance-step">The compare preflight section defines the exact selected/base pair. The commit body shown in each row is review context only and does not limit which two retained revisions you can compare.</li>
        <li data-testid="history-guidance-step">Use <code>Open docs</code> to open the bundled user documentation that ships with this installed extension version instead of leaving VS Code for repo-hosted docs.</li>
        ${reviewGuidanceBenchmarkStep}
        ${reviewGuidanceHumanReviewStep}
      </ol>
    </details>
    <details class="confidence" data-testid="history-confidence-scope">
      <summary>Confidence and scope</summary>
      <strong>Confidence and scope:</strong>
      <div class="confidence-grid">
        <div data-testid="history-confidence-basis"><strong>Basis:</strong> Local Git history, tracked-file status, and content-detected VI signature checks.</div>
        <div data-testid="history-confidence-rating"><strong>Confidence:</strong> Direct local evidence for chronology, path provenance, retained hashes, and explicit selected/base compare preflight facts.</div>
        <div data-testid="history-scope-included"><strong>Included here:</strong> Repository/path facts, retained commit chronology, explicit selected/base compare preflight, and per-revision commit subject and body.</div>
        <div data-testid="history-scope-excluded"><strong>Needs external comparison tooling:</strong> Binary semantic differences, visual or cosmetic change detection, and LabVIEW comparison-report output.</div>
      </div>
    </details>
    ${reviewSubmissionHtml}
    <script>
      const vscode = acquireVsCodeApi();
      let panelState = vscode.getState() ?? {};
      const compareSelectionEnabled = ${serializeForInlineScript(comparisonSelectionEnabled)};
      const comparePreflight = ${serializeForInlineScript(effectiveComparePreflightState)};
      function readHostReviewDraft() {
        const draft = panelState.hostReviewDraft;
        if (!draft || typeof draft !== 'object') {
          return {};
        }

        return draft;
      }
      function persistHostReviewDraft() {
        const outcome = document.getElementById('host-review-outcome');
        const confidence = document.getElementById('host-review-confidence');
        const note = document.getElementById('host-review-note');
        panelState = {
          ...panelState,
          hostReviewDraft: {
            outcome: outcome instanceof HTMLSelectElement ? outcome.value : '',
            confidence: confidence instanceof HTMLSelectElement ? confidence.value : '',
            note: note instanceof HTMLTextAreaElement ? note.value : ''
          }
        };
        vscode.setState(panelState);
      }
      function clearHostReviewDraft() {
        panelState = {
          ...panelState,
          hostReviewDraft: undefined
        };
        vscode.setState(panelState);
      }
      function getCommitSelectionInputs() {
        return Array.from(document.querySelectorAll('[data-testid="history-commit-select"]')).filter(
          (candidate) => candidate instanceof HTMLInputElement
        );
      }
      function updateComparePreflightSummary(message) {
        const status = document.getElementById('compare-preflight-summary');
        if (status instanceof HTMLElement) {
          status.textContent = message;
        }
      }
      function updateComparePreflightNextAction(message) {
        const nextAction = document.getElementById('compare-preflight-next-action');
        if (nextAction instanceof HTMLElement) {
          nextAction.textContent = message;
        }
      }
      function updateComparePreflightPair(selectedValue, baseValue) {
        const selected = document.getElementById('compare-preflight-selected-value');
        const base = document.getElementById('compare-preflight-base-value');
        if (selected instanceof HTMLElement) {
          selected.textContent = selectedValue;
        }
        if (base instanceof HTMLElement) {
          base.textContent = baseValue;
        }
      }
      function updateCompareButtonState(enabled) {
        const compareButton = document.getElementById('history-action-compare-selected');
        if (compareButton instanceof HTMLButtonElement) {
          compareButton.disabled = !enabled;
        }
      }
      function resolveSelectedPair() {
        const checked = getCommitSelectionInputs().filter((candidate) => candidate.checked);
        if (checked.length !== 2) {
          return undefined;
        }

        const ranked = checked
          .map((candidate) => {
            const row = candidate.closest('[data-commit-index]');
            const commitIndexText =
              row instanceof HTMLElement ? row.dataset.commitIndex : undefined;
            return {
              hash: candidate.dataset.hash ?? '',
              commitIndex: Number(commitIndexText ?? '999999')
            };
          })
          .filter((candidate) => candidate.hash.length > 0)
          .sort((left, right) => left.commitIndex - right.commitIndex);

        if (ranked.length !== 2) {
          return undefined;
        }

        return {
          selectedHash: ranked[0].hash,
          baseHash: ranked[1].hash
        };
      }
      function updateComparePreflightSelectionState() {
        const checked = getCommitSelectionInputs().filter((candidate) => candidate.checked);
        if (!compareSelectionEnabled) {
          updateComparePreflightPair('Unavailable in this build.', 'Unavailable in this build.');
          updateComparePreflightSummary('Compare preflight is unavailable in this build.');
          updateComparePreflightNextAction(comparePreflight.nextAction);
          updateCompareButtonState(false);
          return;
        }

        if (checked.length === 0) {
          updateComparePreflightPair('Not selected yet.', 'Not selected yet.');
          updateComparePreflightSummary(${serializeForInlineScript(initialComparePreflightSummary)});
          updateComparePreflightNextAction(comparePreflight.nextAction);
          updateCompareButtonState(false);
          return;
        }

        if (checked.length === 1) {
          const selectedHash = checked[0].dataset.hash ?? '';
          updateComparePreflightPair(selectedHash.slice(0, 8), 'Not selected yet.');
          updateComparePreflightSummary('Select one more retained revision to populate compare preflight.');
          updateComparePreflightNextAction('Next action: select one more retained revision, then choose Compare.');
          updateCompareButtonState(false);
          return;
        }

        const pair = resolveSelectedPair();
        if (!pair) {
          updateComparePreflightPair('Not selected yet.', 'Not selected yet.');
          updateComparePreflightSummary('Compare preflight could not resolve a stable selected/base pair from the current checkbox state.');
          updateComparePreflightNextAction('Next action: clear the current checkbox state, then select exactly two retained revisions again.');
          updateCompareButtonState(false);
          return;
        }

        updateComparePreflightPair(pair.selectedHash.slice(0, 8), pair.baseHash.slice(0, 8));
        if (comparePreflight.status === 'ready') {
          updateComparePreflightSummary('Compare preflight is ready for ' + pair.selectedHash.slice(0, 8) + ' vs ' + pair.baseHash.slice(0, 8) + '.');
          updateComparePreflightNextAction('Next action: review the explicit selected/base pair, then choose Compare.');
          updateCompareButtonState(true);
          return;
        }

        updateComparePreflightSummary('Compare will try ' + pair.selectedHash.slice(0, 8) + ' vs ' + pair.baseHash.slice(0, 8) + ' and report runtime details if it cannot finish.');
        updateComparePreflightNextAction('Next action: choose Compare to exercise the selected pair, then use runtime details if the local LabVIEW path fails.');
        updateCompareButtonState(true);
      }
      function handleCommitSelectionChange(target) {
        if (!(target instanceof HTMLInputElement) || target.dataset.hash === undefined) {
          return;
        }

        const checked = getCommitSelectionInputs().filter((candidate) => candidate.checked);
        if (checked.length > 2) {
          target.checked = false;
          updateComparePreflightSelectionState();
          return;
        }
        updateComparePreflightSelectionState();
      }
      function restoreHostReviewDraft() {
        const draft = readHostReviewDraft();
        const outcome = document.getElementById('host-review-outcome');
        const confidence = document.getElementById('host-review-confidence');
        const note = document.getElementById('host-review-note');

        if (outcome instanceof HTMLSelectElement && typeof draft.outcome === 'string') {
          outcome.value = draft.outcome;
        }
        if (confidence instanceof HTMLSelectElement && typeof draft.confidence === 'string') {
          confidence.value = draft.confidence;
        }
        if (note instanceof HTMLTextAreaElement && typeof draft.note === 'string') {
          note.value = draft.note;
        }
      }

      restoreHostReviewDraft();
      updateComparePreflightSelectionState();

      window.addEventListener('message', (event) => {
        const message = event.data;
        if (!message) {
          return;
        }

        if (
          message.type === 'comparisonRuntimeResult' ||
          message.type === 'comparisonRuntimeProgress'
        ) {
          const container = document.getElementById('compare-runtime-status');
          const summary = document.getElementById('compare-runtime-summary');
          const nextAction = document.getElementById('compare-runtime-next-action');
          const details = document.getElementById('compare-runtime-details');
          if (container instanceof HTMLElement && typeof message.status === 'string') {
            container.dataset.state = message.status;
          }
          if (summary instanceof HTMLElement && typeof message.summary === 'string') {
            summary.textContent = message.summary;
          }
          if (nextAction instanceof HTMLElement && typeof message.nextAction === 'string') {
            nextAction.textContent = message.nextAction;
          }
          if (details instanceof HTMLElement) {
            details.replaceChildren();
            if (Array.isArray(message.details)) {
              for (const detail of message.details) {
                if (
                  !detail ||
                  typeof detail.label !== 'string' ||
                  typeof detail.value !== 'string'
                ) {
                  continue;
                }

                const line = document.createElement('div');
                line.setAttribute('data-testid', 'history-compare-runtime-detail');
                const label = document.createElement('strong');
                label.textContent = detail.label + ':';
                line.append(label, document.createTextNode(' ' + detail.value));
                details.append(line);
              }
            }
          }
          return;
        }

        if (message.type !== 'humanReviewSubmissionResult') {
          return;
        }

        const status = document.getElementById('host-review-status');
        const submitButton = document.querySelector('[data-testid="history-action-submit-human-review"]');
        if (status instanceof HTMLElement && typeof message.message === 'string') {
          status.textContent = message.message;
          if (typeof message.status === 'string') {
            status.dataset.state = message.status;
          }
        }
        if (submitButton instanceof HTMLButtonElement) {
          submitButton.disabled = false;
        }
        if (message.status === 'success') {
          const outcome = document.getElementById('host-review-outcome');
          const confidence = document.getElementById('host-review-confidence');
          const note = document.getElementById('host-review-note');
          if (outcome instanceof HTMLSelectElement) {
            outcome.value = '';
          }
          if (confidence instanceof HTMLSelectElement) {
            confidence.value = '';
          }
          if (note instanceof HTMLTextAreaElement) {
            note.value = '';
          }
          clearHostReviewDraft();
        }
      });
      document.addEventListener('input', (event) => {
        const target = event.target;
        if (
          !(target instanceof HTMLTextAreaElement) ||
          target.id !== 'host-review-note'
        ) {
          return;
        }

        persistHostReviewDraft();
      });
      document.addEventListener('change', (event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) {
          return;
        }

        if (
          target instanceof HTMLInputElement &&
          target.dataset.hash !== undefined &&
          target.type === 'checkbox'
        ) {
          handleCommitSelectionChange(target);
          return;
        }

        if (
          target.id !== 'host-review-outcome' &&
          target.id !== 'host-review-confidence'
        ) {
          return;
        }

        persistHostReviewDraft();
      });
      document.addEventListener('click', (event) => {
        const target = event.target;
        if (!(target instanceof HTMLButtonElement)) {
          return;
        }

        const command = target.dataset.command;
        const hash = target.dataset.hash;
        const pageId = target.dataset.pageId;
        if (!command) {
          return;
        }

        const payload = { command };
        if (hash) {
          payload.hash = hash;
        }
        if (pageId) {
          payload.pageId = pageId;
        }
        if (command === 'submitHumanReview') {
          const outcome = document.getElementById('host-review-outcome');
          const confidence = document.getElementById('host-review-confidence');
          const note = document.getElementById('host-review-note');
          const status = document.getElementById('host-review-status');
          if (outcome instanceof HTMLSelectElement) {
            payload.reviewOutcome = outcome.value;
          }
          if (confidence instanceof HTMLSelectElement) {
            payload.reviewConfidence = confidence.value;
          }
          if (note instanceof HTMLTextAreaElement) {
            payload.reviewNote = note.value;
          }
          if (status instanceof HTMLElement) {
            status.textContent = 'Submitting host review...';
            status.dataset.state = 'submitting';
          }
          target.disabled = true;
        }
        if (command === 'generateComparisonReportFromSelection') {
          const pair = resolveSelectedPair();
          if (!pair) {
            updateComparePreflightSelectionState();
            return;
          }
          payload.selectedHashes = [pair.selectedHash, pair.baseHash];
        }
        vscode.postMessage(payload);
      });
    </script>
  </body>
</html>`;
}

function deriveInitialCompareRuntimeStatus(
  lastActionSummary?: HistoryPanelActionSummary
): {
  status: 'idle' | 'blocked' | 'failed' | 'succeeded' | 'cancelled';
  summary: string;
  nextAction: string;
  details: CompareRuntimeDetailItem[];
} {
  if (
    lastActionSummary?.comparisonRuntimePanelSummary &&
    lastActionSummary.comparisonRuntimePanelNextAction
  ) {
    return {
      status: lastActionSummary.comparisonRuntimePanelStatus ?? 'idle',
      summary: lastActionSummary.comparisonRuntimePanelSummary,
      nextAction: lastActionSummary.comparisonRuntimePanelNextAction,
      details: lastActionSummary.comparisonRuntimePanelDetails ?? []
    };
  }

  return {
    status: 'idle',
    summary: 'No compare action from this panel has retained provider or acquisition truth yet.',
    nextAction:
      'Next action: review compare preflight, then choose Compare to surface the selected provider and any acquisition state here.',
    details: []
  };
}

export function renderHistoryReviewPacketText(model: ViHistoryViewModel): string {
  const newestCommit = model.commits[0];
  const oldestCommit = model.commits[model.commits.length - 1];
  const commitFacts =
    model.commits.length > 0
      ? model.commits
          .map(
            (commit) =>
              `- ${renderPlainTextValue(commit.hash.slice(0, 8))} :: ${renderPlainTextValue(commit.subject)} :: ${renderCommitBodyText(commit)}`
          )
          .join('\n')
      : '- No retained commits were loaded, so no commit facts are available.';

  return [
    'VI History Review Packet',
    `Repository: ${renderPlainTextValue(model.repositoryName)}`,
    `Root: ${renderPlainTextValue(model.repositoryRoot)}`,
    `Origin: ${renderPlainTextValue(model.repositoryUrl ?? 'Unavailable')}`,
    `Path: ${renderPlainTextValue(model.relativePath)}`,
    `Repo support: ${renderPlainTextValue(model.repositorySupport?.supportLabel ?? 'Not classified in this build')}`,
    `Signature: ${renderPlainTextValue(model.signature)}`,
    `Eligibility: ${model.eligible ? 'Eligible' : 'Not eligible'}`,
    `Retained revisions: ${model.commits.length}`,
    `History window: ${renderHistoryWindowSummary(model)}`,
    `Newest retained commit: ${renderTextCommitSummary(newestCommit)}`,
    `Oldest retained commit: ${renderTextCommitSummary(oldestCommit)}`,
    'Confidence and scope:',
    '- Basis: local Git history, tracked-file status, and content-detected VI signature checks.',
    '- Included here: chronology, path provenance, retained hashes, explicit selected/base compare preflight, and per-retained-commit subject and body facts.',
    '- Needs external comparison tooling: binary semantic differences, visual or cosmetic change detection, and LabVIEW comparison-report output.',
    'Per-retained-commit facts:',
    commitFacts
  ].join('\n');
}

function deriveComparePreflightState(
  comparisonSelectionEnabled: boolean,
  comparePreflightState?: HistoryPanelComparePreflightState
): HistoryPanelComparePreflightState {
  if (!comparisonSelectionEnabled) {
    return {
      status: 'unavailable',
      provider: comparePreflightState?.provider ?? 'Unavailable in this build.',
      labviewVersion: comparePreflightState?.labviewVersion ?? 'Unavailable in this build.',
      labviewBitness: comparePreflightState?.labviewBitness ?? 'Unavailable in this build.',
      nextAction: 'Next action: compare generation is unavailable in this extension build.',
      cliHint:
        comparePreflightState?.cliHint ??
        'This build does not expose compare generation.',
      warningMessage: comparePreflightState?.warningMessage
    };
  }

  return (
    comparePreflightState ?? {
      status: 'blocked',
      provider: 'host',
      labviewVersion: 'Unset',
      labviewBitness: 'Unset',
      nextAction:
        'Next action: use the generated settings CLI to set viHistorySuite.labviewVersion and viHistorySuite.labviewBitness. Compare can still be tried after selecting two revisions.',
      cliHint:
        'Use the generated settings CLI to update provider, LabVIEW version, or LabVIEW bitness.',
      warningMessage:
        'Runtime settings need attention. Use the generated settings CLI to set viHistorySuite.labviewVersion and viHistorySuite.labviewBitness, or try Compare to capture the exact failure.'
    }
  );
}

function deriveInitialComparePreflightSummary(
  comparePreflightState: HistoryPanelComparePreflightState
): string {
  if (comparePreflightState.status === 'ready') {
    return 'Select two retained revisions to populate compare preflight, then choose Compare to generate retained evidence for that exact pair.';
  }

  if (comparePreflightState.status === 'unavailable') {
    return 'Compare preflight is unavailable in this build.';
  }

  return 'Runtime settings need attention; select two retained revisions to try Compare and capture the exact failure if it cannot finish.';
}

function renderCommitBodyCell(commit: ViHistoryCommit): string {
  const body = (commit.body ?? '').trim();
  if (body.length === 0) {
    return '<span data-testid="history-commit-body-empty" class="commit-body-empty">No commit body</span>';
  }

  return escapeHtml(body).replace(/\r\n?|\n/g, '<br />');
}

function renderCommitBodyText(commit: ViHistoryCommit): string {
  const body = renderPlainTextValue(commit.body ?? '');
  return body.length > 0 ? body : 'No commit body';
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function renderPlainTextValue(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replace(/\r\n?|\n/g, ' ')
    .replace(/\t/g, ' ')
    .trim();
}

function serializeForInlineScript(value: unknown): string {
  return JSON.stringify(value).replaceAll('<', '\\u003C');
}

function renderCompareRuntimeDetails(
  details: CompareRuntimeDetailItem[]
): string {
  if (details.length === 0) {
    return '';
  }

  return details
    .map(
      (detail) =>
        `<div data-testid="history-compare-runtime-detail"><strong>${escapeHtml(detail.label)}:</strong> ${escapeHtml(detail.value)}</div>`
    )
    .join('');
}

function renderCommitSummary(commit: ViHistoryCommit | undefined): string {
  if (!commit) {
    return 'No retained commits';
  }

  return `${escapeHtml(commit.hash.slice(0, 8))} · ${escapeHtml(commit.authorDate)} · ${escapeHtml(commit.authorName)}`;
}

function renderTextCommitSummary(commit: ViHistoryCommit | undefined): string {
  if (!commit) {
    return 'No retained commits';
  }

  return `${renderPlainTextValue(commit.hash.slice(0, 8))} · ${renderPlainTextValue(commit.authorDate)} · ${renderPlainTextValue(commit.authorName)}`;
}

function renderHistoryWindowSummary(model: ViHistoryViewModel): string {
  const historyWindow = model.historyWindow;
  if (!historyWindow) {
    return `${model.commits.length} retained commit(s) loaded.`;
  }

  if (historyWindow.totalCommitCount !== undefined) {
    if (!historyWindow.truncated) {
      return historyWindow.mode === 'auto'
        ? `full history loaded automatically (${historyWindow.loadedCommitCount}/${historyWindow.totalCommitCount} commits)`
        : `full history loaded within capped mode (${historyWindow.loadedCommitCount}/${historyWindow.totalCommitCount} commits)`;
    }

    return historyWindow.mode === 'auto'
      ? `auto window truncated to ${historyWindow.loadedCommitCount}/${historyWindow.totalCommitCount} commits at the automatic safety ceiling (${historyWindow.effectiveEntryCeiling})`
      : `capped window truncated to ${historyWindow.loadedCommitCount}/${historyWindow.totalCommitCount} commits at the configured ceiling (${historyWindow.effectiveEntryCeiling})`;
  }

  return historyWindow.mode === 'auto'
    ? `loaded ${historyWindow.loadedCommitCount} commits under auto mode; total history count was unavailable`
    : `loaded ${historyWindow.loadedCommitCount} commits under capped mode; total history count was unavailable`;
}

function renderRepositorySupportSection(
  support: ViHistoryRepositorySupport
): string {
  return `
    <div class="limitations" data-testid="history-repository-support">
      <strong>Repo support:</strong> ${escapeHtml(support.supportLabel)}<br />
      ${escapeHtml(support.supportGuidance)}
    </div>
  `;
}

function renderHumanReviewSubmissionSection(): string {
  return `
    <div class="review-submit" data-testid="history-human-review-submit">
      <strong>Host-machine review submission:</strong> This maintainer-only surface is shown only on Sergio Velderrain's canonical Windows 11 development and review machine.
      <div class="review-submit-grid">
        <label data-testid="history-human-review-outcome-field">
          Outcome
          <select id="host-review-outcome">
            <option value="" selected>Select outcome</option>
            <option value="passed-human-review">Pass</option>
            <option value="needs-more-review">Needs more review</option>
            <option value="failed-human-review">Fail</option>
          </select>
        </label>
        <label data-testid="history-human-review-confidence-field">
          Confidence
          <select id="host-review-confidence">
            <option value="" selected>Select confidence</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </label>
        <label data-testid="history-human-review-note-field" style="grid-column: 1 / -1;">
          Review note
          <textarea id="host-review-note" placeholder="Summarize the manual right-click result, any surprises, and whether the review surface behaved as expected."></textarea>
        </label>
      </div>
      <div data-testid="history-human-review-examples">
        <strong>Outcome/confidence quick guide:</strong> outcome = what happened; confidence = how sure you are.
        <ul>
          <li>Pass + High: the click flow behaved as expected and no meaningful doubt remains.</li>
          <li>Pass + Medium: the click flow behaved as expected, but one minor doubt remains.</li>
          <li>Pass + Low: it mostly passed, but you want another confirming run.</li>
          <li>Needs more review + High: you are sure the current evidence is not enough yet.</li>
          <li>Needs more review + Medium: more review is probably needed.</li>
          <li>Needs more review + Low: you are only slightly leaning toward more review.</li>
          <li>Fail + High: the UX or behavior clearly failed.</li>
          <li>Fail + Medium: a failure likely happened, but one detail is still uncertain.</li>
          <li>Fail + Low: a failure might have happened, but you want another run to confirm it.</li>
        </ul>
      </div>
      <div class="review-submit-status" data-testid="history-human-review-status" id="host-review-status" role="status" aria-live="polite">No host review has been submitted from this panel yet.</div>
      <button data-testid="history-action-submit-human-review" data-command="submitHumanReview">Submit host review</button>
    </div>
  `;
}

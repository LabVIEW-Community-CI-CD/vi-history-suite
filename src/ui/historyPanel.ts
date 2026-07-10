import {
  ViHistoryCommit,
  ViHistoryViewModel
} from '../services/viHistoryModel';
import { WORKTREE_REVISION_SENTINEL } from '../git/gitCli';

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

export function renderHistoryPanelHtml(model: ViHistoryViewModel): string {
  const capabilities = model.surfaceCapabilities ?? {};
  const comparisonSelectionEnabled = capabilities.comparisonGenerationAvailable !== false;
  const commitCount = model.commits.length;
  // VHS-REQ-641: when the selected VI has uncommitted working-tree changes, pin a
  // selectable "Working Tree (uncommitted)" row at the top of the history table so
  // the on-disk version can be paired with any commit via the same two-checkbox
  // compare flow. data-commit-index="-1" sorts it as the newest entry, so it
  // resolves as the `selected` side and the checked commit becomes the `base`.
  const workingTreeRow =
    comparisonSelectionEnabled && model.workingTree?.hasUncommittedChanges
      ? `
        <tr data-testid="history-working-tree-row" data-commit-index="-1">
          <td data-testid="history-commit-select-cell"><input data-testid="history-commit-select" type="checkbox" data-hash="${escapeHtml(
            WORKTREE_REVISION_SENTINEL
          )}" /></td>
          <td data-testid="history-commit-hash"><code>working tree</code></td>
          <td data-testid="history-commit-date">uncommitted</td>
          <td data-testid="history-commit-author">Working tree</td>
          <td data-testid="history-commit-subject">Uncommitted changes (not retained)</td>
          <td data-testid="history-commit-body" class="commit-body"><span class="commit-body-empty">On-disk changes not yet committed.</span></td>
        </tr>
      `
      : '';
  const rows = model.commits
    .map((commit: ViHistoryCommit, index: number) => {
      const selectCheckbox = `<input data-testid="history-commit-select" type="checkbox" data-hash="${escapeHtml(commit.hash)}" ${
        comparisonSelectionEnabled ? '' : 'disabled'
      } />`;
      // VHS-REQ-659: per-revision preview opens that commit's VI in the read-only
      // preview editor. Shown only when comparison/runtime surfaces are available
      // (same gate as compare); the shared webview click handler posts
      // { command: 'previewRevision', hash }.
      const previewButton = comparisonSelectionEnabled
        ? `<button data-testid="history-action-preview" class="row-preview" data-command="previewRevision" data-hash="${escapeHtml(
            commit.hash
          )}" title="Preview this revision">Preview</button>`
        : '';

      return `
        <tr data-testid="history-row" data-commit-index="${index}">
          <td data-testid="history-commit-select-cell">${selectCheckbox}${previewButton}</td>
          <td data-testid="history-commit-hash"><code>${escapeHtml(commit.hash.slice(0, 8))}</code></td>
          <td data-testid="history-commit-date">${escapeHtml(commit.authorDate)}</td>
          <td data-testid="history-commit-author">${escapeHtml(commit.authorName)}</td>
          <td data-testid="history-commit-subject">${escapeHtml(commit.subject)}</td>
          <td data-testid="history-commit-body" class="commit-body">${renderCommitBodyCell(commit)}</td>
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
      h1 {
        font-size: 1.1em;
        font-weight: 600;
        margin: 0 0 12px;
      }
      h1 .history-path {
        font-family: var(--vscode-editor-font-family, monospace);
      }
      h1 .history-commit-count {
        color: var(--vscode-descriptionForeground);
        font-weight: 400;
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
      .row-preview {
        margin-left: 6px;
        margin-bottom: 0;
        font-size: 0.85em;
      }
      .commit-body {
        white-space: pre-wrap;
      }
      .commit-body-empty {
        color: var(--vscode-descriptionForeground);
        font-style: italic;
      }
      /*
       * VHS-REQ-133 (#559): pin the primary Compare action in a sticky footer so
       * it stays reachable without scrolling on large histories (e.g. lv_icon.vi).
       * The opaque background + top border keep table rows covered as they scroll
       * underneath; on short histories the bar simply sits at its natural position.
       */
      .compare-bar {
        position: sticky;
        bottom: 0;
        margin-top: 16px;
        padding: 12px 0;
        background: var(--vscode-editor-background);
        border-top: 1px solid var(--vscode-panel-border);
        z-index: 1;
      }
      .compare-bar button {
        margin-bottom: 0;
      }
    </style>
  </head>
  <body>
    <h1 data-testid="history-title">VI History — <span class="history-path">${escapeHtml(model.relativePath)}</span> <span class="history-commit-count">(${commitCount} commit${commitCount === 1 ? '' : 's'})</span></h1>
    <table data-testid="history-table">
      <thead>
        <tr>
          <th>Select</th>
          <th>Commit</th>
          <th>Date</th>
          <th>Author</th>
          <th>Subject</th>
          <th>Commit body</th>
        </tr>
      </thead>
      <tbody>
        ${workingTreeRow}
        ${rows}
      </tbody>
    </table>
    <div class="compare-bar" data-testid="history-compare-bar">
      <button data-testid="history-action-compare-selected" id="history-action-compare-selected" data-command="generateComparisonReportFromSelection" disabled>Compare</button>
    </div>
    <script>
      const vscode = acquireVsCodeApi();
      const compareSelectionEnabled = ${comparisonSelectionEnabled ? 'true' : 'false'};
      function getCommitSelectionInputs() {
        return Array.from(document.querySelectorAll('[data-testid="history-commit-select"]')).filter(
          (candidate) => candidate instanceof HTMLInputElement
        );
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
      // VHS-REQ-133: exactly two distinct retained revisions enable Compare; the
      // newer (lower commit index) becomes selected and the older becomes base.
      // Selecting the second revision only enables the button — Compare stays an
      // explicit user action and is never triggered automatically.
      function updateCompareSelectionState() {
        if (!compareSelectionEnabled) {
          updateCompareButtonState(false);
          return;
        }
        updateCompareButtonState(resolveSelectedPair() !== undefined);
      }
      // VHS-REQ-133 (#561): persist the explicit checkbox selection to webview
      // state so it survives a panel reload. Switching to another panel (e.g.
      // Runtime & Report Settings) hides this webview, and an in-place re-render
      // reassigns the HTML; either reloads the script, which would otherwise drop
      // the in-DOM selection.
      function readSavedSelectedHashes() {
        const state = vscode.getState();
        const saved = state && Array.isArray(state.selectedHashes) ? state.selectedHashes : [];
        return saved.filter((value) => typeof value === 'string' && value.length > 0);
      }
      function persistSelectedHashes() {
        const selectedHashes = getCommitSelectionInputs()
          .filter((candidate) => candidate.checked)
          .map((candidate) => candidate.dataset.hash ?? '')
          .filter((hash) => hash.length > 0);
        vscode.setState({ ...(vscode.getState() ?? {}), selectedHashes });
      }
      function restoreSelectedHashes() {
        if (!compareSelectionEnabled) {
          return;
        }
        const saved = readSavedSelectedHashes();
        if (saved.length === 0) {
          return;
        }
        let restored = 0;
        for (const input of getCommitSelectionInputs()) {
          const hash = input.dataset.hash ?? '';
          if (hash.length > 0 && saved.indexOf(hash) !== -1 && restored < 2) {
            input.checked = true;
            restored += 1;
          }
        }
      }
      function handleCommitSelectionChange(target) {
        if (!(target instanceof HTMLInputElement) || target.dataset.hash === undefined) {
          return;
        }

        const checked = getCommitSelectionInputs().filter((candidate) => candidate.checked);
        if (checked.length > 2) {
          target.checked = false;
        }
        updateCompareSelectionState();
        persistSelectedHashes();
      }

      restoreSelectedHashes();
      updateCompareSelectionState();

      document.addEventListener('change', (event) => {
        const target = event.target;
        if (
          target instanceof HTMLInputElement &&
          target.dataset.hash !== undefined &&
          target.type === 'checkbox'
        ) {
          handleCommitSelectionChange(target);
        }
      });
      document.addEventListener('click', (event) => {
        const target = event.target;
        if (!(target instanceof HTMLButtonElement)) {
          return;
        }

        const command = target.dataset.command;
        const hash = target.dataset.hash;
        if (!command) {
          return;
        }

        const payload = { command };
        if (hash) {
          payload.hash = hash;
        }
        if (command === 'generateComparisonReportFromSelection') {
          const pair = resolveSelectedPair();
          if (!pair) {
            updateCompareSelectionState();
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

function renderCommitBodyCell(commit: ViHistoryCommit): string {
  const body = commit.body ?? '';
  if (body.trim().length === 0) {
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


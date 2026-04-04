import {
  ViHistoryCommit,
  ViHistorySurfaceCapabilities,
  ViHistoryViewModel
} from '../services/viHistoryModel';

export function renderHistoryPanelHtml(model: ViHistoryViewModel): string {
  const capabilities = model.surfaceCapabilities ?? {};
  const newestCommit = model.commits[0];
  const oldestCommit = model.commits[model.commits.length - 1];
  const historyWindowSummary = renderHistoryWindowSummary(model);
  const dashboardButton =
    capabilities.dashboardAvailable !== false && model.commits.length >= 3
      ? '<button data-testid="history-action-dashboard" data-command="openDashboard">Open dashboard</button>'
      : '<button data-testid="history-action-dashboard" disabled>Open dashboard</button>';
  const documentationButton =
    capabilities.documentationAvailable !== false
      ? '<button data-testid="history-action-documentation" data-command="openDocumentation" data-page-id="user-workflow">Open docs</button>'
      : '<button data-testid="history-action-documentation" disabled>Open docs</button>';
  const decisionRecordButton =
    capabilities.decisionRecordAvailable !== false && model.commits.length >= 3
      ? '<button data-testid="history-action-decision-record" data-command="createDecisionRecord">Create decision record</button>'
      : '<button data-testid="history-action-decision-record" disabled>Create decision record</button>';
  const capabilitySummary = renderCapabilitySummary(capabilities, model.commits.length);
  const rows = model.commits
    .map((commit: ViHistoryCommit, index: number) => {
      const hasRetainedComparisonEvidence = commit.retainedComparisonEvidenceAvailable === true;
      const diffButton =
        commit.previousHash &&
        hasRetainedComparisonEvidence &&
        capabilities.retainedComparisonOpenAvailable !== false
        ? `<button data-testid="history-action-diff" data-command="diffPrevious" data-hash="${escapeHtml(commit.hash)}">Open compare</button>`
        : '<button data-testid="history-action-diff" disabled>Open compare</button>';
      const reportActionLabel = hasRetainedComparisonEvidence
        ? 'Refresh compare'
        : 'Generate compare';
      const reportButton =
        commit.previousHash &&
        capabilities.comparisonGenerationAvailable !== false
        ? `<button data-testid="history-action-report" data-command="generateComparisonReport" data-hash="${escapeHtml(commit.hash)}">${reportActionLabel}</button>`
        : `<button data-testid="history-action-report" disabled>${reportActionLabel}</button>`;
      const compareBase = commit.previousHash
        ? `<div data-testid="history-compare-pair"><strong>Selected:</strong> <code>${escapeHtml(commit.hash.slice(0, 8))}</code> <strong>vs base:</strong> <code>${escapeHtml(commit.previousHash.slice(0, 8))}</code></div>`
        : 'Oldest retained revision';

      return `
        <tr data-testid="history-row" data-commit-index="${index}">
          <td data-testid="history-commit-hash"><code>${escapeHtml(commit.hash.slice(0, 8))}</code></td>
          <td data-testid="history-commit-date">${escapeHtml(commit.authorDate)}</td>
          <td data-testid="history-commit-author">${escapeHtml(commit.authorName)}</td>
          <td data-testid="history-commit-subject">${escapeHtml(commit.subject)}</td>
          <td data-testid="history-compare-base">${compareBase}</td>
          <td data-testid="history-commit-actions">
            <button data-testid="history-action-open" data-command="openCommit" data-hash="${escapeHtml(commit.hash)}">Open@commit</button>
            ${diffButton}
            ${reportButton}
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
      ${dashboardButton}
      ${decisionRecordButton}
    </div>
    <div class="packet" data-testid="history-review-packet">
      <div data-testid="history-chronology-order"><strong>Order:</strong> Newest commit first</div>
      <div data-testid="history-retained-span"><strong>Retained revisions:</strong> ${model.commits.length}</div>
      <div data-testid="history-review-window"><strong>Window:</strong> ${escapeHtml(historyWindowSummary)}</div>
      <div data-testid="history-newest-commit"><strong>Newest:</strong> ${renderCommitSummary(newestCommit)}</div>
      <div data-testid="history-oldest-commit"><strong>Oldest:</strong> ${renderCommitSummary(oldestCommit)}</div>
    </div>
    <div class="meta" data-testid="history-meta">
      <div data-testid="history-meta-repository"><strong>Repository:</strong> ${escapeHtml(model.repositoryName)}</div>
      <div data-testid="history-meta-root"><strong>Root:</strong> ${escapeHtml(model.repositoryRoot)}</div>
      <div data-testid="history-meta-path"><strong>Path:</strong> ${escapeHtml(model.relativePath)}</div>
      <div data-testid="history-meta-surface"><strong>Surface:</strong> VI History</div>
    </div>
    <div class="packet" data-testid="history-surface-capabilities">
      <div data-testid="history-capability-comparison"><strong>Compare generation:</strong> ${capabilitySummary.comparisonGeneration}</div>
      <div data-testid="history-capability-open-compare"><strong>Open compare:</strong> ${capabilitySummary.openCompare}</div>
      <div data-testid="history-capability-dashboard"><strong>Dashboard:</strong> ${capabilitySummary.dashboard}</div>
      <div data-testid="history-capability-decision-record"><strong>Decision record:</strong> ${capabilitySummary.decisionRecord}</div>
      <div data-testid="history-capability-documentation"><strong>Documentation:</strong> ${capabilitySummary.documentation}</div>
    </div>
    <div class="limitations" data-testid="history-binary-limitations">
      <strong>Binary review limits:</strong> Git-backed LabVIEW VI revisions are binary artifacts. This surface retains chronology and commit facts; pairwise compare actions use retained NI comparison-report evidence and installed tooling instead of plain text diff.
    </div>
    <div class="guidance" data-testid="history-review-guidance">
      <strong>Reviewer guidance:</strong>
      <ol>
        <li data-testid="history-guidance-step">Use the newest/oldest packet to confirm the retained review window before acting on a specific revision.</li>
        <li data-testid="history-guidance-step">Use the compare pair in each row to see exactly which retained base revision an <code>Open compare</code> action targets once retained pair evidence exists and retained compare opening is available in this build.</li>
        <li data-testid="history-guidance-step">Use <code>Open docs</code> to open the bundled user documentation that ships with this installed extension version instead of leaving VS Code for repo-hosted docs.</li>
        <li data-testid="history-guidance-step">Use <code>Open dashboard</code> when the retained window has at least three commits, dashboard review is available in this build, and you want concentrated comparison-report evidence in one place.</li>
        <li data-testid="history-guidance-step">Use <code>Create decision record</code> when decision-record support is available in this build and you want to retain a separate human review outcome from the current VI review evidence without mutating the machine-generated dashboard packet.</li>
        <li data-testid="history-guidance-step">Use <code>Generate compare</code> when a pair has no retained evidence yet, and <code>Refresh compare</code> when you want to update already-retained evidence for that pair, but only when comparison generation is available in this build.</li>
      </ol>
    </div>
    <div class="confidence" data-testid="history-confidence-scope">
      <strong>Confidence and scope:</strong>
      <div class="confidence-grid">
        <div data-testid="history-confidence-basis"><strong>Basis:</strong> Local Git history, tracked-file status, and content-detected VI signature checks.</div>
        <div data-testid="history-confidence-rating"><strong>Confidence:</strong> Direct local evidence for chronology, path provenance, retained hashes, and retained compare pairing.</div>
        <div data-testid="history-scope-included"><strong>Included here:</strong> Repository/path facts, retained commit chronology, selected-versus-base pairing, compare-pair summaries, and dashboard availability.</div>
        <div data-testid="history-scope-excluded"><strong>Needs external comparison tooling:</strong> Binary semantic differences, visual or cosmetic change detection, and NI comparison-report output.</div>
      </div>
    </div>
    <table data-testid="history-table">
      <thead>
        <tr>
          <th>Commit</th>
          <th>Date</th>
          <th>Author</th>
          <th>Subject</th>
          <th>Compare base</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
    <script>
      const vscode = acquireVsCodeApi();
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
        vscode.postMessage(payload);
      });
    </script>
  </body>
</html>`;
}

export function renderHistoryReviewPacketText(model: ViHistoryViewModel): string {
  const newestCommit = model.commits[0];
  const oldestCommit = model.commits[model.commits.length - 1];
  const comparePairs = model.commits
    .map((commit) =>
      commit.previousHash
        ? `- ${commit.hash.slice(0, 8)} vs ${commit.previousHash.slice(0, 8)} :: ${commit.subject}`
        : `- ${commit.hash.slice(0, 8)} :: oldest retained revision :: ${commit.subject}`
    )
    .join('\n');

  return [
    'VI History Review Packet',
    `Repository: ${model.repositoryName}`,
    `Root: ${model.repositoryRoot}`,
    `Path: ${model.relativePath}`,
    `Signature: ${model.signature}`,
    `Eligibility: ${model.eligible ? 'Eligible' : 'Not eligible'}`,
    `Retained revisions: ${model.commits.length}`,
    `History window: ${renderHistoryWindowSummary(model)}`,
    `Dashboard available: ${model.commits.length >= 3 ? 'yes' : 'no'}`,
    `Newest retained commit: ${renderCommitSummary(newestCommit)}`,
    `Oldest retained commit: ${renderCommitSummary(oldestCommit)}`,
    'Confidence and scope:',
    '- Basis: local Git history, tracked-file status, and content-detected VI signature checks.',
    '- Included here: chronology, path provenance, retained hashes, compare pairs, and dashboard availability.',
    '- Needs external comparison tooling: binary semantic differences, visual or cosmetic change detection, and NI comparison-report output.',
    'Retained compare pairs:',
    comparePairs
  ].join('\n');
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function renderCommitSummary(commit: ViHistoryCommit | undefined): string {
  if (!commit) {
    return 'No retained commits';
  }

  return `${escapeHtml(commit.hash.slice(0, 8))} · ${escapeHtml(commit.authorDate)} · ${escapeHtml(commit.authorName)}`;
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

function renderCapabilitySummary(
  capabilities: ViHistorySurfaceCapabilities,
  commitCount: number
): {
  comparisonGeneration: string;
  openCompare: string;
  dashboard: string;
  decisionRecord: string;
  documentation: string;
} {
  return {
    comparisonGeneration:
      capabilities.comparisonGenerationAvailable === false
        ? 'Unavailable in this build'
        : 'Available for retained pairs that have a base revision',
    openCompare:
      capabilities.retainedComparisonOpenAvailable === false
        ? 'Unavailable in this build'
        : 'Available once retained pair evidence exists',
    dashboard:
      capabilities.dashboardAvailable === false
        ? 'Unavailable in this build'
        : commitCount >= 3
          ? 'Available for this retained review window'
          : 'Available when the retained review window reaches at least three commits',
    decisionRecord:
      capabilities.decisionRecordAvailable === false
        ? 'Unavailable in this build'
        : commitCount >= 3
          ? 'Available for this retained review window'
          : 'Available when the retained review window reaches at least three commits',
    documentation:
      capabilities.documentationAvailable === false
        ? 'Unavailable in this build'
        : 'Available in this build'
  };
}

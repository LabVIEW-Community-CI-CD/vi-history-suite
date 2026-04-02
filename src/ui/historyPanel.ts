import { ViHistoryCommit, ViHistoryViewModel } from '../services/viHistoryModel';

export function renderHistoryPanelHtml(model: ViHistoryViewModel): string {
  const rows = model.commits
    .map((commit: ViHistoryCommit, index: number) => {
      const diffButton = commit.previousHash
        ? `<button data-testid="history-action-diff" data-command="diffPrevious" data-hash="${escapeHtml(commit.hash)}">Diff prev</button>`
        : '<button data-testid="history-action-diff" disabled>Diff prev</button>';

      return `
        <tr data-testid="history-row" data-commit-index="${index}">
          <td data-testid="history-commit-hash"><code>${escapeHtml(commit.hash.slice(0, 8))}</code></td>
          <td data-testid="history-commit-date">${escapeHtml(commit.authorDate)}</td>
          <td data-testid="history-commit-author">${escapeHtml(commit.authorName)}</td>
          <td data-testid="history-commit-subject">${escapeHtml(commit.subject)}</td>
          <td data-testid="history-commit-actions">
            <button data-testid="history-action-open" data-command="openCommit" data-hash="${escapeHtml(commit.hash)}">Open@commit</button>
            ${diffButton}
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
    </style>
  </head>
  <body>
    <div class="status" data-testid="history-status">
      <strong>Eligibility:</strong> <span data-testid="history-status-eligibility">${model.eligible ? 'Eligible' : 'Not eligible'}</span><br />
      <strong>Signature:</strong> <span data-testid="history-status-signature">${escapeHtml(model.signature)}</span><br />
      <strong>Commits:</strong> <span data-testid="history-status-commit-count">${model.commits.length}</span>
    </div>
    <div class="meta" data-testid="history-meta">
      <div data-testid="history-meta-repository"><strong>Repository:</strong> ${escapeHtml(model.repositoryName)}</div>
      <div data-testid="history-meta-root"><strong>Root:</strong> ${escapeHtml(model.repositoryRoot)}</div>
      <div data-testid="history-meta-path"><strong>Path:</strong> ${escapeHtml(model.relativePath)}</div>
      <div data-testid="history-meta-surface"><strong>Surface:</strong> VI History</div>
    </div>
    <table data-testid="history-table">
      <thead>
        <tr>
          <th>Commit</th>
          <th>Date</th>
          <th>Author</th>
          <th>Subject</th>
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
        if (!command || !hash) {
          return;
        }

        vscode.postMessage({ command, hash });
      });
    </script>
  </body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

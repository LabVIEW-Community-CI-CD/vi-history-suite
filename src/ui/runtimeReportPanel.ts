/**
 * VHS-REQ-620 / VHS-REQ-645: Runtime & Report Settings webview panel renderer.
 *
 * Replaces the status-bar runtime quick-pick with a single secondary surface
 * that selects the comparison runtime provider, the LabVIEW container image
 * version (when Docker is in play), and toggles the LabVIEW comparison-report
 * difference filters.
 *
 * The report filters are presented as **Include** checkboxes: a checked box
 * means "include this difference class in the report"; unchecking it deselects
 * that class. The underlying `viHistorySuite.report.ignore*` settings use the
 * inverse polarity (true = exclude), so the panel host inverts the value on the
 * way to settings (`ignore = !include`) and back (`include = !ignore`).
 *
 * This module is intentionally free of `vscode` runtime imports so the render
 * is a pure function of its view model and unit-testable without the harness.
 * The owning command (`openRuntimeReportPanelCommand`) builds the view model
 * from cached runtime detection plus `viHistorySuite.*` settings and applies the
 * messages this panel posts.
 */

import type { ComparisonReportOptions } from '../reporting/comparisonReportPlan';

/** Stable view-type id for the runtime & report settings webview panel. */
export const RUNTIME_REPORT_PANEL_VIEW_TYPE = 'viHistorySuite.runtimeReportSettings';

/** Title shown on the runtime & report settings webview panel tab. */
export const RUNTIME_REPORT_PANEL_TITLE = 'Runtime & Report Settings';

/** Include-flag keys, one per LabVIEW `CreateComparisonReport` difference filter. */
export type ReportIncludeKey =
  | 'viAttributes'
  | 'frontPanel'
  | 'frontPanelObjectPosition'
  | 'blockDiagram'
  | 'blockDiagramCosmetic';

/**
 * Static description of one report difference class: how it maps to the
 * `viHistorySuite.report.ignore*` setting and the LabVIEW CLI flag emitted when
 * the class is excluded. `settingKey` is the section-relative settings key (the
 * panel host prefixes `viHistorySuite`).
 */
export interface ReportOptionDescriptor {
  readonly includeKey: ReportIncludeKey;
  readonly settingKey: string;
  readonly label: string;
  readonly description: string;
  readonly cliFlag: string;
}

/**
 * The five difference filters, in report-section order. Each is rendered as an
 * Include checkbox; unchecking maps to the named `ignore*` setting (CLI flag).
 */
export const REPORT_OPTION_DESCRIPTORS: readonly ReportOptionDescriptor[] = [
  {
    includeKey: 'viAttributes',
    settingKey: 'report.ignoreViAttributes',
    label: 'VI attributes',
    description: 'Include VI attribute differences in the comparison report.',
    cliFlag: '-noattr'
  },
  {
    includeKey: 'frontPanel',
    settingKey: 'report.ignoreFrontPanel',
    label: 'Front panel',
    description: 'Include all front panel differences in the comparison report.',
    cliFlag: '-nofp'
  },
  {
    includeKey: 'frontPanelObjectPosition',
    settingKey: 'report.ignoreFrontPanelObjectPosition',
    label: 'Front panel object size & position',
    description:
      'Include front panel object size and position differences in the comparison report.',
    cliFlag: '-nofppos'
  },
  {
    includeKey: 'blockDiagram',
    settingKey: 'report.ignoreBlockDiagram',
    label: 'Block diagram',
    description: 'Include all block diagram differences in the comparison report.',
    cliFlag: '-nobd'
  },
  {
    includeKey: 'blockDiagramCosmetic',
    settingKey: 'report.ignoreBlockDiagramCosmetic',
    label: 'Block diagram cosmetic differences',
    description:
      'Include block diagram cosmetic differences, including object position and size.',
    cliFlag: '-nobdcosm'
  }
];

/** Quick lookup from an include key to its descriptor. */
export const REPORT_OPTION_DESCRIPTOR_BY_KEY: Readonly<
  Record<ReportIncludeKey, ReportOptionDescriptor>
> = Object.freeze(
  REPORT_OPTION_DESCRIPTORS.reduce(
    (accumulator, descriptor) => {
      accumulator[descriptor.includeKey] = descriptor;
      return accumulator;
    },
    {} as Record<ReportIncludeKey, ReportOptionDescriptor>
  )
);

/** Report formats the in-panel viewer, dashboard, and export pipeline support. */
export type PanelReportFormat = 'HTMLSingleFile' | 'HTML';

/**
 * Derive the Include-checkbox state from the persisted (ignore-polarity)
 * comparison report options. `include = !ignore`; an omitted/false ignore flag
 * means the class is compared, so the box is checked.
 */
export function deriveReportIncludeFlags(
  options: ComparisonReportOptions
): Record<ReportIncludeKey, boolean> {
  return {
    viAttributes: options.ignoreViAttributes !== true,
    frontPanel: options.ignoreFrontPanel !== true,
    frontPanelObjectPosition: options.ignoreFrontPanelObjectPosition !== true,
    blockDiagram: options.ignoreBlockDiagram !== true,
    blockDiagramCosmetic: options.ignoreBlockDiagramCosmetic !== true
  };
}

/** A runtime-provider choice rendered as a selectable row in the panel. */
export interface RuntimeProviderPanelOption {
  readonly kind: 'host' | 'docker' | 'clear';
  readonly label: string;
  readonly description?: string;
  readonly detail?: string;
}

/** One discovered container image version offered in the container dropdown. */
export interface ContainerVersionPanelOption {
  readonly tag: string;
  readonly presence: string;
}

/** Container image section state. Hidden entirely when `visible` is false. */
export interface ContainerSectionViewModel {
  readonly visible: boolean;
  /** Selected `viHistorySuite.container.imageVersion`; '' uses the newest default. */
  readonly currentTag: string;
  readonly discovering: boolean;
  readonly discovered: boolean;
  readonly versions: readonly ContainerVersionPanelOption[];
  readonly notes: readonly string[];
}

/** Report section state: format plus the five include flags. */
export interface ReportSectionViewModel {
  readonly format: PanelReportFormat;
  readonly includeFlags: Record<ReportIncludeKey, boolean>;
}

/** Full view model consumed by {@link renderRuntimeReportPanelHtml}. */
export interface RuntimeReportPanelViewModel {
  readonly trusted: boolean;
  readonly detectionAvailable: boolean;
  readonly activeProviderSummary: string;
  readonly activeProviderSource?: 'persisted' | 'auto-detected';
  readonly providerOptions: readonly RuntimeProviderPanelOption[];
  /** Index into `providerOptions` matching the active selection, or -1. */
  readonly selectedProviderIndex: number;
  readonly container: ContainerSectionViewModel;
  readonly report: ReportSectionViewModel;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function serializeForInlineScript(value: unknown): string {
  return JSON.stringify(value).replaceAll('<', '\\u003C');
}

function renderProviderOption(
  option: RuntimeProviderPanelOption,
  index: number,
  selected: boolean
): string {
  const description = option.description
    ? `<div class="option-line" data-testid="runtime-report-provider-description">${escapeHtml(option.description)}</div>`
    : '';
  const detail = option.detail
    ? `<div class="option-line" data-testid="runtime-report-provider-detail">${escapeHtml(option.detail)}</div>`
    : '';
  return `
        <button
          class="provider-option${selected ? ' selected' : ''}"
          type="button"
          data-testid="runtime-report-provider-option"
          data-command="selectRuntimeProvider"
          data-index="${index}"
          data-kind="${escapeHtml(option.kind)}"
          aria-pressed="${selected ? 'true' : 'false'}"
        >
          <span class="option-label">${selected ? '\u2713 ' : ''}${escapeHtml(option.label)}</span>
          ${description}
          ${detail}
        </button>`;
}

function renderContainerSection(container: ContainerSectionViewModel): string {
  if (!container.visible) {
    return '';
  }

  const currentLabel =
    container.currentTag.length > 0
      ? escapeHtml(container.currentTag)
      : 'Newest supported default';

  let body: string;
  if (container.discovering) {
    body =
      '<div data-testid="runtime-report-container-status">Discovering LabVIEW container image versions\u2026</div>';
  } else if (!container.discovered) {
    body = `
        <button
          type="button"
          data-testid="runtime-report-container-discover"
          data-command="discoverContainerVersions"
        >Discover versions\u2026</button>`;
  } else {
    const options = [
      `<option value=""${container.currentTag.length === 0 ? ' selected' : ''}>Newest supported default</option>`,
      ...container.versions.map(
        (version) =>
          `<option value="${escapeHtml(version.tag)}"${version.tag === container.currentTag ? ' selected' : ''}>${escapeHtml(version.tag)} \u2014 ${escapeHtml(version.presence)}</option>`
      )
    ].join('\n          ');
    body = `
        <label class="field-label" for="runtime-report-container-select">Container image version</label>
        <select
          id="runtime-report-container-select"
          data-testid="runtime-report-container-select"
          data-command="selectContainerVersion"
        >
          ${options}
        </select>
        <button
          type="button"
          data-testid="runtime-report-container-refresh"
          data-command="discoverContainerVersions"
        >Refresh</button>`;
  }

  const notes =
    container.notes.length > 0
      ? `<div class="notes" data-testid="runtime-report-container-notes">${container.notes
          .map((note) => `<div>${escapeHtml(note)}</div>`)
          .join('')}</div>`
      : '';

  return `
    <section class="card" data-testid="runtime-report-container-section">
      <h2>LabVIEW container image</h2>
      <div data-testid="runtime-report-container-current"><strong>Selected:</strong> ${currentLabel}</div>
      ${body}
      ${notes}
    </section>`;
}

function renderProviderSection(model: RuntimeReportPanelViewModel): string {
  if (model.providerOptions.length === 0) {
    return `
    <section class="card" data-testid="runtime-report-provider-section">
      <h2>Comparison runtime</h2>
      <div data-testid="runtime-report-provider-empty">No comparison runtime was detected on this host. Install LabVIEW 2025 or newer or install Docker, then reopen this panel.</div>
    </section>`;
  }

  const options = model.providerOptions
    .map((option, index) =>
      renderProviderOption(option, index, index === model.selectedProviderIndex)
    )
    .join('\n');

  const sourceLine = model.activeProviderSource
    ? `<div class="source" data-testid="runtime-report-provider-source">Label source: ${escapeHtml(model.activeProviderSource)}</div>`
    : '';

  return `
    <section class="card" data-testid="runtime-report-provider-section">
      <h2>Comparison runtime</h2>
      <div data-testid="runtime-report-provider-active"><strong>Active:</strong> ${escapeHtml(model.activeProviderSummary)}</div>
      ${sourceLine}
      <div class="provider-options">${options}</div>
    </section>`;
}

function renderReportSection(report: ReportSectionViewModel): string {
  const formatOptions = (['HTMLSingleFile', 'HTML'] as const)
    .map((format) => {
      const label =
        format === 'HTMLSingleFile'
          ? 'Single self-contained HTML file (recommended)'
          : 'Multi-file HTML with a sibling images folder';
      return `
          <label class="radio-row" data-testid="runtime-report-format-row">
            <input
              type="radio"
              name="runtime-report-format"
              value="${format}"
              data-command="setReportFormat"
              ${report.format === format ? 'checked' : ''}
            />
            <span>${escapeHtml(label)}</span>
          </label>`;
    })
    .join('\n');

  const includeRows = REPORT_OPTION_DESCRIPTORS.map((descriptor) => {
    const checked = report.includeFlags[descriptor.includeKey];
    return `
          <label class="checkbox-row" data-testid="runtime-report-include-row" data-include-key="${escapeHtml(descriptor.includeKey)}">
            <input
              type="checkbox"
              data-testid="runtime-report-include-checkbox"
              data-command="setReportInclude"
              data-include-key="${escapeHtml(descriptor.includeKey)}"
              ${checked ? 'checked' : ''}
            />
            <span class="checkbox-text">
              <span class="checkbox-label">${escapeHtml(descriptor.label)}</span>
              <span class="checkbox-help">${escapeHtml(descriptor.description)} <code>${escapeHtml(descriptor.cliFlag)}</code></span>
            </span>
          </label>`;
  }).join('\n');

  return `
    <section class="card" data-testid="runtime-report-report-section">
      <h2>Comparison report</h2>
      <div class="subhead">Report format</div>
      <div class="radio-group" data-testid="runtime-report-format-group">
        ${formatOptions}
      </div>
      <div class="subhead">Include in report</div>
      <p class="hint" data-testid="runtime-report-include-hint">Uncheck a difference class to deselect it from the LabVIEW comparison report.</p>
      <div class="checkbox-group" data-testid="runtime-report-include-group">
        ${includeRows}
      </div>
    </section>`;
}

/**
 * Render the complete Runtime &amp; Report Settings panel HTML for a view model.
 * Pure: no `vscode` access, so it can be asserted directly in unit tests.
 */
export function renderRuntimeReportPanelHtml(model: RuntimeReportPanelViewModel): string {
  const untrustedBanner = model.trusted
    ? ''
    : '<div class="banner" data-testid="runtime-report-untrusted">VI History runtime commands require workspace trust. Trust this workspace to change runtime or report settings.</div>';

  const detectionBanner =
    model.trusted && !model.detectionAvailable
      ? '<div class="banner" data-testid="runtime-report-no-detection">Runtime detection has not completed yet. Reopen this panel shortly or run "Detect Runtime Now" first.</div>'
      : '';

  const interactiveSections = model.trusted
    ? `
    ${renderProviderSection(model)}
    ${renderContainerSection(model.container)}
    ${renderReportSection(model.report)}`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(RUNTIME_REPORT_PANEL_TITLE)}</title>
    <style>
      body {
        font-family: var(--vscode-font-family);
        color: var(--vscode-foreground);
        background: var(--vscode-editor-background);
        padding: 16px;
      }
      h1 {
        font-size: 1.3em;
        margin: 0 0 4px 0;
      }
      h2 {
        font-size: 1.05em;
        margin: 0 0 10px 0;
      }
      .intro {
        margin: 0 0 16px 0;
        color: var(--vscode-descriptionForeground);
      }
      .card {
        margin-bottom: 16px;
        padding: 12px;
        border: 1px solid var(--vscode-panel-border);
      }
      .banner {
        margin-bottom: 16px;
        padding: 12px;
        border-left: 4px solid var(--vscode-textLink-foreground);
        background: color-mix(in srgb, var(--vscode-editor-background) 85%, var(--vscode-textLink-foreground) 15%);
      }
      .provider-options {
        display: flex;
        flex-direction: column;
        gap: 8px;
        margin-top: 8px;
      }
      .provider-option {
        display: block;
        width: 100%;
        text-align: left;
        padding: 8px 10px;
        border: 1px solid var(--vscode-panel-border);
        background: var(--vscode-input-background);
        color: var(--vscode-foreground);
        cursor: pointer;
        font: inherit;
      }
      .provider-option.selected {
        border-color: var(--vscode-focusBorder);
        outline: 1px solid var(--vscode-focusBorder);
      }
      .option-label {
        font-weight: 600;
      }
      .option-line {
        color: var(--vscode-descriptionForeground);
        font-size: 0.9em;
        margin-top: 2px;
        word-break: break-all;
      }
      .source,
      .subhead {
        color: var(--vscode-descriptionForeground);
        margin-top: 6px;
      }
      .subhead {
        font-weight: 600;
        margin: 14px 0 6px 0;
      }
      .hint {
        color: var(--vscode-descriptionForeground);
        margin: 0 0 8px 0;
      }
      .radio-group,
      .checkbox-group {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .radio-row,
      .checkbox-row {
        display: flex;
        align-items: flex-start;
        gap: 8px;
      }
      .checkbox-text {
        display: flex;
        flex-direction: column;
      }
      .checkbox-label {
        font-weight: 600;
      }
      .checkbox-help {
        color: var(--vscode-descriptionForeground);
        font-size: 0.9em;
      }
      .notes {
        margin-top: 8px;
        color: var(--vscode-descriptionForeground);
        font-size: 0.9em;
      }
      select {
        color: var(--vscode-input-foreground);
        background: var(--vscode-input-background);
        border: 1px solid var(--vscode-input-border, var(--vscode-panel-border));
        padding: 6px;
        font: inherit;
        margin: 6px 8px 6px 0;
      }
      button[data-command] {
        margin-top: 6px;
      }
      .field-label {
        display: block;
        margin-top: 6px;
        color: var(--vscode-descriptionForeground);
      }
      code {
        font-family: var(--vscode-editor-font-family, monospace);
      }
    </style>
  </head>
  <body>
    <h1 data-testid="runtime-report-title">${escapeHtml(RUNTIME_REPORT_PANEL_TITLE)}</h1>
    <p class="intro">Choose the comparison runtime and tune which differences the LabVIEW comparison report includes. Changes are saved to your user settings immediately.</p>
    ${untrustedBanner}
    ${detectionBanner}
    ${interactiveSections}
    <script>
      const vscode = acquireVsCodeApi();
      vscode.setState(${serializeForInlineScript({ viewType: RUNTIME_REPORT_PANEL_VIEW_TYPE })});

      document.addEventListener('click', (event) => {
        const target = event.target instanceof Element ? event.target.closest('[data-command]') : null;
        if (!(target instanceof HTMLElement)) {
          return;
        }
        const command = target.dataset.command;
        if (command === 'selectRuntimeProvider') {
          const index = Number(target.dataset.index);
          if (Number.isInteger(index)) {
            vscode.postMessage({ command, index });
          }
          return;
        }
        if (command === 'discoverContainerVersions') {
          vscode.postMessage({ command });
          return;
        }
      });

      document.addEventListener('change', (event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) {
          return;
        }
        const command = target.dataset.command;
        if (command === 'setReportFormat' && target instanceof HTMLInputElement && target.checked) {
          vscode.postMessage({ command, format: target.value });
          return;
        }
        if (command === 'setReportInclude' && target instanceof HTMLInputElement) {
          vscode.postMessage({
            command,
            includeKey: target.dataset.includeKey,
            include: target.checked
          });
          return;
        }
        if (command === 'selectContainerVersion' && target instanceof HTMLSelectElement) {
          vscode.postMessage({ command, tag: target.value });
          return;
        }
      });
    </script>
  </body>
</html>`;
}

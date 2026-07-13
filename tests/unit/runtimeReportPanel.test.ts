/**
 * VHS-REQ-620 / VHS-REQ-645 / VHS-REQ-651: unit tests for the Runtime & Report Settings panel
 * renderer. The renderer is pure, so these assert the rendered HTML and the
 * include/ignore inversion directly without the VS Code harness.
 */

import { describe, expect, it } from 'vitest';

import {
  REPORT_OPTION_DESCRIPTORS,
  deriveReportIncludeFlags,
  renderRuntimeReportPanelHtml,
  type ReportIncludeKey,
  type RuntimeReportPanelViewModel
} from '../../src/ui/runtimeReportPanel';

function baseModel(
  overrides: Partial<RuntimeReportPanelViewModel> = {}
): RuntimeReportPanelViewModel {
  return {
    trusted: true,
    detectionAvailable: true,
    activeProviderSummary: 'Host LabVIEW 2026 x64',
    activeProviderSource: 'persisted',
    providerOptions: [
      { kind: 'host', label: 'Host LabVIEW 2026 x64', description: 'C:/LV/LabVIEW.exe' },
      { kind: 'clear', label: 'Clear (auto-detect each session)' }
    ],
    selectedProviderIndex: 0,
    container: {
      visible: false,
      currentTag: '',
      discovering: false,
      discovered: false,
      versions: [],
      notes: []
    },
    preview: {
      visible: false,
      enabled: false
    },
    report: {
      includeFlags: {
        viAttributes: true,
        frontPanel: true,
        frontPanelObjectPosition: true,
        blockDiagram: true,
        blockDiagramCosmetic: true
      }
    },
    ...overrides
  };
}

function includeCheckboxChecked(html: string, key: ReportIncludeKey): boolean {
  const pattern = new RegExp(
    `data-command="setReportInclude"\\s+data-include-key="${key}"\\s*(checked)?\\s*/>`
  );
  const match = html.match(pattern);
  if (!match) {
    throw new Error(`no include checkbox rendered for ${key}`);
  }
  return match[1] === 'checked';
}

describe('VI Preview toggle (VHS-REQ-659)', () => {
  it('hides the VI Preview toggle when Docker is not the effective runtime', () => {
    const html = renderRuntimeReportPanelHtml(baseModel({ preview: { visible: false, enabled: false } }));
    expect(html).not.toContain('data-testid="runtime-report-preview-section"');
    expect(html).not.toContain('data-command="setPreviewEnabled"');
  });

  it('renders the VI Preview toggle checked when enabled on Docker', () => {
    const html = renderRuntimeReportPanelHtml(baseModel({ preview: { visible: true, enabled: true } }));
    expect(html).toContain('data-testid="runtime-report-preview-section"');
    expect(html).toMatch(/data-command="setPreviewEnabled"\s*checked/);
  });

  it('renders the VI Preview toggle unchecked when disabled on Docker', () => {
    const html = renderRuntimeReportPanelHtml(baseModel({ preview: { visible: true, enabled: false } }));
    expect(html).toContain('data-testid="runtime-report-preview-section"');
    expect(html).not.toMatch(/data-command="setPreviewEnabled"\s*checked/);
  });
});

describe('REPORT_OPTION_DESCRIPTORS (VHS-REQ-645.2)', () => {
  it('maps the five difference filters to their ignore settings and CLI flags', () => {
    expect(REPORT_OPTION_DESCRIPTORS.map((descriptor) => descriptor.includeKey)).toEqual([
      'viAttributes',
      'frontPanel',
      'frontPanelObjectPosition',
      'blockDiagram',
      'blockDiagramCosmetic'
    ]);
    expect(REPORT_OPTION_DESCRIPTORS.map((descriptor) => descriptor.settingKey)).toEqual([
      'report.ignoreViAttributes',
      'report.ignoreFrontPanel',
      'report.ignoreFrontPanelObjectPosition',
      'report.ignoreBlockDiagram',
      'report.ignoreBlockDiagramCosmetic'
    ]);
    expect(REPORT_OPTION_DESCRIPTORS.map((descriptor) => descriptor.cliFlag)).toEqual([
      '-noattr',
      '-nofp',
      '-nofppos',
      '-nobd',
      '-nobdcosm'
    ]);
  });
});

describe('deriveReportIncludeFlags (VHS-REQ-645.5)', () => {
  it('treats an absent or false ignore flag as included (checked)', () => {
    expect(deriveReportIncludeFlags({})).toEqual({
      viAttributes: true,
      frontPanel: true,
      frontPanelObjectPosition: true,
      blockDiagram: true,
      blockDiagramCosmetic: true
    });
  });

  it('inverts a true ignore flag to a deselected (unchecked) include flag', () => {
    expect(
      deriveReportIncludeFlags({ ignoreBlockDiagram: true, ignoreFrontPanel: true })
    ).toMatchObject({
      blockDiagram: false,
      frontPanel: false,
      viAttributes: true
    });
  });
});

describe('renderRuntimeReportPanelHtml (VHS-REQ-620 / VHS-REQ-645)', () => {
  it('renders the title, active provider, and the selected provider marker', () => {
    const html = renderRuntimeReportPanelHtml(baseModel());
    expect(html).toContain('data-testid="runtime-report-title"');
    // The '&' in the title is HTML-escaped in the rendered markup.
    expect(html).toContain('Runtime &amp; Report Settings');
    expect(html).toContain('Host LabVIEW 2026 x64');
    // The selected provider option is marked pressed.
    expect(html).toMatch(/data-index="0"[\s\S]*?aria-pressed="true"/);
    expect(html).toMatch(/data-index="1"[\s\S]*?aria-pressed="false"/);
  });

  it('hides the container section when it is not visible (VHS-REQ-651.4)', () => {
    const html = renderRuntimeReportPanelHtml(baseModel());
    expect(html).not.toContain('data-testid="runtime-report-container-section"');
  });

  it('shows the container section with a discover affordance when visible (VHS-REQ-651.1)', () => {
    const html = renderRuntimeReportPanelHtml(
      baseModel({
        container: {
          visible: true,
          currentTag: '',
          discovering: false,
          discovered: false,
          versions: [],
          notes: []
        }
      })
    );
    expect(html).toContain('data-testid="runtime-report-container-section"');
    expect(html).toContain('data-testid="runtime-report-container-discover"');
    expect(html).toContain('Newest supported default');
  });

  it('renders discovered container versions as a select with the current tag selected (VHS-REQ-651.1)', () => {
    const html = renderRuntimeReportPanelHtml(
      baseModel({
        container: {
          visible: true,
          currentTag: '2026q1-linux',
          discovering: false,
          discovered: true,
          versions: [{ tag: '2026q1-linux', presence: 'Pulled locally' }],
          notes: []
        }
      })
    );
    expect(html).toContain('data-testid="runtime-report-container-select"');
    expect(html).toMatch(/<option value="2026q1-linux" selected>/);
  });

  it('reflects the include flags as checkbox state (deselected = unchecked) (VHS-REQ-645.5)', () => {
    const html = renderRuntimeReportPanelHtml(
      baseModel({
        report: {
          format: 'HTMLSingleFile',
          includeFlags: {
            viAttributes: true,
            frontPanel: true,
            frontPanelObjectPosition: true,
            blockDiagram: false,
            blockDiagramCosmetic: true
          }
        }
      })
    );
    expect(includeCheckboxChecked(html, 'viAttributes')).toBe(true);
    expect(includeCheckboxChecked(html, 'blockDiagram')).toBe(false);
  });

  it('renders the fixed single-file format note and no format selector (VHS-REQ-645.5, #545)', () => {
    const html = renderRuntimeReportPanelHtml(baseModel());
    expect(html).toContain('data-testid="runtime-report-format-note"');
    expect(html).toContain('single self-contained HTML file');
    // The removed multi-file format selector must not reappear.
    expect(html).not.toContain('data-command="setReportFormat"');
    expect(html).not.toContain('data-testid="runtime-report-format-group"');
  });

  it('renders only an untrusted banner without interactive sections when untrusted', () => {
    const html = renderRuntimeReportPanelHtml(baseModel({ trusted: false }));
    expect(html).toContain('data-testid="runtime-report-untrusted"');
    expect(html).not.toContain('data-testid="runtime-report-provider-section"');
    expect(html).not.toContain('data-testid="runtime-report-report-section"');
  });

  it('surfaces a no-detection banner when detection has not completed (VHS-REQ-620.5)', () => {
    const html = renderRuntimeReportPanelHtml(
      baseModel({ detectionAvailable: false, providerOptions: [], selectedProviderIndex: -1 })
    );
    expect(html).toContain('data-testid="runtime-report-no-detection"');
    // The report section remains available even without runtime detection.
    expect(html).toContain('data-testid="runtime-report-report-section"');
  });
});

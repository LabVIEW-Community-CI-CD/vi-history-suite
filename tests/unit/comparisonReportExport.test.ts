import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  ComparisonReportExportRegistry,
  ComparisonReportExportSource,
  buildComparisonReportExportDirectoryName,
  describeMissingGraphicsReportReason,
  exportComparisonReportBundle,
  injectRevisionContextIntoExportedReportHtml,
  resolveComparisonReportExportPlan,
  runComparisonReportExport
} from '../../src/reporting/comparisonReportExport';

const tempRoots: string[] = [];

async function makeTempRoot(): Promise<string> {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'vihs-report-export-'));
  tempRoots.push(tempRoot);
  return tempRoot;
}

afterEach(async () => {
  while (tempRoots.length > 0) {
    const tempRoot = tempRoots.pop();
    if (tempRoot) {
      await fs.rm(tempRoot, { recursive: true, force: true });
    }
  }
  vi.restoreAllMocks();
});

function createSource(overrides: Partial<ComparisonReportExportSource> = {}): ComparisonReportExportSource {
  return {
    reportTitle: 'VI Comparison Report: foo.vi',
    generatedReportExists: true,
    reportFilePath: '/storage/reports/repo/file/diff-report-foo.vi.html',
    packetFilePath: '/storage/reports/repo/file/report-packet.html',
    relativePath: 'src/foo.vi',
    selectedHash: 'aaaaaaaaaaaa',
    baseHash: 'bbbbbbbbbbbb',
    selectedRevision: {
      hash: 'aaaaaaaaaaaa',
      authorDate: '2026-06-01 10:00:00 -0500',
      authorName: 'Ada Lovelace',
      subject: 'Selected subject',
      body: 'Selected body line one\nSelected body line two'
    },
    baseRevision: {
      hash: 'bbbbbbbbbbbb',
      authorDate: '2026-05-01 09:00:00 -0500',
      authorName: 'Grace Hopper',
      subject: 'Base subject',
      body: 'Base body'
    },
    ...overrides
  };
}

function createPacketSource(
  overrides: Partial<ComparisonReportExportSource> = {}
): ComparisonReportExportSource {
  return createSource({
    generatedReportExists: false,
    reportStatus: 'blocked-runtime',
    graphicsReportUnavailableReason: 'runtime-unavailable',
    ...overrides
  });
}

describe('buildComparisonReportExportDirectoryName', () => {
  it('slugifies the report title and appends a filesystem-safe timestamp', () => {
    const name = buildComparisonReportExportDirectoryName(
      'VI Comparison Report: foo.vi',
      new Date('2026-06-07T12:34:56.789Z')
    );

    expect(name).toBe('vi-comparison-report-foo-vi-2026-06-07T12-34-56-789Z');
  });

  it('falls back to a default slug when the title has no alphanumeric characters', () => {
    const name = buildComparisonReportExportDirectoryName('***', new Date('2026-06-07T00:00:00.000Z'));

    expect(name).toBe('vi-comparison-report-2026-06-07T00-00-00-000Z');
  });
});

describe('describeMissingGraphicsReportReason', () => {
  it('explains a preflight block with the underlying detail', () => {
    expect(
      describeMissingGraphicsReportReason(
        createSource({
          generatedReportExists: false,
          reportStatus: 'blocked-preflight',
          graphicsReportUnavailableReason: 'not-a-vi'
        })
      )
    ).toBe('the comparison was blocked before the LabVIEW runtime could run (not-a-vi)');
  });

  it('explains a runtime block with the underlying detail', () => {
    expect(
      describeMissingGraphicsReportReason(
        createSource({
          generatedReportExists: false,
          reportStatus: 'blocked-runtime',
          graphicsReportUnavailableReason: 'runtime-unavailable'
        })
      )
    ).toBe('the LabVIEW comparison runtime was unavailable on this host (runtime-unavailable)');
  });

  it('explains a runtime failure with the underlying detail', () => {
    expect(
      describeMissingGraphicsReportReason(
        createSource({
          generatedReportExists: false,
          runtimeExecutionState: 'failed',
          graphicsReportUnavailableReason: 'exit-code-1'
        })
      )
    ).toBe('the LabVIEW comparison runtime failed (exit-code-1)');
  });

  it('explains a non-Windows / unavailable runtime without a detail clause', () => {
    expect(
      describeMissingGraphicsReportReason(
        createSource({ generatedReportExists: false, runtimeExecutionState: 'not-available' })
      )
    ).toBe(
      'the LabVIEW comparison runtime is not available on this platform (for example, a non-Windows host)'
    );
  });

  it('explains a not-run comparison', () => {
    expect(
      describeMissingGraphicsReportReason(
        createSource({ generatedReportExists: false, runtimeExecutionState: 'not-run' })
      )
    ).toBe('the LabVIEW comparison has not been run yet');
  });

  it('explains a generated report that vanished from disk', () => {
    expect(
      describeMissingGraphicsReportReason(createSource({ generatedReportExists: true }))
    ).toBe('the generated graphics report is no longer available on disk');
  });

  it('falls back to a generic reason when no status context is present', () => {
    expect(
      describeMissingGraphicsReportReason(createSource({ generatedReportExists: false }))
    ).toBe('no LabVIEW-generated graphics report was produced');
  });
});

describe('resolveComparisonReportExportPlan', () => {
  it('prefers the generated report with its assets directory when both exist (VHS-REQ-626.2)', async () => {
    const source = createSource();
    const expectedAssetsDirectoryPath = path.join(
      path.dirname(source.reportFilePath),
      'diff-report-foo.vi_files'
    );
    const pathExists = vi.fn(
      async (target: string) =>
        target === source.reportFilePath || target === expectedAssetsDirectoryPath
    );

    const plan = await resolveComparisonReportExportPlan(source, pathExists);

    expect(plan).toEqual({
      evidenceKind: 'generated-report',
      htmlSourcePath: source.reportFilePath,
      htmlFileName: 'diff-report-foo.vi.html',
      assetsSourceDirectoryPath: expectedAssetsDirectoryPath,
      assetsDirectoryName: 'diff-report-foo.vi_files'
    });
  });

  it('omits the assets directory when only the generated report HTML exists', async () => {
    const source = createSource();
    const pathExists = vi.fn(async (target: string) => target === source.reportFilePath);

    const plan = await resolveComparisonReportExportPlan(source, pathExists);

    expect(plan).toEqual({
      evidenceKind: 'generated-report',
      htmlSourcePath: source.reportFilePath,
      htmlFileName: 'diff-report-foo.vi.html',
      assetsSourceDirectoryPath: undefined,
      assetsDirectoryName: undefined
    });
  });

  it('falls back to the packet when the generated report flag is set but the file is missing', async () => {
    const source = createSource();
    const pathExists = vi.fn(async (target: string) => target === source.packetFilePath);

    const plan = await resolveComparisonReportExportPlan(source, pathExists);

    expect(plan).toEqual({
      evidenceKind: 'packet',
      htmlSourcePath: source.packetFilePath,
      htmlFileName: 'report-packet.html'
    });
  });

  it('uses the packet when no generated report was produced', async () => {
    const source = createSource({ generatedReportExists: false });
    const pathExists = vi.fn(async (target: string) => target === source.packetFilePath);

    const plan = await resolveComparisonReportExportPlan(source, pathExists);

    expect(plan?.evidenceKind).toBe('packet');
    expect(pathExists).not.toHaveBeenCalledWith(source.reportFilePath);
  });

  it('returns undefined when neither artifact exists on disk', async () => {
    const source = createSource();
    const pathExists = vi.fn(async () => false);

    const plan = await resolveComparisonReportExportPlan(source, pathExists);

    expect(plan).toBeUndefined();
  });
});

describe('exportComparisonReportBundle', () => {
  it('copies the report HTML and its assets directory preserving original names (VHS-REQ-626.2)', async () => {
    const tempRoot = await makeTempRoot();
    const sourceDir = path.join(tempRoot, 'source');
    const assetsDir = path.join(sourceDir, 'diff-report-foo.vi_files');
    await fs.mkdir(assetsDir, { recursive: true });
    const htmlPath = path.join(sourceDir, 'diff-report-foo.vi.html');
    await fs.writeFile(
      htmlPath,
      '<html><body><img src="diff-report-foo.vi_files/block.png" /></body></html>',
      'utf8'
    );
    await fs.writeFile(path.join(assetsDir, 'block.png'), 'fake-png-bytes', 'utf8');

    const destinationDirectory = path.join(tempRoot, 'export', 'bundle');

    const result = await exportComparisonReportBundle({
      plan: {
        evidenceKind: 'generated-report',
        htmlSourcePath: htmlPath,
        htmlFileName: 'diff-report-foo.vi.html',
        assetsSourceDirectoryPath: assetsDir,
        assetsDirectoryName: 'diff-report-foo.vi_files'
      },
      destinationDirectory
    });

    expect(result.copiedAssets).toBe(true);
    expect(result.exportedHtmlPath).toBe(
      path.join(destinationDirectory, 'diff-report-foo.vi.html')
    );
    expect(result.exportedAssetsDirectoryPath).toBe(
      path.join(destinationDirectory, 'diff-report-foo.vi_files')
    );
    await expect(
      fs.readFile(path.join(destinationDirectory, 'diff-report-foo.vi.html'), 'utf8')
    ).resolves.toContain('diff-report-foo.vi_files/block.png');
    await expect(
      fs.readFile(path.join(destinationDirectory, 'diff-report-foo.vi_files', 'block.png'), 'utf8')
    ).resolves.toBe('fake-png-bytes');
  });

  it('copies only the HTML when the plan has no assets directory', async () => {
    const tempRoot = await makeTempRoot();
    const sourceDir = path.join(tempRoot, 'source');
    await fs.mkdir(sourceDir, { recursive: true });
    const htmlPath = path.join(sourceDir, 'report-packet.html');
    await fs.writeFile(htmlPath, '<html><body>packet</body></html>', 'utf8');

    const destinationDirectory = path.join(tempRoot, 'export', 'bundle');

    const result = await exportComparisonReportBundle({
      plan: {
        evidenceKind: 'packet',
        htmlSourcePath: htmlPath,
        htmlFileName: 'report-packet.html'
      },
      destinationDirectory
    });

    expect(result.copiedAssets).toBe(false);
    expect(result.exportedAssetsDirectoryPath).toBeUndefined();
    await expect(
      fs.readFile(path.join(destinationDirectory, 'report-packet.html'), 'utf8')
    ).resolves.toContain('packet');
  });

  it('exports a self-contained single-file report as the HTML alone (VHS-REQ-640, VHS-REQ-626.2)', async () => {
    const tempRoot = await makeTempRoot();
    const sourceDir = path.join(tempRoot, 'source');
    await fs.mkdir(sourceDir, { recursive: true });
    const htmlPath = path.join(sourceDir, 'diff-report-foo.vi.html');
    // Single-file report: images embedded as data URIs, no sibling _files dir.
    await fs.writeFile(
      htmlPath,
      '<html><body><img src="data:image/png;base64,AAAA"></body></html>',
      'utf8'
    );

    const destinationDirectory = path.join(tempRoot, 'export', 'bundle');

    const result = await exportComparisonReportBundle({
      plan: {
        evidenceKind: 'generated-report',
        htmlSourcePath: htmlPath,
        htmlFileName: 'diff-report-foo.vi.html'
      },
      destinationDirectory
    });

    expect(result.copiedAssets).toBe(false);
    expect(result.exportedAssetsDirectoryPath).toBeUndefined();
    // No sibling _files directory is created for a single-file report.
    await expect(
      fs.access(path.join(destinationDirectory, 'diff-report-foo.vi_files'))
    ).rejects.toThrow();
    await expect(
      fs.readFile(path.join(destinationDirectory, 'diff-report-foo.vi.html'), 'utf8')
    ).resolves.toContain('data:image/png;base64,AAAA');
  });

  it('embeds the revision context into the exported generated report without mutating the source (multi-file) (VHS-REQ-626.3, VHS-REQ-644.2)', async () => {
    const tempRoot = await makeTempRoot();
    const sourceDir = path.join(tempRoot, 'source');
    const assetsDir = path.join(sourceDir, 'diff-report-foo.vi_files');
    await fs.mkdir(assetsDir, { recursive: true });
    const htmlPath = path.join(sourceDir, 'diff-report-foo.vi.html');
    const originalHtml =
      '<html><head><title>NI</title></head><body><img src="diff-report-foo.vi_files/block.png" /></body></html>';
    await fs.writeFile(htmlPath, originalHtml, 'utf8');
    await fs.writeFile(path.join(assetsDir, 'block.png'), 'fake-png-bytes', 'utf8');

    const destinationDirectory = path.join(tempRoot, 'export', 'bundle');

    const result = await exportComparisonReportBundle({
      plan: {
        evidenceKind: 'generated-report',
        htmlSourcePath: htmlPath,
        htmlFileName: 'diff-report-foo.vi.html',
        assetsSourceDirectoryPath: assetsDir,
        assetsDirectoryName: 'diff-report-foo.vi_files'
      },
      destinationDirectory,
      revisionContext: {
        relativePath: 'src/foo.vi',
        selectedHash: 'aaaaaaaaaaaa',
        baseHash: 'bbbbbbbbbbbb',
        selectedRevision: {
          hash: 'aaaaaaaaaaaa',
          authorDate: '2026-06-01',
          authorName: 'Ada Lovelace',
          subject: 'Selected subject',
          body: 'Body A\nBody B'
        },
        baseRevision: {
          hash: 'bbbbbbbbbbbb',
          authorDate: '2026-05-01',
          authorName: 'Grace Hopper',
          subject: 'Base subject',
          body: 'Base body'
        }
      }
    });

    expect(result.copiedAssets).toBe(true);
    const exportedHtml = await fs.readFile(
      path.join(destinationDirectory, 'diff-report-foo.vi.html'),
      'utf8'
    );
    // Revision context block present for both selected and base revisions.
    expect(exportedHtml).toContain('data-testid="comparison-report-panel-context"');
    expect(exportedHtml).toContain('Ada Lovelace');
    expect(exportedHtml).toContain('Grace Hopper');
    expect(exportedHtml).toContain('Selected subject');
    expect(exportedHtml).toContain('Base subject');
    expect(exportedHtml).toContain('Body A<br />Body B');
    expect(exportedHtml).toContain('aaaaaaaaaaaa');
    expect(exportedHtml).toContain('bbbbbbbbbbbb');
    // Original report content and relative image link are preserved.
    expect(exportedHtml).toContain('diff-report-foo.vi_files/block.png');
    // No <base href> is injected: relative links resolve via the sibling _files dir.
    expect(exportedHtml).not.toContain('<base ');
    // The retained source report on disk is never mutated.
    await expect(fs.readFile(htmlPath, 'utf8')).resolves.toBe(originalHtml);
  });

  it('embeds the revision context into a self-contained single-file report (VHS-REQ-640)', async () => {
    const tempRoot = await makeTempRoot();
    const sourceDir = path.join(tempRoot, 'source');
    await fs.mkdir(sourceDir, { recursive: true });
    const htmlPath = path.join(sourceDir, 'diff-report-foo.vi.html');
    const originalHtml =
      '<html><head></head><body><img src="data:image/png;base64,AAAA"></body></html>';
    await fs.writeFile(htmlPath, originalHtml, 'utf8');

    const destinationDirectory = path.join(tempRoot, 'export', 'bundle');

    const result = await exportComparisonReportBundle({
      plan: {
        evidenceKind: 'generated-report',
        htmlSourcePath: htmlPath,
        htmlFileName: 'diff-report-foo.vi.html'
      },
      destinationDirectory,
      revisionContext: {
        selectedHash: 'aaaaaaaaaaaa',
        baseHash: 'bbbbbbbbbbbb',
        selectedRevision: { hash: 'aaaaaaaaaaaa', subject: 'Selected subject' },
        baseRevision: { hash: 'bbbbbbbbbbbb', subject: 'Base subject' }
      }
    });

    expect(result.copiedAssets).toBe(false);
    // No sibling _files directory is created for a single-file report.
    await expect(
      fs.access(path.join(destinationDirectory, 'diff-report-foo.vi_files'))
    ).rejects.toThrow();
    const exportedHtml = await fs.readFile(
      path.join(destinationDirectory, 'diff-report-foo.vi.html'),
      'utf8'
    );
    expect(exportedHtml).toContain('data-testid="comparison-report-panel-context"');
    expect(exportedHtml).toContain('Selected subject');
    expect(exportedHtml).toContain('Base subject');
    // The embedded data-URI image is preserved.
    expect(exportedHtml).toContain('data:image/png;base64,AAAA');
    // The retained source report on disk is never mutated.
    await expect(fs.readFile(htmlPath, 'utf8')).resolves.toBe(originalHtml);
  });

  it('copies the packet export verbatim without injecting context (it already renders the cards)', async () => {
    const tempRoot = await makeTempRoot();
    const sourceDir = path.join(tempRoot, 'source');
    await fs.mkdir(sourceDir, { recursive: true });
    const htmlPath = path.join(sourceDir, 'report-packet.html');
    const originalHtml = '<html><body>packet</body></html>';
    await fs.writeFile(htmlPath, originalHtml, 'utf8');

    const destinationDirectory = path.join(tempRoot, 'export', 'bundle');

    await exportComparisonReportBundle({
      plan: {
        evidenceKind: 'packet',
        htmlSourcePath: htmlPath,
        htmlFileName: 'report-packet.html'
      },
      destinationDirectory,
      revisionContext: { selectedHash: 'aaaaaaaaaaaa', baseHash: 'bbbbbbbbbbbb' }
    });

    const exportedHtml = await fs.readFile(
      path.join(destinationDirectory, 'report-packet.html'),
      'utf8'
    );
    expect(exportedHtml).toBe(originalHtml);
    expect(exportedHtml).not.toContain('data-testid="comparison-report-panel-context"');
  });
});

describe('runComparisonReportExport', () => {
  function createBaseDeps(): Parameters<typeof runComparisonReportExport>[1] {
    return {
      showOpenDialog: vi.fn(async () => [{ fsPath: '/chosen' } as never]),
      showInformationMessage: vi.fn(async () => undefined),
      showWarningMessage: vi.fn(async () => undefined),
      showErrorMessage: vi.fn(async () => undefined),
      openExternal: vi.fn(async () => true),
      executeCommand: vi.fn(async () => undefined),
      uriFile: vi.fn((fsPath: string) => ({ fsPath }) as never),
      now: () => new Date('2026-06-07T12:00:00.000Z'),
      pathExists: vi.fn(async () => true),
      exportBundle: vi.fn(async () => ({
        exportedHtmlPath: '/chosen/bundle/diff-report-foo.vi.html',
        exportedAssetsDirectoryPath: '/chosen/bundle/diff-report-foo.vi_files',
        copiedAssets: true
      }))
    };
  }

  it('warns and returns when there is no active comparison report', async () => {
    const deps = createBaseDeps();

    const result = await runComparisonReportExport(undefined, deps);

    expect(result.outcome).toBe('no-active-comparison-report');
    expect(deps.showWarningMessage).toHaveBeenCalledOnce();
    expect(deps.showOpenDialog).not.toHaveBeenCalled();
  });

  it('warns and returns when the source artifacts are missing on disk', async () => {
    const deps = createBaseDeps();
    deps.pathExists = vi.fn(async () => false);

    const result = await runComparisonReportExport(createSource(), deps);

    expect(result.outcome).toBe('source-missing');
    expect(deps.showOpenDialog).not.toHaveBeenCalled();
  });

  it('returns cancelled when the destination dialog is dismissed', async () => {
    const deps = createBaseDeps();
    deps.showOpenDialog = vi.fn(async () => undefined);

    const result = await runComparisonReportExport(createSource(), deps);

    expect(result.outcome).toBe('cancelled');
    expect(deps.exportBundle).not.toHaveBeenCalled();
  });

  it('exports the bundle into timestamped folders under the chosen directory without overwriting prior exports (VHS-REQ-626.5)', async () => {
    const deps = createBaseDeps();
    const now = vi
      .fn()
      .mockReturnValueOnce(new Date('2026-06-07T12:00:00.000Z'))
      .mockReturnValueOnce(new Date('2026-06-07T12:01:00.000Z'));
    deps.now = now;

    const result = await runComparisonReportExport(createSource(), deps);
    const secondResult = await runComparisonReportExport(createSource(), deps);

    expect(result.outcome).toBe('exported');
    expect(secondResult.outcome).toBe('exported');
    expect(result.copiedAssets).toBe(true);
    expect(secondResult.bundleDirectoryPath).not.toBe(result.bundleDirectoryPath);
    expect(deps.exportBundle).toHaveBeenCalledWith({
      plan: expect.objectContaining({ evidenceKind: 'generated-report' }),
      destinationDirectory: path.join(
        '/chosen',
        'vi-comparison-report-foo-vi-2026-06-07T12-00-00-000Z'
      ),
      revisionContext: expect.objectContaining({
        relativePath: 'src/foo.vi',
        selectedHash: 'aaaaaaaaaaaa',
        baseHash: 'bbbbbbbbbbbb'
      })
    });
    expect(deps.exportBundle).toHaveBeenCalledWith(
      expect.objectContaining({
        destinationDirectory: path.join(
          '/chosen',
          'vi-comparison-report-foo-vi-2026-06-07T12-01-00-000Z'
        )
      })
    );
  });

  it('opens the exported HTML in the browser when the user selects that action (VHS-REQ-626.6)', async () => {
    const deps = createBaseDeps();
    deps.showInformationMessage = vi.fn(async () => 'Open in Browser' as never);

    await runComparisonReportExport(createSource(), deps);
    await Promise.resolve();
    await Promise.resolve();

    expect(deps.openExternal).toHaveBeenCalledWith(
      expect.objectContaining({ fsPath: '/chosen/bundle/diff-report-foo.vi.html' })
    );
  });

  it('reveals the exported HTML in the OS file manager when requested (VHS-REQ-626.6)', async () => {
    const deps = createBaseDeps();
    deps.showInformationMessage = vi.fn(async () => 'Show in Folder' as never);

    await runComparisonReportExport(createSource(), deps);
    await Promise.resolve();
    await Promise.resolve();

    expect(deps.executeCommand).toHaveBeenCalledWith(
      'revealFileInOS',
      expect.objectContaining({ fsPath: '/chosen/bundle/diff-report-foo.vi.html' })
    );
  });

  it('surfaces an error message and export-failed outcome when the copy throws', async () => {
    const deps = createBaseDeps();
    deps.exportBundle = vi.fn(async () => {
      throw new Error('disk full');
    });

    const result = await runComparisonReportExport(createSource(), deps);

    expect(result.outcome).toBe('export-failed');
    expect(result.failureReason).toBe('disk full');
    expect(deps.showErrorMessage).toHaveBeenCalledOnce();
  });

  it('does not prompt when a generated graphics report is available', async () => {
    const deps = createBaseDeps();

    await runComparisonReportExport(createSource(), deps);

    expect(deps.showWarningMessage).not.toHaveBeenCalled();
    expect(deps.showInformationMessage).toHaveBeenCalledWith(
      expect.stringContaining('comparison report with graphics'),
      'Open in Browser',
      'Show in Folder'
    );
  });

  function createPacketDeps(): Parameters<typeof runComparisonReportExport>[1] {
    const deps = createBaseDeps();
    deps.pathExists = vi.fn(async (target: string) => target.endsWith('report-packet.html'));
    deps.exportBundle = vi.fn(async () => ({
      exportedHtmlPath: '/chosen/bundle/report-packet.html',
      copiedAssets: false
    }));
    return deps;
  }

  it('confirms with a modal reason before falling back to the evidence packet (VHS-REQ-626.4)', async () => {
    const deps = createPacketDeps();
    deps.showWarningMessage = vi.fn(async () => 'Export Evidence Packet' as never);

    const result = await runComparisonReportExport(createPacketSource(), deps);

    expect(deps.showWarningMessage).toHaveBeenCalledWith(
      expect.stringContaining('the LabVIEW comparison runtime was unavailable on this host'),
      { modal: true },
      'Export Evidence Packet'
    );
    expect(result.outcome).toBe('exported');
    expect(result.evidenceKind).toBe('packet');
    expect(result.graphicsReportUnavailableReason).toContain('runtime-unavailable');
    expect(deps.showInformationMessage).toHaveBeenCalledWith(
      expect.stringContaining('diagnostic evidence packet'),
      'Open in Browser',
      'Show in Folder'
    );
  });

  it('cancels without picking a folder when the packet confirmation is declined (VHS-REQ-626.4)', async () => {
    const deps = createPacketDeps();
    deps.showWarningMessage = vi.fn(async () => undefined);

    const result = await runComparisonReportExport(createPacketSource(), deps);

    expect(result.outcome).toBe('cancelled');
    expect(result.evidenceKind).toBe('packet');
    expect(result.graphicsReportUnavailableReason).toContain('runtime-unavailable');
    expect(deps.showOpenDialog).not.toHaveBeenCalled();
    expect(deps.exportBundle).not.toHaveBeenCalled();
  });
});

describe('ComparisonReportExportRegistry', () => {
  interface FakePanel {
    active: boolean;
    fireViewState: (active: boolean) => void;
    fireDispose: () => void;
    onDidChangeViewState: (listener: (event: { webviewPanel: { active: boolean } }) => void) => void;
    onDidDispose: (listener: () => void) => void;
  }

  function createFakePanel(active: boolean): FakePanel {
    let viewStateListener: ((event: { webviewPanel: { active: boolean } }) => void) | undefined;
    let disposeListener: (() => void) | undefined;
    const panel: FakePanel = {
      active,
      onDidChangeViewState(listener) {
        viewStateListener = listener;
      },
      onDidDispose(listener) {
        disposeListener = listener;
      },
      fireViewState(nextActive: boolean) {
        panel.active = nextActive;
        viewStateListener?.({ webviewPanel: { active: nextActive } });
      },
      fireDispose() {
        disposeListener?.();
      }
    };
    return panel;
  }

  it('tracks the source of the active panel on registration', () => {
    const registry = new ComparisonReportExportRegistry();
    const panel = createFakePanel(true);
    const source = createSource();

    registry.register(panel as never, source);

    expect(registry.getActiveSource()).toBe(source);
  });

  it('does not adopt a panel that registers while inactive', () => {
    const registry = new ComparisonReportExportRegistry();
    const panel = createFakePanel(false);

    registry.register(panel as never, createSource());

    expect(registry.getActiveSource()).toBeUndefined();
  });

  it('switches the active source as panels gain and lose focus', () => {
    const registry = new ComparisonReportExportRegistry();
    const firstPanel = createFakePanel(true);
    const firstSource = createSource({ reportTitle: 'first' });
    const secondPanel = createFakePanel(false);
    const secondSource = createSource({ reportTitle: 'second' });

    registry.register(firstPanel as never, firstSource);
    registry.register(secondPanel as never, secondSource);
    expect(registry.getActiveSource()).toBe(firstSource);

    secondPanel.fireViewState(true);
    expect(registry.getActiveSource()).toBe(secondSource);

    secondPanel.fireViewState(false);
    expect(registry.getActiveSource()).toBeUndefined();
  });

  it('clears the active source when the active panel is disposed', () => {
    const registry = new ComparisonReportExportRegistry();
    const panel = createFakePanel(true);
    const source = createSource();
    registry.register(panel as never, source);

    panel.fireDispose();

    expect(registry.getActiveSource()).toBeUndefined();
  });
});

describe('injectRevisionContextIntoExportedReportHtml', () => {
  const fullContext = {
    relativePath: 'src/foo.vi',
    selectedHash: 'aaaaaaaaaaaa',
    baseHash: 'bbbbbbbbbbbb',
    selectedRevision: {
      hash: 'aaaaaaaaaaaa',
      authorDate: '2026-06-01',
      authorName: 'Ada Lovelace',
      subject: 'Add <feature>',
      body: 'Line one\nLine two'
    },
    baseRevision: {
      hash: 'bbbbbbbbbbbb',
      authorDate: '2026-05-01',
      authorName: 'Grace Hopper',
      subject: 'Base',
      body: 'Base body'
    }
  };

  it('injects the context style into <head> and the markup at the start of <body>', () => {
    const html = '<html><head><title>NI</title></head><body><p>report</p></body></html>';

    const out = injectRevisionContextIntoExportedReportHtml(html, fullContext);

    expect(out).toContain('.vihs-compare-context {');
    expect(out).toContain('<p>report</p>');
    // Context markup precedes the original report body content.
    expect(out.indexOf('comparison-report-panel-context')).toBeLessThan(
      out.indexOf('<p>report</p>')
    );
    // No <base href> is injected so relative image links keep resolving.
    expect(out).not.toContain('<base ');
  });

  it('escapes HTML and preserves a multi-line commit body', () => {
    const out = injectRevisionContextIntoExportedReportHtml(
      '<html><head></head><body></body></html>',
      fullContext
    );

    expect(out).toContain('Add &lt;feature&gt;');
    expect(out).toContain('Line one<br />Line two');
  });

  it('renders the not-retained fallback when revision metadata is absent', () => {
    const out = injectRevisionContextIntoExportedReportHtml(
      '<html><head></head><body></body></html>',
      { selectedHash: 'aaaaaaaaaaaa', baseHash: 'bbbbbbbbbbbb' }
    );

    expect(out).toContain('not retained');
    expect(out).not.toContain('No commit body');
  });

  it('renders the empty-body fallback for a retained revision with no body', () => {
    const out = injectRevisionContextIntoExportedReportHtml(
      '<html><head></head><body></body></html>',
      {
        selectedRevision: { hash: 'aaaaaaaaaaaa', subject: 'Selected', body: '' },
        baseRevision: { hash: 'bbbbbbbbbbbb', subject: 'Base', body: '' }
      }
    );

    expect(out).toContain('No commit body');
  });

  it('wraps content that has no <head> or <body> tags', () => {
    const out = injectRevisionContextIntoExportedReportHtml('<p>loose</p>', fullContext);

    expect(out).toContain('comparison-report-panel-context');
    expect(out).toContain('<p>loose</p>');
    expect(out).toContain('.vihs-compare-context {');
  });
});

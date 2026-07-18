import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  registerCustomEditorProviderMock,
  workspaceTrusted,
  blockDiagramInteractive,
  hostNativeRenderAllowed,
  isViPreviewEnabledMock,
  resolvePreviewRuntimeMock,
  renderViPreviewForFileMock,
  createViPreviewCacheMock,
  buildViPreviewRenderSourceDepsMock
} = vi.hoisted(() => ({
  registerCustomEditorProviderMock: vi.fn(),
  workspaceTrusted: { value: true },
  blockDiagramInteractive: { value: false },
  hostNativeRenderAllowed: { value: false },
  isViPreviewEnabledMock: vi.fn(),
  resolvePreviewRuntimeMock: vi.fn(),
  renderViPreviewForFileMock: vi.fn(),
  createViPreviewCacheMock: vi.fn(),
  buildViPreviewRenderSourceDepsMock: vi.fn()
}));

vi.mock('vscode', () => ({
  window: {
    registerCustomEditorProvider: registerCustomEditorProviderMock
  },
  workspace: {
    get isTrusted() {
      return workspaceTrusted.value;
    },
    getConfiguration: () => ({
      get: (key: string, fallback: unknown) =>
        key === 'preview.blockDiagramInteractive'
          ? blockDiagramInteractive.value
          : key === 'preview.allowHostNativeRender'
            ? hostNativeRenderAllowed.value
            : fallback
    })
  }
}));

vi.mock('../../src/reporting/viPreview/viPreviewFileRender', () => ({
  renderViPreviewForFile: renderViPreviewForFileMock
}));

vi.mock('../../src/ui/viPreviewRenderHost', () => ({
  buildViPreviewRenderDeps: vi.fn(() => ({})),
  buildViPreviewRenderSourceDeps: buildViPreviewRenderSourceDepsMock,
  createViPreviewCache: createViPreviewCacheMock,
  getViPreviewOperationDirectory: vi.fn(() => '/ops'),
  isViPreviewEnabled: isViPreviewEnabledMock,
  resolvePreviewRuntime: resolvePreviewRuntimeMock
}));

import {
  registerViPreviewCustomEditor,
  VI_PREVIEW_VIEW_TYPE
} from '../../src/ui/viPreviewEditor';

type RegisteredProvider = {
  openCustomDocument(uri: { fsPath: string; scheme?: string }): { uri: { fsPath: string; scheme?: string } };
  resolveCustomEditor(document: { uri: { fsPath: string; scheme?: string } }, panel: FakePanel): Promise<void>;
};

type FakePanel = {
  webview: {
    html: string;
    options?: { enableScripts: boolean };
  };
};

function createContext() {
  return {
    subscriptions: [],
    extensionPath: '/ext',
    globalStorageUri: { fsPath: '/global' }
  };
}

function createPanel(): FakePanel {
  return { webview: { html: '' } };
}

function providerFromLastRegistration(): RegisteredProvider {
  return registerCustomEditorProviderMock.mock.calls.at(-1)?.[1] as RegisteredProvider;
}

async function resolveEditor(
  provider: RegisteredProvider,
  panel: FakePanel = createPanel(),
  fsPath = '/workspace/repo/Foo.vi',
  scheme = 'file'
): Promise<FakePanel> {
  const document = provider.openCustomDocument({ fsPath, scheme });
  await provider.resolveCustomEditor(document, panel);
  return panel;
}

describe('VI Preview custom editor (VHS-REQ-659.8)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    workspaceTrusted.value = true;
    blockDiagramInteractive.value = false;
    hostNativeRenderAllowed.value = false;
    isViPreviewEnabledMock.mockReturnValue(true);
    resolvePreviewRuntimeMock.mockResolvedValue({
      outcome: 'ready',
      runtime: {
        provider: 'linux-container',
        containerImage: 'nationalinstruments/labview:2026q1-linux'
      }
    });
    renderViPreviewForFileMock.mockResolvedValue({ outcome: 'rendered', html: '<html>rendered</html>' });
    createViPreviewCacheMock.mockReturnValue({});
    buildViPreviewRenderSourceDepsMock.mockReturnValue({});
    registerCustomEditorProviderMock.mockReturnValue({ dispose: vi.fn() });
  });

  it('registers the read-only VI Preview custom editor provider', () => {
    const context = createContext();

    const disposable = registerViPreviewCustomEditor(context as never);

    expect(registerCustomEditorProviderMock).toHaveBeenCalledWith(
      VI_PREVIEW_VIEW_TYPE,
      expect.any(Object),
      {
        supportsMultipleEditorsPerDocument: false,
        webviewOptions: { retainContextWhenHidden: true }
      }
    );
    expect(context.subscriptions).toContain(disposable);
  });

  it('shows an untrusted-workspace message and never resolves or launches a runtime', async () => {
    workspaceTrusted.value = false;
    const provider = providerFromLastRegistrationAfterRegister();

    const panel = await resolveEditor(provider);

    expect(panel.webview.options).toEqual({ enableScripts: false });
    expect(panel.webview.html).toContain('VI preview is disabled in untrusted workspaces');
    expect(resolvePreviewRuntimeMock).not.toHaveBeenCalled();
    expect(renderViPreviewForFileMock).not.toHaveBeenCalled();
  });

  it('shows the opt-in enable prompt and never renders when VI Preview is off (VHS-REQ-659.7)', async () => {
    isViPreviewEnabledMock.mockReturnValueOnce(false);
    const provider = providerFromLastRegistrationAfterRegister();

    const panel = await resolveEditor(provider);

    expect(panel.webview.options).toEqual({ enableScripts: false });
    expect(panel.webview.html).toContain('VI Preview is off');
    expect(resolvePreviewRuntimeMock).not.toHaveBeenCalled();
    expect(renderViPreviewForFileMock).not.toHaveBeenCalled();
  });

  it('guides to Docker when host-native has no cached preview (VHS-REQ-659.7)', async () => {
    resolvePreviewRuntimeMock.mockResolvedValueOnce({
      outcome: 'ready',
      runtime: { provider: 'host-native', labviewCliPath: 'C:\\LabVIEWCLI.exe' }
    });
    // Host-native does a cache-only peek; a miss must NOT launch LabVIEW.
    renderViPreviewForFileMock.mockResolvedValueOnce({
      outcome: 'failed',
      failureReason: 'preview-cache-miss'
    });
    const provider = providerFromLastRegistrationAfterRegister();

    const panel = await resolveEditor(provider);

    expect(panel.webview.html).toContain('requires Docker to generate the cache');
    // The peek ran in cacheOnly mode (no live render / LabVIEW launch).
    expect(renderViPreviewForFileMock).toHaveBeenCalledWith(
      expect.objectContaining({ cacheOnly: true }),
      expect.anything()
    );
  });

  it('displays a cached preview on host-native without launching LabVIEW (VHS-REQ-659.7)', async () => {
    resolvePreviewRuntimeMock.mockResolvedValueOnce({
      outcome: 'ready',
      runtime: { provider: 'host-native', labviewCliPath: 'C:\\LabVIEWCLI.exe' }
    });
    renderViPreviewForFileMock.mockResolvedValueOnce({
      outcome: 'rendered',
      html: '<html>cached host preview</html>',
      cached: true
    });
    const provider = providerFromLastRegistrationAfterRegister();

    const panel = await resolveEditor(provider);

    expect(panel.webview.html).toContain('cached host preview');
    expect(renderViPreviewForFileMock).toHaveBeenCalledWith(
      expect.objectContaining({ cacheOnly: true }),
      expect.anything()
    );
  });

  it('renders live on host-native when allowHostNativeRender is on (Vagrant; VHS-REQ-659.7)', async () => {
    hostNativeRenderAllowed.value = true;
    resolvePreviewRuntimeMock.mockResolvedValueOnce({
      outcome: 'ready',
      runtime: { provider: 'host-native', labviewCliPath: 'C:\\LabVIEWCLI.exe' }
    });
    renderViPreviewForFileMock.mockResolvedValueOnce({
      outcome: 'rendered',
      html: '<html>vagrant live preview</html>'
    });
    const provider = providerFromLastRegistrationAfterRegister();

    const panel = await resolveEditor(provider);

    expect(panel.webview.html).toContain('vagrant live preview');
    // A live render (not a cacheOnly peek) generates and caches on the VM.
    expect(renderViPreviewForFileMock).toHaveBeenCalledWith(
      expect.not.objectContaining({ cacheOnly: true }),
      expect.anything()
    );
  });

  it('renders through the shared warm session for a Docker runtime and starts warming (VHS-REQ-659.12)', async () => {
    const onPreviewOpened = vi.fn();
    const sessionManager = {
      renderVi: vi.fn().mockResolvedValue({ outcome: 'rendered', html: '<html>docker preview</html>' }),
      dispose: vi.fn()
    };
    const context = createContext();
    registerViPreviewCustomEditor(context as never, { onPreviewOpened, sessionManager });
    const provider = providerFromLastRegistration();

    const panel = await resolveEditor(provider, createPanel(), '/workspace/repo/Foo.vit');

    expect(panel.webview.options).toEqual({ enableScripts: false });
    expect(sessionManager.renderVi).toHaveBeenCalledWith(
      {
        provider: 'linux-container',
        containerImage: 'nationalinstruments/labview:2026q1-linux',
        containerLabviewPath: undefined,
        connectTimeoutSeconds: undefined
      },
      '/workspace/repo/Foo.vit',
      'interactive'
    );
    expect(panel.webview.html).toContain('docker preview');
    expect(onPreviewOpened).toHaveBeenCalledWith('/workspace/repo/Foo.vit');
    expect(renderViPreviewForFileMock).not.toHaveBeenCalled();
  });

  const BD_HTML =
    '<HTML><BODY><H3>Block Diagram</H3>' +
    '<P><IMG src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAMgAAACWCAIAAAA="></P>' +
    '<H3>VI Revision History</H3></BODY></HTML>';

  it('enables webview scripts only when the interactive viewer is returned (VHS-REQ-659.19)', async () => {
    blockDiagramInteractive.value = true;
    const sessionManager = {
      renderVi: vi.fn().mockResolvedValue({ outcome: 'rendered', html: BD_HTML }),
      dispose: vi.fn()
    };
    const context = createContext();
    registerViPreviewCustomEditor(context as never, { sessionManager });
    const provider = providerFromLastRegistration();

    const panel = await resolveEditor(provider, createPanel(), '/workspace/repo/Foo.vi');

    expect(panel.webview.options).toEqual({ enableScripts: true });
    expect(panel.webview.html).toContain('lvr-frames');
  });

  it('keeps scripts disabled when interactive mode falls back to the document (VHS-REQ-659.19)', async () => {
    blockDiagramInteractive.value = true;
    // No Block Diagram section => no frames extract => the selector falls back to
    // the static document, which must stay host-level script-disabled.
    const sessionManager = {
      renderVi: vi.fn().mockResolvedValue({ outcome: 'rendered', html: '<HTML><BODY>no diagram</BODY></HTML>' }),
      dispose: vi.fn()
    };
    const context = createContext();
    registerViPreviewCustomEditor(context as never, { sessionManager });
    const provider = providerFromLastRegistration();

    const panel = await resolveEditor(provider, createPanel(), '/workspace/repo/Foo.ctl');

    expect(panel.webview.options).toEqual({ enableScripts: false });
    expect(panel.webview.html).not.toContain('lvr-frames');
  });

  it('materializes a non-file (git) base URI and renders the committed bytes, not the working file (VHS-REQ-659.8)', async () => {
    const removeDirectory = vi.fn(async () => {});
    buildViPreviewRenderSourceDepsMock.mockReturnValue({
      readBytes: vi.fn(async () => new Uint8Array([0x52, 0x53, 0x52, 0x43])),
      createTempDirectory: vi.fn(async () => '/tmp/vihs-src'),
      writeFile: vi.fn(async () => {}),
      removeDirectory,
      joinPath: (directory: string, name: string) => `${directory}/${name}`
    });
    const provider = providerFromLastRegistrationAfterRegister();

    const panel = await resolveEditor(
      provider,
      createPanel(),
      '/workspace/repo/Dequeue Trace.vi',
      'git'
    );

    expect(renderViPreviewForFileMock).toHaveBeenCalledWith(
      expect.objectContaining({ viFilePath: '/tmp/vihs-src/Dequeue Trace.vi' }),
      expect.anything()
    );
    expect(panel.webview.html).toContain('rendered');
    expect(removeDirectory).toHaveBeenCalledWith('/tmp/vihs-src');
  });
});

function providerFromLastRegistrationAfterRegister(): RegisteredProvider {
  registerViPreviewCustomEditor(createContext() as never);
  return providerFromLastRegistration();
}
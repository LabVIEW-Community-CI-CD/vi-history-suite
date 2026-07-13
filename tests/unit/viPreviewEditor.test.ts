import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  registerCustomEditorProviderMock,
  workspaceTrusted,
  isViPreviewEnabledMock,
  resolvePreviewRuntimeMock,
  renderViPreviewForFileMock,
  createViPreviewCacheMock
} = vi.hoisted(() => ({
  registerCustomEditorProviderMock: vi.fn(),
  workspaceTrusted: { value: true },
  isViPreviewEnabledMock: vi.fn(),
  resolvePreviewRuntimeMock: vi.fn(),
  renderViPreviewForFileMock: vi.fn(),
  createViPreviewCacheMock: vi.fn()
}));

vi.mock('vscode', () => ({
  window: {
    registerCustomEditorProvider: registerCustomEditorProviderMock
  },
  workspace: {
    get isTrusted() {
      return workspaceTrusted.value;
    }
  }
}));

vi.mock('../../src/reporting/viPreview/viPreviewFileRender', () => ({
  renderViPreviewForFile: renderViPreviewForFileMock
}));

vi.mock('../../src/ui/viPreviewRenderHost', () => ({
  buildViPreviewRenderDeps: vi.fn(() => ({})),
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
  openCustomDocument(uri: { fsPath: string }): { uri: { fsPath: string } };
  resolveCustomEditor(document: { uri: { fsPath: string } }, panel: FakePanel): Promise<void>;
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
  fsPath = '/workspace/repo/Foo.vi'
): Promise<FakePanel> {
  const document = provider.openCustomDocument({ fsPath });
  await provider.resolveCustomEditor(document, panel);
  return panel;
}

describe('VI Preview custom editor (VHS-REQ-659.8)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    workspaceTrusted.value = true;
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

  it('requires Docker and does not render when the resolved runtime is host-native', async () => {
    resolvePreviewRuntimeMock.mockResolvedValueOnce({
      outcome: 'ready',
      runtime: { provider: 'host-native', labviewCliPath: 'C:\\LabVIEWCLI.exe' }
    });
    const provider = providerFromLastRegistrationAfterRegister();

    const panel = await resolveEditor(provider);

    expect(panel.webview.html).toContain('VI Preview requires Docker');
    expect(panel.webview.html).toContain('VI Preview runs on the Docker runtime');
    expect(renderViPreviewForFileMock).not.toHaveBeenCalled();
  });

  it('renders through the shared warm session for a Docker runtime and starts warming', async () => {
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
});

function providerFromLastRegistrationAfterRegister(): RegisteredProvider {
  registerViPreviewCustomEditor(createContext() as never);
  return providerFromLastRegistration();
}
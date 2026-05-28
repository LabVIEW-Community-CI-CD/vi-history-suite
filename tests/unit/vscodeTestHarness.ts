import * as path from 'node:path';

import { vi } from 'vitest';

type CommandHandler = (...args: unknown[]) => unknown;

export interface FakeUri {
  scheme: string;
  fsPath: string;
  path: string;
  authority: string;
  query: string;
  fragment: string;
  toString(): string;
  with(changes: Partial<Pick<FakeUri, 'scheme' | 'path' | 'query' | 'fragment'>>): FakeUri;
}

export interface FakeWebviewPanel {
  viewType: string;
  title: string;
  viewColumn: unknown;
  options: unknown;
  postedMessages: unknown[];
  reveal: ReturnType<typeof vi.fn>;
  dispose: ReturnType<typeof vi.fn>;
  onDidDispose: ReturnType<typeof vi.fn>;
  webview: {
    html: string;
    postedMessages: unknown[];
    asWebviewUri: ReturnType<typeof vi.fn>;
    postMessage: ReturnType<typeof vi.fn>;
    onDidReceiveMessage: ReturnType<typeof vi.fn>;
  };
  dispatchMessage(message: unknown): Promise<void>;
  fireDispose(): void;
}

export interface FakeOutputChannel {
  name: string;
  lines: string[];
  append: ReturnType<typeof vi.fn>;
  appendLine: ReturnType<typeof vi.fn>;
  clear: ReturnType<typeof vi.fn>;
  show: ReturnType<typeof vi.fn>;
  hide: ReturnType<typeof vi.fn>;
  dispose: ReturnType<typeof vi.fn>;
  text(): string;
}

interface StoredFile {
  data: Uint8Array;
}

function normalizeFilePath(filePath: string): string {
  return filePath.replace(/\\/g, '/');
}

function toUint8Array(value: string | Uint8Array): Uint8Array {
  return typeof value === 'string' ? new TextEncoder().encode(value) : value;
}

function toText(value: string | Uint8Array): string {
  return typeof value === 'string' ? value : new TextDecoder().decode(value);
}

function createMissingFileError(filePath: string): Error & { code: string } {
  return Object.assign(new Error(`ENOENT: no such file or directory, ${filePath}`), {
    code: 'ENOENT'
  });
}

export function createFakeUri(inputPath: string, scheme = 'file'): FakeUri {
  const normalizedFsPath = normalizeFilePath(inputPath);
  const uriPath = normalizedFsPath.startsWith('/') ? normalizedFsPath : `/${normalizedFsPath}`;
  return {
    scheme,
    fsPath: normalizedFsPath,
    path: uriPath,
    authority: '',
    query: '',
    fragment: '',
    toString() {
      if (scheme === 'file') {
        return `file://${uriPath}`;
      }
      return `${scheme}:${uriPath}`;
    },
    with(changes) {
      return createFakeUri(changes.path ?? normalizedFsPath, changes.scheme ?? scheme);
    }
  };
}

export function createVsCodeTestHarness() {
  const commandHandlers = new Map<string, CommandHandler>();
  const workspaceFiles = new Map<string, StoredFile>();
  const nodeFiles = new Map<string, StoredFile>();
  const directories = new Set<string>();
  const panels: FakeWebviewPanel[] = [];
  const outputChannels: FakeOutputChannel[] = [];
  const executedCommands: Array<{ command: string; args: unknown[] }> = [];
  const progressReports: Array<{ options: unknown; update: unknown }> = [];
  const clipboardWrites: string[] = [];
  const openedExternalUris: string[] = [];
  const workspaceState = {
    isTrusted: true,
    workspaceFolders: [] as Array<{ uri: FakeUri; name: string; index: number }>
  };

  function disposable(dispose = vi.fn()) {
    return { dispose };
  }

  function createMemento(initial: Record<string, unknown> = {}) {
    const store = new Map<string, unknown>(Object.entries(initial));
    return {
      get: vi.fn((key: string, defaultValue?: unknown) =>
        store.has(key) ? store.get(key) : defaultValue
      ),
      update: vi.fn(async (key: string, value: unknown) => {
        if (value === undefined) {
          store.delete(key);
        } else {
          store.set(key, value);
        }
      }),
      keys: vi.fn(() => [...store.keys()]),
      store
    };
  }

  function createWebviewPanel(
    viewType: string,
    title: string,
    viewColumn?: unknown,
    options?: unknown
  ): FakeWebviewPanel {
    const messageListeners: Array<(message: unknown) => unknown> = [];
    const disposeListeners: Array<() => unknown> = [];
    const panel: FakeWebviewPanel = {
      viewType,
      title,
      viewColumn,
      options,
      postedMessages: [],
      reveal: vi.fn(),
      dispose: vi.fn(() => {
        panel.fireDispose();
      }),
      onDidDispose: vi.fn((listener: () => unknown) => {
        disposeListeners.push(listener);
        return disposable();
      }),
      webview: {
        html: '',
        postedMessages: [],
        asWebviewUri: vi.fn((uri: FakeUri) => uri),
        postMessage: vi.fn(async (message: unknown) => {
          panel.postedMessages.push(message);
          panel.webview.postedMessages.push(message);
          return true;
        }),
        onDidReceiveMessage: vi.fn((listener: (message: unknown) => unknown) => {
          messageListeners.push(listener);
          return disposable();
        })
      },
      async dispatchMessage(message: unknown) {
        for (const listener of messageListeners) {
          await listener(message);
        }
      },
      fireDispose() {
        for (const listener of disposeListeners) {
          listener();
        }
      }
    };
    panels.push(panel);
    return panel;
  }

  function createOutputChannel(name: string): FakeOutputChannel {
    const lines: string[] = [];
    const channel: FakeOutputChannel = {
      name,
      lines,
      append: vi.fn((value: string) => {
        lines.push(value);
      }),
      appendLine: vi.fn((value: string) => {
        lines.push(`${value}\n`);
      }),
      clear: vi.fn(() => {
        lines.length = 0;
      }),
      show: vi.fn(),
      hide: vi.fn(),
      dispose: vi.fn(),
      text: () => lines.join('')
    };
    outputChannels.push(channel);
    return channel;
  }

  function createWritableStream() {
    const chunks: string[] = [];
    return {
      write: vi.fn((value: string) => {
        chunks.push(value);
      }),
      text: () => chunks.join('')
    };
  }

  const vscode = {
    commands: {
      registerCommand: vi.fn((command: string, handler: CommandHandler) => {
        commandHandlers.set(command, handler);
        return disposable(
          vi.fn(() => {
            commandHandlers.delete(command);
          })
        );
      }),
      executeCommand: vi.fn(async (command: string, ...args: unknown[]) => {
        executedCommands.push({ command, args });
        const handler = commandHandlers.get(command);
        return handler?.(...args);
      })
    },
    env: {
      clipboard: {
        writeText: vi.fn(async (value: string) => {
          clipboardWrites.push(value);
        }),
        readText: vi.fn(async () => clipboardWrites.at(-1) ?? '')
      },
      machineId: 'test-machine',
      openExternal: vi.fn(async (uri: FakeUri) => {
        openedExternalUris.push(uri.toString());
        return true;
      })
    },
    extensions: {
      getExtension: vi.fn()
    },
    window: {
      activeTextEditor: undefined as unknown,
      createOutputChannel: vi.fn(createOutputChannel),
      createStatusBarItem: vi.fn(() => ({
        text: '',
        tooltip: '',
        command: '',
        show: vi.fn(),
        hide: vi.fn(),
        dispose: vi.fn()
      })),
      createWebviewPanel: vi.fn(createWebviewPanel),
      showInformationMessage: vi.fn(async (message: string, ...items: unknown[]) => items[0]),
      showWarningMessage: vi.fn(async (message: string, ...items: unknown[]) => items[0]),
      showErrorMessage: vi.fn(async (message: string, ...items: unknown[]) => items[0]),
      withProgress: vi.fn(async (options: unknown, task: (progress: unknown, token: unknown) => unknown) => {
        const progress = {
          report: vi.fn((update: unknown) => {
            progressReports.push({ options, update });
          })
        };
        return task(progress, createCancellationToken(false));
      })
    },
    workspace: {
      get isTrusted() {
        return workspaceState.isTrusted;
      },
      get workspaceFolders() {
        return workspaceState.workspaceFolders;
      },
      fs: {
        readFile: vi.fn(async (uri: FakeUri) => {
          const key = normalizeFilePath(uri.fsPath);
          const entry = workspaceFiles.get(key);
          if (!entry) {
            throw createMissingFileError(key);
          }
          return entry.data;
        }),
        writeFile: vi.fn(async (uri: FakeUri, data: Uint8Array) => {
          workspaceFiles.set(normalizeFilePath(uri.fsPath), { data });
        }),
        createDirectory: vi.fn(async (uri: FakeUri) => {
          directories.add(normalizeFilePath(uri.fsPath));
        }),
        stat: vi.fn(async (uri: FakeUri) => {
          const key = normalizeFilePath(uri.fsPath);
          if (!workspaceFiles.has(key) && !directories.has(key)) {
            throw createMissingFileError(key);
          }
          return { type: workspaceFiles.has(key) ? 1 : 2 };
        })
      },
      getConfiguration: vi.fn(() => ({
        get: vi.fn((_key: string, defaultValue?: unknown) => defaultValue),
        update: vi.fn()
      })),
      onDidChangeWorkspaceFolders: vi.fn(() => disposable()),
      onDidGrantWorkspaceTrust: vi.fn(() => disposable()),
      onDidChangeConfiguration: vi.fn(() => disposable())
    },
    Uri: {
      file: (filePath: string) => createFakeUri(filePath, 'file'),
      parse: (value: string) => {
        try {
          const parsed = new URL(value);
          return createFakeUri(parsed.pathname, parsed.protocol.replace(':', '') || 'file');
        } catch {
          return createFakeUri(value, 'file');
        }
      },
      joinPath: (base: FakeUri, ...segments: string[]) =>
        createFakeUri(path.posix.join(normalizeFilePath(base.fsPath), ...segments), base.scheme)
    },
    ViewColumn: {
      Active: 1,
      Beside: 2
    },
    ProgressLocation: {
      Window: 10,
      Notification: 15
    },
    StatusBarAlignment: {
      Left: 1,
      Right: 2
    },
    Disposable: {
      from: (...disposables: Array<{ dispose?: () => void }>) =>
        disposable(
          vi.fn(() => {
            for (const item of disposables) {
              item.dispose?.();
            }
          })
        )
    },
    version: '1.90.0'
  };

  function writeWorkspaceFile(filePath: string, value: string | Uint8Array): void {
    workspaceFiles.set(normalizeFilePath(filePath), { data: toUint8Array(value) });
  }

  function writeNodeFile(filePath: string, value: string | Uint8Array): void {
    nodeFiles.set(normalizeFilePath(filePath), { data: toUint8Array(value) });
  }

  function createNodeFs() {
    return {
      access: vi.fn(async (filePath: string) => {
        const key = normalizeFilePath(filePath);
        if (!nodeFiles.has(key) && !directories.has(key)) {
          throw createMissingFileError(key);
        }
      }),
      chmod: vi.fn(async () => undefined),
      mkdir: vi.fn(async (filePath: string) => {
        directories.add(normalizeFilePath(filePath));
      }),
      readFile: vi.fn(async (filePath: string, encoding?: BufferEncoding) => {
        const key = normalizeFilePath(filePath);
        const entry = nodeFiles.get(key);
        if (!entry) {
          throw createMissingFileError(key);
        }
        return encoding ? toText(entry.data) : entry.data;
      }),
      writeFile: vi.fn(async (filePath: string, value: string | Uint8Array) => {
        nodeFiles.set(normalizeFilePath(filePath), { data: toUint8Array(value) });
      })
    };
  }

  function createContext(overrides: Record<string, unknown> = {}) {
    return {
      subscriptions: [],
      workspaceState: createMemento(),
      globalState: createMemento(),
      extensionPath: '/workspace/vi-history-suite',
      extensionUri: createFakeUri('/workspace/vi-history-suite'),
      storageUri: createFakeUri('/workspace/storage'),
      globalStorageUri: createFakeUri('/workspace/global-storage'),
      environmentVariableCollection: {
        prepend: vi.fn(),
        append: vi.fn(),
        replace: vi.fn()
      },
      extension: {
        packageJSON: {
          version: '0.0.0-test'
        }
      },
      ...overrides
    };
  }

  function createCancellationToken(isCancellationRequested = false) {
    return {
      isCancellationRequested,
      onCancellationRequested: vi.fn(() => disposable())
    };
  }

  function reset() {
    commandHandlers.clear();
    workspaceFiles.clear();
    nodeFiles.clear();
    directories.clear();
    panels.length = 0;
    outputChannels.length = 0;
    executedCommands.length = 0;
    progressReports.length = 0;
    clipboardWrites.length = 0;
    openedExternalUris.length = 0;
    workspaceState.isTrusted = true;
    workspaceState.workspaceFolders = [];
    vi.clearAllMocks();
  }

  return {
    vscode,
    commandHandlers,
    workspaceFiles,
    nodeFiles,
    directories,
    panels,
    outputChannels,
    executedCommands,
    progressReports,
    clipboardWrites,
    openedExternalUris,
    workspaceState,
    createCancellationToken,
    createContext,
    createMemento,
    createNodeFs,
    createOutputChannel,
    createUri: createFakeUri,
    createWebviewPanel,
    createWritableStream,
    reset,
    setWorkspaceTrusted(isTrusted: boolean) {
      workspaceState.isTrusted = isTrusted;
    },
    setWorkspaceFolders(folders: string[]) {
      workspaceState.workspaceFolders = folders.map((folder, index) => ({
        uri: createFakeUri(folder),
        name: path.posix.basename(normalizeFilePath(folder)),
        index
      }));
    },
    writeNodeFile,
    writeWorkspaceFile
  };
}

export const defaultVsCodeTestHarness = createVsCodeTestHarness();

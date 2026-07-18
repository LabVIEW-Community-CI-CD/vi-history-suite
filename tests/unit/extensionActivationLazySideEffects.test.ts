import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  commandHandlers,
  registerCommandMock,
  showInformationMessageMock,
  showWarningMessageMock,
  getBuiltInGitApiMock,
  viHistoryServiceConstructedWith,
  viHistoryServiceLoadMock,
  createOpenViHistoryCommandMock,
  openViHistoryHandlerMock,
  bundledDocumentationActionMock,
  admitLocalRuntimeSettingsCliToTerminalPathMock,
  resolveLocalRuntimeSettingsCliContractMock,
  materializedCli,
  workspaceState,
  eligibilityEventListeners,
  onDidChangeConfigurationMock,
  onDidChangeWorkspaceFoldersMock,
  onDidGrantWorkspaceTrustMock,
  executeCommandMock,
  exportRegistryActiveSourceHolder
} = vi.hoisted(() => {
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  const materialized = {
    rootDirectoryPath: '/tmp/vihs-cli',
    javascriptLauncherPath: '/tmp/vihs-cli/run-local-runtime-settings-cli.js',
    windowsLauncherPath: '/tmp/vihs-cli/vihs-runtime-settings.cmd',
    posixLauncherPath: '/tmp/vihs-cli/vihs-runtime-settings',
    windowsTerminalEntrypointPath: '/tmp/vihs-cli/vihs.cmd',
    posixTerminalEntrypointPath: '/tmp/vihs-cli/vihs',
    currentPlatformLauncherPath: '/tmp/vihs-cli/vihs-runtime-settings',
    currentPlatformTerminalEntrypointPath: '/tmp/vihs-cli/vihs',
    terminalCommandName: 'vihs',
    pathPrependValue: '/tmp/vihs-cli:',
    modulePath: '/workspace/out/tooling/localRuntimeSettingsCli.js',
    nextCommand: 'vihs',
    exampleCommand: 'vihs'
  };

  const workspaceStateHolder = { isTrusted: true };
  const eligibilityEventListenerStore = {
    configuration: [] as Array<(...args: unknown[]) => unknown>,
    workspaceFolders: [] as Array<(...args: unknown[]) => unknown>,
    grantTrust: [] as Array<(...args: unknown[]) => unknown>
  };

  return {
    commandHandlers: handlers,
    registerCommandMock: vi.fn((command: string, handler: (...args: unknown[]) => unknown) => {
      handlers.set(command, handler);
      return { dispose: vi.fn() };
    }),
    showInformationMessageMock: vi.fn(),
    showWarningMessageMock: vi.fn(),
    getBuiltInGitApiMock: vi.fn(),
    viHistoryServiceConstructedWith: [] as unknown[],
    viHistoryServiceLoadMock: vi.fn(),
    createOpenViHistoryCommandMock: vi.fn(),
    openViHistoryHandlerMock: vi.fn(),
    bundledDocumentationActionMock: vi.fn(),
    admitLocalRuntimeSettingsCliToTerminalPathMock: vi.fn(),
    resolveLocalRuntimeSettingsCliContractMock: vi.fn(),
    materializedCli: materialized,
    workspaceState: workspaceStateHolder,
    eligibilityEventListeners: eligibilityEventListenerStore,
    onDidChangeConfigurationMock: vi.fn((listener: (...args: unknown[]) => unknown) => {
      eligibilityEventListenerStore.configuration.push(listener);
      return { dispose: vi.fn() };
    }),
    onDidChangeWorkspaceFoldersMock: vi.fn((listener: (...args: unknown[]) => unknown) => {
      eligibilityEventListenerStore.workspaceFolders.push(listener);
      return { dispose: vi.fn() };
    }),
    onDidGrantWorkspaceTrustMock: vi.fn((listener: (...args: unknown[]) => unknown) => {
      eligibilityEventListenerStore.grantTrust.push(listener);
      return { dispose: vi.fn() };
    }),
    executeCommandMock: vi.fn(),
    exportRegistryActiveSourceHolder: {
      value: undefined as { sourceViFsPath?: string } | undefined
    }
  };
});

vi.mock('vscode', () => ({
  commands: {
    registerCommand: registerCommandMock,
    executeCommand: executeCommandMock
  },
  Uri: {
    file: (fsPath: string) => ({ fsPath, scheme: 'file' }),
    joinPath: (base: { fsPath?: string } | undefined, ...segments: string[]) => ({
      fsPath: [base?.fsPath ?? '', ...segments].join('/'),
      scheme: 'file'
    })
  },
  window: {
    showInformationMessage: showInformationMessageMock,
    showWarningMessage: showWarningMessageMock,
    registerCustomEditorProvider: vi.fn(() => ({ dispose: vi.fn() })),
    registerFileDecorationProvider: vi.fn(() => ({ dispose: vi.fn() }))
  },
  workspace: {
    get isTrusted() {
      return workspaceState.isTrusted;
    },
    getConfiguration: () => ({
      get: () => undefined
    }),
    onDidChangeConfiguration: onDidChangeConfigurationMock,
    onDidChangeWorkspaceFolders: onDidChangeWorkspaceFoldersMock,
    onDidGrantWorkspaceTrust: onDidGrantWorkspaceTrustMock,
    // VHS-REQ-664: the on-change warmer registers a FileSystemWatcher during
    // activation; the watcher callbacks never fire in these activation tests.
    createFileSystemWatcher: () => ({
      onDidChange: () => ({ dispose: () => {} }),
      onDidCreate: () => ({ dispose: () => {} }),
      onDidDelete: () => ({ dispose: () => {} }),
      dispose: () => {}
    })
  },
  // The VHS-REQ-660 Source Control decoration provider constructs an
  // EventEmitter and registers a file-decoration provider during activation.
  EventEmitter: class {
    event = vi.fn();
    fire = vi.fn();
    dispose = vi.fn();
  },
  // No `registerMcpServerDefinitionProvider`, so the semantic MCP registration
  // guard short-circuits to a no-op here (the host-without-stable-MCP-API path);
  // its full behavior is covered in viSemanticMcpServerProvider.test.ts.
  lm: {}
}));

vi.mock('../../src/reporting/comparisonReportExport', () => ({
  ComparisonReportExportRegistry: class {
    register(): void {}
    getActiveSource(): { sourceViFsPath?: string } | undefined {
      return exportRegistryActiveSourceHolder.value;
    }
  },
  runComparisonReportExport: vi.fn(async () => ({ outcome: 'no-active-comparison-report' }))
}));

vi.mock('../../src/git/gitApi', () => ({
  getBuiltInGitApi: getBuiltInGitApiMock
}));

vi.mock('../../src/tooling/runtimeAutoDetect', () => ({
  detectAvailableRuntimes: vi.fn(async () => ({
    platform: 'linux',
    host: { installations: [] },
    docker: { cliAvailable: false }
  })),
  recommendRuntimeFromDetection: vi.fn(() => ({ provider: 'none' as const }))
}));

vi.mock('../../src/tooling/runtimeSettingsSeed', () => ({
  applyRuntimeSettingsSeed: vi.fn(async () => ({
    outcome: 'no-runtime-detected',
    settingsFilePath: '/home/test/.config/Code/User/settings.json',
    recommendation: { provider: 'none' as const },
    previous: {}
  }))
}));

vi.mock('../../src/ui/runtimeAvailabilityNotice', () => ({
  createRuntimeAvailabilityWatcher: vi.fn(() => ({
    dispose: vi.fn(),
    forceRefresh: vi.fn(async () => undefined),
    getLastDetection: vi.fn(() => undefined),
    getLastSnapshot: vi.fn(() => undefined)
  })),
  decideLabviewCliOpenGate: vi.fn(() => ({ kind: 'allow' })),
  decideLabviewCliOpenGateWithRegistryFallback: vi.fn(async (decision) => decision),
  presentLabviewCliOpenBlockedToast: vi.fn(async () => undefined),
  decideViServerOpenGate: vi.fn(async () => ({ kind: 'allow' })),
  presentViServerOpenBlockedToast: vi.fn(async () => undefined),
  decideBitnessOpenGate: vi.fn(async () => ({ kind: 'allow' })),
  presentBitnessOpenBlockedToast: vi.fn(async () => undefined),
  decideVersionOpenGate: vi.fn(async () => ({ kind: 'allow' })),
  presentVersionOpenBlockedToast: vi.fn(async () => undefined),
  STATUS_BAR_PICK_COMMAND_ID: 'labviewViHistory.pickRuntimeProvider'
}));

vi.mock('../../src/ui/gitPrerequisiteNotice', () => ({
  createGitPrerequisiteWatcher: vi.fn(() => ({
    dispose: vi.fn(),
    forceRefresh: vi.fn(async () => undefined),
    getDetection: vi.fn(() => ({ available: true, version: '2.46.0' }))
  })),
  decideOpenGate: vi.fn(() => ({ kind: 'allow' })),
  presentOpenBlockedToast: vi.fn(async () => undefined)
}));

vi.mock('../../src/commands/runtimeCommands', () => ({
  registerRuntimeRuntimeCommands: vi.fn()
}));

vi.mock('../../src/commands/openRuntimeReportPanelCommand', () => ({
  registerOpenRuntimeReportPanelCommand: vi.fn()
}));

vi.mock('../../src/services/viHistoryService', () => ({
  getViHistoryServiceSettings: vi.fn(),
  ViHistoryService: class MockViHistoryService {
    constructor(gitApi: unknown) {
      viHistoryServiceConstructedWith.push(gitApi);
    }

    load = viHistoryServiceLoadMock;
  }
}));

vi.mock('../../src/commands/openViHistoryCommand', () => ({
  createOpenViHistoryCommand: createOpenViHistoryCommandMock
}));

vi.mock('../../src/reporting/comparisonReportAction', () => ({
  createComparisonReportAction: vi.fn(() => vi.fn()),
  createEnsureComparisonReportEvidenceAction: vi.fn(() => vi.fn()),
  createOpenRetainedComparisonReportAction: vi.fn(() => vi.fn()),
  readComparisonRuntimeSettings: vi.fn()
}));

vi.mock('../../src/dashboard/multiReportDashboardAction', () => ({
  createMultiReportDashboardAction: vi.fn(() => vi.fn())
}));

vi.mock('../../src/dashboard/comparisonReportArchive', () => ({
  buildComparisonReportArchivePlanFromSelection: vi.fn(() => ({
    sourceRecordFilePath: '/tmp/missing-report.json'
  }))
}));

vi.mock('../../src/docs/bundledDocumentationAction', () => ({
  createBundledDocumentationAction: vi.fn(() => bundledDocumentationActionMock)
}));

vi.mock('../../src/scenarios/reviewDecisionRecordAction', () => ({
  createReviewDecisionRecordAction: vi.fn(() => vi.fn())
}));

vi.mock('../../src/git/gitCli', () => ({
  getFileHistoryCount: vi.fn()
}));

vi.mock('../../src/tooling/localRuntimeSettingsCli', () => ({
  admitLocalRuntimeSettingsCliToTerminalPath: admitLocalRuntimeSettingsCliToTerminalPathMock,
  resolveLocalRuntimeSettingsCliContract: resolveLocalRuntimeSettingsCliContractMock,
  resolveDefaultVsCodeSettingsPath: vi.fn(() => '/home/test/.config/Code/User/settings.json'),
  runLocalRuntimeSettingsCli: vi.fn()
}));

vi.mock('../../src/tooling/runtimeSettingsLiveSessionProbe', () => ({
  buildRuntimeSettingsLiveSessionProbeSummary: vi.fn()
}));

vi.mock('../../src/tooling/runtimeSettingsLiveSessionProbePacket', () => ({
  persistRuntimeSettingsLiveSessionProbePacket: vi.fn()
}));

vi.mock('../../src/tooling/runtimeSettingsLiveSessionSafeRestore', () => ({
  deriveRuntimeSettingsLiveSessionMutationRequest: vi.fn(),
  runWithRuntimeSettingsSafeRestore: vi.fn()
}));

import { activate } from '../../src/extension';
import { registerRuntimeRuntimeCommands } from '../../src/commands/runtimeCommands';
import { detectAvailableRuntimes } from '../../src/tooling/runtimeAutoDetect';
import { applyRuntimeSettingsSeed } from '../../src/tooling/runtimeSettingsSeed';
import {
  createRuntimeAvailabilityWatcher,
  decideLabviewCliOpenGate,
  decideLabviewCliOpenGateWithRegistryFallback,
  decideBitnessOpenGate,
  decideVersionOpenGate,
  decideViServerOpenGate,
  presentLabviewCliOpenBlockedToast,
  presentBitnessOpenBlockedToast,
  presentVersionOpenBlockedToast,
  presentViServerOpenBlockedToast
} from '../../src/ui/runtimeAvailabilityNotice';
import {
  createGitPrerequisiteWatcher,
  decideOpenGate,
  presentOpenBlockedToast
} from '../../src/ui/gitPrerequisiteNotice';

function createContext(overrides: Record<string, unknown> = {}) {
  return {
    subscriptions: [],
    globalStorageUri: { fsPath: '/tmp/vihs-global-storage' },
    workspaceState: {
      get: vi.fn(),
      update: vi.fn()
    },
    storageUri: { fsPath: '/tmp/vihs-workspace-storage' },
    extensionPath: '/workspace/vi-history-suite',
    environmentVariableCollection: {
      prepend: vi.fn()
    },
    ...overrides
  };
}

describe('extension activation lazy side effects', () => {
  beforeEach(() => {
    commandHandlers.clear();
    vi.clearAllMocks();
    viHistoryServiceConstructedWith.length = 0;
    workspaceState.isTrusted = true;
    eligibilityEventListeners.configuration.length = 0;
    eligibilityEventListeners.workspaceFolders.length = 0;
    eligibilityEventListeners.grantTrust.length = 0;
    exportRegistryActiveSourceHolder.value = undefined;
    getBuiltInGitApiMock.mockResolvedValue({
      repositories: [],
      onDidOpenRepository: vi.fn(),
      onDidCloseRepository: vi.fn()
    });
    viHistoryServiceLoadMock.mockResolvedValue({ eligible: true });
    openViHistoryHandlerMock.mockResolvedValue(undefined);
    createOpenViHistoryCommandMock.mockReturnValue(openViHistoryHandlerMock);
    bundledDocumentationActionMock.mockResolvedValue({ outcome: 'opened-documentation' });
    admitLocalRuntimeSettingsCliToTerminalPathMock.mockResolvedValue(materializedCli);
    resolveLocalRuntimeSettingsCliContractMock.mockReturnValue({
      defaultSettingsFilePath: '/home/test/.config/Code/User/settings.json',
      supportedSettingsTargets: ['default-user-settings', 'explicit-settings-file'],
      untrustedWorkspacePosture: 'prepare-command-admitted-compare-blocked'
    });
  });

  it('auto-materializes the runtime CLI and refreshes the prepare-command contract without resolving Git (VHS-REQ-083, VHS-REQ-083.3, VHS-REQ-612.3)', async () => {
    const api = await activate(createContext() as never);

    // VHS-REQ-612.2
    expect(admitLocalRuntimeSettingsCliToTerminalPathMock).toHaveBeenCalledTimes(1);
    expect(admitLocalRuntimeSettingsCliToTerminalPathMock).toHaveBeenCalledWith(
      '/tmp/vihs-global-storage',
      '/workspace/vi-history-suite',
      expect.objectContaining({ prepend: expect.any(Function) })
    );
    expect(api.getLocalRuntimeSettingsTerminalEntrypoint()).toBe(materializedCli);
    expect(getBuiltInGitApiMock).not.toHaveBeenCalled();
    const watcherInstance = vi
      .mocked(createRuntimeAvailabilityWatcher)
      .mock.results[0]?.value;
    expect(registerRuntimeRuntimeCommands).toHaveBeenCalledTimes(1);
    expect(registerRuntimeRuntimeCommands).toHaveBeenCalledWith(
      expect.anything(),
      watcherInstance
    );
    expect(api.isEligible({ fsPath: '/repo/demo.vi' } as never)).toBe(false);
    expect(api.getEligibilityDebugSnapshot()).toEqual({
      eligiblePathCount: 0,
      eligiblePathsSample: []
    });

    await commandHandlers.get('labviewViHistory.openDocumentation')?.();

    expect(getBuiltInGitApiMock).not.toHaveBeenCalled();

    const prepareResult = await commandHandlers.get('labviewViHistory.prepareLocalRuntimeSettingsCli')?.();

    // Manual prepare remains a refresh path; admission is invoked again, idempotently.
    expect(admitLocalRuntimeSettingsCliToTerminalPathMock).toHaveBeenCalledTimes(2);
    expect(getBuiltInGitApiMock).not.toHaveBeenCalled();
    expect(api.getLocalRuntimeSettingsTerminalEntrypoint()).toBe(materializedCli);
    expect(prepareResult).toMatchObject({
      outcome: 'prepared-local-runtime-settings-cli',
      javascriptLauncherPath: materializedCli.javascriptLauncherPath,
      currentPlatformLauncherPath: materializedCli.currentPlatformLauncherPath,
      currentPlatformTerminalEntrypointPath: materializedCli.currentPlatformTerminalEntrypointPath,
      terminalCommandName: materializedCli.terminalCommandName,
      defaultSettingsFilePath: '/home/test/.config/Code/User/settings.json',
      supportedSettingsTargets: ['default-user-settings', 'explicit-settings-file']
    });
    expect(showInformationMessageMock).toHaveBeenCalledWith(
      expect.stringContaining('Prepared VI History local runtime settings CLI')
    );
    expect(showInformationMessageMock).toHaveBeenCalledWith(
      expect.stringContaining('Settings targets: default user settings.json')
    );
  });

  it('logs detection and seed failures without blocking activation (VHS-REQ-616.7)', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      vi.mocked(detectAvailableRuntimes).mockRejectedValueOnce(new Error('detection failed'));

      const apiAfterDetectionFailure = await activate(createContext() as never);

      expect(commandHandlers.has('labviewViHistory.open')).toBe(true);
      expect(apiAfterDetectionFailure.getLocalRuntimeSettingsTerminalEntrypoint()).toBe(
        materializedCli
      );
      expect(consoleError).toHaveBeenCalledWith(
        '[vi-history-suite] Failed to seed or repair runtime selection in user settings.',
        expect.any(Error)
      );
      expect(registerRuntimeRuntimeCommands).toHaveBeenCalled();
      consoleError.mockClear();

      commandHandlers.clear();
      const seedError = new Error('seed failed');
      vi.mocked(applyRuntimeSettingsSeed).mockRejectedValueOnce(seedError);

      await activate(createContext() as never);

      expect(commandHandlers.has('labviewViHistory.open')).toBe(true);
      expect(consoleError).toHaveBeenCalledTimes(1);
      expect(consoleError).toHaveBeenLastCalledWith(
        '[vi-history-suite] Failed to seed or repair runtime selection in user settings.',
        seedError
      );
      expect(consoleError.mock.calls.every((call) => String(call[0]).startsWith('[vi-history-suite]'))).toBe(
        true
      );
    } finally {
      consoleError.mockRestore();
    }
  });

  it('registers the primary VI History open handler and resolves its runtime lazily (VHS-REQ-082.3)', async () => {
    const context = createContext();
    await activate(context as never);

    expect(commandHandlers.has('labviewViHistory.open')).toBe(true);
    await commandHandlers.get('labviewViHistory.open')?.({ fsPath: '/repo/demo.vi' });

    expect(getBuiltInGitApiMock).toHaveBeenCalledTimes(1);
    expect(viHistoryServiceConstructedWith).toHaveLength(1);
    expect(createOpenViHistoryCommandMock).toHaveBeenCalledTimes(1);
    expect(openViHistoryHandlerMock).toHaveBeenCalledWith({ fsPath: '/repo/demo.vi' });
  });

  it('registers the runtime availability watcher for extension disposal (VHS-REQ-617.4)', async () => {
    const runtimeWatcher = {
      dispose: vi.fn(),
      forceRefresh: vi.fn(async () => undefined),
      getLastDetection: vi.fn(() => undefined),
      getLastSnapshot: vi.fn(() => undefined)
    };
    vi.mocked(createRuntimeAvailabilityWatcher).mockReturnValueOnce(runtimeWatcher);
    const context = createContext();

    await activate(context as never);

    expect(createRuntimeAvailabilityWatcher).toHaveBeenCalledTimes(1);
    expect(context.subscriptions as unknown[]).toContain(runtimeWatcher);
  });

  it('registers the standalone container image picker command for remediation CTAs (VHS-REQ-651.5)', async () => {
    await activate(createContext() as never);

    expect(registerCommandMock).toHaveBeenCalledWith(
      'labviewViHistory.pickContainerImageVersion',
      expect.any(Function)
    );
    expect(commandHandlers.has('labviewViHistory.pickContainerImageVersion')).toBe(true);
  });

  it('allows VI History open while Git prerequisite detection is pending and registers watcher disposal (VHS-REQ-619.5, VHS-REQ-619.6)', async () => {
    const watcher = {
      dispose: vi.fn(),
      forceRefresh: vi.fn(async () => undefined),
      getDetection: vi.fn(() => undefined)
    };
    vi.mocked(createGitPrerequisiteWatcher).mockReturnValueOnce(watcher);
    const context = createContext();

    await activate(context as never);
    await commandHandlers.get('labviewViHistory.open')?.({ fsPath: '/repo/demo.vi' });

    expect(createGitPrerequisiteWatcher).toHaveBeenCalledTimes(1);
    expect(context.subscriptions as unknown[]).toContain(watcher);
    expect(watcher.getDetection).toHaveBeenCalledTimes(1);
    expect(decideOpenGate).not.toHaveBeenCalled();
    expect(presentOpenBlockedToast).not.toHaveBeenCalled();
    expect(openViHistoryHandlerMock).toHaveBeenCalledWith({ fsPath: '/repo/demo.vi' });
  });

  it('blocks VI History open from the cached LabVIEW CLI gate without re-detecting (VHS-REQ-627.6, VHS-REQ-634.3)', async () => {
    const gitWatcher = {
      dispose: vi.fn(),
      forceRefresh: vi.fn(async () => undefined),
      getDetection: vi.fn(() => ({ available: true, version: '2.46.0' }))
    };
    const cachedDetection = {
      platform: 'linux' as const,
      host: { installations: [] },
      docker: { cliAvailable: false }
    };
    const cachedSnapshot = {
      kind: 'missing' as const,
      source: 'auto-detected' as const,
      label: { provider: 'none' as const }
    };
    const runtimeWatcher = {
      dispose: vi.fn(),
      forceRefresh: vi.fn(async () => undefined),
      getLastDetection: vi.fn(() => cachedDetection),
      getLastSnapshot: vi.fn(() => cachedSnapshot)
    };
    const blockDecision = {
      kind: 'block' as const,
      toastMessage: 'VI History cannot open a comparison because the LabVIEW CLI is not installed.',
      actionLabel: 'Install LabVIEW'
    };
    vi.mocked(createGitPrerequisiteWatcher).mockReturnValueOnce(gitWatcher);
    vi.mocked(createRuntimeAvailabilityWatcher).mockReturnValueOnce(runtimeWatcher);
    vi.mocked(decideLabviewCliOpenGate).mockReturnValueOnce(blockDecision);
    const context = createContext();

    await activate(context as never);
    vi.mocked(detectAvailableRuntimes).mockClear();
    await commandHandlers.get('labviewViHistory.open')?.({ fsPath: '/repo/demo.vi' });

    expect(gitWatcher.getDetection).toHaveBeenCalledTimes(1);
    expect(decideOpenGate).toHaveBeenCalledWith({ available: true, version: '2.46.0' });
    expect(runtimeWatcher.getLastDetection).toHaveBeenCalledTimes(1);
    expect(runtimeWatcher.getLastSnapshot).toHaveBeenCalledTimes(1);
    expect(runtimeWatcher.forceRefresh).not.toHaveBeenCalled();
    expect(detectAvailableRuntimes).not.toHaveBeenCalled();
    expect(decideLabviewCliOpenGate).toHaveBeenCalledWith(
      cachedDetection,
      cachedSnapshot,
      undefined
    );
    expect(decideLabviewCliOpenGateWithRegistryFallback).toHaveBeenCalledWith(
      blockDecision,
      expect.objectContaining({ probeRegistryHostLabview: expect.any(Function) })
    );
    expect(decideOpenGate.mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(decideLabviewCliOpenGate).mock.invocationCallOrder[0]
    );
    expect(vi.mocked(decideLabviewCliOpenGate).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(decideLabviewCliOpenGateWithRegistryFallback).mock.invocationCallOrder[0]
    );
    expect(
      vi.mocked(decideLabviewCliOpenGateWithRegistryFallback).mock.invocationCallOrder[0]
    ).toBeLessThan(presentLabviewCliOpenBlockedToast.mock.invocationCallOrder[0]);
    expect(presentLabviewCliOpenBlockedToast).toHaveBeenCalledWith(blockDecision);
    expect(getBuiltInGitApiMock).not.toHaveBeenCalled();
    expect(createOpenViHistoryCommandMock).not.toHaveBeenCalled();
    expect(openViHistoryHandlerMock).not.toHaveBeenCalled();
  });

  it('blocks VI History open from the cached VI Server gate after earlier gates allow (VHS-REQ-631.4)', async () => {
    const gitWatcher = {
      dispose: vi.fn(),
      forceRefresh: vi.fn(async () => undefined),
      getDetection: vi.fn(() => ({ available: true, version: '2.46.0' }))
    };
    const cachedDetection = {
      platform: 'win32' as const,
      host: {
        installations: [
          {
            year: '2026',
            bitness: 'x64' as const,
            labviewExePath: 'C:\\Program Files\\National Instruments\\LabVIEW 2026\\LabVIEW.exe',
            labviewCliPath: 'C:\\Program Files (x86)\\National Instruments\\Shared\\LabVIEW CLI\\LabVIEWCLI.exe'
          }
        ]
      },
      docker: { cliAvailable: false }
    };
    const cachedSnapshot = {
      kind: 'available' as const,
      source: 'auto-detected' as const,
      label: { provider: 'host' as const, installation: cachedDetection.host.installations[0] }
    };
    const runtimeWatcher = {
      dispose: vi.fn(),
      forceRefresh: vi.fn(async () => undefined),
      getLastDetection: vi.fn(() => cachedDetection),
      getLastSnapshot: vi.fn(() => cachedSnapshot)
    };
    const viServerBlock = {
      kind: 'block' as const,
      toastMessage: 'VI History cannot open a comparison because VI Server is not enabled.',
      inspectedConfigPaths: ['C:\\Program Files\\National Instruments\\LabVIEW 2026\\LabVIEW.ini']
    };
    vi.mocked(createGitPrerequisiteWatcher).mockReturnValueOnce(gitWatcher);
    vi.mocked(createRuntimeAvailabilityWatcher).mockReturnValueOnce(runtimeWatcher);
    vi.mocked(decideLabviewCliOpenGate).mockReturnValueOnce({ kind: 'allow' });
    vi.mocked(decideLabviewCliOpenGateWithRegistryFallback).mockResolvedValueOnce({ kind: 'allow' });
    vi.mocked(decideViServerOpenGate).mockResolvedValueOnce(viServerBlock);

    await activate(createContext() as never);
    await commandHandlers.get('labviewViHistory.open')?.({ fsPath: '/repo/demo.vi' });

    expect(decideOpenGate).toHaveBeenCalledWith({ available: true, version: '2.46.0' });
    expect(decideLabviewCliOpenGate).toHaveBeenCalledWith(
      cachedDetection,
      cachedSnapshot,
      undefined
    );
    expect(decideViServerOpenGate).toHaveBeenCalledWith(cachedDetection, cachedSnapshot);
    expect(runtimeWatcher.forceRefresh).not.toHaveBeenCalled();
    expect(decideOpenGate.mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(decideLabviewCliOpenGate).mock.invocationCallOrder[0]
    );
    expect(
      vi.mocked(decideLabviewCliOpenGateWithRegistryFallback).mock.invocationCallOrder[0]
    ).toBeLessThan(vi.mocked(decideViServerOpenGate).mock.invocationCallOrder[0]);
    expect(vi.mocked(decideViServerOpenGate).mock.invocationCallOrder[0]).toBeLessThan(
      presentViServerOpenBlockedToast.mock.invocationCallOrder[0]
    );
    expect(presentViServerOpenBlockedToast).toHaveBeenCalledWith(viServerBlock);
    expect(getBuiltInGitApiMock).not.toHaveBeenCalled();
    expect(createOpenViHistoryCommandMock).not.toHaveBeenCalled();
    expect(openViHistoryHandlerMock).not.toHaveBeenCalled();
  });

  it('warns without resolving Git when report re-entry has no active comparison report source (VHS-REQ-638.3)', async () => {
    await activate(createContext() as never);

    const result = await commandHandlers.get('labviewViHistory.openViHistoryFromReport')?.();

    expect(result).toEqual({ outcome: 'missing-source-vi' });
    expect(showWarningMessageMock).toHaveBeenCalledWith(
      'VI History could not resolve the source file for this comparison report. Select the LabVIEW VI in the Explorer and choose VI History.'
    );
    expect(getBuiltInGitApiMock).not.toHaveBeenCalled();
  });

  it('re-opens VI History for the active report source VI by delegating to labviewViHistory.open (VHS-REQ-638.2)', async () => {
    exportRegistryActiveSourceHolder.value = { sourceViFsPath: '/repo/demo.vi' };
    await activate(createContext() as never);

    const result = await commandHandlers.get('labviewViHistory.openViHistoryFromReport')?.();

    expect(executeCommandMock).toHaveBeenCalledWith('labviewViHistory.open', {
      fsPath: '/repo/demo.vi',
      scheme: 'file'
    });
    expect(result).toEqual({
      outcome: 'reopened-vi-history',
      sourceViFsPath: '/repo/demo.vi'
    });
    expect(showWarningMessageMock).not.toHaveBeenCalled();
    // Re-entry delegates through the command surface; the report command itself
    // does not eagerly resolve Git (the delegated open runs that lazily).
    expect(getBuiltInGitApiMock).not.toHaveBeenCalled();
  });

  it('blocks VI History open with the bitness toast and does not resolve runtime when the bitness gate blocks (VHS-REQ-636.7)', async () => {
    vi.mocked(decideBitnessOpenGate).mockResolvedValueOnce({
      kind: 'block',
      toastMessage:
        'LabVIEW 2024 (32-bit) is currently open, but VI History is set to compare with LabVIEW 2026 (64-bit).',
      actionLabel: 'Pick Runtime Provider'
    });
    await activate(createContext() as never);

    await commandHandlers.get('labviewViHistory.open')?.({ fsPath: '/repo/demo.vi' });

    // The blocked gate presents its toast and returns before the panel opens.
    expect(presentBitnessOpenBlockedToast).toHaveBeenCalledTimes(1);
    expect(presentBitnessOpenBlockedToast).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'block' })
    );
    // Early return: the workspace runtime (Git API, history command) is never resolved.
    expect(getBuiltInGitApiMock).not.toHaveBeenCalled();
    expect(createOpenViHistoryCommandMock).not.toHaveBeenCalled();
    expect(openViHistoryHandlerMock).not.toHaveBeenCalled();
  });

  it('blocks VI History open with the version toast and does not resolve runtime when the version gate blocks (VHS-REQ-637.6)', async () => {
    vi.mocked(decideVersionOpenGate).mockResolvedValueOnce({
      kind: 'block',
      toastMessage:
        'LabVIEW 2024 (64-bit) is currently open, but VI History is set to compare with LabVIEW 2026 (64-bit).',
      actionLabel: 'Pick Runtime Provider'
    });
    await activate(createContext() as never);

    await commandHandlers.get('labviewViHistory.open')?.({ fsPath: '/repo/demo.vi' });

    // The version gate runs after the bitness gate; on block it presents its
    // toast and returns before the panel opens.
    expect(presentVersionOpenBlockedToast).toHaveBeenCalledTimes(1);
    expect(presentVersionOpenBlockedToast).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'block' })
    );
    expect(getBuiltInGitApiMock).not.toHaveBeenCalled();
    expect(createOpenViHistoryCommandMock).not.toHaveBeenCalled();
    expect(openViHistoryHandlerMock).not.toHaveBeenCalled();
  });

  it('keeps refreshEligibility non-enumerating and uses lazy selected-file runtime for history loading (VHS-REQ-635.2, VHS-REQ-635.5)', async () => {
    const api = await activate(createContext() as never);

    await api.refreshEligibility();
    expect(getBuiltInGitApiMock).not.toHaveBeenCalled();

    await api.loadHistory({ fsPath: '/repo/demo.vi' } as never);

    expect(getBuiltInGitApiMock).toHaveBeenCalledTimes(1);
    expect(viHistoryServiceLoadMock).toHaveBeenCalledWith({ fsPath: '/repo/demo.vi' });
    expect(api.isEligible({ fsPath: '/repo/demo.vi' } as never)).toBe(true);
  });

  it('fails closed on loadHistory in untrusted workspaces without invoking Git (VHS-REQ-012.1)', async () => {
    workspaceState.isTrusted = false;
    const api = await activate(createContext() as never);

    const model = await api.loadHistory({ fsPath: '/repo/demo.vi' } as never);

    expect(model.eligible).toBe(false);
    expect(model.relativePath).toBe('/repo/demo.vi');
    expect(getBuiltInGitApiMock).not.toHaveBeenCalled();
    expect(viHistoryServiceLoadMock).not.toHaveBeenCalled();
    expect(api.isEligible({ fsPath: '/repo/demo.vi' } as never)).toBe(false);
  });

  it('invalidates cached eligibility when viHistorySuite configuration changes so isEligible cannot go stale (#366)', async () => {
    const api = await activate(createContext() as never);

    await api.loadHistory({ fsPath: '/repo/demo.vi' } as never);
    expect(api.isEligible({ fsPath: '/repo/demo.vi' } as never)).toBe(true);

    // Two filtered config listeners register at activation: the eligibility-cache
    // invalidator and the VI Preview warming reconciler (VHS-REQ-659). Firing both
    // with a viHistorySuite change invalidates eligibility; the preview listener is
    // a no-op for this event (it filters to preview.enabled / runtimeProvider).
    expect(eligibilityEventListeners.configuration).toHaveLength(2);
    eligibilityEventListeners.configuration.forEach((listener) =>
      listener({ affectsConfiguration: (section: string) => section === 'viHistorySuite' })
    );

    expect(api.isEligible({ fsPath: '/repo/demo.vi' } as never)).toBe(false);
  });

  it('does not invalidate cached eligibility on unrelated configuration changes (#366)', async () => {
    // Regression guard: an unfiltered config listener wiped the cache on any
    // settings churn (themes, other extensions, the extension's own runtime
    // seeding on a later tick), making isEligible racy right after loadHistory.
    const api = await activate(createContext() as never);

    await api.loadHistory({ fsPath: '/repo/demo.vi' } as never);
    expect(api.isEligible({ fsPath: '/repo/demo.vi' } as never)).toBe(true);

    expect(eligibilityEventListeners.configuration).toHaveLength(2);
    eligibilityEventListeners.configuration.forEach((listener) =>
      listener({ affectsConfiguration: () => false })
    );

    expect(api.isEligible({ fsPath: '/repo/demo.vi' } as never)).toBe(true);
  });

  it('invalidates cached eligibility when workspace folders change (#366)', async () => {
    const api = await activate(createContext() as never);

    await api.loadHistory({ fsPath: '/repo/demo.vi' } as never);
    expect(api.isEligible({ fsPath: '/repo/demo.vi' } as never)).toBe(true);

    expect(eligibilityEventListeners.workspaceFolders).toHaveLength(1);
    eligibilityEventListeners.workspaceFolders.forEach((listener) => listener({}));

    expect(api.isEligible({ fsPath: '/repo/demo.vi' } as never)).toBe(false);
  });

  it('invalidates cached eligibility on a workspace-trust transition (#366)', async () => {
    const api = await activate(createContext() as never);

    await api.loadHistory({ fsPath: '/repo/demo.vi' } as never);
    expect(api.isEligible({ fsPath: '/repo/demo.vi' } as never)).toBe(true);

    // Model the real onDidGrantWorkspaceTrust semantics: VS Code only fires this
    // event on an untrusted -> trusted transition. Drop to untrusted and back to
    // trusted before invoking the listener so the final assertion runs while
    // trusted (the trust gate is not masking it) and therefore proves the cache
    // itself was cleared by the grant-trust listener.
    workspaceState.isTrusted = false;
    workspaceState.isTrusted = true;

    // Two grant-trust listeners register at activation: the eligibility-cache
    // invalidator and the VI Preview warming reconciler (VHS-REQ-659). Invoking
    // both proves the cache is cleared; the reconcile listener is a fire-and-forget
    // no-op for this assertion.
    expect(eligibilityEventListeners.grantTrust).toHaveLength(2);
    eligibilityEventListeners.grantTrust.forEach((listener) => listener());

    expect(api.isEligible({ fsPath: '/repo/demo.vi' } as never)).toBe(false);
  });

  it('never reports cached true eligibility once the workspace becomes untrusted (#366)', async () => {
    const api = await activate(createContext() as never);

    await api.loadHistory({ fsPath: '/repo/demo.vi' } as never);
    expect(api.isEligible({ fsPath: '/repo/demo.vi' } as never)).toBe(true);

    workspaceState.isTrusted = false;

    expect(api.isEligible({ fsPath: '/repo/demo.vi' } as never)).toBe(false);
  });

  it('drops a cached true when a fresh loadHistory flips the path to ineligible (#366)', async () => {
    const api = await activate(createContext() as never);

    await api.loadHistory({ fsPath: '/repo/demo.vi' } as never);
    expect(api.isEligible({ fsPath: '/repo/demo.vi' } as never)).toBe(true);

    viHistoryServiceLoadMock.mockResolvedValueOnce({ eligible: false });
    await api.loadHistory({ fsPath: '/repo/demo.vi' } as never);

    expect(api.isEligible({ fsPath: '/repo/demo.vi' } as never)).toBe(false);
  });

  it('admits documentation command in untrusted workspaces as a low-risk path (VHS-REQ-012.4)', async () => {
    workspaceState.isTrusted = false;
    await activate(createContext() as never);

    await commandHandlers.get('labviewViHistory.openDocumentation')?.();

    // VHS-REQ-611.2
    expect(bundledDocumentationActionMock).toHaveBeenCalled();
    expect(getBuiltInGitApiMock).not.toHaveBeenCalled();
    expect(showWarningMessageMock).not.toHaveBeenCalled();
  });

  it('admits CLI preparation command in untrusted workspaces as a low-risk path (VHS-REQ-012.4)', async () => {
    workspaceState.isTrusted = false;
    await activate(createContext() as never);

    await commandHandlers.get('labviewViHistory.prepareLocalRuntimeSettingsCli')?.();

    // VHS-REQ-612.5
    expect(admitLocalRuntimeSettingsCliToTerminalPathMock).toHaveBeenCalled();
    expect(getBuiltInGitApiMock).not.toHaveBeenCalled();
    expect(showWarningMessageMock).not.toHaveBeenCalled();
  });

  it('reports missing global storage before materializing the local runtime settings CLI', async () => {
    await activate(createContext({ globalStorageUri: undefined }) as never);

    const result = await commandHandlers.get('labviewViHistory.prepareLocalRuntimeSettingsCli')?.();

    // VHS-REQ-612.4
    expect(result).toEqual({ outcome: 'missing-global-storage-uri' });
    expect(admitLocalRuntimeSettingsCliToTerminalPathMock).not.toHaveBeenCalled();
    expect(showWarningMessageMock).toHaveBeenCalledWith(
      'VI History could not prepare the local runtime settings CLI because extension-global storage is unavailable.'
    );
  });

  it('resolves lazy runtime for VI History open in untrusted workspaces without starting indexing', async () => {
    // Note: In the actual implementation, VI History open resolves the workspace runtime
    // (Git API, history service) and then the handler checks trust. Since createOpenViHistoryCommand
    // is mocked here, we verify that the runtime resolution happens but the mock handler
    // does not proceed. The actual warning message behavior is verified in integration tests
    // via tests/integration/suite/extensionHost.test.ts.
    workspaceState.isTrusted = false;
    await activate(createContext() as never);

    await commandHandlers.get('labviewViHistory.open')?.({ fsPath: '/repo/demo.vi' });

    // VI History open resolves runtime even in untrusted workspaces because trust check
    // happens inside the handler. The mock handler doesn't show warnings, but it also
    // doesn't do anything. This verifies the lazy resolution still happens.
    expect(getBuiltInGitApiMock).toHaveBeenCalledTimes(1);
    expect(openViHistoryHandlerMock).toHaveBeenCalledWith({ fsPath: '/repo/demo.vi' });
  });
});

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
  workspaceState
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
    workspaceState: workspaceStateHolder
  };
});

vi.mock('vscode', () => ({
  commands: {
    registerCommand: registerCommandMock
  },
  window: {
    showInformationMessage: showInformationMessageMock,
    showWarningMessage: showWarningMessageMock
  },
  workspace: {
    get isTrusted() {
      return workspaceState.isTrusted;
    },
    getConfiguration: () => ({
      get: () => undefined
    })
  }
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

vi.mock('../../src/commands/pickRuntimeProviderCommand', () => ({
  registerPickRuntimeProviderCommand: vi.fn()
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

vi.mock('../../src/review/humanReviewSubmissionAction', () => ({
  resolveHumanReviewMachineCapability: vi.fn(() => ({ isCanonicalHostMachine: false })),
  createHumanReviewSubmissionAction: vi.fn(() => vi.fn())
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
import { createRuntimeAvailabilityWatcher } from '../../src/ui/runtimeAvailabilityNotice';

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

  it('auto-materializes the runtime CLI on activation without resolving Git or starting indexing', async () => {
    const api = await activate(createContext() as never);

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

    await commandHandlers.get('labviewViHistory.prepareLocalRuntimeSettingsCli')?.();

    // Manual prepare remains a refresh path; admission is invoked again, idempotently.
    expect(admitLocalRuntimeSettingsCliToTerminalPathMock).toHaveBeenCalledTimes(2);
    expect(getBuiltInGitApiMock).not.toHaveBeenCalled();
    expect(api.getLocalRuntimeSettingsTerminalEntrypoint()).toBe(materializedCli);
  });

  it('resolves Git and selected-file history runtime lazily for VI History open', async () => {
    const context = createContext();
    await activate(context as never);

    await commandHandlers.get('labviewViHistory.open')?.({ fsPath: '/repo/demo.vi' });

    expect(getBuiltInGitApiMock).toHaveBeenCalledTimes(1);
    expect(viHistoryServiceConstructedWith).toHaveLength(1);
    expect(createOpenViHistoryCommandMock).toHaveBeenCalledTimes(1);
    expect(openViHistoryHandlerMock).toHaveBeenCalledWith({ fsPath: '/repo/demo.vi' });
  });

  it('keeps refreshEligibility non-enumerating and uses lazy runtime for history loading', async () => {
    const api = await activate(createContext() as never);

    await api.refreshEligibility();
    expect(getBuiltInGitApiMock).not.toHaveBeenCalled();

    await api.loadHistory({ fsPath: '/repo/demo.vi' } as never);

    expect(getBuiltInGitApiMock).toHaveBeenCalledTimes(1);
    expect(viHistoryServiceLoadMock).toHaveBeenCalledWith({ fsPath: '/repo/demo.vi' });
    expect(api.isEligible({ fsPath: '/repo/demo.vi' } as never)).toBe(true);
  });

  it('fails closed on loadHistory in untrusted workspaces without invoking Git', async () => {
    workspaceState.isTrusted = false;
    const api = await activate(createContext() as never);

    const model = await api.loadHistory({ fsPath: '/repo/demo.vi' } as never);

    expect(model.eligible).toBe(false);
    expect(model.relativePath).toBe('/repo/demo.vi');
    expect(getBuiltInGitApiMock).not.toHaveBeenCalled();
    expect(viHistoryServiceLoadMock).not.toHaveBeenCalled();
    expect(api.isEligible({ fsPath: '/repo/demo.vi' } as never)).toBe(false);
  });

  it('admits documentation command in untrusted workspaces as a low-risk path', async () => {
    workspaceState.isTrusted = false;
    await activate(createContext() as never);

    await commandHandlers.get('labviewViHistory.openDocumentation')?.();

    expect(bundledDocumentationActionMock).toHaveBeenCalled();
    expect(getBuiltInGitApiMock).not.toHaveBeenCalled();
    expect(showWarningMessageMock).not.toHaveBeenCalled();
  });

  it('admits CLI preparation command in untrusted workspaces as a low-risk path', async () => {
    workspaceState.isTrusted = false;
    await activate(createContext() as never);

    await commandHandlers.get('labviewViHistory.prepareLocalRuntimeSettingsCli')?.();

    expect(admitLocalRuntimeSettingsCliToTerminalPathMock).toHaveBeenCalled();
    expect(getBuiltInGitApiMock).not.toHaveBeenCalled();
    expect(showWarningMessageMock).not.toHaveBeenCalled();
  });

  it('reports missing global storage before materializing the local runtime settings CLI', async () => {
    await activate(createContext({ globalStorageUri: undefined }) as never);

    const result = await commandHandlers.get('labviewViHistory.prepareLocalRuntimeSettingsCli')?.();

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

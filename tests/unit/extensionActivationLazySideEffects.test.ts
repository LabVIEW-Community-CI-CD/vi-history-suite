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
    registerCustomEditorProvider: vi.fn(() => ({ dispose: vi.fn() }))
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
    onDidGrantWorkspaceTrust: onDidGrantWorkspaceTrustMock
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
import {
  createRuntimeAvailabilityWatcher,
  decideBitnessOpenGate,
  decideVersionOpenGate,
  presentBitnessOpenBlockedToast,
  presentVersionOpenBlockedToast
} from '../../src/ui/runtimeAvailabilityNotice';

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

  it('auto-materializes the runtime CLI on activation without resolving Git or starting indexing (VHS-REQ-083)', async () => {
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

  it('warns without resolving Git when report re-entry has no active comparison report source (VHS-REQ-638)', async () => {
    await activate(createContext() as never);

    const result = await commandHandlers.get('labviewViHistory.openViHistoryFromReport')?.();

    expect(result).toEqual({ outcome: 'missing-source-vi' });
    expect(showWarningMessageMock).toHaveBeenCalledWith(
      'VI History could not resolve the source file for this comparison report. Select the LabVIEW VI in the Explorer and choose VI History.'
    );
    expect(getBuiltInGitApiMock).not.toHaveBeenCalled();
  });

  it('re-opens VI History for the active report source VI by delegating to labviewViHistory.open (VHS-REQ-638)', async () => {
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

  it('blocks VI History open with the bitness toast and does not resolve runtime when the bitness gate blocks (VHS-REQ-636)', async () => {
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

  it('blocks VI History open with the version toast and does not resolve runtime when the version gate blocks (VHS-REQ-637)', async () => {
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

  it('keeps refreshEligibility non-enumerating and uses lazy runtime for history loading', async () => {
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

    expect(eligibilityEventListeners.grantTrust).toHaveLength(1);
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

    expect(bundledDocumentationActionMock).toHaveBeenCalled();
    expect(getBuiltInGitApiMock).not.toHaveBeenCalled();
    expect(showWarningMessageMock).not.toHaveBeenCalled();
  });

  it('admits CLI preparation command in untrusted workspaces as a low-risk path (VHS-REQ-012.4)', async () => {
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

/**
 * Unit tests for the VI semantic MCP server provider registration.
 *
 * Requirement coverage: VHS-REQ-662 (agent MCP surface). Verifies VS Code MCP
 * server registration for Copilot agent-mode discovery (VHS-REQ-662.7).
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('vscode', async () => {
  const { defaultVsCodeTestHarness } = await import('./vscodeTestHarness');
  return defaultVsCodeTestHarness.vscode;
});

import * as vscode from 'vscode';

import {
  VI_SEMANTIC_MCP_PROVIDER_ID,
  VI_SEMANTIC_MCP_SERVER_LABEL,
  buildViSemanticMcpServerDefinitionFields,
  buildViSemanticMcpServerEnv,
  registerViSemanticMcpServerProvider,
  resolveViSemanticMcpLaunch,
  resolveViSemanticMcpServerScriptPath
} from '../../src/mcp/viSemanticMcpServerProvider';
import { defaultVsCodeTestHarness } from './vscodeTestHarness';

beforeEach(() => {
  defaultVsCodeTestHarness.reset();
});

describe('resolveViSemanticMcpServerScriptPath', () => {
  it('resolves the bundled stdio entrypoint under the extension out directory', () => {
    const resolved = resolveViSemanticMcpServerScriptPath('/opt/ext');
    expect(resolved.replace(/\\/g, '/')).toBe('/opt/ext/out/cli/runViSemanticMcpServer.js');
  });
});

describe('resolveViSemanticMcpLaunch (VHS-REQ-677.2)', () => {
  const base = {
    extensionPath: '/opt/ext',
    globalStorageDir: '/store',
    isWorkspaceTrusted: true
  };

  it('launches the bundled build by default', () => {
    const decision = resolveViSemanticMcpLaunch(
      { ...base, devToolsVersionSetting: 'bundled' },
      { existsSync: () => false }
    );
    expect(decision.scriptPath.replace(/\\/g, '/')).toBe('/opt/ext/out/cli/runViSemanticMcpServer.js');
    expect(decision.fallbackReason).toBe('');
  });

  it('launches a verified pin from global storage in a trusted workspace', () => {
    const decision = resolveViSemanticMcpLaunch(
      { ...base, devToolsVersionSetting: 'devtools-v1.2.3' },
      { existsSync: () => true }
    );
    expect(decision.scriptPath.replace(/\\/g, '/')).toBe(
      '/store/devtools/1.2.3/out/cli/runViSemanticMcpServer.js'
    );
    expect(decision.fallbackReason).toBe('');
  });

  it('fails closed to the bundled build when a pin is unverified', () => {
    const decision = resolveViSemanticMcpLaunch(
      { ...base, devToolsVersionSetting: 'devtools-v1.2.3' },
      { existsSync: () => false }
    );
    expect(decision.scriptPath.replace(/\\/g, '/')).toBe('/opt/ext/out/cli/runViSemanticMcpServer.js');
    // The pinned-install-missing reason drives the extension's actionable
    // "install pinned dev-tools" notification (VHS-REQ-679.5) while the launch
    // stays on the bundled build.
    expect(decision.fallbackReason).toBe('pinned-install-missing');
  });

  it('fails closed to the bundled build in an untrusted workspace', () => {
    const decision = resolveViSemanticMcpLaunch(
      { ...base, isWorkspaceTrusted: false, devToolsVersionSetting: 'devtools-v1.2.3' },
      { existsSync: () => true }
    );
    expect(decision.scriptPath.replace(/\\/g, '/')).toBe('/opt/ext/out/cli/runViSemanticMcpServer.js');
    expect(decision.fallbackReason).toBe('workspace-not-trusted');
  });

  it('fails closed to the bundled build on a malformed setting', () => {
    const decision = resolveViSemanticMcpLaunch(
      { ...base, devToolsVersionSetting: 'latest' },
      { existsSync: () => true }
    );
    expect(decision.scriptPath.replace(/\\/g, '/')).toBe('/opt/ext/out/cli/runViSemanticMcpServer.js');
  });
});

describe('buildViSemanticMcpServerDefinitionFields', () => {
  it('builds stdio fields launching the entrypoint with the given node runtime', () => {
    const fields = buildViSemanticMcpServerDefinitionFields({
      extensionPath: '/opt/ext',
      execPath: '/usr/bin/node',
      version: '1.2.3'
    });

    expect(fields.label).toBe(VI_SEMANTIC_MCP_SERVER_LABEL);
    expect(fields.command).toBe('/usr/bin/node');
    expect(fields.args.map((arg) => arg.replace(/\\/g, '/'))).toEqual([
      '/opt/ext/out/cli/runViSemanticMcpServer.js'
    ]);
    expect(fields.version).toBe('1.2.3');
  });

  it('omits the version when it is not supplied', () => {
    const fields = buildViSemanticMcpServerDefinitionFields({
      extensionPath: '/opt/ext',
      execPath: '/usr/bin/node'
    });

    expect(fields.version).toBeUndefined();
  });

  it('forwards VIHS_SEMANTICS_PROVIDER=lvkit in the env when the lvkit provider is selected', () => {
    const fields = buildViSemanticMcpServerDefinitionFields({
      extensionPath: '/opt/ext',
      execPath: '/usr/bin/node',
      semanticsProvider: 'lvkit'
    });

    expect(fields.env).toEqual({ VIHS_SEMANTICS_PROVIDER: 'lvkit' });
  });

  it('sets VIHS_SEMANTICS_PROVIDER=labview explicitly for the default provider', () => {
    const fields = buildViSemanticMcpServerDefinitionFields({
      extensionPath: '/opt/ext',
      execPath: '/usr/bin/node',
      semanticsProvider: 'labview'
    });

    // Explicit (not empty) so an inherited VIHS_SEMANTICS_PROVIDER=lvkit cannot leak through.
    expect(fields.env).toEqual({ VIHS_SEMANTICS_PROVIDER: 'labview' });
  });
});

describe('buildViSemanticMcpServerEnv', () => {
  it('forwards only the opt-in lvkit provider (case-insensitive, trimmed)', () => {
    expect(buildViSemanticMcpServerEnv('lvkit')).toEqual({ VIHS_SEMANTICS_PROVIDER: 'lvkit' });
    expect(buildViSemanticMcpServerEnv('LVKIT')).toEqual({ VIHS_SEMANTICS_PROVIDER: 'lvkit' });
    expect(buildViSemanticMcpServerEnv('  lvkit  ')).toEqual({ VIHS_SEMANTICS_PROVIDER: 'lvkit' });
  });

  it('sets the provider to labview explicitly for labview, unset, or unknown values', () => {
    // Deterministic override: the setting always wins over an inherited env var.
    expect(buildViSemanticMcpServerEnv('labview')).toEqual({ VIHS_SEMANTICS_PROVIDER: 'labview' });
    expect(buildViSemanticMcpServerEnv(undefined)).toEqual({ VIHS_SEMANTICS_PROVIDER: 'labview' });
    expect(buildViSemanticMcpServerEnv('something-else')).toEqual({ VIHS_SEMANTICS_PROVIDER: 'labview' });
  });
});

describe('registerViSemanticMcpServerProvider', () => {
  it('registers the provider under the manifest provider id and tracks the disposable', () => {
    const context = defaultVsCodeTestHarness.createContext();

    const disposable = registerViSemanticMcpServerProvider(
      context as unknown as vscode.ExtensionContext
    );

    expect(disposable).toBeDefined();
    expect(context.subscriptions).toContain(disposable);
    expect(defaultVsCodeTestHarness.registeredMcpProviders.has(VI_SEMANTIC_MCP_PROVIDER_ID)).toBe(
      true
    );
  });

  it('provides a stdio server definition launching the bundled entrypoint with the extension version', () => {
    const context = defaultVsCodeTestHarness.createContext();
    registerViSemanticMcpServerProvider(context as unknown as vscode.ExtensionContext);

    const provider = defaultVsCodeTestHarness.registeredMcpProviders.get(
      VI_SEMANTIC_MCP_PROVIDER_ID
    ) as vscode.McpServerDefinitionProvider;
    const definitions = provider.provideMcpServerDefinitions({
      isCancellationRequested: false,
      onCancellationRequested: vi.fn()
    } as unknown as vscode.CancellationToken) as unknown as vscode.McpStdioServerDefinition[];

    expect(definitions).toHaveLength(1);
    expect(definitions[0]!.label).toBe(VI_SEMANTIC_MCP_SERVER_LABEL);
    expect(definitions[0]!.command).toBe(process.execPath);
    expect(definitions[0]!.args.map((arg) => arg.replace(/\\/g, '/'))).toEqual([
      '/workspace/vi-history-suite/out/cli/runViSemanticMcpServer.js'
    ]);
    expect(definitions[0]!.version).toBe('0.0.0-test');
  });

  it('forwards the lvkit provider setting into the launched server env', () => {
    const context = defaultVsCodeTestHarness.createContext();
    const getConfiguration = vscode.workspace.getConfiguration as unknown as ReturnType<typeof vi.fn>;
    const original = getConfiguration.getMockImplementation();
    // The registration reads `viHistorySuite.semantics.provider`; forward lvkit.
    getConfiguration.mockImplementation(() => ({
      get: (key: string, def?: unknown) => (key === 'semantics.provider' ? 'lvkit' : def),
      update: vi.fn()
    }));

    try {
      registerViSemanticMcpServerProvider(context as unknown as vscode.ExtensionContext);
      const provider = defaultVsCodeTestHarness.registeredMcpProviders.get(
        VI_SEMANTIC_MCP_PROVIDER_ID
      ) as vscode.McpServerDefinitionProvider;
      const definitions = provider.provideMcpServerDefinitions({
        isCancellationRequested: false,
        onCancellationRequested: vi.fn()
      } as unknown as vscode.CancellationToken) as unknown as Array<
        vscode.McpStdioServerDefinition & { env: Record<string, string> }
      >;

      expect(definitions[0]!.env).toEqual({ VIHS_SEMANTICS_PROVIDER: 'lvkit' });
    } finally {
      if (original) {
        getConfiguration.mockImplementation(original);
      }
    }
  });

  it('is a no-op on hosts without the stable MCP provider API', () => {
    const context = defaultVsCodeTestHarness.createContext();
    const lm = (vscode as unknown as { lm: { registerMcpServerDefinitionProvider?: unknown } }).lm;
    const original = lm.registerMcpServerDefinitionProvider;
    lm.registerMcpServerDefinitionProvider = undefined;

    try {
      const disposable = registerViSemanticMcpServerProvider(
        context as unknown as vscode.ExtensionContext
      );

      expect(disposable).toBeUndefined();
      expect(context.subscriptions).toHaveLength(0);
    } finally {
      lm.registerMcpServerDefinitionProvider = original;
    }
  });
});

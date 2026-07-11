/**
 * Unit tests for the VI semantic MCP server provider registration.
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
  registerViSemanticMcpServerProvider,
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

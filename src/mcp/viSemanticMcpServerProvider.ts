/**
 * VS Code registration for the VI semantic comparison MCP server.
 *
 * The semantic platform (`src/semantic/*`) exposes a dependency-free JSON-RPC
 * MCP handler over a stdio entrypoint (`src/cli/runViSemanticMcpServer.ts`).
 * This module makes that server discoverable inside VS Code by registering an
 * MCP server definition provider, so Copilot agent mode can launch it and call
 * its tools. The definition launches the bundled entrypoint with the editor's
 * own Node runtime (`process.execPath`), matching the VS Code MCP API guidance.
 */

import * as path from 'node:path';

import * as vscode from 'vscode';

/**
 * Provider id shared between the `contributes.mcpServerDefinitionProviders`
 * manifest entry and the runtime `registerMcpServerDefinitionProvider` call.
 * The two must match for VS Code to bind the contribution to the provider.
 */
export const VI_SEMANTIC_MCP_PROVIDER_ID = 'viHistorySuiteSemantic';

/** Human-readable label shown for the contributed MCP server. */
export const VI_SEMANTIC_MCP_SERVER_LABEL = 'VI History Suite: VI Semantic Comparison';

/**
 * Path segments, relative to the extension install root, of the bundled stdio
 * MCP server entrypoint emitted by the TypeScript build.
 */
export const VI_SEMANTIC_MCP_SERVER_SCRIPT_SEGMENTS = [
  'out',
  'cli',
  'runViSemanticMcpServer.js'
] as const;

/**
 * Resolves the absolute path to the bundled MCP server entrypoint for an
 * extension installed at `extensionPath`.
 */
export function resolveViSemanticMcpServerScriptPath(extensionPath: string): string {
  return path.join(extensionPath, ...VI_SEMANTIC_MCP_SERVER_SCRIPT_SEGMENTS);
}

/** Plain description of the stdio server definition (VS Code class-free). */
export interface ViSemanticMcpServerDefinitionFields {
  readonly label: string;
  readonly command: string;
  readonly args: string[];
  readonly version?: string;
}

/**
 * Builds the fields of the stdio MCP server definition. Kept free of the VS Code
 * `McpStdioServerDefinition` class so the shape is unit-testable in isolation.
 */
export function buildViSemanticMcpServerDefinitionFields(options: {
  readonly extensionPath: string;
  readonly execPath: string;
  readonly version?: string;
}): ViSemanticMcpServerDefinitionFields {
  return {
    label: VI_SEMANTIC_MCP_SERVER_LABEL,
    command: options.execPath,
    args: [resolveViSemanticMcpServerScriptPath(options.extensionPath)],
    version: options.version
  };
}

/**
 * Registers the VI semantic MCP server definition provider with VS Code.
 *
 * Guarded for hosts predating the stable MCP API (VS Code 1.101): when
 * `vscode.lm.registerMcpServerDefinitionProvider` is unavailable the function is
 * a no-op and returns `undefined`. On success the disposable is pushed to the
 * extension subscriptions and also returned for direct disposal in tests.
 */
export function registerViSemanticMcpServerProvider(
  context: vscode.ExtensionContext
): vscode.Disposable | undefined {
  const registrar = vscode.lm?.registerMcpServerDefinitionProvider;
  if (typeof registrar !== 'function') {
    return undefined;
  }

  const fields = buildViSemanticMcpServerDefinitionFields({
    extensionPath: context.extensionPath,
    execPath: process.execPath,
    version: context.extension?.packageJSON?.version as string | undefined
  });

  const provider: vscode.McpServerDefinitionProvider = {
    provideMcpServerDefinitions: () => [
      new vscode.McpStdioServerDefinition(
        fields.label,
        fields.command,
        fields.args,
        {},
        fields.version
      )
    ]
  };

  const disposable = vscode.lm.registerMcpServerDefinitionProvider(
    VI_SEMANTIC_MCP_PROVIDER_ID,
    provider
  );
  context.subscriptions.push(disposable);
  return disposable;
}

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

import * as fs from 'node:fs';
import * as path from 'node:path';

import * as vscode from 'vscode';

import {
  DEVTOOLS_MCP_SERVER_SCRIPT_SEGMENTS,
  decideDevToolsLaunch,
  normalizeDevToolsVersionSetting,
  type DevToolsMcpLaunchResolution
} from '../tooling/devToolsResolver';

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

/**
 * Filename of the marker written into a pinned dev-tools install directory once
 * its integrity has been verified (VHS-REQ-677). The MCP launch treats a pinned
 * version as usable only when this marker is present.
 */
export const DEVTOOLS_VERIFIED_MARKER = '.vihs-devtools-verified.json';

/** True when a pinned dev-tools version is installed and integrity-verified. */
export function isVerifiedDevToolsInstall(
  installBaseDir: string,
  version: string,
  deps: { readonly existsSync: (p: string) => boolean } = { existsSync: fs.existsSync }
): boolean {
  return deps.existsSync(path.join(installBaseDir, version, DEVTOOLS_VERIFIED_MARKER));
}

export interface ViSemanticMcpLaunchContext {
  readonly extensionPath: string;
  readonly globalStorageDir: string;
  readonly isWorkspaceTrusted: boolean;
  readonly devToolsVersionSetting?: string;
}

export interface ViSemanticMcpLaunchDecision {
  readonly scriptPath: string;
  readonly resolution: DevToolsMcpLaunchResolution;
  /** Stable reason the bundled build was used despite a pin (empty otherwise). */
  readonly fallbackReason: string;
}

/**
 * Resolves which MCP entrypoint to launch for a VS Code context. A `bundled`
 * setting (or an unparseable one) launches the shipped build. A pinned version
 * launches from its verified global-storage install; if the pin is missing,
 * unverified, or the workspace is untrusted, it FAILS CLOSED to the bundled
 * build (never launching unverified pinned code) and reports why via
 * `fallbackReason`. Pure over the injected `existsSync` probe.
 */
export function resolveViSemanticMcpLaunch(
  context: ViSemanticMcpLaunchContext,
  deps: { readonly existsSync: (p: string) => boolean } = { existsSync: fs.existsSync }
): ViSemanticMcpLaunchDecision {
  let selection;
  try {
    selection = normalizeDevToolsVersionSetting(context.devToolsVersionSetting);
  } catch {
    // Malformed setting: fail closed to bundled rather than launching nothing.
    selection = { kind: 'bundled' as const };
  }
  const installBaseDir = path.join(context.globalStorageDir, 'devtools');
  const decision = decideDevToolsLaunch({
    selection,
    bundledRootPath: context.extensionPath,
    installBaseDir,
    isWorkspaceTrusted: context.isWorkspaceTrusted,
    isVerifiedInstall: (version) => isVerifiedDevToolsInstall(installBaseDir, version, deps)
  });
  if (decision.status === 'ready') {
    return { scriptPath: decision.resolution.scriptPath, resolution: decision.resolution, fallbackReason: '' };
  }
  return {
    scriptPath: path.join(context.extensionPath, ...DEVTOOLS_MCP_SERVER_SCRIPT_SEGMENTS),
    resolution: decision.resolution,
    fallbackReason: decision.reason
  };
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
  readonly scriptPath?: string;
}): ViSemanticMcpServerDefinitionFields {
  return {
    label: VI_SEMANTIC_MCP_SERVER_LABEL,
    command: options.execPath,
    args: [options.scriptPath ?? resolveViSemanticMcpServerScriptPath(options.extensionPath)],
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
    version: context.extension?.packageJSON?.version as string | undefined,
    scriptPath: resolveViSemanticMcpLaunch({
      extensionPath: context.extensionPath,
      globalStorageDir: context.globalStorageUri.fsPath,
      isWorkspaceTrusted: vscode.workspace.isTrusted,
      devToolsVersionSetting: vscode.workspace
        .getConfiguration('viHistorySuite')
        .get<string>('devTools.version')
    }).scriptPath
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

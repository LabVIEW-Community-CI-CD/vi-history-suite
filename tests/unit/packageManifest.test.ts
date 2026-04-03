import * as fs from 'node:fs';
import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

interface ExtensionManifest {
  activationEvents?: string[];
  extensionDependencies?: string[];
  scripts?: Record<string, string>;
  capabilities?: {
    untrustedWorkspaces?: {
      supported?: string;
      description?: string;
      restrictedConfigurations?: string[];
    };
  };
  contributes?: {
    commands?: Array<{
      command?: string;
      title?: string;
      category?: string;
    }>;
    configuration?: {
      title?: string;
      properties?: Record<string, unknown>;
    };
    menus?: Record<
      string,
      Array<{
        command?: string;
        group?: string;
        when?: string;
      }>
    >;
  };
}

function readManifest(): ExtensionManifest {
  const manifestPath = path.resolve(__dirname, '..', '..', 'package.json');
  return JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as ExtensionManifest;
}

describe('extension manifest research alignment', () => {
  it('uses the authoritative labviewViHistory command id and activation event', () => {
    const manifest = readManifest();

    expect(manifest.activationEvents).toContain('onStartupFinished');
    expect(manifest.activationEvents).toContain('onCommand:labviewViHistory.open');
    expect(manifest.extensionDependencies).toContain('vscode.git');
    expect(manifest.contributes?.commands).toContainEqual({
      command: 'labviewViHistory.open',
      title: 'VI History',
      category: 'VI History'
    });
  });

  it('contributes the authoritative visibility gate in explorer and editor title menus', () => {
    const manifest = readManifest();
    const expectedMenuEntry = {
      command: 'labviewViHistory.open',
      group: '3_compare',
      when: 'resourcePath in labviewViHistory.eligiblePaths && isWorkspaceTrusted && gitOpenRepositoryCount >= 1'
    };

    expect(manifest.contributes?.menus?.['explorer/context']).toContainEqual(expectedMenuEntry);
    expect(manifest.contributes?.menus?.['editor/title/context']).toContainEqual(
      expectedMenuEntry
    );
  });

  it('declares limited untrusted-workspace support and restricts external tool settings', () => {
    const manifest = readManifest();

    expect(manifest.capabilities?.untrustedWorkspaces).toEqual({
      supported: 'limited',
      description:
        'VI History disables background indexing and external LabVIEW comparison-tool execution in untrusted workspaces.',
      restrictedConfigurations: [
        'viHistorySuite.labviewCliPath',
        'viHistorySuite.lvComparePath',
        'viHistorySuite.labviewExePath',
        'viHistorySuite.windowsContainerImage',
        'viHistorySuite.preferBitness'
      ]
    });

    expect(manifest.contributes?.configuration?.properties).toHaveProperty(
      'viHistorySuite.labviewCliPath'
    );
    expect(manifest.contributes?.configuration?.properties).toHaveProperty(
      'viHistorySuite.windowsContainerImage'
    );
  });

  it('exposes the fast local VS Code loop, docs-package workbench, and preview refresh scripts', () => {
    const manifest = readManifest();

    expect(manifest.scripts?.['dev:watch']).toBe('tsc -p . --watch --preserveWatchOutput');
    expect(manifest.scripts?.['dev:workspace']).toContain('runDevHost.js --prepare-workspace-only');
    expect(manifest.scripts?.['dev:host']).toContain('runDevHost.js');
    expect(manifest.scripts?.['docs:gate']).toBe('node scripts/run-docs-gate.js');
    expect(manifest.scripts?.['docs:gate:core']).toBe(
      'node scripts/run-docs-gate.js --skip-links'
    );
    expect(manifest.scripts?.['docs:workbench:build']).toContain(
      'docker/docs-authoring/Dockerfile'
    );
    expect(manifest.scripts?.['docs:workbench:gate']).toContain(
      'vi-history-suite-docs-authoring:local npm run docs:gate'
    );
    expect(manifest.scripts?.['docs:workbench:shell']).toContain(
      'vi-history-suite-docs-authoring:local bash'
    );
    expect(manifest.scripts?.['test:integration:linux']).toBe(
      'VI_HISTORY_SUITE_INTEGRATION_HOST=linux npm run test:integration'
    );
    expect(manifest.scripts?.['test:integration:windows']).toBe(
      'VI_HISTORY_SUITE_INTEGRATION_HOST=windows npm run test:integration'
    );
    expect(manifest.scripts?.['preview:refresh']).toContain('preview-evidence');
    expect(manifest.scripts?.['preview:refresh']).toContain('/mnt/c/Users/sveld/Downloads');
  });
});

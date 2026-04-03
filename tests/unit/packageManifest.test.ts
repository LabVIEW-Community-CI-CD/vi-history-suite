import * as fs from 'node:fs';
import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

interface ExtensionManifest {
  activationEvents?: string[];
  extensionDependencies?: string[];
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
});

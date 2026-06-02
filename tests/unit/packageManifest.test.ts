import * as fs from 'node:fs';
import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

interface ExtensionManifest {
  name?: string;
  displayName?: string;
  version?: string;
  publisher?: string;
  license?: string;
  private?: boolean;
  icon?: string;
  main?: string;
  browser?: string;
  extensionKind?: string[];
  activationEvents?: string[];
  files?: string[];
  homepage?: string;
  repository?: {
    type?: string;
    url?: string;
  };
  bugs?: {
    url?: string;
  };
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
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

describe('extension manifest public metadata', () => {
  it('preserves the Marketplace identity while moving source metadata to the org repo', () => {
    const manifest = readManifest();

    expect(manifest.name).toBe('vi-history-suite');
    expect(manifest.displayName).toBe('VI History Suite');
    expect(manifest.version).toBe('1.9.2');
    expect(manifest.publisher).toBe('svelderrainruiz');
    expect(manifest.license).toBe('0BSD');
    expect(manifest.private).toBe(true);
    expect(manifest.repository).toEqual({
      type: 'git',
      url: 'https://github.com/LabVIEW-Community-CI-CD/vi-history-suite.git'
    });
    expect(manifest.homepage).toBe(
      'https://github.com/LabVIEW-Community-CI-CD/vi-history-suite#readme'
    );
    expect(manifest.bugs).toEqual({
      url: 'https://github.com/LabVIEW-Community-CI-CD/vi-history-suite/issues'
    });
  });

  it('activates on startup plus explicit commands without manifest-level Git activation', () => {
    const manifest = readManifest();

    expect(manifest.files).toEqual([
      'out/**',
      'node_modules/jsonc-parser/**',
      'resources/**',
      'README.md',
      'CHANGELOG.md',
      'LICENSE'
    ]);
    expect(manifest.icon).toBe('resources/marketplace/vi-history-suite-icon.png');
    expect(manifest.activationEvents).toContain('onStartupFinished');
    expect(manifest.activationEvents).toContain('onCommand:labviewViHistory.open');
    expect(manifest.activationEvents).toContain(
      'onCommand:labviewViHistory.prepareLocalRuntimeSettingsCli'
    );
    expect(manifest.activationEvents).toContain('onCommand:labviewViHistory.openDocumentation');
    expect(manifest.activationEvents).toContain(
      'onCommand:labviewViHistory.detectRuntimeNow'
    );
    expect(manifest.activationEvents).toContain(
      'onCommand:labviewViHistory.resetFirstRunNotice'
    );
    expect(manifest.activationEvents).toContain(
      'onCommand:labviewViHistory.showRuntimeSummary'
    );
    expect(manifest.activationEvents).toContain(
      'onCommand:labviewViHistory.pickRuntimeProvider'
    );
    expect(manifest.extensionDependencies ?? []).not.toContain('vscode.git');
  });

  it('contributes the runtime convenience commands under the VI History category', () => {
    const manifest = readManifest();
    const commands = manifest.contributes?.commands ?? [];
    const titles = new Map(commands.map((entry) => [entry.command ?? '', entry]));

    expect(titles.get('labviewViHistory.detectRuntimeNow')).toMatchObject({
      title: 'Detect Runtime Now',
      category: 'VI History'
    });
    expect(titles.get('labviewViHistory.resetFirstRunNotice')).toMatchObject({
      title: 'Reset First-Run Runtime Notice',
      category: 'VI History'
    });
    expect(titles.get('labviewViHistory.showRuntimeSummary')).toMatchObject({
      title: 'Show Runtime Summary',
      category: 'VI History'
    });
    expect(titles.get('labviewViHistory.pickRuntimeProvider')).toMatchObject({
      title: 'Pick Runtime Provider',
      category: 'VI History'
    });
  });

  it('contributes the visibility gate in explorer and editor title menus', () => {    const manifest = readManifest();
    const expectedMenuEntry = {
      command: 'labviewViHistory.open',
      group: '3_compare',
      when:
        '(resourceExtname == .vi || resourceExtname == .ctl || resourceExtname == .vit) && isWorkspaceTrusted'
    };

    expect(manifest.contributes?.menus?.['explorer/context']).toContainEqual(expectedMenuEntry);
    expect(manifest.contributes?.menus?.['editor/title/context']).toContainEqual(
      expectedMenuEntry
    );
  });

  it('keeps desktop extension boundaries and runtime settings configuration', () => {
    const manifest = readManifest();

    expect(manifest.main).toBe('./out/extension.js');
    expect(manifest.browser).toBeUndefined();
    expect(manifest.extensionKind ?? []).not.toContain('web');
    expect(manifest.capabilities?.untrustedWorkspaces).toEqual({
      supported: 'limited',
      description:
        'VI History disables background indexing and comparison execution in untrusted workspaces to prevent external process execution. Documentation and local runtime settings CLI preparation remain available.',
      restrictedConfigurations: [
        'viHistorySuite.runtimeProvider',
        'viHistorySuite.labviewVersion',
        'viHistorySuite.labviewBitness'
      ]
    });
    expect(manifest.contributes?.configuration?.properties).toHaveProperty(
      'viHistorySuite.runtimeProvider'
    );
    expect(manifest.contributes?.configuration?.properties).toHaveProperty(
      'viHistorySuite.labviewVersion'
    );
    expect(manifest.contributes?.configuration?.properties).toHaveProperty(
      'viHistorySuite.labviewBitness'
    );
  });

  it('keeps the simplified development, CI, package, and optional Vagrant scripts', () => {
    const manifest = readManifest();

    expect(manifest.dependencies ?? {}).toEqual({
      'jsonc-parser': expect.any(String)
    });
    expect(manifest.devDependencies).toHaveProperty('@vscode/vsce', '3.9.1');
    expect(manifest.scripts).toMatchObject({
      clean: 'rimraf out out-tests coverage',
      compile: 'tsc -p . && node scripts/generateBuildInfo.js',
      check: 'tsc -p . --noEmit',
      test: 'vitest run --coverage',
      package: 'npm run compile && npm run package:audit && node scripts/runPinnedVsce.js package',
      'vagrant:validate': 'cd vagrant && vagrant validate',
      'public:fixture:icon-editor': 'node scripts/preparePublicTestFixture.js',
      'public:repo:clone': 'node scripts/preparePublicRepoClone.js'
    });
    expect(manifest.scripts).not.toHaveProperty('gitlab:private-release:publish');
    expect(manifest.scripts).not.toHaveProperty('public:source:promote');
    expect(manifest.scripts).not.toHaveProperty('acceptance:windows:private-release');
    expect(manifest.scripts).not.toHaveProperty('test:design-contract');
  });
});

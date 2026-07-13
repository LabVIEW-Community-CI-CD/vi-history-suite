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
  engines?: {
    vscode?: string;
  };
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
    mcpServerDefinitionProviders?: Array<{
      id?: string;
      label?: string;
    }>;
    commands?: Array<{
      command?: string;
      title?: string;
      category?: string;
    }>;
    configuration?: {
      title?: string;
      properties?: Record<string, { type?: string; default?: unknown } | unknown>;
    };
    menus?: Record<
      string,
      Array<{
        command?: string;
        group?: string;
        when?: string;
      }>
    >;
    customEditors?: Array<{
      viewType?: string;
      displayName?: string;
      selector?: Array<{ filenamePattern?: string }>;
      priority?: string;
    }>;
  };
}

function readManifest(): ExtensionManifest {
  const manifestPath = path.resolve(__dirname, '..', '..', 'package.json');
  return JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as ExtensionManifest;
}

function readRepoText(...segments: string[]): string {
  return fs.readFileSync(path.resolve(__dirname, '..', '..', ...segments), 'utf8');
}

describe('extension manifest public metadata', () => {
  it('preserves the Marketplace identity while moving source metadata to the org repo', () => {
    const manifest = readManifest();

    // VHS-REQ-600.1, VHS-REQ-600.2, VHS-REQ-600.3, VHS-REQ-600.4
    expect(manifest.name).toBe('vi-history-suite');
    expect(manifest.displayName).toBe('VI History Suite');
    expect(manifest.version).toBe('1.33.2');
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

  it('bumps the engine floor to the stable MCP provider API and contributes the VI semantic MCP server', () => {
    const manifest = readManifest();

    // The MCP server definition provider API is stable as of VS Code 1.101, so
    // the engine and @types/vscode floor must not regress below it.
    expect(manifest.engines?.vscode).toBe('^1.101.0');
    expect(manifest.devDependencies?.['@types/vscode']).toBe('^1.101.0');

    const providers = manifest.contributes?.mcpServerDefinitionProviders ?? [];
    expect(providers).toContainEqual({
      id: 'viHistorySuiteSemantic',
      label: 'VI History Suite: VI Semantic Comparison'
    });
  });

  it('activates on startup without redundant per-command activation events or manifest-level Git activation (VHS-REQ-082.1, VHS-REQ-082.2, VHS-REQ-083.1, VHS-REQ-083.2)', () => {
    const manifest = readManifest();

    // VHS-REQ-611.4
    expect(manifest.files).toEqual([
      'out/**',
      'node_modules/jsonc-parser/**',
      'resources/**',
      'README.md',
      'CHANGELOG.md',
      'LICENSE'
    ]);
    expect(manifest.icon).toBe('resources/marketplace/vi-history-suite-icon.png');
    // VHS-REQ-083.1: onStartupFinished is the *only* explicit activation event, so
    // the eager `*` startup activation cannot be reintroduced without failing here.
    expect(manifest.activationEvents).toEqual(['onStartupFinished']);
    // VHS-REQ-083.2: VS Code auto-infers onCommand activation from contributes.commands,
    // so explicit onCommand:* activation events are redundant advisories and
    // must not be reintroduced into the manifest.
    const redundantCommandActivations = (manifest.activationEvents ?? []).filter(
      (event) => event.startsWith('onCommand:')
    );
    expect(redundantCommandActivations).toEqual([]);
    // VHS-REQ-611.1, VHS-REQ-612.1
    // VHS-REQ-082.1, VHS-REQ-082.2: the commands that previously carried explicit activation events remain
    // contributed, so VS Code still activates the extension on first invocation
    // of labviewViHistory.open, labviewViHistory.openDocumentation,
    // labviewViHistory.prepareLocalRuntimeSettingsCli, and the runtime commands.
    const contributedCommandIds = (manifest.contributes?.commands ?? []).map(
      (entry) => entry.command
    );
    expect(contributedCommandIds).toEqual(
      expect.arrayContaining([
        'labviewViHistory.open',
        'labviewViHistory.openDocumentation',
        // VHS-REQ-039.1: the copied review packet remains available as a contributed command.
        'labviewViHistory.copyReviewPacket',
        'labviewViHistory.prepareLocalRuntimeSettingsCli',
        'labviewViHistory.detectRuntimeNow',
        'labviewViHistory.resetFirstRunNotice',
        'labviewViHistory.showRuntimeSummary',
        'labviewViHistory.pickRuntimeProvider',
        'labviewViHistory.exportComparisonReport'
      ])
    );
    expect(manifest.extensionDependencies ?? []).not.toContain('vscode.git');
  });

  it('contributes the runtime convenience commands under the VI History category (VHS-REQ-617.6)', () => {
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
      title: 'Runtime & Report Settings',
      category: 'VI History'
    });
  });

  it('contributes the visibility gate in explorer and editor title menus (VHS-REQ-004.1, VHS-REQ-004.2, VHS-REQ-004.3, VHS-REQ-013.1)', () => {
    const manifest = readManifest();
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

  it('contributes comparison report title-bar actions while the report panel is active (VHS-REQ-626.1, VHS-REQ-638.1)', () => {
    const manifest = readManifest();
    const commands = manifest.contributes?.commands ?? [];
    const titles = new Map(commands.map((entry) => [entry.command ?? '', entry]));

    expect(titles.get('labviewViHistory.openViHistoryFromReport')).toMatchObject({
      title: 'Open VI History',
      category: 'VI History'
    });
    expect(titles.get('labviewViHistory.exportComparisonReport')).toMatchObject({
      title: 'Export Comparison Report (HTML)',
      category: 'VI History'
    });

    expect(manifest.contributes?.menus?.['editor/title']).toContainEqual({
      command: 'labviewViHistory.openViHistoryFromReport',
      group: 'navigation',
      when: 'activeWebviewPanelId == viHistorySuite.comparisonReport'
    });
    expect(manifest.contributes?.menus?.['editor/title']).toContainEqual({
      command: 'labviewViHistory.exportComparisonReport',
      group: 'navigation',
      when: 'activeWebviewPanelId == viHistorySuite.comparisonReport'
    });
    expect(manifest.contributes?.menus?.['commandPalette']).toContainEqual({
      command: 'labviewViHistory.openViHistoryFromReport',
      when: 'activeWebviewPanelId == viHistorySuite.comparisonReport'
    });
  });

  it('keeps desktop extension boundaries and runtime settings configuration (VHS-REQ-084.1, VHS-REQ-084.2, VHS-REQ-084.3, VHS-REQ-012.3, VHS-REQ-633.1, VHS-REQ-649.1)', () => {
    const manifest = readManifest();

    expect(manifest.main).toBe('./out/extension.js');
    expect(manifest.browser).toBeUndefined();
    expect(manifest.extensionKind ?? []).not.toContain('web');
    expect(manifest.capabilities?.untrustedWorkspaces).toEqual({
      supported: 'limited',
      description:
        'VI History disables selected-file history evaluation and comparison execution in untrusted workspaces to prevent external process execution. Documentation and local runtime settings CLI preparation remain available.',
      restrictedConfigurations: [
        'viHistorySuite.runtimeProvider',
        'viHistorySuite.labviewVersion',
        'viHistorySuite.labviewBitness',
        'viHistorySuite.labviewExePath',
        'viHistorySuite.labviewCliPath',
        'viHistorySuite.container.imageVersion'
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
    expect(manifest.contributes?.configuration?.properties).toHaveProperty(
      'viHistorySuite.labviewExePath'
    );
    expect(manifest.contributes?.configuration?.properties).toHaveProperty(
      'viHistorySuite.labviewCliPath'
    );
    expect(manifest.contributes?.configuration?.properties?.['viHistorySuite.labviewExePath']).toMatchObject({
      type: 'string'
    });
    expect(manifest.contributes?.configuration?.properties?.['viHistorySuite.labviewCliPath']).toMatchObject({
      type: 'string'
    });
    const containerImageVersionSetting = manifest.contributes?.configuration?.properties?.[
      'viHistorySuite.container.imageVersion'
    ] as { type?: string; default?: unknown } | undefined;
    expect(containerImageVersionSetting).toMatchObject({ type: 'string' });
    expect(containerImageVersionSetting).not.toHaveProperty('default');
  });

  it('contributes native comparison report suppression settings without a report format setting (VHS-REQ-645.1, VHS-REQ-645.4)', () => {
    const manifest = readManifest();
    const properties = manifest.contributes?.configuration?.properties ?? {};

    for (const key of [
      'viHistorySuite.report.ignoreViAttributes',
      'viHistorySuite.report.ignoreFrontPanel',
      'viHistorySuite.report.ignoreFrontPanelObjectPosition',
      'viHistorySuite.report.ignoreBlockDiagram',
      'viHistorySuite.report.ignoreBlockDiagramCosmetic'
    ]) {
      expect(properties[key]).toMatchObject({ type: 'boolean' });
    }
    expect(properties).not.toHaveProperty('viHistorySuite.report.format');
  });

  it('keeps the container image picker out of contributed command surfaces (VHS-REQ-651.5)', () => {
    const manifest = readManifest();
    const contributedCommands = (manifest.contributes?.commands ?? []).map(
      (entry) => entry.command
    );
    const commandPaletteEntries = (manifest.contributes?.menus?.['commandPalette'] ?? []).map(
      (entry) => entry.command
    );

    expect(contributedCommands).not.toContain('labviewViHistory.pickContainerImageVersion');
    expect(commandPaletteEntries).not.toContain('labviewViHistory.pickContainerImageVersion');
  });

  it('contributes the VI Preview custom editor at default priority (VHS-REQ-659.8)', () => {
    const manifest = readManifest();
    const editor = manifest.contributes?.customEditors?.find(
      (entry) => entry.viewType === 'viHistorySuite.viPreview'
    );

    expect(editor).toMatchObject({
      displayName: 'VI History Preview',
      priority: 'default'
    });
    expect(editor?.selector?.map((entry) => entry.filenamePattern)).toEqual([
      '*.vi',
      '*.vit',
      '*.vim',
      '*.ctl'
    ]);
  });

  it('keeps the simplified development, CI, package, and optional Vagrant scripts (VHS-REQ-599.2)', () => {
    const manifest = readManifest();

    expect(manifest.dependencies ?? {}).toEqual({
      'jsonc-parser': expect.any(String)
    });
    expect(manifest.devDependencies).toHaveProperty('@vscode/vsce', '3.9.2');
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

  it('keeps Vagrant out of hosted CI so it stays an optional human helper (VHS-REQ-599.3)', () => {
    // VHS-REQ-599.3: Vagrant is an optional human-run validation helper, never a
    // release gate — no hosted CI workflow may invoke it.
    const workflowsDirectory = path.resolve(__dirname, '..', '..', '.github', 'workflows');
    const workflowFiles = fs
      .readdirSync(workflowsDirectory)
      .filter((name) => name.endsWith('.yml') || name.endsWith('.yaml'));

    expect(workflowFiles.length).toBeGreaterThan(0);
    for (const name of workflowFiles) {
      const content = fs.readFileSync(path.join(workflowsDirectory, name), 'utf8');
      expect(content, `${name} must not invoke the optional Vagrant helper`).not.toMatch(/vagrant/i);
    }
  });

  it('documents Vagrant as optional and keeps provisioning independent of CI (VHS-REQ-599.1, VHS-REQ-599.4)', () => {
    const vagrantDoc = readRepoText('docs', 'vagrant.md');
    const vagrantfile = readRepoText('vagrant', 'Vagrantfile');
    const bootstrapProvisioner = readRepoText('vagrant', 'provision', 'bootstrap.ps1');
    const coldLabviewProvisioner = readRepoText(
      'vagrant',
      'provision',
      'prepare-cold-labview.ps1'
    );

    expect(vagrantDoc).toContain('optional isolation helper');
    expect(vagrantDoc).toContain('not part of required CI');
    expect(vagrantDoc).toMatch(/not\s+a release gate/);
    expect(vagrantDoc).toContain('npm run vagrant:validate');
    expect(vagrantfile).toContain('human-maintainer local testing only');
    expect(vagrantfile).toMatch(/not a required\s+#\s+release gate/);
    expect(vagrantfile).toContain('provision/bootstrap.ps1');
    expect(vagrantfile).toContain('provision/prepare-cold-labview.ps1');

    expect(bootstrapProvisioner).toContain('Checking git');
    expect(bootstrapProvisioner).toContain('Checking Node.js');
    expect(bootstrapProvisioner).toContain('Checking VS Code CLI');
    expect(bootstrapProvisioner).toContain('Checking LabVIEW 2026');
    expect(coldLabviewProvisioner).toContain('$runtimeProcessNames');
    expect(coldLabviewProvisioner).toContain('Stop-RuntimeProcess');
    expect(coldLabviewProvisioner).toContain('Test-PortListening');

    for (const provisioner of [bootstrapProvisioner, coldLabviewProvisioner]) {
      expect(provisioner).not.toMatch(/GITHUB_|workflow_dispatch|github\.com|actions\//i);
    }
  });

  it('contributes the opt-in strict RSRC header detection setting (VHS-REQ-003.3)', () => {
    const manifest = readManifest();
    const strictSetting = manifest.contributes?.configuration?.properties?.[
      'viHistorySuite.strictRsrcHeader'
    ] as { type?: string; default?: unknown } | undefined;

    expect(strictSetting?.type).toBe('boolean');
    // VHS-REQ-003.3: strict mode must remain opt-in (default off).
    expect(strictSetting?.default).toBe(false);
  });
});

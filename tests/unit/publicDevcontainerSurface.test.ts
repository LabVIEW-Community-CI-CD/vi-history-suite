import * as fs from 'node:fs';
import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '..', '..');

function readText(relativePath: string): string {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function readJson<T>(relativePath: string): T {
  return JSON.parse(readText(relativePath)) as T;
}

const EXPECTED_LAUNCH_CONFIG_NAME = 'Run VI History Suite';
const EXPECTED_PRELAUNCH_TASK = 'npm: compile';
const ONBOARDING_FEEDBACK_URL =
  'https://github.com/LabVIEW-Community-CI-CD/vi-history-suite/issues/12';

describe('public devcontainer surface', () => {
  it('retains a Docker-capable devcontainer and VS Code launch surface for the public GitHub repo (VHS-REQ-596.1, VHS-REQ-596.2)', () => {
    const devcontainer = readJson<{
      name?: string;
      image?: string;
      overrideCommand?: boolean;
      features?: Record<string, unknown>;
      postCreateCommand?: string;
      postStartCommand?: string;
      customizations?: {
        vscode?: {
          extensions?: string[];
          settings?: Record<string, string>;
        };
      };
    }>('.devcontainer/devcontainer.json');
    const launch = readJson<{
      configurations?: Array<{ name?: string; type?: string; preLaunchTask?: string }>;
    }>('.vscode/launch.json');
    const tasks = readJson<{
      tasks?: Array<{ type?: string; script?: string }>;
    }>('.vscode/tasks.json');
    const extensions = readJson<{ recommendations?: string[] }>('.vscode/extensions.json');
    const readme = readText('README.md');
    const install = readText('INSTALL.md');
    const firstRun = readText('FIRST-RUN.md');

    expect(devcontainer.name).toBe('vi-history-suite');
    expect(devcontainer.image).toBe('mcr.microsoft.com/devcontainers/typescript-node:1-22-bookworm');
    expect(devcontainer.overrideCommand).toBe(true);
    expect(devcontainer.features).toHaveProperty('ghcr.io/devcontainers/features/docker-in-docker:2');
    expect(devcontainer.features).toHaveProperty('ghcr.io/devcontainers/features/sshd:1');
    expect(devcontainer.postCreateCommand).toBe(
      'sudo install -m 0755 scripts/bootstrapLinuxVsCodeHost.js /usr/local/bin/vihs-bootstrap-vscode-linux-host && npm run public:host:bootstrap-linux && npm ci'
    );
    expect(devcontainer.postStartCommand).toBe('npm run compile');
    expect(devcontainer.customizations?.vscode?.extensions).toEqual(
      expect.arrayContaining(['ms-vscode.extension-test-runner', 'dbaeumer.vscode-eslint'])
    );
    expect(devcontainer.customizations?.vscode?.extensions).not.toEqual(
      expect.arrayContaining(['vitest.explorer'])
    );
    expect(devcontainer.customizations?.vscode?.settings).toMatchObject({
      'terminal.integrated.defaultProfile.linux': 'bash'
    });

    expect(launch.configurations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: EXPECTED_LAUNCH_CONFIG_NAME,
          type: 'extensionHost',
          preLaunchTask: EXPECTED_PRELAUNCH_TASK
        }),
        expect.objectContaining({
          name: 'Run VI History Suite Integration Tests',
          type: 'extensionHost',
          preLaunchTask: 'npm: test:integration:compile'
        })
      ])
    );
    expect(tasks.tasks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'npm', script: 'compile' }),
            expect.objectContaining({ type: 'npm', script: 'test' })
      ])
    );
    expect(extensions.recommendations).toEqual(
      expect.arrayContaining(['ms-vscode.extension-test-runner', 'dbaeumer.vscode-eslint'])
    );
    expect(extensions.recommendations).not.toEqual(expect.arrayContaining(['vitest.explorer']));

    // Issue #589: the README is user-facing only. Source-evaluation and dev-loop
    // guidance moved to the contributor docs, which the README links to instead
    // of carrying inline.
    expect(readme).toContain('CONTRIBUTING.md');
    expect(readme).toContain('docs/development.md');
    expect(readme).toMatch(/### Contribute|## Contribute/);
    expect(readme).toMatch(
      /https:\/\/github\.com\/LabVIEW-Community-CI-CD\/vi-history-suite/
    );
    expect(install).toContain('Use a devcontainer or Codespace');
    expect(install).toContain('npm run public:host:bootstrap-linux');
    expect(install).toContain('npm run public:fixture:icon-editor');
    expect(install).toContain('npm run public:repo:clone');
    expect(install).toContain('Vagrant is a local human tester');
    expect(firstRun).toContain('Use a devcontainer or Codespace');
    expect(firstRun).toContain('Extension Development Host');
  });

  it('documents the expected devcontainer first-run path with the named launch configuration (VHS-REQ-596.3)', () => {
    const launch = readJson<{
      configurations?: Array<{ name?: string; type?: string; preLaunchTask?: string }>;
    }>('.vscode/launch.json');
    const install = readText('INSTALL.md');
    const firstRun = readText('FIRST-RUN.md');
    const development = readText('docs/development.md');
    const testPlan = readText('docs/testing/test-plan.md');

    const launchConfig = launch.configurations?.find(
      (config) => config.name === EXPECTED_LAUNCH_CONFIG_NAME
    );
    expect(launchConfig, `launch configuration '${EXPECTED_LAUNCH_CONFIG_NAME}' exists`).toBeDefined();
    expect(launchConfig?.type).toBe('extensionHost');
    expect(launchConfig?.preLaunchTask).toBe(EXPECTED_PRELAUNCH_TASK);

    // Issue #589: README is user-only; launch/F5/Extension Development Host
    // guidance is verified in the contributor and onboarding docs instead.
    for (const [docName, docContent] of [
      ['INSTALL.md', install],
      ['FIRST-RUN.md', firstRun],
      ['docs/development.md', development],
      ['docs/testing/test-plan.md', testPlan]
    ] as const) {
      expect(docContent, `${docName} mentions launch config`).toContain(EXPECTED_LAUNCH_CONFIG_NAME);
      expect(docContent, `${docName} mentions F5`).toContain('F5');
      expect(docContent, `${docName} mentions Extension Development Host`).toContain(
        'Extension Development Host'
      );
    }
  });

  it('documents structured source-evaluation onboarding feedback (VHS-REQ-596.4)', () => {
    const feedbackTemplate = readText(
      '.github/ISSUE_TEMPLATE/first_time_onboarding_feedback.yml'
    );
    const readme = readText('README.md');
    const install = readText('INSTALL.md');
    const firstRun = readText('FIRST-RUN.md');
    const development = readText('docs/development.md');
    const testPlan = readText('docs/testing/test-plan.md');

    for (const [docName, docContent] of [
      ['README.md', readme],
      ['INSTALL.md', install],
      ['FIRST-RUN.md', firstRun],
      ['docs/development.md', development],
      ['docs/testing/test-plan.md', testPlan]
    ] as const) {
      expect(docContent, `${docName} points to onboarding tracker`).toContain(
        ONBOARDING_FEEDBACK_URL
      );
    }

    expect(feedbackTemplate).toContain('Codespaces source evaluation');
    expect(feedbackTemplate).toContain('Dev Containers in VS Code');
    expect(feedbackTemplate).toContain('Local clone source evaluation');
    expect(feedbackTemplate).toContain('id: first_action');
    expect(feedbackTemplate).toContain('id: friction');
    // VHS-REQ-596.4: source-evaluation feedback captures the Extension Development Host result.
    expect(feedbackTemplate).toContain('id: extension_development_host');
    expect(feedbackTemplate).toContain('Extension Development Host Result');
  });

  it('documents postStartCommand expectations consistently across docs', () => {
    const devcontainer = readJson<{
      postStartCommand?: string;
    }>('.devcontainer/devcontainer.json');
    const install = readText('INSTALL.md');
    const development = readText('docs/development.md');

    expect(devcontainer.postStartCommand).toBe('npm run compile');

    // Issue #589: README is user-only and no longer documents postStartCommand;
    // the devcontainer detail stays in the contributor/onboarding docs.
    for (const [docName, docContent] of [
      ['INSTALL.md', install],
      ['docs/development.md', development]
    ] as const) {
      expect(docContent, `${docName} mentions postStartCommand`).toContain('postStartCommand');
    }
  });
});

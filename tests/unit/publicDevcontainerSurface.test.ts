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

describe('public devcontainer surface', () => {
  it('retains a Docker-capable devcontainer and VS Code launch surface for the public GitHub facade', () => {
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
          name: 'Run VI History Suite',
          type: 'extensionHost',
          preLaunchTask: 'npm: compile'
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
        expect.objectContaining({ type: 'npm', script: 'test:design-contract' })
      ])
    );
    expect(extensions.recommendations).toEqual(
      expect.arrayContaining(['ms-vscode.extension-test-runner', 'dbaeumer.vscode-eslint'])
    );
    expect(extensions.recommendations).not.toEqual(expect.arrayContaining(['vitest.explorer']));

    expect(readme).toContain('## If You Installed VI History Suite');
    expect(
      readme.includes('## Source Evaluation And Codespaces') ||
        readme.includes('## Public Devcontainer And Codespaces')
    ).toBe(true);
    expect(readme).toContain('public GitHub facade is expected to support evaluation inside Codespaces or');
    expect(readme).toContain('a local devcontainer');
    expect(
      readme.includes('The current exact released installed extension path is Docker-only and') ||
        readme.includes('Docker CLI plus a running Docker daemon are prerequisites for the first')
    ).toBe(true);
    expect(readme).toContain('A Linux-hosted development session uses the governed Linux container image.');
    expect(readme).toContain('npm run public:host:bootstrap-linux');
    expect(readme).toContain('npm run public:fixture:icon-editor');
    expect(readme).toContain('repo-sibling `labview-icon-editor`');
    expect(readme).toContain('No host LabVIEW installation is required for the installed extension path.');
  });
});

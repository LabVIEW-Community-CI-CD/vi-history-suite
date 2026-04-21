import { describe, expect, it } from 'vitest';
import path from 'node:path';

const {
  buildDockerArgs,
  buildGitSafeDirectoryEnvArgs,
  formatPublishedRegistryAccessError,
  resolvePublishedRegistryCredentials,
  resolveNodeModulesVolumeName,
  resolvePublishedRegistryHost
} = require('../../scripts/runDocsWorkbenchDocker.js');

const repoBaseName = path.basename(process.cwd());

describe('runDocsWorkbenchDocker', () => {
  it('derives the registry host from a published image reference', () => {
    expect(
      resolvePublishedRegistryHost(
        'registry.gitlab.com/svelderrainruiz/vi-history-suite/docs-authoring:main'
      )
    ).toBe('registry.gitlab.com');
    expect(resolvePublishedRegistryHost('vi-history-suite-docs-authoring:local')).toBeNull();
  });

  it('resolves oauth2 registry credentials from GITLAB_TOKEN', () => {
    expect(resolvePublishedRegistryCredentials({ GITLAB_TOKEN: 'secret-token' })).toEqual({
      username: 'oauth2',
      password: 'secret-token',
      source: 'gitlab-token'
    });
  });

  it('prefers explicit registry user and token when present', () => {
    expect(
      resolvePublishedRegistryCredentials({
        VIHS_GITLAB_REGISTRY_USER: 'sergio',
        VIHS_GITLAB_REGISTRY_TOKEN: 'explicit-token',
        GITLAB_TOKEN: 'fallback-token'
      })
    ).toEqual({
      username: 'sergio',
      password: 'explicit-token',
      source: 'explicit-user'
    });
  });

  it('formats a fail-closed published-image registry access explanation', () => {
    const message = formatPublishedRegistryAccessError({
      docsImage: 'registry.gitlab.com/svelderrainruiz/vi-history-suite/docs-authoring:main',
      registryHost: 'registry.gitlab.com',
      credentials: null
    });

    expect(message).toContain('Published docs workbench image pull failed');
    expect(message).toContain('registry.gitlab.com');
    expect(message).toContain('GITLAB_TOKEN');
  });

  it('mounts the repo parent for gate and shell commands so sibling wiki roots stay visible', () => {
    const gateArgs = buildDockerArgs(
      'gate',
      'docker.exe',
      'vi-history-suite-docs-authoring:local'
    );
    const shellArgs = buildDockerArgs(
      'shell',
      'docker.exe',
      'vi-history-suite-docs-authoring:local'
    );

    expect(gateArgs.slice(0, 3)).toEqual(['run', '--rm', '-v']);
    expect(gateArgs[3]).toContain('/repo-parent');
    expect(gateArgs).toContain(
      `${resolveNodeModulesVolumeName(repoBaseName)}:/repo-parent/${repoBaseName}/node_modules`
    );
    expect(gateArgs).toContain('GIT_CONFIG_COUNT=3');
    expect(gateArgs).toContain(`VIHS_DOCS_WORKSPACE=/repo-parent/${repoBaseName}`);
    expect(gateArgs).toContain(`/repo-parent/${repoBaseName}`);
    expect(gateArgs.slice(-3)).toEqual(['npm', 'run', 'docs:gate']);

    expect(shellArgs.slice(0, 3)).toEqual(['run', '--rm', '-it']);
    expect(shellArgs[4]).toContain('/repo-parent');
    expect(shellArgs).toContain(
      `${resolveNodeModulesVolumeName(repoBaseName)}:/repo-parent/${repoBaseName}/node_modules`
    );
    expect(shellArgs).toContain('GIT_CONFIG_COUNT=3');
    expect(shellArgs).toContain(`VIHS_DOCS_WORKSPACE=/repo-parent/${repoBaseName}`);
    expect(shellArgs).toContain(`/repo-parent/${repoBaseName}`);
    expect(shellArgs.at(-1)).toBe('bash');
  });

  it('predeclares the mounted repo and sibling wiki roots as safe directories', () => {
    expect(buildGitSafeDirectoryEnvArgs(repoBaseName)).toEqual([
      '-e',
      'GIT_CONFIG_COUNT=3',
      '-e',
      'GIT_CONFIG_KEY_0=safe.directory',
      '-e',
      `GIT_CONFIG_VALUE_0=/repo-parent/${repoBaseName}`,
      '-e',
      'GIT_CONFIG_KEY_1=safe.directory',
      '-e',
      'GIT_CONFIG_VALUE_1=/repo-parent/vi-history-suite.wiki',
      '-e',
      'GIT_CONFIG_KEY_2=safe.directory',
      '-e',
      'GIT_CONFIG_VALUE_2=/repo-parent/vi-history-suite.github.wiki'
    ]);
  });
});

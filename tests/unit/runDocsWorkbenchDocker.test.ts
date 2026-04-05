import { describe, expect, it } from 'vitest';

const {
  formatPublishedRegistryAccessError,
  resolvePublishedRegistryCredentials,
  resolvePublishedRegistryHost
} = require('../../scripts/runDocsWorkbenchDocker.js');

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
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getExtensionMock } = vi.hoisted(() => ({
  getExtensionMock: vi.fn()
}));

vi.mock('vscode', () => ({
  extensions: {
    getExtension: getExtensionMock
  }
}));

import { getBuiltInGitApi, hasGitApiFactory } from '../../src/git/gitApi';

describe('gitApi resolver', () => {
  beforeEach(() => {
    getExtensionMock.mockReset();
  });

  it('returns undefined when the built-in Git extension is not installed', async () => {
    getExtensionMock.mockReturnValue(undefined);

    await expect(getBuiltInGitApi()).resolves.toBeUndefined();
    expect(getExtensionMock).toHaveBeenCalledWith('vscode.git');
  });

  it('returns the active built-in Git API using API version 1', async () => {
    const api = { repositories: [] };
    const getAPIMock = vi.fn().mockReturnValue(api);
    const activateMock = vi.fn();
    getExtensionMock.mockReturnValue({
      isActive: true,
      exports: {
        getAPI: getAPIMock
      },
      activate: activateMock
    });

    await expect(getBuiltInGitApi()).resolves.toBe(api as never);
    expect(getAPIMock).toHaveBeenCalledWith(1);
    expect(activateMock).not.toHaveBeenCalled();
  });

  it('activates the built-in Git extension when needed and returns its API', async () => {
    const api = { repositories: [] };
    const getAPIMock = vi.fn().mockReturnValue(api);
    const activateMock = vi.fn().mockResolvedValue({
      getAPI: getAPIMock
    });
    getExtensionMock.mockReturnValue({
      isActive: false,
      exports: {},
      activate: activateMock
    });

    await expect(getBuiltInGitApi()).resolves.toBe(api as never);
    expect(activateMock).toHaveBeenCalledTimes(1);
    expect(getAPIMock).toHaveBeenCalledWith(1);
  });

  it('returns undefined when Git extension exports do not provide getAPI', async () => {
    getExtensionMock.mockReturnValue({
      isActive: true,
      exports: {},
      activate: vi.fn()
    });

    await expect(getBuiltInGitApi()).resolves.toBeUndefined();
  });

  it('returns undefined when Git extension activation throws', async () => {
    getExtensionMock.mockReturnValue({
      isActive: false,
      exports: {},
      activate: vi.fn().mockRejectedValue(new Error('activation failed'))
    });

    await expect(getBuiltInGitApi()).resolves.toBeUndefined();
  });

  it('identifies values that expose a callable getAPI factory', () => {
    expect(hasGitApiFactory({ getAPI: () => ({ repositories: [] }) })).toBe(true);
    expect(hasGitApiFactory({ getAPI: 'nope' })).toBe(false);
    expect(hasGitApiFactory(undefined)).toBe(false);
  });
});

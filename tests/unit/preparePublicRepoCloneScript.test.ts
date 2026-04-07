import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '..', '..');
const scriptPath = path.join(repoRoot, 'scripts', 'preparePublicRepoClone.js');

// eslint-disable-next-line @typescript-eslint/no-var-requires
const script = require(scriptPath) as {
  SUPPORTED_PUBLIC_HOSTS: string[];
  deriveVisibleTargetRoot: (repoUrl: string, root?: string) => string;
  getUsage: () => string;
  normalizeRepoUrl: (repoUrl: string) => string;
  parseArgs: (argv: string[]) => {
    repoUrl?: string;
    branch?: string;
    repoUrlSpecified: boolean;
    branchSpecified: boolean;
    targetRootSpecified: boolean;
  };
  parseRemoteHeadBranch: (output: string) => string;
  parseSupportedPublicRepoUrl: (repoUrl: string) => {
    host: string;
    owner: string;
    repoName: string;
    normalizedUrl: string;
  };
  resolveEffectiveOptions: (
    parsed: ReturnType<typeof script.parseArgs>,
    deps?: { resolveDefaultBranch: (repoUrl: string) => string }
  ) => {
    repoUrl: string;
    branch: string;
    targetRoot: string;
    branchWasResolved: boolean;
  };
};

describe('prepare public repo clone script', () => {
  it('requires an explicit public repo URL and explains the supported hosts', () => {
    const usage = script.getUsage();

    expect(usage).toContain('--repo-url <url>');
    expect(usage).toContain('github.com, gitlab.com');
    expect(script.SUPPORTED_PUBLIC_HOSTS).toEqual(['github.com', 'gitlab.com']);

    expect(() => script.resolveEffectiveOptions(script.parseArgs([]))).toThrow(
      'This command requires --repo-url'
    );
  });

  it('derives visible repo-sibling target paths and resolves the remote default branch when omitted', () => {
    const gitHubParsed = script.parseArgs([
      '--repo-url',
      'https://github.com/crossrulz/SerialPortNuggets.git'
    ]);
    const gitHubOptions = script.resolveEffectiveOptions(gitHubParsed, {
      resolveDefaultBranch: () => 'main'
    });

    const gitLabParsed = script.parseArgs([
      '--repo-url',
      'https://gitlab.com/hampel-soft/open-source/hse-logger.git'
    ]);
    const gitLabOptions = script.resolveEffectiveOptions(gitLabParsed, {
      resolveDefaultBranch: () => 'master'
    });

    expect(gitHubOptions.repoUrl).toBe('https://github.com/crossrulz/SerialPortNuggets.git');
    expect(gitHubOptions.branch).toBe('main');
    expect(gitHubOptions.branchWasResolved).toBe(true);
    expect(path.basename(gitHubOptions.targetRoot)).toBe('SerialPortNuggets');
    expect(gitHubOptions.targetRoot).not.toContain(`${path.sep}.cache${path.sep}`);

    expect(gitLabOptions.repoUrl).toBe('https://gitlab.com/hampel-soft/open-source/hse-logger.git');
    expect(gitLabOptions.branch).toBe('master');
    expect(gitLabOptions.branchWasResolved).toBe(true);
    expect(path.basename(gitLabOptions.targetRoot)).toBe('hse-logger');
    expect(gitLabOptions.targetRoot).not.toContain(`${path.sep}.cache${path.sep}`);
  });

  it('normalizes supported GitHub and GitLab URLs and parses remote HEAD output', () => {
    expect(script.normalizeRepoUrl('https://github.com/crossrulz/SerialPortNuggets')).toBe(
      'https://github.com/crossrulz/SerialPortNuggets.git'
    );
    expect(script.normalizeRepoUrl('https://gitlab.com/hampel-soft/open-source/hse-logger')).toBe(
      'https://gitlab.com/hampel-soft/open-source/hse-logger.git'
    );
    expect(
      script.parseSupportedPublicRepoUrl('https://github.com/crossrulz/SerialPortNuggets')
    ).toMatchObject({
      host: 'github.com',
      owner: 'crossrulz',
      repoName: 'SerialPortNuggets'
    });
    expect(script.parseRemoteHeadBranch('ref: refs/heads/main\tHEAD\nabc123\tHEAD')).toBe('main');
    expect(script.parseRemoteHeadBranch('ref: refs/heads/master\tHEAD\nabc123\tHEAD')).toBe(
      'master'
    );
    expect(
      script.deriveVisibleTargetRoot('https://github.com/crossrulz/SerialPortNuggets.git')
    ).toContain(`${path.sep}SerialPortNuggets`);
  });

  it('rejects unsupported hosts and non-https URLs', () => {
    expect(() =>
      script.parseSupportedPublicRepoUrl('https://example.com/owner/repo.git')
    ).toThrow('Unsupported public repo host');
    expect(() => script.parseSupportedPublicRepoUrl('git@github.com:owner/repo.git')).toThrow(
      'Public repo URL must be a full https://github.com/... or https://gitlab.com/... URL'
    );
    expect(() => script.parseSupportedPublicRepoUrl('http://github.com/owner/repo.git')).toThrow(
      'Public repo URL must use https'
    );
  });
});

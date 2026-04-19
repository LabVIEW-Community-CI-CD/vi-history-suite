#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const { readGitLabApiToken } = require('./resolveLocalGitLabApiToken.js');

const DEFAULT_GIT_REMOTE_NAME = 'origin';
const DEFAULT_GITLAB_HOST = 'gitlab.com';
const DEFAULT_GIT_PROTOCOL = 'https';
const FALLBACK_GITLAB_GIT_USERNAME = 'oauth2';
const GITLAB_GIT_USERNAME_ENV = 'VIHS_GITLAB_GIT_USERNAME';

function getRefreshLocalGitLabGitCredentialUsage() {
  return [
    'Usage: node scripts/refreshLocalGitLabGitCredential.js [--remote <name>] [--username <value>] [--no-check-remote] [--json] [--help]',
    '',
    'Refresh the repo-local Git HTTPS credential for the vi-history-suite GitLab authority remote using the governed local token resolver.',
    'The command removes stale gitlab.com credentials, sets credential.https://gitlab.com.username in the current repo, approves the fresh token, and read-proves access with git ls-remote <remote> HEAD unless --no-check-remote is set.',
    'Token source: node scripts/resolveLocalGitLabApiToken.js --json',
    `Optional username override env: ${GITLAB_GIT_USERNAME_ENV}`
  ].join('\n');
}

function parseRefreshLocalGitLabGitCredentialArgs(argv) {
  const parsed = {
    helpRequested: false,
    json: false,
    remoteName: DEFAULT_GIT_REMOTE_NAME,
    username: '',
    checkRemote: true
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === '--help' || argument === '-h') {
      parsed.helpRequested = true;
      continue;
    }
    if (argument === '--json') {
      parsed.json = true;
      continue;
    }
    if (argument === '--no-check-remote') {
      parsed.checkRemote = false;
      continue;
    }
    if (argument === '--remote') {
      parsed.remoteName = readRequiredValue(argv, ++index, '--remote');
      continue;
    }
    if (argument === '--username') {
      parsed.username = readRequiredValue(argv, ++index, '--username');
      continue;
    }

    throw new Error(`Unknown argument: ${argument}`);
  }

  return parsed;
}

function readRequiredValue(argv, index, flag) {
  const value = argv[index];
  if (!value || !value.trim()) {
    throw new Error(`Missing value for ${flag}.`);
  }
  return value.trim();
}

function repoRoot() {
  return path.resolve(path.dirname(fs.realpathSync.native(__filename)), '..');
}

function runGit(args, spawnSyncImpl = spawnSync, cwd = repoRoot(), options = {}) {
  const result = spawnSyncImpl('git', ['-C', cwd, ...args], {
    encoding: 'utf8',
    input: options.input
  });

  if (!options.allowFailure && result.status !== 0) {
    const detail = (result.stderr || result.stdout || '').trim();
    throw new Error(`git ${args.join(' ')} failed${detail ? `: ${detail}` : ''}`);
  }

  return result;
}

function gitOutput(args, spawnSyncImpl = spawnSync, cwd = repoRoot(), options = {}) {
  return runGit(args, spawnSyncImpl, cwd, options).stdout.trim();
}

function parseGitRemoteUrl(remoteUrl) {
  const trimmed = `${remoteUrl}`.trim();

  try {
    const url = new URL(trimmed);
    const projectPath = url.pathname.replace(/^\/+/, '').replace(/\.git$/i, '');
    return {
      scheme: url.protocol.replace(/:$/, ''),
      host: url.hostname,
      namespaceOwner: projectPath.split('/')[0] ?? '',
      projectPath
    };
  } catch {
    // ignore and try SSH parsing next
  }

  const sshMatch = trimmed.match(/^git@([^:]+):(.+?)(?:\.git)?$/i);
  if (sshMatch) {
    const projectPath = sshMatch[2];
    return {
      scheme: 'ssh',
      host: sshMatch[1],
      namespaceOwner: projectPath.split('/')[0] ?? '',
      projectPath
    };
  }

  throw new Error(`Unsupported Git remote URL: ${remoteUrl}`);
}

function readConfiguredCredentialUsername(
  host,
  spawnSyncImpl = spawnSync,
  cwd = repoRoot()
) {
  const result = runGit(
    ['config', '--local', '--get', `credential.${DEFAULT_GIT_PROTOCOL}://${host}.username`],
    spawnSyncImpl,
    cwd,
    { allowFailure: true }
  );
  return result.status === 0 ? result.stdout.trim() : '';
}

function resolveGitCredentialContext(parsed, deps = {}) {
  const repoRootPath = deps.repoRoot ?? repoRoot();
  const spawnSyncImpl = deps.spawnSync ?? spawnSync;
  const env = deps.env ?? process.env;
  const remoteUrl = gitOutput(['remote', 'get-url', parsed.remoteName], spawnSyncImpl, repoRootPath);
  const remote = parseGitRemoteUrl(remoteUrl);

  if (remote.scheme !== DEFAULT_GIT_PROTOCOL) {
    throw new Error(
      `GitLab Git credential refresh requires an HTTPS ${parsed.remoteName} remote; found ${remote.scheme}: ${remoteUrl}`
    );
  }

  if (remote.host !== DEFAULT_GITLAB_HOST) {
    throw new Error(
      `GitLab Git credential refresh expects ${DEFAULT_GITLAB_HOST}; found ${remote.host} from ${remoteUrl}`
    );
  }

  const configuredUsername = readConfiguredCredentialUsername(
    remote.host,
    spawnSyncImpl,
    repoRootPath
  );
  const envUsername = `${env[GITLAB_GIT_USERNAME_ENV] ?? ''}`.trim();
  const requestedUsername = (
    parsed.username ||
    envUsername ||
    configuredUsername ||
    remote.namespaceOwner ||
    FALLBACK_GITLAB_GIT_USERNAME
  ).trim();

  return {
    repoRootPath,
    remoteName: parsed.remoteName,
    remoteUrl,
    protocol: DEFAULT_GIT_PROTOCOL,
    host: remote.host,
    username: requestedUsername,
    configuredUsername,
    namespaceOwner: remote.namespaceOwner
  };
}

function buildGitCredentialInput({ protocol, host, username, password }) {
  const lines = [`protocol=${protocol}`, `host=${host}`];

  if (username) {
    lines.push(`username=${username}`);
  }

  if (password) {
    lines.push(`password=${password}`);
  }

  lines.push('', '');
  return lines.join('\n');
}

function buildGitCredentialRejectUsernames(context) {
  const candidates = [
    context.configuredUsername,
    context.namespaceOwner,
    context.username,
    FALLBACK_GITLAB_GIT_USERNAME
  ];

  return Array.from(new Set(candidates.filter((candidate) => `${candidate}`.trim().length > 0)));
}

function rejectExistingGitCredential(context, spawnSyncImpl = spawnSync) {
  runGit(
    ['credential', 'reject'],
    spawnSyncImpl,
    context.repoRootPath,
    {
      input: buildGitCredentialInput({
        protocol: context.protocol,
        host: context.host
      })
    }
  );

  for (const username of buildGitCredentialRejectUsernames(context)) {
    runGit(
      ['credential', 'reject'],
      spawnSyncImpl,
      context.repoRootPath,
      {
        input: buildGitCredentialInput({
          protocol: context.protocol,
          host: context.host,
          username
        })
      }
    );
  }
}

function setRepoCredentialUsername(context, spawnSyncImpl = spawnSync) {
  runGit(
    ['config', '--local', `credential.${context.protocol}://${context.host}.username`, context.username],
    spawnSyncImpl,
    context.repoRootPath
  );
}

function approveGitCredential(context, token, spawnSyncImpl = spawnSync) {
  runGit(
    ['credential', 'approve'],
    spawnSyncImpl,
    context.repoRootPath,
    {
      input: buildGitCredentialInput({
        protocol: context.protocol,
        host: context.host,
        username: context.username,
        password: token
      })
    }
  );
}

function verifyGitRemoteAccess(context, spawnSyncImpl = spawnSync) {
  const result = runGit(
    ['ls-remote', '--exit-code', context.remoteName, 'HEAD'],
    spawnSyncImpl,
    context.repoRootPath
  );

  return (result.stdout || '').trim();
}

function runRefreshLocalGitLabGitCredential(argv = process.argv.slice(2), deps = {}) {
  const parsed = parseRefreshLocalGitLabGitCredentialArgs(argv);
  const stdout = deps.stdout ?? process.stdout;

  if (parsed.helpRequested) {
    stdout.write(`${getRefreshLocalGitLabGitCredentialUsage()}\n`);
    return { outcome: 'help' };
  }

  const context = resolveGitCredentialContext(parsed, deps);
  const token = deps.token ?? readGitLabApiToken(deps.env ?? process.env, deps.fs ?? fs);
  const spawnSyncImpl = deps.spawnSync ?? spawnSync;

  rejectExistingGitCredential(context, spawnSyncImpl);
  setRepoCredentialUsername(context, spawnSyncImpl);
  approveGitCredential(context, token, spawnSyncImpl);

  const verification =
    parsed.checkRemote ? verifyGitRemoteAccess(context, spawnSyncImpl) : undefined;
  const result = {
    outcome: 'refreshed',
    remoteName: context.remoteName,
    remoteUrl: context.remoteUrl,
    protocol: context.protocol,
    host: context.host,
    username: context.username,
    checkRemote: parsed.checkRemote,
    verification
  };

  if (parsed.json) {
    stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    stdout.write('vi-history-suite GitLab Git credential: refreshed\n');
    stdout.write(`- remote: ${result.remoteName}\n`);
    stdout.write(`- host: ${result.host}\n`);
    stdout.write(`- username: ${result.username}\n`);
    stdout.write(
      `- read proof: ${
        result.checkRemote
          ? `passed (git ls-remote ${result.remoteName} HEAD)`
          : 'skipped (--no-check-remote)'
      }\n`
    );
  }

  return result;
}

function main() {
  try {
    const result = runRefreshLocalGitLabGitCredential();
    return result.outcome === 'help' ? 0 : 0;
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}

if (require.main === module) {
  process.exitCode = main();
}

module.exports = {
  DEFAULT_GIT_REMOTE_NAME,
  DEFAULT_GITLAB_HOST,
  DEFAULT_GIT_PROTOCOL,
  FALLBACK_GITLAB_GIT_USERNAME,
  GITLAB_GIT_USERNAME_ENV,
  getRefreshLocalGitLabGitCredentialUsage,
  parseRefreshLocalGitLabGitCredentialArgs,
  parseGitRemoteUrl,
  resolveGitCredentialContext,
  buildGitCredentialInput,
  buildGitCredentialRejectUsernames,
  rejectExistingGitCredential,
  setRepoCredentialUsername,
  approveGitCredential,
  verifyGitRemoteAccess,
  runRefreshLocalGitLabGitCredential
};

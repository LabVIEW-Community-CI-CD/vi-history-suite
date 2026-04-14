#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { setTimeout: delay } = require('node:timers/promises');

const { readGitLabApiToken } = require('./resolveLocalGitLabApiToken.js');

const DEFAULT_GITLAB_API_URL = 'https://gitlab.com/api/v4';
const DEFAULT_TARGET_BRANCH = 'develop';
const DEFAULT_WAIT_ATTEMPTS = 8;
const DEFAULT_WAIT_DELAY_MS = 1000;
const PENDING_MERGE_STATUSES = new Set([
  'checking',
  'preparing',
  'approvals_syncing',
  'unchecked'
]);

function getQueueGovernedMergeRequestUsage() {
  return [
    'Usage: node scripts/queueGovernedMergeRequest.js [--source-branch <branch>] [--target-branch <branch>] --title <text> [--description <text> | --description-file <path>] [--auto-merge] [--remove-source-branch] [--wait-attempts <count>] [--wait-delay-ms <ms>] [--help]',
    '',
    'Create or reuse a governed GitLab merge request through the direct GitLab API using the local vi-history-suite token resolver.',
    'Inspect token resolution first with node scripts/resolveLocalGitLabApiToken.js --json.',
    'This path is repo-local and does not depend on remembered glab auth state.'
  ].join('\n');
}

function parseQueueGovernedMergeRequestArgs(argv) {
  const parsed = {
    helpRequested: false,
    sourceBranch: undefined,
    targetBranch: DEFAULT_TARGET_BRANCH,
    title: '',
    description: '',
    descriptionFile: undefined,
    autoMerge: false,
    removeSourceBranch: false,
    waitAttempts: DEFAULT_WAIT_ATTEMPTS,
    waitDelayMs: DEFAULT_WAIT_DELAY_MS
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === '--help' || argument === '-h') {
      parsed.helpRequested = true;
      continue;
    }
    if (argument === '--auto-merge') {
      parsed.autoMerge = true;
      continue;
    }
    if (argument === '--remove-source-branch') {
      parsed.removeSourceBranch = true;
      continue;
    }
    if (argument === '--source-branch') {
      parsed.sourceBranch = readRequiredValue(argv, ++index, '--source-branch');
      continue;
    }
    if (argument === '--target-branch') {
      parsed.targetBranch = readRequiredValue(argv, ++index, '--target-branch');
      continue;
    }
    if (argument === '--title') {
      parsed.title = readRequiredValue(argv, ++index, '--title');
      continue;
    }
    if (argument === '--description') {
      parsed.description = readRequiredValue(argv, ++index, '--description');
      continue;
    }
    if (argument === '--description-file') {
      parsed.descriptionFile = readRequiredValue(argv, ++index, '--description-file');
      continue;
    }
    if (argument === '--wait-attempts') {
      parsed.waitAttempts = Number.parseInt(readRequiredValue(argv, ++index, '--wait-attempts'), 10);
      continue;
    }
    if (argument === '--wait-delay-ms') {
      parsed.waitDelayMs = Number.parseInt(readRequiredValue(argv, ++index, '--wait-delay-ms'), 10);
      continue;
    }

    throw new Error(`Unknown argument: ${argument}`);
  }

  if (!parsed.helpRequested && !parsed.title.trim()) {
    throw new Error('Missing required --title.');
  }

  if (
    !parsed.helpRequested &&
    parsed.description.trim().length > 0 &&
    parsed.descriptionFile
  ) {
    throw new Error('Use only one of --description or --description-file.');
  }

  if (!Number.isInteger(parsed.waitAttempts) || parsed.waitAttempts < 1) {
    throw new Error('--wait-attempts must be a positive integer.');
  }

  if (!Number.isInteger(parsed.waitDelayMs) || parsed.waitDelayMs < 0) {
    throw new Error('--wait-delay-ms must be a non-negative integer.');
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

function gitOutput(args, spawnSyncImpl = spawnSync, cwd = repoRoot()) {
  const result = spawnSyncImpl('git', ['-C', cwd, ...args], {
    encoding: 'utf8'
  });
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || '').trim();
    throw new Error(`git ${args.join(' ')} failed${detail ? `: ${detail}` : ''}`);
  }
  return result.stdout.trim();
}

function parseGitLabProjectPath(remoteUrl) {
  const trimmed = `${remoteUrl}`.trim();
  const sshMatch = trimmed.match(/^git@([^:]+):(.+?)(?:\.git)?$/);
  if (sshMatch) {
    return sshMatch[2];
  }

  const httpsMatch = trimmed.match(/^https?:\/\/[^/]+\/(.+?)(?:\.git)?$/);
  if (httpsMatch) {
    return httpsMatch[1];
  }

  throw new Error(`Unsupported GitLab remote URL: ${remoteUrl}`);
}

function resolveCurrentBranch(spawnSyncImpl = spawnSync, cwd = repoRoot()) {
  return gitOutput(['branch', '--show-current'], spawnSyncImpl, cwd);
}

function resolveProjectPath(spawnSyncImpl = spawnSync, cwd = repoRoot()) {
  return parseGitLabProjectPath(gitOutput(['remote', 'get-url', 'origin'], spawnSyncImpl, cwd));
}

async function gitLabRequest(url, token, options = {}, fetchImpl = fetch) {
  const response = await fetchImpl(url, {
    method: options.method ?? 'GET',
    headers: {
      'PRIVATE-TOKEN': token,
      ...(options.body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {})
    },
    body: options.body ? new URLSearchParams(options.body) : undefined
  });
  const text = await response.text();
  let json;
  try {
    json = text.trim() ? JSON.parse(text) : undefined;
  } catch {
    json = undefined;
  }

  return {
    ok: response.ok,
    status: response.status,
    text,
    json
  };
}

function projectApiUrl(projectPath, suffix, apiUrl = DEFAULT_GITLAB_API_URL) {
  return `${apiUrl}/projects/${encodeURIComponent(projectPath)}${suffix}`;
}

function mergeRequestApiUrl(projectPath, mergeRequestIid, suffix = '', apiUrl = DEFAULT_GITLAB_API_URL) {
  return projectApiUrl(projectPath, `/merge_requests/${mergeRequestIid}${suffix}`, apiUrl);
}

async function findOpenMergeRequest(projectPath, sourceBranch, targetBranch, token, deps = {}) {
  const url = `${projectApiUrl(projectPath, '/merge_requests', deps.apiUrl)}?state=opened&source_branch=${encodeURIComponent(sourceBranch)}&target_branch=${encodeURIComponent(targetBranch)}`;
  const response = await gitLabRequest(url, token, {}, deps.fetch ?? fetch);
  if (!response.ok) {
    throw new Error(`GET ${url} failed with ${response.status}: ${response.text.trim()}`);
  }

  const matches = Array.isArray(response.json) ? response.json : [];
  return matches[0];
}

async function createMergeRequest(projectPath, parsed, token, deps = {}) {
  const description =
    parsed.descriptionFile
      ? fs.readFileSync(path.resolve(parsed.descriptionFile), 'utf8')
      : parsed.description;
  const response = await gitLabRequest(
    projectApiUrl(projectPath, '/merge_requests', deps.apiUrl),
    token,
    {
      method: 'POST',
      body: {
        source_branch: parsed.sourceBranch,
        target_branch: parsed.targetBranch,
        title: parsed.title,
        description,
        remove_source_branch: parsed.removeSourceBranch ? 'true' : 'false'
      }
    },
    deps.fetch ?? fetch
  );
  if (!response.ok) {
    throw new Error(
      `POST merge request failed with ${response.status}: ${response.text.trim()}`
    );
  }

  return response.json;
}

async function readMergeRequest(projectPath, mergeRequestIid, token, deps = {}) {
  const response = await gitLabRequest(
    mergeRequestApiUrl(projectPath, mergeRequestIid, '', deps.apiUrl),
    token,
    {},
    deps.fetch ?? fetch
  );
  if (!response.ok) {
    throw new Error(
      `GET merge request ${mergeRequestIid} failed with ${response.status}: ${response.text.trim()}`
    );
  }
  return response.json;
}

async function armAutoMerge(projectPath, mergeRequest, parsed, token, deps = {}) {
  for (let attempt = 0; attempt < parsed.waitAttempts; attempt += 1) {
    const current = await readMergeRequest(projectPath, mergeRequest.iid, token, deps);
    const detailedStatus = current.detailed_merge_status || current.merge_status || '';

    if (PENDING_MERGE_STATUSES.has(detailedStatus)) {
      if (attempt < parsed.waitAttempts - 1) {
        await (deps.delay ?? delay)(parsed.waitDelayMs);
        continue;
      }
    }

    const response = await gitLabRequest(
      mergeRequestApiUrl(projectPath, mergeRequest.iid, '/merge', deps.apiUrl),
      token,
      {
        method: 'PUT',
        body: {
          merge_when_pipeline_succeeds: 'true',
          should_remove_source_branch: parsed.removeSourceBranch ? 'true' : 'false'
        }
      },
      deps.fetch ?? fetch
    );

    if (response.ok) {
      return {
        outcome: 'armed',
        detailedStatus
      };
    }

    if (response.status === 422 && attempt < parsed.waitAttempts - 1) {
      await (deps.delay ?? delay)(parsed.waitDelayMs);
      continue;
    }

    throw new Error(
      `PUT merge request ${mergeRequest.iid} merge failed with ${response.status}: ${response.text.trim()}`
    );
  }

  throw new Error(`Timed out waiting to arm auto-merge for !${mergeRequest.iid}.`);
}

async function runQueueGovernedMergeRequest(argv = process.argv.slice(2), deps = {}) {
  const parsed = parseQueueGovernedMergeRequestArgs(argv);
  const stdout = deps.stdout ?? process.stdout;
  if (parsed.helpRequested) {
    stdout.write(`${getQueueGovernedMergeRequestUsage()}\n`);
    return { outcome: 'help' };
  }

  const repoRootPath = deps.repoRoot ?? repoRoot();
  parsed.sourceBranch =
    parsed.sourceBranch ??
    resolveCurrentBranch(deps.spawnSync ?? spawnSync, repoRootPath);
  const projectPath =
    deps.projectPath ?? resolveProjectPath(deps.spawnSync ?? spawnSync, repoRootPath);
  const token = deps.token ?? readGitLabApiToken(deps.env ?? process.env, deps.fs ?? fs);

  let mergeRequest =
    (await findOpenMergeRequest(projectPath, parsed.sourceBranch, parsed.targetBranch, token, deps)) ??
    (await createMergeRequest(projectPath, parsed, token, deps));
  let autoMerge = undefined;

  if (parsed.autoMerge) {
    autoMerge = await armAutoMerge(projectPath, mergeRequest, parsed, token, deps);
    mergeRequest = await readMergeRequest(projectPath, mergeRequest.iid, token, deps);
  }

  const result = {
    outcome: 'queued-merge-request',
    projectPath,
    sourceBranch: parsed.sourceBranch,
    targetBranch: parsed.targetBranch,
    mergeRequestIid: mergeRequest.iid,
    webUrl: mergeRequest.web_url,
    autoMerge
  };

  stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  return result;
}

async function main() {
  try {
    await runQueueGovernedMergeRequest();
    return 0;
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}

if (require.main === module) {
  void main().then((code) => {
    process.exitCode = code;
  });
}

module.exports = {
  DEFAULT_GITLAB_API_URL,
  DEFAULT_TARGET_BRANCH,
  DEFAULT_WAIT_ATTEMPTS,
  DEFAULT_WAIT_DELAY_MS,
  PENDING_MERGE_STATUSES,
  getQueueGovernedMergeRequestUsage,
  parseQueueGovernedMergeRequestArgs,
  parseGitLabProjectPath,
  resolveCurrentBranch,
  resolveProjectPath,
  projectApiUrl,
  mergeRequestApiUrl,
  findOpenMergeRequest,
  createMergeRequest,
  readMergeRequest,
  armAutoMerge,
  runQueueGovernedMergeRequest
};

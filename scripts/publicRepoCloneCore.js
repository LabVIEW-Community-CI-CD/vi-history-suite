const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');
const { spawnSync } = require('node:child_process');

const repoRoot = path.resolve(path.dirname(fs.realpathSync.native(__filename)), '..');
const SUPPORTED_PUBLIC_HOSTS = ['github.com', 'gitlab.com'];
const DEFAULT_ICON_EDITOR_REPO_URL = 'https://github.com/ni/labview-icon-editor.git';
const DEFAULT_ICON_EDITOR_BRANCH = 'develop';
const DEFAULT_ICON_EDITOR_TARGET_ROOT = path.resolve(repoRoot, '..', 'labview-icon-editor');
const KNOWN_PUBLIC_REPO_REVIEW_HINTS = {
  'gitlab.com/hampel-soft/open-source/hse-logger': {
    exampleViPath: 'Examples/Logging with Helper-VIs.vi'
  },
  'github.com/crossrulz/serialportnuggets': {
    exampleViPath: 'ASCII/Terminals/ASCII Command-Response.vi'
  }
};

function stripGitSuffix(value) {
  return value.replace(/\.git$/i, '');
}

function buildParsedRepoPath(segments, rawValue, host) {
  if (segments.length < 2) {
    throw new Error(`Public repo URL must include owner and repo: ${rawValue}`);
  }

  const namespaceSegments = segments.slice(0, -1);
  const repoName = stripGitSuffix(segments.at(-1) ?? '');
  const namespacePath = namespaceSegments.join('/');
  if (!namespacePath || !repoName) {
    throw new Error(`Public repo URL must include owner and repo: ${rawValue}`);
  }

  return {
    host,
    owner: namespaceSegments[0],
    namespacePath,
    repoName,
    normalizedUrl: `https://${host}/${namespacePath}/${repoName}.git`
  };
}

function parseSupportedPublicRepoUrl(rawValue) {
  let url;
  try {
    url = new URL(rawValue);
  } catch (error) {
    throw new Error(
      `Public repo URL must be a full https://github.com/... or https://gitlab.com/... URL: ${rawValue}`
    );
  }

  if (url.protocol !== 'https:') {
    throw new Error(`Public repo URL must use https: ${rawValue}`);
  }

  const host = url.hostname.toLowerCase();
  if (!SUPPORTED_PUBLIC_HOSTS.includes(host)) {
    throw new Error(
      `Unsupported public repo host: ${host}. Supported hosts: ${SUPPORTED_PUBLIC_HOSTS.join(', ')}`
    );
  }

  const segments = url.pathname.split('/').filter(Boolean);
  return buildParsedRepoPath(segments, rawValue, host);
}

function parseRepoComparisonKey(rawValue) {
  const trimmed = String(rawValue ?? '').trim();
  if (!trimmed) {
    throw new Error('Repo URL is empty');
  }

  if (/^https?:\/\//i.test(trimmed)) {
    const parsed = parseSupportedPublicRepoUrl(trimmed);
    return `${parsed.host}/${parsed.namespacePath.toLowerCase()}/${parsed.repoName.toLowerCase()}`;
  }

  const sshMatch = trimmed.match(/^(?:ssh:\/\/)?git@([^/:]+)[:/](.+)$/i);
  if (sshMatch) {
    const host = sshMatch[1].toLowerCase();
    if (!SUPPORTED_PUBLIC_HOSTS.includes(host)) {
      throw new Error(
        `Unsupported public repo host: ${host}. Supported hosts: ${SUPPORTED_PUBLIC_HOSTS.join(', ')}`
      );
    }

    const pathSegments = sshMatch[2]
      .split('/')
      .map((value) => value.trim())
      .filter(Boolean);
    const parsed = buildParsedRepoPath(pathSegments, trimmed, host);
    return `${host}/${parsed.namespacePath.toLowerCase()}/${parsed.repoName.toLowerCase()}`;
  }

  throw new Error(`Unsupported repo URL format: ${trimmed}`);
}

function normalizeRepoUrl(rawValue) {
  return parseSupportedPublicRepoUrl(rawValue).normalizedUrl;
}

function parseRemoteHeadBranch(output) {
  const match = String(output ?? '').match(/ref:\s+refs\/heads\/([^\s]+)\s+HEAD/);
  if (!match?.[1]) {
    throw new Error(`Unable to resolve remote default branch from: ${String(output ?? '').trim()}`);
  }
  return match[1];
}

function deriveVisibleTargetRoot(repoUrl, root = repoRoot) {
  const parsed = parseSupportedPublicRepoUrl(repoUrl);
  return path.resolve(root, '..', parsed.repoName);
}

function getNextStepMessage(targetRoot, label = 'public-repo') {
  return [
    `[${label}] Next: if the extension development host is not running yet, press F5 in the vi-history-suite window.`,
    `[${label}] Then in the extension host choose File -> Open Folder... and open ${targetRoot}.`
  ].join('\n') + '\n';
}

function getRepoReviewHint(repoUrl) {
  const repoKey = parseRepoComparisonKey(repoUrl);
  return KNOWN_PUBLIC_REPO_REVIEW_HINTS[repoKey];
}

function writeNextStep(targetRoot, repoUrl, stdout, label) {
  stdout.write(getNextStepMessage(targetRoot, label));
  const reviewHint = getRepoReviewHint(repoUrl);
  if (reviewHint?.exampleViPath) {
    stdout.write(
      `[${label}] Example VI to try after the folder opens: ${reviewHint.exampleViPath}.\n`
    );
  }
}

function canPromptInteractively(input, output) {
  return Boolean(
    input &&
      output &&
      input.isTTY &&
      output.isTTY &&
      typeof input.setRawMode === 'function'
  );
}

async function promptForRepoUrl(input = process.stdin, output = process.stdout, label = 'public-repo') {
  if (!canPromptInteractively(input, output)) {
    return undefined;
  }

  readline.emitKeypressEvents(input);
  const previousRawMode = Boolean(input.isRaw);
  input.setRawMode(true);
  input.resume();

  output.write(
    [
      `[${label}] Paste a public GitHub or GitLab repo URL to review.`,
      `[${label}] Example format: https://github.com/owner/repo.git`,
      `[${label}] Press Escape to cancel and return to the canonical helper path.`,
      `[${label}] Repo URL: `
    ].join('\n')
  );

  return await new Promise((resolve, reject) => {
    let buffer = '';

    const cleanup = () => {
      input.removeListener('keypress', onKeypress);
      input.setRawMode(previousRawMode);
      input.pause();
    };

    const finish = (value, error) => {
      cleanup();
      if (error) {
        reject(error);
        return;
      }
      resolve(value);
    };

    const onKeypress = (chunk, key = {}) => {
      if (key.ctrl && key.name === 'c') {
        output.write('\n');
        finish(undefined, new Error('Interactive public repo prompt interrupted.'));
        return;
      }

      if (key.name === 'escape') {
        output.write('\n');
        finish(undefined);
        return;
      }

      if (key.name === 'return' || key.name === 'enter') {
        output.write('\n');
        finish(buffer.trim() || undefined);
        return;
      }

      if (key.name === 'backspace') {
        if (buffer.length > 0) {
          buffer = buffer.slice(0, -1);
          output.write('\b \b');
        }
        return;
      }

      if (typeof chunk === 'string' && chunk.length > 0 && !key.meta) {
        buffer += chunk;
        output.write(chunk);
      }
    };

    input.on('keypress', onKeypress);
  });
}

function parseArgs(argv, defaults = {}) {
  const parsed = {
    helpRequested: false,
    refresh: false,
    repoUrl: defaults.repoUrl,
    branch: defaults.branch,
    targetRoot: defaults.targetRoot ? path.resolve(defaults.targetRoot) : undefined,
    repoUrlSpecified: false,
    branchSpecified: false,
    targetRootSpecified: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === '--help' || argument === '-h') {
      parsed.helpRequested = true;
      continue;
    }

    if (argument === '--refresh') {
      parsed.refresh = true;
      continue;
    }

    if (argument === '--target-root') {
      const value = argv[index + 1];
      if (!value) {
        throw new Error('Missing value for --target-root');
      }
      parsed.targetRoot = path.resolve(value);
      parsed.targetRootSpecified = true;
      index += 1;
      continue;
    }

    if (argument === '--repo-url' || argument === '--repo') {
      const value = argv[index + 1];
      if (!value) {
        throw new Error(`Missing value for ${argument}`);
      }
      parsed.repoUrl = value;
      parsed.repoUrlSpecified = true;
      index += 1;
      continue;
    }

    if (argument === '--branch') {
      const value = argv[index + 1];
      if (!value) {
        throw new Error('Missing value for --branch');
      }
      parsed.branch = value;
      parsed.branchSpecified = true;
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${argument}`);
  }

  return parsed;
}

function getUsage(config = {}) {
  const defaultRepoUrl = config.defaultRepoUrl;
  const defaultBranch = config.defaultBranch;
  const defaultTargetRoot = config.defaultTargetRoot
    ? path.resolve(config.defaultTargetRoot)
    : undefined;
  const requireExplicitRepo = config.requireExplicitRepo === true;
  const usagePath = config.usagePath ?? 'scripts/preparePublicRepoClone.js';

  const lines = [
    `Usage: node ${usagePath} ${requireExplicitRepo ? '--repo-url <url> ' : ''}[--target-root <path>] [--branch <name>] [--refresh] [--help]`.replace(
      /\s+/g,
      ' '
    ),
    '',
    config.description ??
      'Clone or refresh a public GitHub or GitLab repo for devcontainer/Codespaces evaluation.',
    '',
    `Supported hosts: ${SUPPORTED_PUBLIC_HOSTS.join(', ')}`,
    ''
  ];

  if (!requireExplicitRepo) {
    lines.push('Defaults:');
    lines.push(`  repo-url: ${defaultRepoUrl}`);
    if (defaultBranch) {
      lines.push(`  branch:   ${defaultBranch}`);
    }
    if (defaultTargetRoot) {
      lines.push(`  target:   ${defaultTargetRoot}`);
    }
    lines.push('');
  }

  lines.push('Behavior:');
  lines.push(
    '  - without --refresh: clone the repo if it is missing, otherwise reuse a clean matching clone'
  );
  lines.push(
    '  - with --refresh: fast-forward a clean matching clone to origin/<branch>'
  );
  lines.push(
    '  - without --branch: resolve the remote default branch unless the wrapper already governs one'
  );
  lines.push(
    '  - without --target-root: derive a visible repo-sibling folder from the repo name'
  );
  lines.push(
    '  - in an interactive terminal, omitting --repo-url opens a prompt so you can paste a public repo URL'
  );
  return lines.join('\n');
}

function runGit(args, cwd) {
  const result = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    shell: false
  });

  if (result.status !== 0) {
    throw new Error(
      `git ${args.join(' ')} failed${cwd ? ` in ${cwd}` : ''}: ${String(
        result.stderr || result.stdout || 'unknown error'
      ).trim()}`
    );
  }

  return String(result.stdout ?? '').trim();
}

function resolveDefaultBranch(repoUrl) {
  const output = runGit(['ls-remote', '--symref', repoUrl, 'HEAD']);
  return parseRemoteHeadBranch(output);
}

function resolveEffectiveOptions(parsed, config = {}, deps = {}) {
  const resolvedRepoUrl = parsed.repoUrl ?? config.defaultRepoUrl;
  if (!resolvedRepoUrl) {
    throw new Error(
      'This command requires --repo-url for a public GitHub or GitLab repository.'
    );
  }

  const normalizedRepoUrl = normalizeRepoUrl(resolvedRepoUrl);
  const targetRoot =
    parsed.targetRootSpecified || parsed.targetRoot
      ? path.resolve(parsed.targetRoot)
      : config.defaultTargetRoot
        ? path.resolve(config.defaultTargetRoot)
        : deriveVisibleTargetRoot(normalizedRepoUrl, config.repoRoot ?? repoRoot);
  const branch =
    parsed.branchSpecified || parsed.branch
      ? parsed.branch
      : (deps.resolveDefaultBranch ?? resolveDefaultBranch)(normalizedRepoUrl);

  return {
    repoUrl: normalizedRepoUrl,
    branch,
    targetRoot,
    refresh: parsed.refresh,
    branchWasResolved: !parsed.branchSpecified && !config.defaultBranch
  };
}

function ensureGitClone(targetRoot) {
  if (!fs.existsSync(path.join(targetRoot, '.git'))) {
    throw new Error(`Existing target is not a Git clone: ${targetRoot}`);
  }
}

function ensureMatchingOrigin(targetRoot, expectedRepoUrl) {
  const currentOrigin = runGit(['remote', 'get-url', 'origin'], targetRoot);
  const expectedKey = parseRepoComparisonKey(expectedRepoUrl);
  const currentKey = parseRepoComparisonKey(currentOrigin);
  if (currentKey !== expectedKey) {
    throw new Error(
      `Existing clone at ${targetRoot} points to ${currentOrigin}, not ${expectedRepoUrl}. Remove or retarget that clone before continuing.`
    );
  }
}

function ensureCleanWorkingTree(targetRoot) {
  const status = runGit(['status', '--short'], targetRoot);
  if (status) {
    throw new Error(
      `Refusing to reuse or refresh a dirty clone at ${targetRoot}. Commit, stash, or remove it first.`
    );
  }
}

function isShallowRepository(targetRoot) {
  return runGit(['rev-parse', '--is-shallow-repository'], targetRoot) === 'true';
}

function getCurrentBranch(targetRoot) {
  return runGit(['branch', '--show-current'], targetRoot);
}

function cloneRepo(options, stdout, label) {
  fs.mkdirSync(path.dirname(options.targetRoot), { recursive: true });
  runGit(['clone', '--branch', options.branch, options.repoUrl, options.targetRoot]);
  const head = runGit(['rev-parse', 'HEAD'], options.targetRoot);
  stdout.write(
    `[${label}] Cloned ${options.repoUrl} to ${options.targetRoot} at ${head} from origin/${options.branch}.\n`
  );
  writeNextStep(options.targetRoot, options.repoUrl, stdout, label);
}

function reuseRepo(options, stdout, label) {
  ensureGitClone(options.targetRoot);
  ensureMatchingOrigin(options.targetRoot, options.repoUrl);
  ensureCleanWorkingTree(options.targetRoot);
  const head = runGit(['rev-parse', 'HEAD'], options.targetRoot);
  stdout.write(
    `[${label}] Using clean existing clone at ${options.targetRoot} (${head}) on ${options.branch}.\n`
  );
  writeNextStep(options.targetRoot, options.repoUrl, stdout, label);
}

function refreshRepo(options, stdout, label) {
  ensureGitClone(options.targetRoot);
  ensureMatchingOrigin(options.targetRoot, options.repoUrl);
  ensureCleanWorkingTree(options.targetRoot);

  if (isShallowRepository(options.targetRoot)) {
    runGit(['fetch', '--unshallow', 'origin', options.branch], options.targetRoot);
  } else {
    runGit(['fetch', 'origin', options.branch], options.targetRoot);
  }

  const currentBranch = getCurrentBranch(options.targetRoot);
  if (currentBranch === options.branch) {
    runGit(['merge', '--ff-only', 'FETCH_HEAD'], options.targetRoot);
  } else {
    const localBranches = runGit(
      ['for-each-ref', '--format=%(refname:short)', 'refs/heads'],
      options.targetRoot
    )
      .split('\n')
      .map((value) => value.trim())
      .filter(Boolean);

    if (localBranches.includes(options.branch)) {
      runGit(['checkout', options.branch], options.targetRoot);
      runGit(['merge', '--ff-only', 'FETCH_HEAD'], options.targetRoot);
    } else {
      runGit(
        ['checkout', '-b', options.branch, '--track', `origin/${options.branch}`],
        options.targetRoot
      );
    }
  }

  const head = runGit(['rev-parse', 'HEAD'], options.targetRoot);
  stdout.write(
    `[${label}] Normalized ${options.targetRoot} to ${head} from origin/${options.branch}.\n`
  );
  writeNextStep(options.targetRoot, options.repoUrl, stdout, label);
}

function needsNormalization(options) {
  ensureGitClone(options.targetRoot);
  ensureMatchingOrigin(options.targetRoot, options.repoUrl);
  ensureCleanWorkingTree(options.targetRoot);
  return getCurrentBranch(options.targetRoot) !== options.branch || isShallowRepository(options.targetRoot);
}

async function runPublicRepoClone(argv = process.argv.slice(2), deps = {}, config = {}) {
  const stdout = deps.stdout ?? process.stdout;
  const stdin = deps.stdin ?? process.stdin;
  const parsed = parseArgs(argv, config);

  if (parsed.helpRequested) {
    stdout.write(`${getUsage(config)}\n`);
    return;
  }

  if (!parsed.repoUrl && !config.defaultRepoUrl) {
    const promptedRepoUrl = await (deps.promptForRepoUrl ?? promptForRepoUrl)(
      stdin,
      stdout,
      config.label ?? 'public-repo'
    );
    if (!promptedRepoUrl) {
      stdout.write(
        `[${config.label ?? 'public-repo'}] Cancelled interactive repo prompt. Next: run npm run public:fixture:icon-editor for the canonical labview-icon-editor sample.\n`
      );
      return;
    }
    parsed.repoUrl = promptedRepoUrl;
    parsed.repoUrlSpecified = true;
  }

  const options = resolveEffectiveOptions(parsed, config, deps);
  const label = config.label ?? 'public-repo';

  if (!fs.existsSync(options.targetRoot)) {
    cloneRepo(options, stdout, label);
    return;
  }

  if (parsed.refresh || needsNormalization(options)) {
    refreshRepo(options, stdout, label);
    return;
  }

  reuseRepo(options, stdout, label);
}

module.exports = {
  DEFAULT_ICON_EDITOR_BRANCH,
  DEFAULT_ICON_EDITOR_REPO_URL,
  DEFAULT_ICON_EDITOR_TARGET_ROOT,
  SUPPORTED_PUBLIC_HOSTS,
  canPromptInteractively,
  deriveVisibleTargetRoot,
  getNextStepMessage,
  getRepoReviewHint,
  getUsage,
  normalizeRepoUrl,
  parseArgs,
  parseRemoteHeadBranch,
  parseSupportedPublicRepoUrl,
  promptForRepoUrl,
  resolveEffectiveOptions,
  runPublicRepoClone
};

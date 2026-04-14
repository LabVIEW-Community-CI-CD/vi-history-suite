#!/usr/bin/env node

const { spawnSync, execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(path.dirname(fs.realpathSync.native(__filename)), '..');
const localDocsImage = 'vi-history-suite-docs-authoring:local';
const publishedDocsImage =
  process.env.VIHS_DOCS_WORKBENCH_IMAGE ||
  'registry.gitlab.com/svelderrainruiz/vi-history-suite/docs-authoring:main';
const gitLabRegistryHost = 'registry.gitlab.com';

function isWsl() {
  return process.platform === 'linux' && Boolean(process.env.WSL_DISTRO_NAME);
}

function getUsage() {
  return [
    'Usage: node scripts/runDocsWorkbenchDocker.js <command> [--image-source local|published] [--image <ref>] [--pull]',
    '',
    'Commands:',
    '  build',
    '  pull',
    '  gate',
    '  shell',
    '  wiki-doctor',
    '  wiki-plan',
    '  wiki-prepare',
    '  wiki-sync-bundled-docs',
    '',
    'Options:',
    '  --image-source <local|published>  Choose the local image or the published GitLab image.',
    '  --image <ref>                     Override the image reference explicitly.',
    '  --pull                           Pull the selected image before running the command.'
  ].join('\n');
}

function parseArgs(argv) {
  let mode;
  let imageSource = 'local';
  let imageOverride;
  let pull = false;

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    const requireValue = (flag) => {
      const candidate = argv[index + 1];
      if (!candidate || candidate.startsWith('--')) {
        throw new Error(`Missing value for ${flag}.\n\n${getUsage()}`);
      }
      index += 1;
      return candidate;
    };

    if (current === '--help' || current === '-h') {
      return {
        helpRequested: true,
        mode: undefined,
        imageSource,
        imageOverride,
        pull
      };
    }

    if (current === '--image-source') {
      const candidate = requireValue('--image-source');
      if (candidate !== 'local' && candidate !== 'published') {
        throw new Error(`Unsupported --image-source value: ${candidate}\n\n${getUsage()}`);
      }
      imageSource = candidate;
      continue;
    }

    if (current === '--image') {
      imageOverride = requireValue('--image');
      continue;
    }

    if (current === '--pull') {
      pull = true;
      continue;
    }

    if (!current.startsWith('--') && mode === undefined) {
      mode = current;
      continue;
    }

    throw new Error(`Unknown argument: ${current}\n\n${getUsage()}`);
  }

  return {
    helpRequested: false,
    mode,
    imageSource,
    imageOverride,
    pull
  };
}

function resolveDocsImage(options) {
  if (options.imageOverride) {
    return options.imageOverride;
  }

  return options.imageSource === 'published' ? publishedDocsImage : localDocsImage;
}

function resolvePublishedRegistryHost(imageRef) {
  const firstSegment = imageRef.split('/')[0]?.trim();
  if (!firstSegment || !firstSegment.includes('.')) {
    return null;
  }
  return firstSegment;
}

function resolvePublishedRegistryCredentials(env = process.env) {
  const explicitUser = env.VIHS_GITLAB_REGISTRY_USER || env.GITLAB_REGISTRY_USER;
  const explicitToken =
    env.VIHS_GITLAB_REGISTRY_TOKEN ||
    env.GITLAB_REGISTRY_TOKEN ||
    env.VIHS_GITLAB_REGISTRY_PASSWORD ||
    env.GITLAB_REGISTRY_PASSWORD;

  if (explicitUser && explicitToken) {
    return {
      username: explicitUser,
      password: explicitToken,
      source: explicitUser === 'oauth2' ? 'explicit-oauth2' : 'explicit-user'
    };
  }

  const gitlabToken = env.GITLAB_TOKEN || env.VIHS_GITLAB_TOKEN || env.GLAB_TOKEN;
  if (gitlabToken) {
    return {
      username: 'oauth2',
      password: gitlabToken,
      source: 'gitlab-token'
    };
  }

  return null;
}

function runDockerCommand(docker, args, options = {}) {
  return spawnSync(docker.command, [...docker.extraArgs, ...args], {
    cwd: repoRoot,
    shell: false,
    encoding: 'utf8',
    stdio: options.captureOutput ? ['pipe', 'pipe', 'pipe'] : 'inherit'
  });
}

function formatPublishedRegistryAccessError({ docsImage, registryHost, credentials }) {
  const base = [
    `Published docs workbench image pull failed for ${docsImage}.`,
    `GitLab registry access to ${registryHost} is not available on this machine.`
  ];

  if (credentials) {
    base.push(
      `A registry login was attempted using ${credentials.source}, but the pull still failed.`
    );
  } else {
    base.push(
      'No supported GitLab registry credential was found in VIHS_GITLAB_REGISTRY_USER/VIHS_GITLAB_REGISTRY_TOKEN, GITLAB_REGISTRY_USER/GITLAB_REGISTRY_TOKEN, or GITLAB_TOKEN.'
    );
  }

  base.push(
    `Either provide a GitLab registry credential through the supported environment variables or pre-authenticate Docker for ${registryHost}.`
  );
  return base.join(' ');
}

function maybeLoginToPublishedRegistry(docker, docsImage, registryHost) {
  if (registryHost !== gitLabRegistryHost) {
    return null;
  }

  const credentials = resolvePublishedRegistryCredentials();
  if (!credentials) {
    return null;
  }

  const loginResult = spawnSync(
    docker.command,
    [
      ...docker.extraArgs,
      'login',
      registryHost,
      '--username',
      credentials.username,
      '--password-stdin'
    ],
    {
      cwd: repoRoot,
      shell: false,
      input: credentials.password,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe']
    }
  );

  if (loginResult.error) {
    throw loginResult.error;
  }

  if (typeof loginResult.status === 'number' && loginResult.status !== 0) {
    const stderr = (loginResult.stderr || '').trim();
    throw new Error(
      `${formatPublishedRegistryAccessError({
        docsImage,
        registryHost,
        credentials
      })}${stderr ? ` Docker login stderr: ${stderr}` : ''}`
    );
  }

  return credentials;
}

function maybeExplainPublishedPullFailure({ docker, docsImage, pullArgs, pullResult, credentials }) {
  const registryHost = resolvePublishedRegistryHost(docsImage);
  if (registryHost !== gitLabRegistryHost) {
    return null;
  }

  const stderr = `${pullResult.stderr || ''}\n${pullResult.stdout || ''}`.trim();
  const lowered = stderr.toLowerCase();
  if (
    !lowered.includes('access forbidden') &&
    !lowered.includes('requested access to the resource is denied') &&
    !lowered.includes('authentication required')
  ) {
    return null;
  }

  return new Error(
    `${formatPublishedRegistryAccessError({
      docsImage,
      registryHost,
      credentials
    })}${stderr ? ` Docker pull output: ${stderr}` : ''}`
  );
}

function resolveDockerCommand() {
  if (process.env.VIHS_DOCKER_BIN) {
    return {
      command: process.env.VIHS_DOCKER_BIN,
      extraArgs: []
    };
  }

  if (isWsl()) {
    return {
      command: 'docker.exe',
      extraArgs: ['--context', 'desktop-linux']
    };
  }

  return {
    command: 'docker',
    extraArgs: []
  };
}

function translatePathForDocker(hostPath, dockerCommand) {
  if (!dockerCommand.toLowerCase().endsWith('.exe')) {
    return hostPath;
  }

  return execFileSync('wslpath', ['-w', hostPath], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore']
  }).trim();
}

function buildDockerArgs(mode, dockerCommand, docsImage) {
  const dockerfilePath = translatePathForDocker(
    path.join(repoRoot, 'docker', 'docs-authoring', 'Dockerfile'),
    dockerCommand
  );
  const repoRootPath = translatePathForDocker(repoRoot, dockerCommand);
  const parentRootPath = translatePathForDocker(path.dirname(repoRoot), dockerCommand);
  const repoBaseName = path.basename(repoRoot);
  const gitSafeDirectoryEnvArgs = buildGitSafeDirectoryEnvArgs(repoBaseName);

  if (mode === 'build') {
    if (docsImage !== localDocsImage) {
      throw new Error('The build command only supports the local docs-authoring image.');
    }
    return ['build', '-f', dockerfilePath, '-t', docsImage, repoRootPath];
  }

  if (mode === 'pull') {
    return ['pull', docsImage];
  }

  if (mode === 'gate') {
    return [
      'run',
      '--rm',
      '-v',
      `${parentRootPath}:/repo-parent`,
      '-e',
      `VIHS_DOCS_WORKSPACE=/repo-parent/${repoBaseName}`,
      ...gitSafeDirectoryEnvArgs,
      '-w',
      `/repo-parent/${repoBaseName}`,
      docsImage,
      'npm',
      'run',
      'docs:gate'
    ];
  }

  if (mode === 'shell') {
    return [
      'run',
      '--rm',
      '-it',
      '-v',
      `${parentRootPath}:/repo-parent`,
      '-e',
      `VIHS_DOCS_WORKSPACE=/repo-parent/${repoBaseName}`,
      ...gitSafeDirectoryEnvArgs,
      '-w',
      `/repo-parent/${repoBaseName}`,
      docsImage,
      'bash'
    ];
  }

  const wikiCommandMap = {
    'wiki-doctor': 'wiki:workbench:doctor',
    'wiki-plan': 'wiki:workbench:plan',
    'wiki-prepare': 'wiki:workbench:prepare',
    'wiki-sync-bundled-docs': 'wiki:workbench:sync-bundled-docs'
  };

  const wikiScript = wikiCommandMap[mode];
  if (!wikiScript) {
    throw new Error(getUsage());
  }

  return [
    'run',
    '--rm',
    '-v',
    `${parentRootPath}:/repo-parent`,
    '-e',
    `VIHS_DOCS_WORKSPACE=/repo-parent/${repoBaseName}`,
    ...gitSafeDirectoryEnvArgs,
    '-w',
    `/repo-parent/${repoBaseName}`,
    docsImage,
    'npm',
    'run',
    wikiScript
  ];
}

function main(argv = process.argv.slice(2)) {
  const parsedArgs = parseArgs(argv);
  if (parsedArgs.helpRequested || !parsedArgs.mode) {
    process.stdout.write(`${getUsage()}\n`);
    return 0;
  }

  const docker = resolveDockerCommand();
  const docsImage = resolveDocsImage(parsedArgs);

  if (parsedArgs.pull && parsedArgs.mode !== 'pull') {
    const registryHost = resolvePublishedRegistryHost(docsImage);
    const credentials =
      parsedArgs.imageSource === 'published'
        ? maybeLoginToPublishedRegistry(docker, docsImage, registryHost)
        : null;
    const pullArgs = buildDockerArgs('pull', docker.command, docsImage);
    const captureOutput = parsedArgs.imageSource === 'published';
    const pullResult = runDockerCommand(docker, pullArgs, { captureOutput });

    if (pullResult.error) {
      throw pullResult.error;
    }

    if (typeof pullResult.status === 'number' && pullResult.status !== 0) {
      const explained = maybeExplainPublishedPullFailure({
        docker,
        docsImage,
        pullArgs,
        pullResult,
        credentials
      });
      if (explained) {
        throw explained;
      }

      if (captureOutput) {
        const stdout = pullResult.stdout || '';
        const stderr = pullResult.stderr || '';
        if (stdout) {
          process.stdout.write(stdout);
        }
        if (stderr) {
          process.stderr.write(stderr);
        }
      }
      return pullResult.status;
    }

    if (captureOutput) {
      const stdout = pullResult.stdout || '';
      const stderr = pullResult.stderr || '';
      if (stdout) {
        process.stdout.write(stdout);
      }
      if (stderr) {
        process.stderr.write(stderr);
      }
    }
  }

  const result = spawnSync(
    docker.command,
    [...docker.extraArgs, ...buildDockerArgs(parsedArgs.mode, docker.command, docsImage)],
    {
      cwd: repoRoot,
      stdio: 'inherit',
      shell: false
    }
  );

  if (result.error) {
    throw result.error;
  }

  return typeof result.status === 'number' ? result.status : 1;
}

function buildGitSafeDirectoryEnvArgs(repoBaseName) {
  const safeDirectories = [
    `/repo-parent/${repoBaseName}`,
    '/repo-parent/vi-history-suite.wiki',
    '/repo-parent/vi-history-suite.github.wiki'
  ];
  const args = ['-e', `GIT_CONFIG_COUNT=${safeDirectories.length}`];

  safeDirectories.forEach((directoryPath, index) => {
    args.push('-e', `GIT_CONFIG_KEY_${index}=safe.directory`);
    args.push('-e', `GIT_CONFIG_VALUE_${index}=${directoryPath}`);
  });

  return args;
}

module.exports = {
  buildDockerArgs,
  buildGitSafeDirectoryEnvArgs,
  formatPublishedRegistryAccessError,
  parseArgs,
  resolveDocsImage,
  resolvePublishedRegistryCredentials,
  resolvePublishedRegistryHost
};

if (require.main === module) {
  try {
    process.exitCode = main();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

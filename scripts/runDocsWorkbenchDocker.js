#!/usr/bin/env node

const { spawnSync, execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(path.dirname(fs.realpathSync.native(__filename)), '..');
const localDocsImage = 'vi-history-suite-docs-authoring:local';
const publishedDocsImage =
  process.env.VIHS_DOCS_WORKBENCH_IMAGE ||
  'registry.gitlab.com/svelderrainruiz/vi-history-suite/docs-authoring:main';

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
    return ['run', '--rm', '-v', `${repoRootPath}:/workspace`, '-w', '/workspace', docsImage, 'npm', 'run', 'docs:gate'];
  }

  if (mode === 'shell') {
    return ['run', '--rm', '-it', '-v', `${repoRootPath}:/workspace`, '-w', '/workspace', docsImage, 'bash'];
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
    const pullResult = spawnSync(
      docker.command,
      [...docker.extraArgs, ...buildDockerArgs('pull', docker.command, docsImage)],
      {
        cwd: repoRoot,
        stdio: 'inherit',
        shell: false
      }
    );

    if (pullResult.error) {
      throw pullResult.error;
    }

    if (typeof pullResult.status === 'number' && pullResult.status !== 0) {
      return pullResult.status;
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

try {
  process.exitCode = main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}

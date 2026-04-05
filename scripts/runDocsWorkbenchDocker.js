#!/usr/bin/env node

const { spawnSync, execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(path.dirname(fs.realpathSync.native(__filename)), '..');
const docsImage = 'vi-history-suite-docs-authoring:local';

function isWsl() {
  return process.platform === 'linux' && Boolean(process.env.WSL_DISTRO_NAME);
}

function getUsage() {
  return [
    'Usage: node scripts/runDocsWorkbenchDocker.js <command>',
    '',
    'Commands:',
    '  build',
    '  gate',
    '  shell',
    '  wiki-doctor',
    '  wiki-plan',
    '  wiki-prepare',
    '  wiki-sync-bundled-docs'
  ].join('\n');
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

function buildDockerArgs(mode, dockerCommand) {
  const dockerfilePath = translatePathForDocker(
    path.join(repoRoot, 'docker', 'docs-authoring', 'Dockerfile'),
    dockerCommand
  );
  const repoRootPath = translatePathForDocker(repoRoot, dockerCommand);
  const parentRootPath = translatePathForDocker(path.dirname(repoRoot), dockerCommand);
  const repoBaseName = path.basename(repoRoot);

  if (mode === 'build') {
    return ['build', '-f', dockerfilePath, '-t', docsImage, repoRootPath];
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
  const mode = argv[0];
  if (!mode || mode === '--help' || mode === '-h') {
    process.stdout.write(`${getUsage()}\n`);
    return 0;
  }

  const docker = resolveDockerCommand();
  const args = [...docker.extraArgs, ...buildDockerArgs(mode, docker.command)];
  const result = spawnSync(docker.command, args, {
    cwd: repoRoot,
    stdio: 'inherit',
    shell: false
  });

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

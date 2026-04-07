#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const repoRoot = path.resolve(path.dirname(fs.realpathSync.native(__filename)), '..');

const DISTRO_PACKAGES = {
  debian: [
    'libasound2',
    'libatk1.0-0',
    'libatk-bridge2.0-0',
    'libatspi2.0-0',
    'libdbus-1-3',
    'libgbm1',
    'libgtk-3-0',
    'libnspr4',
    'libnss3',
    'libsecret-1-0',
    'libsoup-3.0-0',
    'libwebkit2gtk-4.1-0',
    'libxcomposite1',
    'libxdamage1',
    'libxfixes3',
    'xauth',
    'libxkbcommon0',
    'libxkbfile1',
    'libxrandr2',
    'xvfb'
  ],
  ubuntu: [
    'libnspr4',
    'libnss3',
    'libasound2t64',
    'libatk1.0-0',
    'libatk-bridge2.0-0',
    'libatspi2.0-0',
    'libdbus-1-3',
    'libgbm1',
    'libgtk-3-0',
    'libsecret-1-0',
    'libsoup-3.0-0',
    'libwebkit2gtk-4.1-0',
    'libxcomposite1',
    'libxdamage1',
    'libxfixes3',
    'xauth',
    'libxkbcommon0',
    'libxkbfile1',
    'libxrandr2',
    'xvfb'
  ]
};

function getUsage() {
  return [
    'Usage: node scripts/bootstrapLinuxVsCodeHost.js [install|print-plan|help]',
    '',
    'Install the native Linux packages required by the VS Code integration host',
    'and the Xvfb display wrapper used by hosted public-smoke surfaces.'
  ].join('\n');
}

function parseOsRelease(text) {
  const values = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex <= 0) {
      continue;
    }
    const key = trimmed.slice(0, separatorIndex);
    let value = trimmed.slice(separatorIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

function detectPackageFamily(osReleaseText) {
  const parsed = parseOsRelease(osReleaseText);
  const ids = [parsed.ID, ...(parsed.ID_LIKE ?? '').split(/\s+/)]
    .map((value) => String(value ?? '').trim().toLowerCase())
    .filter((value) => value.length > 0);

  if (ids.includes('ubuntu')) {
    return 'ubuntu';
  }
  if (ids.includes('debian')) {
    return 'debian';
  }

  return 'debian';
}

function readOsRelease(filePath = '/etc/os-release') {
  return fs.readFileSync(filePath, 'utf8');
}

function buildInstallPlan(packageFamily) {
  const packages = DISTRO_PACKAGES[packageFamily];
  if (!packages) {
    throw new Error(`Unsupported Linux package family: ${packageFamily}`);
  }

  return {
    packageFamily,
    packages,
    commands: [
      ['sudo', 'apt-get', 'update'],
      ['sudo', 'apt-get', 'install', '-y', '--no-install-recommends', ...packages]
    ]
  };
}

function runCommand(command, args, options = {}) {
  const result = (options.spawnSync ?? spawnSync)(command, args, {
    cwd: options.cwd ?? repoRoot,
    env: options.env ?? process.env,
    encoding: 'utf8',
    stdio: 'inherit',
    shell: false
  });

  if (result.error) {
    throw result.error;
  }
  if (typeof result.status === 'number' && result.status !== 0) {
    throw new Error(`Command failed: ${command} ${args.join(' ')}`);
  }
}

function main(argv = process.argv.slice(2), deps = {}) {
  const action = argv[0] ?? 'install';
  const stdout = deps.stdout ?? process.stdout;
  const osReleaseText = deps.osReleaseText ?? readOsRelease();
  const packageFamily = deps.packageFamily ?? detectPackageFamily(osReleaseText);
  const installPlan = buildInstallPlan(packageFamily);

  if (action === 'help' || action === '--help' || action === '-h') {
    stdout.write(`${getUsage()}\n`);
    return;
  }

  if (action === 'print-plan') {
    stdout.write(`${JSON.stringify(installPlan, null, 2)}\n`);
    return;
  }

  if (action !== 'install') {
    throw new Error(`Unsupported action: ${action}`);
  }

  stdout.write(
    `[vihs-bootstrap] Installing Linux VS Code host packages for ${packageFamily}: ${installPlan.packages.join(', ')}\n`
  );
  for (const [command, ...args] of installPlan.commands) {
    runCommand(command, args, {
      cwd: deps.cwd,
      env: deps.env,
      spawnSync: deps.spawnSync
    });
  }
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

module.exports = {
  DISTRO_PACKAGES,
  buildInstallPlan,
  detectPackageFamily,
  getUsage,
  main,
  parseOsRelease
};

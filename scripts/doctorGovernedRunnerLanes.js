#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const DEFAULT_REPO_ROOT = path.resolve(__dirname, '..');
const DEFAULT_LINUX_DISTRO = 'Ubuntu';

function getUsage() {
  return [
    'Usage: node scripts/doctorGovernedRunnerLanes.js [--surface <all|windows|linux>] [--linux-distro <name>] [--repo-root <path>] [--evidence-dir <path>] [--fail-on-drift] [--help]',
    '',
    'Repo-owned diagnostics surface for the governed GitLab runner lanes.',
    'On Windows the default surface is `all`; on non-Windows hosts the default',
    'surface is `linux`.'
  ].join('\n');
}

function parseArgs(argv, platform = process.platform) {
  const parsed = {
    helpRequested: false,
    surface: platform === 'win32' ? 'all' : 'linux',
    linuxDistro: DEFAULT_LINUX_DISTRO,
    repoRoot: DEFAULT_REPO_ROOT,
    evidenceDir: '',
    failOnDrift: false
  };

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
      parsed.helpRequested = true;
      continue;
    }
    if (current === '--surface') {
      parsed.surface = requireValue('--surface');
      continue;
    }
    if (current === '--linux-distro') {
      parsed.linuxDistro = requireValue('--linux-distro');
      continue;
    }
    if (current === '--repo-root') {
      parsed.repoRoot = path.resolve(requireValue('--repo-root'));
      continue;
    }
    if (current === '--evidence-dir') {
      parsed.evidenceDir = path.resolve(requireValue('--evidence-dir'));
      continue;
    }
    if (current === '--fail-on-drift') {
      parsed.failOnDrift = true;
      continue;
    }

    throw new Error(`Unknown argument: ${current}\n\n${getUsage()}`);
  }

  if (!parsed.helpRequested && !['all', 'windows', 'linux'].includes(parsed.surface)) {
    throw new Error(`Unsupported --surface value: ${parsed.surface}\n\n${getUsage()}`);
  }

  return parsed;
}

function quoteCommandSegment(segment) {
  if (/[\s"]/u.test(segment) || /^[A-Za-z]:\\/u.test(segment)) {
    return `"${String(segment).replace(/"/g, '\\"')}"`;
  }
  return String(segment);
}

function formatCommand(command, args) {
  return [command, ...args].map(quoteCommandSegment).join(' ');
}

function quoteSingleForBash(text) {
  return `'${String(text).replace(/'/g, `'\"'\"'`)}'`;
}

function windowsPathToWslPath(candidatePath) {
  const driveMatch = /^([A-Za-z]):\\(.*)$/u.exec(candidatePath);
  if (!driveMatch) {
    return candidatePath.replace(/\\/g, '/');
  }

  const [, driveLetter, remainder] = driveMatch;
  return `/mnt/${driveLetter.toLowerCase()}/${remainder.replace(/\\/g, '/')}`;
}

function runProcess(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe']
  });

  return {
    status: result.status ?? 1,
    stdout: String(result.stdout ?? ''),
    stderr: String(result.stderr ?? ''),
    error: result.error
  };
}

function ensureProcessSucceeded(result, commandSummary) {
  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(
      `Command failed with exit code ${String(result.status)}: ${commandSummary}\n${(result.stderr || result.stdout || '').trim()}`
    );
  }
}

function parseJsonOutput(stdout, surfaceName) {
  try {
    return JSON.parse(stdout.trim());
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not parse ${surfaceName} doctor JSON output: ${reason}`);
  }
}

function buildWindowsDoctorInvocation(repoRoot) {
  return {
    command: 'powershell.exe',
    args: [
      '-NoLogo',
      '-NoProfile',
      '-File',
      path.join(repoRoot, 'scripts', 'gitlab-runner', 'windows', 'doctor-governed-runner-lanes.ps1')
    ]
  };
}

function buildLinuxDoctorInvocation(repoRoot, linuxDistro, platform = process.platform) {
  const scriptPath = path.join(
    repoRoot,
    'scripts',
    'gitlab-runner',
    'linux',
    'doctor-linux-assurance-runner.sh'
  );

  if (platform === 'win32') {
    const wslScriptPath = windowsPathToWslPath(scriptPath);
    return {
      command: 'wsl.exe',
      args: ['-d', linuxDistro, 'bash', '-lc', `bash ${quoteSingleForBash(wslScriptPath)}`]
    };
  }

  return {
    command: 'bash',
    args: [scriptPath]
  };
}

function writeEvidence(evidenceDir, summary) {
  fs.mkdirSync(evidenceDir, { recursive: true });
  fs.writeFileSync(
    path.join(evidenceDir, 'runner-doctor.json'),
    `${JSON.stringify(summary, null, 2)}\n`,
    'utf8'
  );

  const markdownLines = [
    '# Governed Runner Doctor',
    '',
    `- Generated at: ${summary.generatedAt}`,
    `- Platform: ${summary.platform}`,
    `- Surface: ${summary.surface}`,
    `- Healthy: ${summary.healthy}`,
    `- Windows healthy: ${summary.windows ? summary.windows.healthy : '<not-run>'}`,
    `- Linux healthy: ${summary.linux ? summary.linux.healthy : '<not-run>'}`,
    '',
    '## Issues'
  ];

  const issues = Array.isArray(summary.issues) ? summary.issues : [];
  if (issues.length === 0) {
    markdownLines.push('- none');
  } else {
    for (const issue of issues) {
      markdownLines.push(`- ${issue}`);
    }
  }

  fs.writeFileSync(path.join(evidenceDir, 'runner-doctor.md'), `${markdownLines.join('\n')}\n`, 'utf8');
}

function runDoctor(options, dependencies = {}) {
  const platform = dependencies.platform ?? process.platform;
  const executeCommand = dependencies.executeCommand ?? runProcess;
  const repoRoot = path.resolve(options.repoRoot ?? DEFAULT_REPO_ROOT);
  const linuxDistro = options.linuxDistro ?? DEFAULT_LINUX_DISTRO;
  const includeWindows = options.surface === 'all' || options.surface === 'windows';
  const includeLinux = options.surface === 'all' || options.surface === 'linux';

  if (includeWindows && platform !== 'win32') {
    throw new Error('Windows runner doctor requires a Windows host.');
  }

  const summary = {
    schema: 'vi-history-suite/governed-runner-doctor@v1',
    generatedAt: new Date().toISOString(),
    platform,
    surface: options.surface,
    repoRoot,
    linuxDistro,
    healthy: true,
    issues: []
  };

  if (includeWindows) {
    const invocation = buildWindowsDoctorInvocation(repoRoot);
    const commandSummary = formatCommand(invocation.command, invocation.args);
    const result = executeCommand(invocation.command, invocation.args, { cwd: repoRoot });
    ensureProcessSucceeded(result, commandSummary);
    summary.windows = parseJsonOutput(result.stdout, 'Windows runner');
    if (!summary.windows.healthy) {
      summary.healthy = false;
      summary.issues.push(...(summary.windows.issues || []));
    }
  }

  if (includeLinux) {
    const invocation = buildLinuxDoctorInvocation(repoRoot, linuxDistro, platform);
    const commandSummary = formatCommand(invocation.command, invocation.args);
    const result = executeCommand(invocation.command, invocation.args, { cwd: repoRoot });
    ensureProcessSucceeded(result, commandSummary);
    summary.linux = parseJsonOutput(result.stdout, 'Linux runner');
    if (!summary.linux.healthy) {
      summary.healthy = false;
      summary.issues.push(...(summary.linux.issues || []));
    }
  }

  if (options.evidenceDir) {
    writeEvidence(options.evidenceDir, summary);
  }

  if (options.failOnDrift && !summary.healthy) {
    throw new Error(`Governed runner doctor detected drift.\n${summary.issues.join('\n')}`);
  }

  return summary;
}

function main() {
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed.helpRequested) {
    process.stdout.write(`${getUsage()}\n`);
    return;
  }

  const summary = runDoctor(parsed);
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

module.exports = {
  buildLinuxDoctorInvocation,
  buildWindowsDoctorInvocation,
  getUsage,
  parseArgs,
  runDoctor,
  windowsPathToWslPath
};

if (require.main === module) {
  try {
    main();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
}

#!/usr/bin/env node

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const repoRoot = path.resolve(path.dirname(fs.realpathSync.native(__filename)), '..');
const DEFAULT_EVIDENCE_ROOT = path.join(repoRoot, '.cache', 'public-product-gate-d');
const DEFAULT_FIXTURE_REPO_ROOT = '/mnt/c/dev/labview-icon-editor';
const DEFAULT_FIXTURE_VI_PATH = 'resource/plugins/lv_icon.vi';
const DEFAULT_LINUX_IMAGE = 'nationalinstruments/labview:2026q1-linux';
const WINDOWS_DOCKER_EXE = 'C:\\Program Files\\Docker\\Docker\\resources\\bin\\docker.exe';

function getPublicProductGateDPreflightUsage() {
  return [
    'Usage: node scripts/runPublicProductGateDPreflight.js [options]',
    '',
    'Retain a deterministic Gate D preflight packet for the public Docker-only product.',
    '',
    'Options:',
    '  --public-repo-root PATH     Override the public GitHub source repo checkout path.',
    '  --public-wiki-root PATH     Override the public GitHub wiki checkout path.',
    '  --fixture-repo-root PATH    Override the canonical fixture repo root.',
    '  --fixture-vi-path PATH      Override the canonical VI path relative to the fixture repo.',
    '  --linux-image IMAGE         Override the governed Linux image reference.',
    '  --evidence-root PATH        Override the retained evidence root.',
    '  --prepare-cold-pull         Remove the governed Linux image after preflight so Gate D can cold-pull it.',
    '  --allow-dirty-public-repo   Do not fail closed on a dirty public repo checkout.',
    '  --allow-dirty-public-wiki   Do not fail closed on a dirty public wiki checkout.',
    '  --skip-public-wiki-check    Skip local public wiki checkout validation.',
    '  --help                      Print this help text.'
  ].join('\n');
}

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function resolveRepoJumpEntry(authorityRepoRoot, repoId) {
  const jumpMap = loadJson(path.join(authorityRepoRoot, 'docs', 'product', 'program-repo-jump-map.json'));
  const match = (jumpMap.repos ?? []).find((entry) => entry.id === repoId);
  if (!match) {
    throw new Error(`Missing repo-jump entry for ${repoId}`);
  }
  return match;
}

function resolveRepoJumpLocalPath(authorityRepoRoot, localPath) {
  if (typeof localPath === 'string') {
    return path.resolve(authorityRepoRoot, localPath);
  }

  if (localPath && typeof localPath === 'object') {
    if (localPath.kind === 'sibling' && typeof localPath.relativePath === 'string') {
      return path.resolve(authorityRepoRoot, localPath.relativePath);
    }

    if (localPath.kind === 'absolute' && typeof localPath.path === 'string') {
      return path.resolve(localPath.path);
    }
  }

  throw new Error(`Unsupported repo-jump localPath shape: ${JSON.stringify(localPath)}`);
}

function readPublishedPublicSurfaceCommits(authorityRepoRoot) {
  const sourceLedger = loadJson(
    path.join(
      authorityRepoRoot,
      'docs',
      'product',
      'public-github-source-publication-ledger.json'
    )
  );
  const wikiLedger = loadJson(
    path.join(
      authorityRepoRoot,
      'docs',
      'product',
      'public-github-wiki-publication-ledger.json'
    )
  );

  const sourcePublication = (sourceLedger.publications ?? []).find(
    (entry) => entry.id === 'public-source-product-repo-baseline'
  );
  if (!sourcePublication?.repoCommit) {
    throw new Error('Public GitHub source publication ledger does not retain a published repo commit.');
  }

  const publishedWikiHeadCommit =
    typeof wikiLedger.publishedHeadCommit === 'string' ? wikiLedger.publishedHeadCommit.trim() : '';
  if (publishedWikiHeadCommit) {
    return {
      publicRepoCommit: sourcePublication.repoCommit,
      publicWikiCommit: publishedWikiHeadCommit
    };
  }

  const wikiCommits = Array.from(
    new Set((wikiLedger.pages ?? []).map((entry) => entry.wikiCommit).filter(Boolean))
  );
  if (wikiCommits.length !== 1) {
    throw new Error(
      'Public GitHub wiki publication ledger must retain publishedHeadCommit when page rows span multiple commits.'
    );
  }

  return {
    publicRepoCommit: sourcePublication.repoCommit,
    publicWikiCommit: wikiCommits[0]
  };
}

function parsePublicProductGateDPreflightArgs(argv, authorityRepoRoot = repoRoot) {
  const publicRepoJumpEntry = resolveRepoJumpEntry(authorityRepoRoot, 'vi-history-suite.public');
  const publicWikiJumpEntry = resolveRepoJumpEntry(authorityRepoRoot, 'vi-history-suite.github.wiki');

  const parsed = {
    helpRequested: false,
    publicRepoRoot: resolveRepoJumpLocalPath(authorityRepoRoot, publicRepoJumpEntry.localPath),
    publicWikiRoot: resolveRepoJumpLocalPath(authorityRepoRoot, publicWikiJumpEntry.localPath),
    fixtureRepoRoot: path.resolve(DEFAULT_FIXTURE_REPO_ROOT),
    fixtureViPath: DEFAULT_FIXTURE_VI_PATH,
    linuxImage: DEFAULT_LINUX_IMAGE,
    evidenceRoot: DEFAULT_EVIDENCE_ROOT,
    prepareColdPull: false,
    allowDirtyPublicRepo: false,
    allowDirtyPublicWiki: false,
    skipPublicWikiCheck: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === '--help' || argument === '-h') {
      parsed.helpRequested = true;
      continue;
    }

    if (argument === '--public-repo-root') {
      parsed.publicRepoRoot = path.resolve(argv[index + 1] ?? '');
      if (!argv[index + 1]) {
        throw new Error('Missing value for --public-repo-root');
      }
      index += 1;
      continue;
    }

    if (argument === '--public-wiki-root') {
      parsed.publicWikiRoot = path.resolve(argv[index + 1] ?? '');
      if (!argv[index + 1]) {
        throw new Error('Missing value for --public-wiki-root');
      }
      index += 1;
      continue;
    }

    if (argument === '--fixture-repo-root') {
      parsed.fixtureRepoRoot = path.resolve(argv[index + 1] ?? '');
      if (!argv[index + 1]) {
        throw new Error('Missing value for --fixture-repo-root');
      }
      index += 1;
      continue;
    }

    if (argument === '--fixture-vi-path') {
      const value = argv[index + 1];
      if (!value) {
        throw new Error('Missing value for --fixture-vi-path');
      }
      parsed.fixtureViPath = value;
      index += 1;
      continue;
    }

    if (argument === '--linux-image') {
      const value = argv[index + 1];
      if (!value) {
        throw new Error('Missing value for --linux-image');
      }
      parsed.linuxImage = value;
      index += 1;
      continue;
    }

    if (argument === '--evidence-root') {
      const value = argv[index + 1];
      if (!value) {
        throw new Error('Missing value for --evidence-root');
      }
      parsed.evidenceRoot = path.resolve(value);
      index += 1;
      continue;
    }

    if (argument === '--prepare-cold-pull') {
      parsed.prepareColdPull = true;
      continue;
    }

    if (argument === '--allow-dirty-public-repo') {
      parsed.allowDirtyPublicRepo = true;
      continue;
    }

    if (argument === '--allow-dirty-public-wiki') {
      parsed.allowDirtyPublicWiki = true;
      continue;
    }

    if (argument === '--skip-public-wiki-check') {
      parsed.skipPublicWikiCheck = true;
      continue;
    }

    throw new Error(`Unknown argument: ${argument}`);
  }

  return parsed;
}

function createPublicProductGateDPreflightSteps(options = {}) {
  const steps = [
    {
      id: 'inspect-public-repo-head',
      title: 'Inspect published public source repo checkout',
      command: 'git',
      args: ['-C', options.publicRepoRoot ?? '<public-repo-root>', 'rev-parse', 'HEAD']
    },
    {
      id: 'inspect-public-repo-remote',
      title: 'Inspect public source repo origin remote',
      command: 'git',
      args: ['-C', options.publicRepoRoot ?? '<public-repo-root>', 'remote', 'get-url', 'origin']
    },
    {
      id: 'inspect-public-repo-dirty',
      title: 'Inspect public source repo cleanliness',
      command: 'git',
      args: ['-C', options.publicRepoRoot ?? '<public-repo-root>', 'status', '--porcelain']
    },
    {
      id: 'inspect-canonical-fixture-head',
      title: 'Inspect canonical fixture workspace checkout',
      command: 'git',
      args: ['-C', options.fixtureRepoRoot ?? '<fixture-repo-root>', 'rev-parse', 'HEAD']
    },
    {
      id: 'inspect-docker-engine',
      title: 'Inspect Docker engine facts',
      command: 'docker',
      args: ['info', '--format', '{{json .}}']
    },
    {
      id: 'inspect-governed-linux-image',
      title: 'Inspect governed Linux image presence before Gate D',
      command: 'docker',
      args: ['image', 'inspect', options.linuxImage ?? DEFAULT_LINUX_IMAGE]
    }
  ];

  if (!options.skipPublicWikiCheck) {
    steps.splice(3, 0,
      {
        id: 'inspect-public-wiki-head',
        title: 'Inspect published public wiki checkout',
        command: 'git',
        args: ['-C', options.publicWikiRoot ?? '<public-wiki-root>', 'rev-parse', 'HEAD']
      },
      {
        id: 'inspect-public-wiki-remote',
        title: 'Inspect public wiki origin remote',
        command: 'git',
        args: ['-C', options.publicWikiRoot ?? '<public-wiki-root>', 'remote', 'get-url', 'origin']
      },
      {
        id: 'inspect-public-wiki-dirty',
        title: 'Inspect public wiki cleanliness',
        command: 'git',
        args: ['-C', options.publicWikiRoot ?? '<public-wiki-root>', 'status', '--porcelain']
      }
    );
  }

  if (options.prepareColdPull) {
    steps.push({
      id: 'remove-governed-linux-image',
      title: 'Remove governed Linux image to prepare a cold pull',
      command: 'docker',
      args: ['image', 'rm', '-f', options.linuxImage ?? DEFAULT_LINUX_IMAGE]
    });
    steps.push({
      id: 'inspect-governed-linux-image-after-prepare',
      title: 'Verify governed Linux image is absent after cold-pull preparation',
      command: 'docker',
      args: ['image', 'inspect', options.linuxImage ?? DEFAULT_LINUX_IMAGE]
    });
  }

  return steps;
}

function toCompactTimestamp(iso) {
  return iso.replace(/[:.]/g, '-');
}

async function prepareEvidenceDirectories(evidenceRoot, recordedAt) {
  const runDir = path.join(evidenceRoot, 'runs', toCompactTimestamp(recordedAt));
  const latestDir = path.join(evidenceRoot, 'latest');
  await fsp.rm(runDir, { recursive: true, force: true });
  await fsp.mkdir(runDir, { recursive: true });
  await fsp.rm(latestDir, { recursive: true, force: true });
  await fsp.mkdir(latestDir, { recursive: true });
  return { runDir, latestDir };
}

function runCommand(command, args, options = {}) {
  return (options.spawnSyncImpl ?? spawnSync)(command, args, {
    cwd: options.cwd ?? repoRoot,
    env: options.env ?? process.env,
    encoding: 'utf8',
    shell: false,
    maxBuffer: 10 * 1024 * 1024
  });
}

function quotePowerShellLiteral(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function runDockerCommand(args, options = {}) {
  const directResult = runCommand('docker', args, options);
  if (directResult.status === 0 || (options.hostPlatform ?? process.platform) === 'win32') {
    return {
      ...directResult,
      transport: 'direct'
    };
  }

  const windowsDockerCommand = [
    `$ErrorActionPreference = 'Stop'`,
    `& ${quotePowerShellLiteral(WINDOWS_DOCKER_EXE)} ${args.map(quotePowerShellLiteral).join(' ')}`
  ].join('; ');
  const fallbackResult = runCommand(
    'powershell.exe',
    ['-NoProfile', '-Command', windowsDockerCommand],
    options
  );

  if (fallbackResult.status === 0) {
    return {
      ...fallbackResult,
      transport: 'powershell-windows-docker'
    };
  }

  return {
    ...fallbackResult,
    stdout: [directResult.stdout ?? '', fallbackResult.stdout ?? ''].filter(Boolean).join('\n'),
    stderr: [
      directResult.stderr ?? '',
      fallbackResult.stderr ? `[windows-fallback]\n${fallbackResult.stderr}` : ''
    ]
      .filter(Boolean)
      .join('\n'),
    transport: 'powershell-windows-docker'
  };
}

async function writeText(filePath, content) {
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  await fsp.writeFile(filePath, content, 'utf8');
}

async function writeEvidencePair(directories, fileName, content) {
  const runPath = path.join(directories.runDir, fileName);
  const latestPath = path.join(directories.latestDir, fileName);
  await writeText(runPath, content);
  await writeText(latestPath, content);
  return { runPath, latestPath };
}

function readFixtureState(fixtureRepoRoot, fixtureViPath) {
  const fixtureViAbsolutePath = path.join(fixtureRepoRoot, fixtureViPath);
  return {
    fixtureRepoRoot,
    fixtureViPath,
    fixtureViAbsolutePath,
    fixtureRepoExists: fs.existsSync(fixtureRepoRoot),
    fixtureViExists: fs.existsSync(fixtureViAbsolutePath)
  };
}

function normalizeRemoteUrl(value) {
  return (value ?? '').trim();
}

function normalizeStdout(value) {
  return (value ?? '').trim();
}

function commitsMatch(expectedCommit, actualCommit) {
  if (!expectedCommit || !actualCommit) {
    return false;
  }

  return (
    actualCommit === expectedCommit ||
    actualCommit.startsWith(expectedCommit) ||
    expectedCommit.startsWith(actualCommit)
  );
}

function parseDockerInfo(raw) {
  const parsed = JSON.parse(raw);
  return {
    osType: parsed.OSType ?? null,
    serverVersion: parsed.ServerVersion ?? null,
    operatingSystem: parsed.OperatingSystem ?? null,
    name: parsed.Name ?? null
  };
}

async function inspectGitCheckout(checkoutRoot, expectedRemote, options) {
  const headResult = runCommand('git', ['-C', checkoutRoot, 'rev-parse', 'HEAD'], options);
  const remoteResult = runCommand(
    'git',
    ['-C', checkoutRoot, 'remote', 'get-url', 'origin'],
    options
  );
  const dirtyResult = runCommand('git', ['-C', checkoutRoot, 'status', '--porcelain'], options);

  if (headResult.status !== 0) {
    throw new Error(`Unable to resolve Git HEAD for ${checkoutRoot}`);
  }
  if (remoteResult.status !== 0) {
    throw new Error(`Unable to resolve origin remote for ${checkoutRoot}`);
  }
  if (dirtyResult.status !== 0) {
    throw new Error(`Unable to inspect Git status for ${checkoutRoot}`);
  }

  const remoteUrl = normalizeRemoteUrl(remoteResult.stdout);
  if (expectedRemote && remoteUrl !== expectedRemote) {
    throw new Error(`Unexpected origin remote for ${checkoutRoot}: ${remoteUrl}`);
  }

  return {
    headCommit: normalizeStdout(headResult.stdout),
    remoteUrl,
    dirty: dirtyResult.stdout.trim().length > 0,
    dirtyPorcelain: dirtyResult.stdout
  };
}

function createFailure(stepId, message, extra = {}) {
  return {
    stepId,
    message,
    ...extra
  };
}

function buildPublicProductGateDPreflightReport(options) {
  return {
    schema: 'vi-history-suite/public-product-gate-d-preflight@v1',
    recordedAt: options.recordedAt,
    status: options.status,
    mode: options.prepareColdPull ? 'prepare-cold-pull' : 'preflight',
    authorityRepoRoot: options.authorityRepoRoot,
    evidenceRoot: options.evidenceRoot,
    runDir: options.runDir,
    latestDir: options.latestDir,
    publicRepo: options.publicRepo,
    publicWiki: options.publicWiki ?? null,
    fixture: options.fixture,
    docker: options.docker,
    steps: options.steps,
    failure: options.failure ?? null
  };
}

function buildPublicProductGateDPreflightMarkdown(report) {
  const lines = [
    '# Public Product Gate D Preflight',
    '',
    `- Status: ${report.status}`,
    `- Mode: ${report.mode}`,
    `- Recorded at: ${report.recordedAt}`,
    `- Authority repo: ${report.authorityRepoRoot}`,
    `- Public repo: ${report.publicRepo.checkoutRoot}`,
    `- Expected public repo commit: ${report.publicRepo.expectedCommit}`,
    `- Actual public repo commit: ${report.publicRepo.actualCommit}`,
    `- Public repo clean: ${report.publicRepo.clean ? 'yes' : 'no'}`,
    `- Fixture repo: ${report.fixture.fixtureRepoRoot}`,
    `- Fixture VI: ${report.fixture.fixtureViAbsolutePath}`,
    `- Fixture VI exists: ${report.fixture.fixtureViExists ? 'yes' : 'no'}`,
    `- Docker engine OSType: ${report.docker.osType ?? 'unknown'}`,
    `- Docker command transport: ${report.docker.transport ?? 'unknown'}`,
    `- Governed Linux image: ${report.docker.linuxImage}`,
    `- Image present before prepare: ${report.docker.imagePresentBeforePrepare ? 'yes' : 'no'}`,
    `- Image present after prepare: ${report.docker.imagePresentAfterPrepare == null ? 'not-checked' : report.docker.imagePresentAfterPrepare ? 'yes' : 'no'}`,
    ''
  ];

  if (report.publicWiki) {
    lines.push(
      `- Public wiki: ${report.publicWiki.checkoutRoot}`,
      `- Expected public wiki commit: ${report.publicWiki.expectedCommit}`,
      `- Actual public wiki commit: ${report.publicWiki.actualCommit}`,
      `- Public wiki clean: ${report.publicWiki.clean ? 'yes' : 'no'}`,
      ''
    );
  }

  lines.push('## Steps', '');
  for (const step of report.steps) {
    lines.push(`- ${step.id}: ${step.status}`);
  }

  lines.push('', '## Failure', '');
  if (report.failure) {
    lines.push(`- Step: ${report.failure.stepId ?? 'unknown'}`);
    lines.push(`- Message: ${report.failure.message}`);
  } else {
    lines.push('- none');
  }

  return lines.join('\n');
}

async function runPublicProductGateDPreflight(argv = process.argv.slice(2), deps = {}) {
  const parsed = parsePublicProductGateDPreflightArgs(argv, deps.authorityRepoRoot ?? repoRoot);
  const stdout = deps.stdout ?? process.stdout;

  if (parsed.helpRequested) {
    stdout.write(`${getPublicProductGateDPreflightUsage()}\n`);
    return 'help';
  }

  const authorityRepoRoot = deps.authorityRepoRoot ?? repoRoot;
  const recordedAt = (deps.nowIso ?? (() => new Date().toISOString()))();
  const directories = await prepareEvidenceDirectories(parsed.evidenceRoot, recordedAt);
  const publishedCommits = readPublishedPublicSurfaceCommits(authorityRepoRoot);
  const publicRepoJumpEntry = resolveRepoJumpEntry(authorityRepoRoot, 'vi-history-suite.public');
  const publicWikiJumpEntry = resolveRepoJumpEntry(authorityRepoRoot, 'vi-history-suite.github.wiki');
  const steps = [];
  let failure = null;
  let status = 'passed';

  const fixture = readFixtureState(parsed.fixtureRepoRoot, parsed.fixtureViPath);
  const publicRepo = {
    checkoutRoot: parsed.publicRepoRoot,
    expectedRemote: publicRepoJumpEntry.expectedRemote,
    expectedCommit: publishedCommits.publicRepoCommit
  };
  const publicWiki = parsed.skipPublicWikiCheck
    ? null
    : {
        checkoutRoot: parsed.publicWikiRoot,
        expectedRemote: publicWikiJumpEntry.expectedRemote,
        expectedCommit: publishedCommits.publicWikiCommit
      };
  const docker = {
    linuxImage: parsed.linuxImage,
    osType: null,
    serverVersion: null,
    operatingSystem: null,
    name: null,
    transport: null,
    imagePresentBeforePrepare: null,
    imagePresentAfterPrepare: null
  };

  async function recordStep(step, result) {
    const stdoutFiles = await writeEvidencePair(
      directories,
      `${step.id}.stdout.log`,
      result.stdout ?? ''
    );
    const stderrFiles = await writeEvidencePair(
      directories,
      `${step.id}.stderr.log`,
      result.stderr ?? ''
    );
    steps.push({
      id: step.id,
      title: step.title,
      command: step.command,
      args: step.args,
      status: result.status,
      stdoutPath: stdoutFiles.runPath,
      stderrPath: stderrFiles.runPath
    });
  }

  try {
    const publicRepoStep = createPublicProductGateDPreflightSteps({
      publicRepoRoot: parsed.publicRepoRoot,
      publicWikiRoot: parsed.publicWikiRoot,
      fixtureRepoRoot: parsed.fixtureRepoRoot,
      linuxImage: parsed.linuxImage,
      prepareColdPull: parsed.prepareColdPull,
      skipPublicWikiCheck: parsed.skipPublicWikiCheck
    });

    const repoState = await inspectGitCheckout(parsed.publicRepoRoot, publicRepo.expectedRemote, deps);
    publicRepo.actualCommit = repoState.headCommit;
    publicRepo.clean = !repoState.dirty;
    await recordStep(publicRepoStep.find((step) => step.id === 'inspect-public-repo-head'), {
      stdout: `${repoState.headCommit}\n`,
      stderr: '',
      status: 'passed'
    });
    await recordStep(publicRepoStep.find((step) => step.id === 'inspect-public-repo-remote'), {
      stdout: `${repoState.remoteUrl}\n`,
      stderr: '',
      status: 'passed'
    });
    await recordStep(publicRepoStep.find((step) => step.id === 'inspect-public-repo-dirty'), {
      stdout: repoState.dirtyPorcelain,
      stderr: '',
      status: repoState.dirty ? 'failed' : 'passed'
    });

    if (!commitsMatch(publicRepo.expectedCommit, publicRepo.actualCommit)) {
      throw createFailure(
        'inspect-public-repo-head',
        `Public repo checkout commit ${publicRepo.actualCommit} does not match published commit ${publicRepo.expectedCommit}.`
      );
    }
    if (repoState.dirty && !parsed.allowDirtyPublicRepo) {
      throw createFailure(
        'inspect-public-repo-dirty',
        'Public repo checkout is dirty; Gate D preflight requires the published public product checkout.'
      );
    }

    if (publicWiki) {
      const wikiState = await inspectGitCheckout(parsed.publicWikiRoot, publicWiki.expectedRemote, deps);
      publicWiki.actualCommit = wikiState.headCommit;
      publicWiki.clean = !wikiState.dirty;
      await recordStep(publicRepoStep.find((step) => step.id === 'inspect-public-wiki-head'), {
        stdout: `${wikiState.headCommit}\n`,
        stderr: '',
        status: 'passed'
      });
      await recordStep(publicRepoStep.find((step) => step.id === 'inspect-public-wiki-remote'), {
        stdout: `${wikiState.remoteUrl}\n`,
        stderr: '',
        status: 'passed'
      });
      await recordStep(publicRepoStep.find((step) => step.id === 'inspect-public-wiki-dirty'), {
        stdout: wikiState.dirtyPorcelain,
        stderr: '',
        status: wikiState.dirty ? 'failed' : 'passed'
      });

      if (!commitsMatch(publicWiki.expectedCommit, publicWiki.actualCommit)) {
        throw createFailure(
          'inspect-public-wiki-head',
          `Public wiki checkout commit ${publicWiki.actualCommit} does not match published commit ${publicWiki.expectedCommit}.`
        );
      }
      if (wikiState.dirty && !parsed.allowDirtyPublicWiki) {
        throw createFailure(
          'inspect-public-wiki-dirty',
          'Public wiki checkout is dirty; Gate D preflight requires the published public user-doc checkout.'
        );
      }
    }

    const fixtureHeadResult = runCommand(
      'git',
      ['-C', parsed.fixtureRepoRoot, 'rev-parse', 'HEAD'],
      deps
    );
    await recordStep(publicRepoStep.find((step) => step.id === 'inspect-canonical-fixture-head'), {
      stdout: fixtureHeadResult.stdout ?? '',
      stderr: fixtureHeadResult.stderr ?? '',
      status:
        fixtureHeadResult.status === 0 && fixture.fixtureRepoExists && fixture.fixtureViExists
          ? 'passed'
          : 'failed'
    });
    if (!fixture.fixtureRepoExists || fixtureHeadResult.status !== 0) {
      throw createFailure(
        'inspect-canonical-fixture-head',
        `Canonical fixture repo is not available at ${parsed.fixtureRepoRoot}.`
      );
    }
    if (!fixture.fixtureViExists) {
      throw createFailure(
        'inspect-canonical-fixture-head',
        `Canonical fixture VI is missing at ${fixture.fixtureViAbsolutePath}.`
      );
    }
    fixture.fixtureRepoCommit = normalizeStdout(fixtureHeadResult.stdout);

    const dockerInfoResult = runDockerCommand(['info', '--format', '{{json .}}'], deps);
    await recordStep(publicRepoStep.find((step) => step.id === 'inspect-docker-engine'), {
      stdout: dockerInfoResult.stdout ?? '',
      stderr: dockerInfoResult.stderr ?? '',
      status: dockerInfoResult.status === 0 ? 'passed' : 'failed'
    });
    if (dockerInfoResult.status !== 0) {
      throw createFailure(
        'inspect-docker-engine',
        'Docker info failed; Gate D preflight requires a reachable Docker daemon.'
      );
    }
    Object.assign(docker, parseDockerInfo(dockerInfoResult.stdout));
    docker.transport = dockerInfoResult.transport ?? 'direct';
    if (docker.osType !== 'linux') {
      throw createFailure(
        'inspect-docker-engine',
        `Gate D preflight requires Docker Linux engine, got ${docker.osType ?? 'unknown'}.`
      );
    }

    const imageInspectBefore = runDockerCommand(['image', 'inspect', parsed.linuxImage], deps);
    docker.imagePresentBeforePrepare = imageInspectBefore.status === 0;
    await recordStep(publicRepoStep.find((step) => step.id === 'inspect-governed-linux-image'), {
      stdout: imageInspectBefore.stdout ?? '',
      stderr: imageInspectBefore.stderr ?? '',
      status: 'passed'
    });

    if (parsed.prepareColdPull) {
      const removeResult = runDockerCommand(['image', 'rm', '-f', parsed.linuxImage], deps);
      await recordStep(publicRepoStep.find((step) => step.id === 'remove-governed-linux-image'), {
        stdout: removeResult.stdout ?? '',
        stderr: removeResult.stderr ?? '',
        status: removeResult.status === 0 ? 'passed' : 'passed'
      });

      const imageInspectAfter = runDockerCommand(['image', 'inspect', parsed.linuxImage], deps);
      docker.imagePresentAfterPrepare = imageInspectAfter.status === 0;
      await recordStep(
        publicRepoStep.find((step) => step.id === 'inspect-governed-linux-image-after-prepare'),
        {
          stdout: imageInspectAfter.stdout ?? '',
          stderr: imageInspectAfter.stderr ?? '',
          status: imageInspectAfter.status === 0 ? 'failed' : 'passed'
        }
      );
      if (docker.imagePresentAfterPrepare) {
        throw createFailure(
          'inspect-governed-linux-image-after-prepare',
          `Governed Linux image ${parsed.linuxImage} is still present after cold-pull preparation.`
        );
      }
    }
  } catch (error) {
    status = 'failed';
    failure =
      error && typeof error === 'object' && 'stepId' in error
        ? error
        : createFailure('unknown', error instanceof Error ? error.message : String(error));
  }

  const report = buildPublicProductGateDPreflightReport({
    recordedAt,
    status,
    prepareColdPull: parsed.prepareColdPull,
    authorityRepoRoot,
    evidenceRoot: parsed.evidenceRoot,
    runDir: directories.runDir,
    latestDir: directories.latestDir,
    publicRepo,
    publicWiki,
    fixture,
    docker,
    steps,
    failure
  });

  await writeEvidencePair(
    directories,
    'public-product-gate-d-preflight.json',
    `${JSON.stringify(report, null, 2)}\n`
  );
  await writeEvidencePair(
    directories,
    'public-product-gate-d-preflight.md',
    `${buildPublicProductGateDPreflightMarkdown(report)}\n`
  );

  if (status === 'failed') {
    const message = failure?.message ?? 'Public product Gate D preflight failed.';
    throw new Error(message);
  }

  return report;
}

if (require.main === module) {
  runPublicProductGateDPreflight().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}

module.exports = {
  createPublicProductGateDPreflightSteps,
  getPublicProductGateDPreflightUsage,
  parsePublicProductGateDPreflightArgs,
  readPublishedPublicSurfaceCommits,
  buildPublicProductGateDPreflightMarkdown,
  runPublicProductGateDPreflight
};

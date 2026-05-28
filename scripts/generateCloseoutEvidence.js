#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const DEFAULT_STANDARDS_IMAGE = 'repo-standards-review-assurance-workbench:local';
const DEFAULT_SAVE_DIR = 'assurance-closeout-evidence';
const DEFAULT_SKILL_ROOT = process.env.REPO_STANDARDS_REVIEW_ROOT ||
  'C:\\Users\\sveld\\.codex\\skills\\repo-standards-review';

function npmCommand(platform = process.platform) {
  return platform === 'win32' ? 'npm.cmd' : 'npm';
}

function parseArgs(argv) {
  const options = {
    kind: undefined,
    issue: undefined,
    runGates: false,
    saveDir: undefined,
    standardsRunner: 'auto',
    standardsImage: DEFAULT_STANDARDS_IMAGE,
    skillRoot: DEFAULT_SKILL_ROOT,
    buildStandardsImage: false,
    releaseTag: undefined,
    releasePr: undefined,
    backSyncPr: undefined,
    marketplaceRun: undefined
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) {
        throw new Error(`${arg} requires a value`);
      }
      index += 1;
      return value;
    };

    if (arg === '--kind') options.kind = next();
    else if (arg === '--issue') options.issue = next();
    else if (arg === '--run-gates') options.runGates = true;
    else if (arg === '--save-dir') options.saveDir = next() || DEFAULT_SAVE_DIR;
    else if (arg === '--standards-runner') options.standardsRunner = next();
    else if (arg === '--standards-image') options.standardsImage = next();
    else if (arg === '--skill-root') options.skillRoot = next();
    else if (arg === '--build-standards-image') options.buildStandardsImage = true;
    else if (arg === '--release-tag') options.releaseTag = next();
    else if (arg === '--release-pr') options.releasePr = next();
    else if (arg === '--back-sync-pr') options.backSyncPr = next();
    else if (arg === '--marketplace-run') options.marketplaceRun = next();
    else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }

  if (options.help) {
    return options;
  }

  if (!['standards', 'release'].includes(options.kind)) {
    throw new Error('--kind must be standards or release');
  }

  if (!['auto', 'host', 'docker'].includes(options.standardsRunner)) {
    throw new Error('--standards-runner must be auto, host, or docker');
  }

  return options;
}

function usage() {
  return [
    'Usage: node scripts/generateCloseoutEvidence.js --kind standards|release [options]',
    '',
    'Options:',
    '  --issue <number>',
    '  --run-gates',
    '  --save-dir <path>',
    '  --standards-runner auto|host|docker',
    '  --standards-image <image>',
    '  --build-standards-image',
    '  --release-tag vX.Y.Z',
    '  --release-pr <number>',
    '  --back-sync-pr <number>',
    '  --marketplace-run <run-id-or-url>'
  ].join('\n');
}

function commandLine(command, args) {
  return [command, ...args].join(' ');
}

function quoteForWindowsShell(value) {
  const text = String(value);
  if (/^[A-Za-z0-9_./:\\=-]+$/.test(text)) {
    return text;
  }

  return `"${text.replace(/"/g, '\\"')}"`;
}

function windowsShellLine(command, args) {
  return [command, ...args].map(quoteForWindowsShell).join(' ');
}

function runCommand(command, args, deps = {}) {
  const spawnSyncImpl = deps.spawnSync || spawnSync;
  const platform = deps.platform || process.platform;
  const useWindowsShellLine = platform === 'win32' && !deps.spawnSync;
  const result = spawnSyncImpl(
    useWindowsShellLine ? windowsShellLine(command, args) : command,
    useWindowsShellLine ? [] : args,
    {
    cwd: deps.cwd,
    encoding: 'utf8',
    shell: platform === 'win32'
    }
  );

  return {
    command: commandLine(command, args),
    status: result.status ?? (result.error ? 1 : 0),
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    error: result.error ? String(result.error.message || result.error) : ''
  };
}

function runGateCommands(options, deps = {}) {
  const platform = deps.platform || process.platform;
  const npm = npmCommand(platform);
  const gates = [
    ['traceability:audit', npm, ['run', 'traceability:audit']],
    ['check', npm, ['run', 'check']],
    ['test', npm, ['test']],
    ['package', npm, ['run', 'package']]
  ];

  return gates.map(([name, command, args]) => {
    const started = Date.now();
    const result = runCommand(command, args, deps);
    const durationMs = Date.now() - started;
    return {
      name,
      ...result,
      durationMs,
      success: result.status === 0
    };
  });
}

function parseTraceabilitySummary(output) {
  const inventoryMatch = output.match(/Total inventory entries:\s*(\d+)/);
  const gapMatch = output.match(/Gap entries pending classification:\s*(\d+)/);
  return {
    inventoryEntries: inventoryMatch ? Number(inventoryMatch[1]) : undefined,
    gapEntries: gapMatch ? Number(gapMatch[1]) : undefined
  };
}

function hostStandardsCommands(skillRoot) {
  const scripts = path.join(skillRoot, 'scripts');
  return [
    {
      name: 'preflight',
      file: 'standards-preflight.json',
      command: 'python3',
      args: [path.join(scripts, 'preflight_local_dependencies.py'), '--json']
    },
    {
      name: 'requirements-quality',
      file: 'requirements-quality.json',
      command: 'python3',
      args: [
        path.join(scripts, 'requirements_quality_check.py'),
        '.',
        '--requirements-spec-scope',
        'system',
        '--json'
      ]
    },
    {
      name: 'evidence-scan',
      file: 'repo-evidence-scan.json',
      command: 'python3',
      args: [
        path.join(scripts, 'repo_evidence_scan.py'),
        '.',
        '--format',
        'json',
        '--profile',
        'quick-triage',
        '--include-snippets'
      ]
    },
    {
      name: 'assurance-scorecard',
      file: 'assurance-scorecard.txt',
      command: 'python3',
      args: [
        path.join(scripts, 'run_assurance.py'),
        '.',
        '--profile',
        'quick-triage',
        '--output',
        'gate-scorecard'
      ]
    }
  ];
}

function parseJsonOrUndefined(text) {
  try {
    return JSON.parse(text);
  } catch (_error) {
    return undefined;
  }
}

function summarizeStandardsResults(results, runner) {
  const byName = new Map(results.map((result) => [result.name, result]));
  const preflight = parseJsonOrUndefined(byName.get('preflight')?.stdout || '');
  const requirementsQuality = parseJsonOrUndefined(byName.get('requirements-quality')?.stdout || '');
  const evidenceScan = parseJsonOrUndefined(byName.get('evidence-scan')?.stdout || '');
  const scorecard = byName.get('assurance-scorecard')?.stdout || '';
  const failed = results.filter((result) => result.status !== 0);

  return {
    runner,
    success: failed.length === 0,
    failed,
    preflight,
    requirementsQuality,
    evidenceScan,
    scorecard,
    fileCount: evidenceScan?.inventory?.file_count,
    testSignal: evidenceScan?.areas?.TEST?.signal,
    reqSignal: evidenceScan?.areas?.REQ?.signal,
    coverageGate: /coverage\s*\|\s*PASS/i.test(scorecard) ? 'PASS' : undefined,
    docGate: /doc\s*\|\s*FAIL/i.test(scorecard) ? 'FAIL' : undefined,
    dodGate: /dod\s*\|\s*N\/A/i.test(scorecard) ? 'N/A' : undefined
  };
}

function runHostStandards(options, deps = {}) {
  const results = hostStandardsCommands(options.skillRoot).map((step) => ({
    ...step,
    ...runCommand(step.command, step.args, deps)
  }));
  const summary = summarizeStandardsResults(results, 'host');
  const preflightOk = summary.preflight?.ok === true;
  return {
    runner: 'host',
    success: summary.success && preflightOk,
    results,
    summary,
    failure: preflightOk ? undefined : 'Host standards preflight did not return ok: true.'
  };
}

function dockerStandardsCommands(image) {
  return [
    {
      name: 'requirements-quality',
      file: 'requirements-quality.json',
      command: 'docker',
      args: [
        'run',
        '--rm',
        '-v',
        '${REPO}:/target',
        image,
        'python3',
        'scripts/requirements_quality_check.py',
        '/target',
        '--requirements-spec-scope',
        'system',
        '--json'
      ]
    },
    {
      name: 'evidence-scan',
      file: 'repo-evidence-scan.json',
      command: 'docker',
      args: [
        'run',
        '--rm',
        '-v',
        '${REPO}:/target',
        image,
        'python3',
        'scripts/repo_evidence_scan.py',
        '/target',
        '--format',
        'json',
        '--profile',
        'quick-triage',
        '--include-snippets'
      ]
    },
    {
      name: 'assurance-scorecard',
      file: 'assurance-scorecard.txt',
      command: 'docker',
      args: [
        'run',
        '--rm',
        '-v',
        '${REPO}:/target',
        image,
        'python3',
        'scripts/run_assurance.py',
        '/target',
        '--profile',
        'quick-triage',
        '--output',
        'gate-scorecard'
      ]
    }
  ];
}

function replaceRepoMount(args, repoRoot) {
  return args.map((arg) => arg === '${REPO}:/target' ? `${repoRoot}:/target` : arg);
}

function runDockerStandards(options, deps = {}) {
  const repoRoot = deps.cwd || process.cwd();
  const inspect = runCommand('docker', ['image', 'inspect', options.standardsImage], deps);
  const results = [{
    name: 'docker-preflight',
    file: 'standards-docker-preflight.txt',
    ...inspect
  }];
  let imageAvailable = inspect.status === 0;

  if (!imageAvailable) {
    if (!options.buildStandardsImage) {
      return {
        runner: 'docker',
        success: false,
        results,
        summary: {
          runner: 'docker',
          success: false,
          scorecard: '',
          failed: results
        },
        failure: `Docker standards image '${options.standardsImage}' is missing. Build it with: docker build -f "${path.join(options.skillRoot, 'docker', 'assurance-workbench', 'Dockerfile')}" -t ${options.standardsImage} "${options.skillRoot}"`
      };
    }

    const build = runCommand('docker', [
      'build',
      '-f',
      path.join(options.skillRoot, 'docker', 'assurance-workbench', 'Dockerfile'),
      '-t',
      options.standardsImage,
      options.skillRoot
    ], deps);
    results.push({ name: 'docker-build', file: 'standards-docker-build.txt', ...build });
    if (build.status !== 0) {
      return {
        runner: 'docker',
        success: false,
        results,
        summary: {
          runner: 'docker',
          success: false,
          scorecard: '',
          failed: [{ name: 'docker-build', ...build }]
        },
        failure: 'Docker standards image build failed.'
      };
    }

    const verifyImage = runCommand('docker', ['image', 'inspect', options.standardsImage], deps);
    results.push({
      name: 'docker-image-after-build',
      file: 'standards-docker-image-after-build.txt',
      ...verifyImage
    });
    imageAvailable = verifyImage.status === 0;
    if (!imageAvailable) {
      return {
        runner: 'docker',
        success: false,
        results,
        summary: {
          runner: 'docker',
          success: false,
          scorecard: '',
          failed: [{ name: 'docker-image-after-build', ...verifyImage }]
        },
        failure: 'Docker standards image build completed, but the image could not be inspected.'
      };
    }
  }

  results.push(
    ...dockerStandardsCommands(options.standardsImage).map((step) => ({
      ...step,
      args: replaceRepoMount(step.args, repoRoot),
      ...runCommand(step.command, replaceRepoMount(step.args, repoRoot), deps)
    }))
  );
  const summary = summarizeStandardsResults(
    results.filter((result) => !result.name.startsWith('docker-')),
    'docker'
  );
  return {
    runner: 'docker',
    success: imageAvailable && summary.success,
    results,
    summary,
    failure: summary.success ? undefined : 'Docker standards evidence failed.'
  };
}

function runStandardsEvidence(options, deps = {}) {
  if (options.standardsRunner === 'host') {
    return runHostStandards(options, deps);
  }

  if (options.standardsRunner === 'docker') {
    return runDockerStandards(options, deps);
  }

  const host = runHostStandards(options, deps);
  if (host.success) {
    return host;
  }

  const docker = runDockerStandards(options, deps);
  if (docker.success) {
    docker.hostFailure = host.failure || host.summary.failed?.[0]?.stderr || 'Host standards runner failed.';
    return docker;
  }

  return {
    runner: 'auto',
    success: false,
    results: [
      ...host.results.map((result) => ({ ...result, file: `host-${result.file}` })),
      ...docker.results.map((result) => ({ ...result, file: `docker-${result.file}` }))
    ],
    summary: {
      runner: 'auto',
      success: false,
      scorecard: docker.summary.scorecard || host.summary.scorecard || '',
      failed: [...(host.summary.failed || []), ...(docker.summary.failed || [])]
    },
    failure: `Standards evidence failed through host and Docker. Host: ${host.failure || 'failed'}. Docker: ${docker.failure || 'failed'}.`
  };
}

function tryGhJson(args, deps = {}) {
  const result = runCommand('gh', args, deps);
  if (result.status !== 0) {
    return undefined;
  }
  return parseJsonOrUndefined(result.stdout);
}

function collectGitContext(deps = {}) {
  const branch = runCommand('git', ['branch', '--show-current'], deps);
  const commit = runCommand('git', ['rev-parse', '--short=8', 'HEAD'], deps);
  const fullCommit = runCommand('git', ['rev-parse', 'HEAD'], deps);
  return {
    branch: branch.status === 0 ? branch.stdout.trim() : 'unknown',
    commit: commit.status === 0 ? commit.stdout.trim() : 'unknown',
    fullCommit: fullCommit.status === 0 ? fullCommit.stdout.trim() : 'unknown'
  };
}

function collectGithubContext(options, deps = {}) {
  const context = {
    issue: undefined,
    releasePr: undefined,
    backSyncPr: undefined
  };

  if (options.issue) {
    context.issue = tryGhJson([
      'issue',
      'view',
      String(options.issue),
      '--json',
      'number,title,state,url'
    ], deps);
  }

  if (options.releasePr) {
    context.releasePr = tryGhJson([
      'pr',
      'view',
      String(options.releasePr),
      '--json',
      'number,title,state,url,mergeCommit'
    ], deps);
  }

  if (options.backSyncPr) {
    context.backSyncPr = tryGhJson([
      'pr',
      'view',
      String(options.backSyncPr),
      '--json',
      'number,title,state,url,mergeCommit'
    ], deps);
  }

  return context;
}

function prepareEvidenceDirectory(saveDir, cwd) {
  if (!saveDir) {
    return;
  }

  const resolvedSaveDir = path.resolve(saveDir);
  const resolvedCwd = path.resolve(cwd);
  const relative = path.relative(resolvedCwd, resolvedSaveDir);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('--save-dir must resolve to a directory inside the repository root');
  }

  fs.rmSync(resolvedSaveDir, { recursive: true, force: true });
}

function writeEvidenceFiles(saveDir, records) {
  if (!saveDir) {
    return;
  }
  fs.mkdirSync(saveDir, { recursive: true });
  for (const record of records) {
    const body = record.stdout || record.stderr || record.error || '';
    fs.writeFileSync(path.join(saveDir, record.file || `${record.name}.txt`), body, 'utf8');
  }
}

function markdownTable(rows) {
  return rows.join('\n');
}

function renderGateTable(gates, traceabilitySummary) {
  if (!gates) {
    return [
      '| Gate | Status | Evidence |',
      '| --- | --- | --- |',
      '| local gates | NOT RUN | Not closable yet until `--run-gates` is used or equivalent results are supplied. |'
    ].join('\n');
  }

  const rows = [
    '| Gate | Status | Evidence |',
    '| --- | --- | --- |'
  ];
  for (const gate of gates) {
    rows.push(`| ${gate.name} | ${gate.success ? 'PASS' : 'FAIL'} | ${gate.command} |`);
  }
  if (traceabilitySummary.inventoryEntries !== undefined) {
    rows.push(`| traceability summary | INFO | ${traceabilitySummary.inventoryEntries} inventory entries; ${traceabilitySummary.gapEntries ?? 'unknown'} gaps |`);
  }
  return rows.join('\n');
}

function renderStandardsSummary(standards) {
  if (!standards.success) {
    return [
      `- Standards runner: ${standards.runner}`,
      `- Standards evidence failed: ${standards.failure || 'unknown failure'}`
    ].join('\n');
  }

  const summary = standards.summary;
  return [
    `- Standards runner: ${summary.runner}`,
    `- Requirements quality: ${summary.requirementsQuality?.ok === true ? 'PASS' : 'see raw evidence'}`,
    `- Evidence scan: ${summary.fileCount ?? 'unknown'} files; REQ=${summary.reqSignal ?? 'unknown'}; TEST=${summary.testSignal ?? 'unknown'}`,
    `- Gate scorecard: coverage=${summary.coverageGate ?? 'see scorecard'}; doc=${summary.docGate ?? 'not flagged'}; dod=${summary.dodGate ?? 'not flagged'}`,
    '- Deferred recommendations: docs link-check/lychee and DoD gate evidence remain next-wave advisory findings, not #130 blockers.'
  ].join('\n');
}

function renderReleaseReferences(options, githubContext) {
  if (options.kind !== 'release') {
    return '';
  }

  return [
    '## Release References',
    '',
    `- Release tag: ${options.releaseTag || 'not supplied'}`,
    `- Release PR: ${githubContext.releasePr?.url || options.releasePr || 'not supplied'}`,
    `- Back-sync PR: ${githubContext.backSyncPr?.url || options.backSyncPr || 'not supplied'}`,
    `- Marketplace workflow run: ${options.marketplaceRun || 'not supplied'}`
  ].join('\n');
}

function renderCloseoutMarkdown(context) {
  const gatesPassed = context.gates ? context.gates.every((gate) => gate.success) : false;
  const closable = context.standards.success && gatesPassed;
  const traceabilitySummary = context.traceabilitySummary || {};
  const issueLabel = context.options.issue ? `#${context.options.issue}` : 'unspecified issue';
  const releaseReferences = renderReleaseReferences(context.options, context.githubContext);

  return [
    `# Closeout Evidence: ${issueLabel}`,
    '',
    `- Kind: ${context.options.kind}`,
    `- Branch: ${context.git.branch}`,
    `- Commit: ${context.git.fullCommit}`,
    `- GitHub issue: ${context.githubContext.issue?.url || 'unavailable; supply manually if needed'}`,
    '',
    releaseReferences,
    releaseReferences ? '' : undefined,
    '## Local Gates',
    '',
    renderGateTable(context.gates, traceabilitySummary),
    '',
    '## Standards Evidence',
    '',
    renderStandardsSummary(context.standards),
    '',
    '## Closure Decision',
    '',
    closable
      ? '- Closable: yes. Mandatory standards evidence and local gates passed.'
      : '- Closable: no. Not closable yet until mandatory standards evidence and local gates are both clean.',
    '',
    '## Next Wave',
    '',
    '- Defer docs link-check/lychee automation to the next standards maturity issue.',
    '- Defer explicit Definition-of-Done gate evidence to the next standards maturity issue.'
  ].filter((line) => line !== undefined).join('\n');
}

function generateCloseoutEvidence(argv, deps = {}) {
  const options = parseArgs(argv);
  if (options.help) {
    return { exitCode: 0, markdown: usage(), context: { options } };
  }

  const cwd = deps.cwd || process.cwd();
  const saveDir = options.saveDir ? path.resolve(cwd, options.saveDir) : undefined;
  prepareEvidenceDirectory(saveDir, cwd);
  const git = collectGitContext({ ...deps, cwd });
  const githubContext = collectGithubContext(options, { ...deps, cwd });
  const gates = options.runGates ? runGateCommands(options, { ...deps, cwd }) : undefined;
  const traceabilityGate = gates?.find((gate) => gate.name === 'traceability:audit');
  const traceabilitySummary = parseTraceabilitySummary(
    `${traceabilityGate?.stdout || ''}\n${traceabilityGate?.stderr || ''}`
  );
  const standards = runStandardsEvidence(options, { ...deps, cwd });
  const records = [
    ...(gates || []).map((gate) => ({ ...gate, file: `gate-${gate.name.replace(/[:/\\]/g, '-')}.txt` })),
    ...standards.results
  ];

  writeEvidenceFiles(saveDir, records);

  const context = {
    options,
    git,
    githubContext,
    gates,
    traceabilitySummary,
    standards
  };
  const markdown = renderCloseoutMarkdown(context);
  const gateFailure = gates ? gates.some((gate) => !gate.success) : false;
  return {
    exitCode: standards.success && !gateFailure ? 0 : 1,
    markdown,
    context
  };
}

function main(argv = process.argv.slice(2), deps = {}) {
  try {
    const result = generateCloseoutEvidence(argv, deps);
    process.stdout.write(`${result.markdown}\n`);
    return result.exitCode;
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n\n${usage()}\n`);
    return 1;
  }
}

if (require.main === module) {
  process.exitCode = main();
}

module.exports = {
  DEFAULT_SAVE_DIR,
  DEFAULT_STANDARDS_IMAGE,
  collectGithubContext,
  collectGitContext,
  dockerStandardsCommands,
  generateCloseoutEvidence,
  hostStandardsCommands,
  main,
  parseArgs,
  parseTraceabilitySummary,
  renderCloseoutMarkdown,
  runDockerStandards,
  runGateCommands,
  runHostStandards,
  runStandardsEvidence,
  summarizeStandardsResults
};

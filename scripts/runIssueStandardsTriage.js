#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const childProcess = require('node:child_process');

const {
  DEFAULT_STANDARDS_IMAGE,
  createTrackedWorktreeSnapshot,
  removeTrackedWorktreeSnapshot,
  parseGateScorecard
} = require('./generateCloseoutEvidence.js');

const DEFAULT_REPO = 'LabVIEW-Community-CI-CD/vi-history-suite';
const DEFAULT_SAVE_DIR = 'assurance-issue-triage-evidence';
const DEFAULT_PROFILE = 'quick-triage';
const DEFAULT_REQUIREMENTS_SPEC_SCOPE = 'system';
const COMMAND_TIMEOUT_MS = 5 * 60 * 1000;
const ISSUE_JSON_FIELDS = [
  'author',
  'body',
  'createdAt',
  'labels',
  'milestone',
  'number',
  'state',
  'title',
  'updatedAt',
  'url'
];

function usage() {
  return [
    'Usage: node scripts/runIssueStandardsTriage.js --issue <number> [options]',
    '',
    'Options:',
    `  --repo <owner/name>              GitHub repo for issue metadata (default: ${DEFAULT_REPO})`,
    `  --image <image>                  Standards workbench image (default: ${DEFAULT_STANDARDS_IMAGE})`,
    `  --profile <profile>              Standards profile for evidence and scorecard (default: ${DEFAULT_PROFILE})`,
    `  --requirements-spec-scope <mode>  requirements_quality_check scope (default: ${DEFAULT_REQUIREMENTS_SPEC_SCOPE})`,
    `  --save-dir <dir>                 Output root (default: ${DEFAULT_SAVE_DIR})`,
    '  --skip-issue-fetch               Do not call gh issue view; useful for dry infrastructure checks',
    '  --keep-snapshot                  Leave the tracked-worktree snapshot on disk for troubleshooting',
    '  --help                           Show this help'
  ].join('\n');
}

function takeValue(argv, index, flag) {
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`${flag} requires a value.`);
  }
  return value;
}

function parseArgs(argv) {
  const options = {
    issue: undefined,
    repo: DEFAULT_REPO,
    image: DEFAULT_STANDARDS_IMAGE,
    profile: DEFAULT_PROFILE,
    requirementsSpecScope: DEFAULT_REQUIREMENTS_SPEC_SCOPE,
    saveDir: DEFAULT_SAVE_DIR,
    skipIssueFetch: false,
    keepSnapshot: false,
    help: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    switch (arg) {
      case '--issue':
        options.issue = takeValue(argv, index, arg);
        index += 1;
        break;
      case '--repo':
        options.repo = takeValue(argv, index, arg);
        index += 1;
        break;
      case '--image':
        options.image = takeValue(argv, index, arg);
        index += 1;
        break;
      case '--profile':
        options.profile = takeValue(argv, index, arg);
        index += 1;
        break;
      case '--requirements-spec-scope':
        options.requirementsSpecScope = takeValue(argv, index, arg);
        index += 1;
        break;
      case '--save-dir':
        options.saveDir = takeValue(argv, index, arg);
        index += 1;
        break;
      case '--skip-issue-fetch':
        options.skipIssueFetch = true;
        break;
      case '--keep-snapshot':
        options.keepSnapshot = true;
        break;
      case '--help':
      case '-h':
        options.help = true;
        break;
      default:
        if (!arg.startsWith('--') && !options.issue) {
          options.issue = arg;
          break;
        }
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!options.help && !options.issue) {
    throw new Error('--issue <number> is required.');
  }

  return options;
}

function runCommand(command, args, deps = {}) {
  const spawnSync = deps.spawnSync || childProcess.spawnSync;
  const result = spawnSync(command, args, {
    cwd: deps.cwd,
    encoding: 'utf8',
    shell: false,
    timeout: deps.timeoutMs || COMMAND_TIMEOUT_MS
  });
  return {
    command,
    args,
    status: typeof result.status === 'number' ? result.status : 1,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    error: result.error ? String(result.error.message || result.error) : ''
  };
}

function commandLine(command, args) {
  return [command, ...args].map((part) => (part.includes(' ') ? JSON.stringify(part) : part)).join(' ');
}

function parseJsonOrUndefined(text) {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function issueViewArgs(issue, repo) {
  return ['issue', 'view', issue, '--repo', repo, '--json', ISSUE_JSON_FIELDS.join(',')];
}

function normalizeLabels(labels) {
  if (!Array.isArray(labels)) {
    return [];
  }
  return labels.map((label) => label?.name).filter(Boolean);
}

function renderIssueMarkdown(issue) {
  const labels = normalizeLabels(issue.labels);
  return [
    `# Issue #${issue.number}: ${issue.title || '(untitled)'}`,
    '',
    `- State: ${issue.state || 'unknown'}`,
    `- URL: ${issue.url || 'unknown'}`,
    `- Labels: ${labels.length > 0 ? labels.join(', ') : 'none'}`,
    `- Created: ${issue.createdAt || 'unknown'}`,
    `- Updated: ${issue.updatedAt || 'unknown'}`,
    '',
    '## Body',
    '',
    issue.body || '(empty)'
  ].join('\n');
}

function standardsDockerSteps(options) {
  const mount = '${SNAPSHOT}:/target';
  return [
    {
      name: 'requirements-quality',
      file: 'requirements-quality.json',
      command: 'docker',
      args: [
        'run',
        '--rm',
        '-v',
        mount,
        options.image,
        'python3',
        'scripts/requirements_quality_check.py',
        '/target',
        '--requirements-spec-scope',
        options.requirementsSpecScope,
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
        mount,
        options.image,
        'python3',
        'scripts/repo_evidence_scan.py',
        '/target',
        '--format',
        'json',
        '--profile',
        options.profile,
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
        mount,
        options.image,
        'python3',
        'scripts/run_assurance.py',
        '/target',
        '--profile',
        options.profile,
        '--output',
        'gate-scorecard'
      ]
    }
  ];
}

function replaceSnapshotMount(args, snapshotPath) {
  return args.map((arg) => (arg === '${SNAPSHOT}:/target' ? `${snapshotPath}:/target` : arg));
}

function ensureDir(dirPath, deps = {}) {
  const mkdirSync = deps.mkdirSync || fs.mkdirSync;
  mkdirSync(dirPath, { recursive: true });
}

function writeText(filePath, content, deps = {}) {
  ensureDir(path.dirname(filePath), deps);
  const writeFileSync = deps.writeFileSync || fs.writeFileSync;
  writeFileSync(filePath, content, 'utf8');
}

function writeJson(filePath, payload, deps = {}) {
  writeText(filePath, `${JSON.stringify(payload, null, 2)}\n`, deps);
}

function writeCommandArtifacts(outputDir, stem, stdoutFile, result, deps = {}) {
  writeText(path.join(outputDir, stdoutFile), result.stdout, deps);
  if (result.stderr) {
    writeText(path.join(outputDir, `${stem}.stderr.txt`), result.stderr, deps);
  }
}

function prepareStandardsImage(options, outputDir, deps = {}, cwd = process.cwd()) {
  const imagePreparation = [];
  const imageInspect = runCommand('docker', ['image', 'inspect', options.image], { ...deps, cwd });
  writeCommandArtifacts(outputDir, 'docker-image-inspect', 'docker-image-inspect.stdout.json', imageInspect, deps);
  imagePreparation.push({ name: 'docker-image-inspect', file: 'docker-image-inspect.stdout.json', ...imageInspect });

  if (imageInspect.status === 0) {
    return { imageInspect, imagePreparation, imageAccess: 'present' };
  }

  if (options.image !== DEFAULT_STANDARDS_IMAGE) {
    return { imageInspect, imagePreparation, imageAccess: 'missing' };
  }

  const imagePull = runCommand('docker', ['pull', options.image], { ...deps, cwd });
  writeCommandArtifacts(outputDir, 'docker-image-pull', 'docker-image-pull.stdout.txt', imagePull, deps);
  imagePreparation.push({ name: 'docker-image-pull', file: 'docker-image-pull.stdout.txt', ...imagePull });

  if (imagePull.status !== 0) {
    return { imageInspect, imagePreparation, imageAccess: 'pull-failed' };
  }

  const imageAfterPull = runCommand('docker', ['image', 'inspect', options.image], { ...deps, cwd });
  writeCommandArtifacts(outputDir, 'docker-image-after-pull', 'docker-image-after-pull.stdout.json', imageAfterPull, deps);
  imagePreparation.push({ name: 'docker-image-after-pull', file: 'docker-image-after-pull.stdout.json', ...imageAfterPull });

  return {
    imageInspect: imageAfterPull,
    imagePreparation,
    imageAccess: imageAfterPull.status === 0 ? 'pulled' : 'pull-unverified'
  };
}

function summarizeRequirementsQuality(payload) {
  if (!payload || typeof payload !== 'object') {
    return { ok: false, findingCount: undefined };
  }
  const findings = Array.isArray(payload.findings) ? payload.findings : [];
  return { ok: payload.ok === true, findingCount: findings.length };
}

function summarizeEvidenceScan(payload) {
  if (!payload || typeof payload !== 'object') {
    return { fileCount: undefined, areas: {} };
  }
  const areas = {};
  for (const [area, value] of Object.entries(payload.areas || {})) {
    areas[area] = value && typeof value === 'object' ? value.signal : undefined;
  }
  return { fileCount: payload.inventory?.file_count, areas };
}

function summarizeStandardsStep(step) {
  const parsedJson = step.file.endsWith('.json') ? parseJsonOrUndefined(step.stdout) : undefined;
  const summary = { name: step.name, status: step.status, file: step.file, command: commandLine(step.command, step.args) };
  if (step.name === 'requirements-quality') {
    summary.requirementsQuality = summarizeRequirementsQuality(parsedJson);
  }
  if (step.name === 'evidence-scan') {
    summary.evidenceScan = summarizeEvidenceScan(parsedJson);
  }
  if (step.name === 'assurance-scorecard') {
    summary.scorecard = parseGateScorecard(step.stdout || '');
  }
  return summary;
}

function renderMarkdown(context) {
  const lines = [];
  const issue = context.issue?.json;
  lines.push('# Standards Issue Triage');
  lines.push('');
  lines.push(`- Issue: ${issue ? `#${issue.number} ${issue.title || ''}`.trim() : `#${context.options.issue}`}`);
  if (issue?.url) {
    lines.push(`- URL: ${issue.url}`);
  }
  lines.push(`- GitHub repo: ${context.options.repo}`);
  lines.push(`- Standards image: ${context.options.image}`);
  if (context.imageAccess) {
    lines.push(`- Docker image access: ${context.imageAccess}`);
  }
  lines.push(`- Standards profile: ${context.options.profile}`);
  lines.push(`- Requirements scope: ${context.options.requirementsSpecScope}`);
  lines.push(`- Output directory: ${context.outputDir}`);
  lines.push(`- Snapshot: ${context.snapshot.mode}, ${context.snapshot.trackedFileCount} tracked files`);
  if (context.snapshot.removed === false) {
    lines.push(`- Snapshot retained: ${context.snapshot.path}`);
  }
  lines.push('');
  lines.push('## Command Results');
  lines.push('');
  if (context.issue && !context.issue.skipped) {
    lines.push(`- issue-metadata: ${context.issue.status === 0 ? 'pass' : `FAIL (${context.issue.status})`}`);
  } else {
    lines.push('- issue-metadata: skipped');
  }
  for (const step of context.imagePreparation || [{ name: 'docker-image-inspect', status: context.imageInspect.status }]) {
    lines.push(`- ${step.name}: ${step.status === 0 ? 'pass' : `FAIL (${step.status})`}`);
  }
  for (const step of context.standards) {
    lines.push(`- ${step.name}: ${step.status === 0 ? 'pass' : `FAIL (${step.status})`} -> ${step.file}`);
  }
  lines.push('');
  lines.push('## Signals');
  lines.push('');
  for (const step of context.standards.map(summarizeStandardsStep)) {
    if (step.requirementsQuality) {
      lines.push(`- Requirements quality: ${step.requirementsQuality.ok ? 'ok' : 'not ok'}${typeof step.requirementsQuality.findingCount === 'number' ? ` (${step.requirementsQuality.findingCount} finding(s))` : ''}`);
    }
    if (step.evidenceScan) {
      const areas = Object.entries(step.evidenceScan.areas).map(([name, signal]) => `${name}=${signal || 'unknown'}`);
      lines.push(`- Evidence scan: ${step.evidenceScan.fileCount || 'unknown'} file(s); ${areas.join(', ') || 'no area signals'}`);
    }
    if (step.scorecard && Object.keys(step.scorecard).length > 0) {
      lines.push(`- Scorecard gates: ${Object.entries(step.scorecard).map(([gate, status]) => `${gate}=${status}`).join(', ')}`);
    }
  }
  lines.push('');
  lines.push('## Triage Use');
  lines.push('');
  lines.push('- Read `issue.md` with `repo-evidence-scan.json` to identify requirement, docs, test, and workflow surfaces before editing.');
  lines.push('- Treat `assurance-scorecard.txt` as advisory triage input, not a hosted CI gate.');
  lines.push('- If requirements quality findings appear, resolve them through `npm run requirements:integrity` before PR handoff.');
  return lines.join('\n');
}

function runIssueStandardsTriage(argv = process.argv.slice(2), deps = {}) {
  const options = parseArgs(argv);
  if (options.help) {
    return { exitCode: 0, markdown: usage(), context: { options } };
  }

  const cwd = deps.cwd || process.cwd();
  const outputDir = path.resolve(cwd, options.saveDir, `issue-${options.issue}`);
  ensureDir(outputDir, deps);

  let issueContext = { skipped: true, status: 0 };
  if (!options.skipIssueFetch) {
    const issueResult = runCommand('gh', issueViewArgs(options.issue, options.repo), { ...deps, cwd });
    writeText(path.join(outputDir, 'issue-view.stdout.json'), issueResult.stdout, deps);
    if (issueResult.stderr) {
      writeText(path.join(outputDir, 'issue-view.stderr.txt'), issueResult.stderr, deps);
    }
    const issueJson = parseJsonOrUndefined(issueResult.stdout);
    if (issueJson) {
      writeJson(path.join(outputDir, 'issue.json'), issueJson, deps);
      writeText(path.join(outputDir, 'issue.md'), renderIssueMarkdown(issueJson), deps);
    }
    issueContext = { skipped: false, status: issueResult.status, json: issueJson, command: commandLine('gh', issueViewArgs(options.issue, options.repo)) };
  }

  const createSnapshot = deps.createTrackedWorktreeSnapshot || createTrackedWorktreeSnapshot;
  const removeSnapshot = deps.removeTrackedWorktreeSnapshot || removeTrackedWorktreeSnapshot;
  const snapshot = createSnapshot(cwd, deps);

  try {
    const { imageInspect, imagePreparation, imageAccess } = prepareStandardsImage(options, outputDir, deps, cwd);

    const standards = imageInspect.status === 0
      ? standardsDockerSteps(options).map((step) => {
          const args = replaceSnapshotMount(step.args, snapshot.path);
          const result = runCommand(step.command, args, { ...deps, cwd });
          writeText(path.join(outputDir, step.file), result.stdout, deps);
          if (result.stderr) {
            writeText(path.join(outputDir, `${step.name}.stderr.txt`), result.stderr, deps);
          }
          return { ...step, args, status: result.status, stdout: result.stdout, stderr: result.stderr, error: result.error };
        })
      : [];

    const context = {
      options,
      outputDir,
      issue: issueContext,
      imageInspect,
      imagePreparation,
      imageAccess,
      snapshot: { ...snapshot, removed: false },
      standards
    };
    context.snapshot.removed = !options.keepSnapshot;
    const markdown = renderMarkdown(context);
    const summary = {
      schemaVersion: 1,
      options,
      outputDir,
      issue: issueContext,
      imageInspect: { status: imageInspect.status, command: commandLine('docker', ['image', 'inspect', options.image]) },
      imageAccess,
      imagePreparation: imagePreparation.map((step) => ({
        name: step.name,
        file: step.file,
        status: step.status,
        command: commandLine(step.command, step.args)
      })),
      snapshot: context.snapshot,
      standards: standards.map(summarizeStandardsStep),
      success: issueContext.status === 0 && imageInspect.status === 0 && standards.every((step) => step.status === 0)
    };
    writeJson(path.join(outputDir, 'triage-summary.json'), summary, deps);
    writeText(path.join(outputDir, 'triage-summary.md'), markdown, deps);
    return { exitCode: summary.success ? 0 : 1, markdown, context: summary };
  } finally {
    if (!options.keepSnapshot) {
      removeSnapshot(snapshot, deps);
    }
  }
}

function main(argv = process.argv.slice(2), deps = {}) {
  try {
    const result = runIssueStandardsTriage(argv, deps);
    (deps.stdout || process.stdout).write(`${result.markdown}\n`);
    return result.exitCode;
  } catch (error) {
    (deps.stderr || process.stderr).write(`${error instanceof Error ? error.message : String(error)}\n\n${usage()}\n`);
    return 1;
  }
}

if (require.main === module) {
  process.exitCode = main();
}

module.exports = {
  DEFAULT_REPO,
  DEFAULT_SAVE_DIR,
  DEFAULT_PROFILE,
  DEFAULT_REQUIREMENTS_SPEC_SCOPE,
  ISSUE_JSON_FIELDS,
  parseArgs,
  issueViewArgs,
  standardsDockerSteps,
  replaceSnapshotMount,
  prepareStandardsImage,
  summarizeRequirementsQuality,
  summarizeEvidenceScan,
  summarizeStandardsStep,
  renderMarkdown,
  runIssueStandardsTriage,
  main
};
#!/usr/bin/env node

// Files a requirement-targeted fix issue when a maintainer Linux validation run
// (issue #259) uncovers a gap, so the session/automation — not the human
// operator — is the author of record. The operator invokes this after a
// comparison run; it reads the produced diagnostics bundle, detects gaps (or
// accepts a one-line operator note), composes a complete issue, and files it
// via `gh issue create` (authenticated on the Ubuntu boot).

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const DEFAULT_REPO = 'LabVIEW-Community-CI-CD/vi-history-suite';
const RELATED_VALIDATION_ISSUE = '259';
const ISSUE_BODY_FILENAME = 'linux-validation-gap-issue.md';
// Hard gaps (a real failure surfaced by validation) are bugs.
const DEFAULT_LABELS = Object.freeze(['copilot-target', 'bug']);
// Observational records (a `--note` on a clean/expected run) are validation
// evidence, not defects, so they are not labelled `bug`.
const OBSERVATIONAL_LABELS = Object.freeze(['copilot-target']);
const ALLOWED_EXECUTABLE_COMMANDS = Object.freeze(['gh']);
const REPO_SLUG_PATTERN = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/u;
const GH_TIMEOUT_MS = 60000;

function isAllowedExecutableCommand(command) {
  return ALLOWED_EXECUTABLE_COMMANDS.includes(String(command || ''));
}

function assertAllowedExecutableCommand(command) {
  if (!isAllowedExecutableCommand(command)) {
    throw new Error(`Refusing to execute non-allow-listed command: ${String(command)}`);
  }
}

function isValidRepoSlug(repo) {
  return REPO_SLUG_PATTERN.test(String(repo || ''));
}

function parseArgs(argv) {
  const options = {
    runDir: undefined,
    note: undefined,
    expectedBlock: undefined,
    repo: DEFAULT_REPO,
    dryRun: false,
    help: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith('--')) {
        throw new Error(`${arg} requires a value`);
      }
      index += 1;
      return value;
    };

    if (arg === '--run-dir') options.runDir = next();
    else if (arg === '--note') options.note = next();
    else if (arg === '--expected-block') options.expectedBlock = next();
    else if (arg === '--repo') options.repo = next();
    else if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }

  if (options.help) {
    return options;
  }

  if (!options.runDir) {
    throw new Error('--run-dir is required');
  }
  if (!isValidRepoSlug(options.repo)) {
    throw new Error(`--repo must be a valid owner/repo slug, got: ${options.repo}`);
  }

  return options;
}

function usage() {
  return [
    'Usage: node scripts/fileLinuxValidationGap.js --run-dir <path> [options]',
    '',
    'Files a requirement-targeted fix issue when a Linux validation run (#259)',
    'uncovers a gap, so the session — not the human operator — authors it.',
    '',
    'Options:',
    '  --run-dir <path>         Comparison report run directory (required)',
    '  --note "<text>"          Operator observation; files an observational gap',
    '  --expected-block <reason>  Mark a deliberately-blocked validation as a PASS',
    '  --repo <owner/repo>      Target repository (default: ' + DEFAULT_REPO + ')',
    '  --dry-run                Compose + write the body file, but do not file',
    '  --help                   Show this help'
  ].join('\n');
}

function readJsonIfPresent(filePath, deps) {
  const readFileSync = deps.readFileSync || fs.readFileSync;
  const existsSync = deps.existsSync || fs.existsSync;
  if (!existsSync(filePath)) {
    return undefined;
  }
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch (error) {
    return { __parseError: error instanceof Error ? error.message : String(error) };
  }
}

function readRunEvidence(runDir, deps = {}) {
  const metadataPath = path.join(runDir, 'report-metadata.json');
  const manifestPath = path.join(runDir, 'diagnostics', 'diagnostics-manifest.json');

  const metadata = readJsonIfPresent(metadataPath, deps);
  const manifest = readJsonIfPresent(manifestPath, deps);

  const runtimeExecution = (metadata && metadata.runtimeExecution) || {};
  const runtimeSelection = (metadata && metadata.runtimeSelection) || {};
  const manifestEntries = Array.isArray(manifest && manifest.entries) ? manifest.entries : [];

  return {
    runDir,
    metadataPresent: Boolean(metadata) && !metadata.__parseError,
    manifestPresent: Boolean(manifest) && !manifest.__parseError,
    provider: runtimeSelection.provider,
    platform: runtimeSelection.platform,
    reportStatus: metadata && metadata.reportStatus,
    runtimeState: runtimeExecution.state,
    failureReason: runtimeExecution.failureReason,
    blockedReason: runtimeExecution.blockedReason,
    attempted: runtimeExecution.attempted,
    reportExists: runtimeExecution.reportExists,
    manifestEntries: manifestEntries.map((entry) => ({
      kind: entry && entry.kind,
      filename: entry && entry.filename
    })),
    hasFailureClassification: manifestEntries.some(
      (entry) => entry && entry.kind === 'failure-classification'
    )
  };
}

function detectGap(evidence, options = {}) {
  const reasons = [];
  const expectedBlock = options.expectedBlock;
  const note = options.note && String(options.note).trim();

  const failedUnexpectedly =
    evidence.runtimeState === 'failed' && evidence.failureReason !== expectedBlock;
  const succeededWithoutReport =
    evidence.runtimeState === 'succeeded' && evidence.reportExists === false;
  const classifiedFailure =
    evidence.hasFailureClassification && evidence.failureReason !== expectedBlock;

  if (failedUnexpectedly) {
    reasons.push(
      `runtime execution failed with reason "${evidence.failureReason || 'unknown'}"` +
        (expectedBlock ? ` (not the expected block "${expectedBlock}")` : '')
    );
  }
  if (succeededWithoutReport) {
    reasons.push('runtime reported success but no report file was produced');
  }
  if (classifiedFailure && !failedUnexpectedly) {
    reasons.push('a failure-classification artifact is present in the diagnostics bundle');
  }
  if (!evidence.metadataPresent) {
    reasons.push('report-metadata.json was missing or unreadable in the run directory');
  }

  const isHard = reasons.length > 0;
  if (isHard) {
    return { severity: 'hard', reasons };
  }
  if (note) {
    return { severity: 'observational', reasons: [`operator note: ${note}`] };
  }
  return { severity: 'none', reasons: [] };
}

function truncate(value, max) {
  const text = String(value === undefined || value === null ? '' : value);
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

// The same severity-aware filer composes evidence issues for both the Linux
// (#259) and Windows (#296) real-hardware validation runs. The compare provider
// `host-native` is shared across platforms, so the platform word is taken from
// the persisted `runtimeSelection.platform` (`win32`/`linux`). When platform is
// absent, fall back to the provider (`windows-container` implies Windows) and
// otherwise default to Linux to preserve the original behavior.
function derivePlatformLabel(evidence) {
  const platform = evidence && evidence.platform;
  if (platform === 'win32') {
    return 'Windows';
  }
  if (platform === 'linux') {
    return 'Linux';
  }
  if (!platform && evidence && evidence.provider === 'windows-container') {
    return 'Windows';
  }
  return 'Linux';
}

function composeIssueContent(evidence, gap, options = {}) {
  const note = options.note && String(options.note).trim();
  const providerLabel = evidence.provider || 'unknown-provider';
  const platformLabel = derivePlatformLabel(evidence);
  const isObservation = gap.severity === 'observational';
  const signal = isObservation
    ? truncate(note, 60)
    : evidence.failureReason || evidence.runtimeState || 'unexpected outcome';

  const kindLabel = isObservation ? 'observation' : 'gap';
  const title = `${platformLabel} validation ${kindLabel} (${providerLabel}): ${truncate(signal, 80)}`;

  const manifestList =
    evidence.manifestEntries.length > 0
      ? evidence.manifestEntries
          .map((entry) => `- ${entry.kind || 'unknown'}: ${entry.filename || 'unknown'}`)
          .join('\n')
      : '- (no diagnostics manifest entries found)';

  const summary = isObservation
    ? `A maintainer ${platformLabel} validation run (relates to #${RELATED_VALIDATION_ISSUE}) on real hardware` +
      ` recorded an observation on the \`${providerLabel}\` provider. This is validation evidence,` +
      ' not a confirmed defect. It was filed by `scripts/fileLinuxValidationGap.js` so the session —' +
      ' not the human operator — is the author of record.'
    : `A maintainer ${platformLabel} validation run (relates to #${RELATED_VALIDATION_ISSUE}) on real hardware` +
      ` surfaced a gap on the \`${providerLabel}\` provider. This issue was filed by` +
      ' `scripts/fileLinuxValidationGap.js` so the session — not the human operator — is the author of record.';

  const signalHeading = isObservation ? '## Observed signal' : '## Detected signal';

  const nextStep = isObservation
    ? 'This records validation evidence and may need no action. If it describes a defect,' +
      ' triage against the named requirement surface (VHS-REQ-156 / VHS-REQ-624 / VHS-REQ-147 /' +
      ' VHS-REQ-148 as applicable) and reproduce from the retained run directory.'
    : 'Triage against the named requirement surface (VHS-REQ-156 / VHS-REQ-624 / VHS-REQ-147 /' +
      ' VHS-REQ-148 as applicable), reproduce from the retained run directory, and attach the full' +
      ' `diagnostics/` bundle. Keep the fix scoped to the surfaced behavior.';

  const body = [
    '## Summary',
    summary,
    '',
    signalHeading,
    gap.reasons.map((reason) => `- ${reason}`).join('\n') || '- (none recorded)',
    '',
    note ? '## Operator note' : '',
    note ? note : '',
    note ? '' : '',
    '## Run facts',
    `- Provider: \`${providerLabel}\``,
    `- Report status: \`${evidence.reportStatus || 'unknown'}\``,
    `- Runtime state: \`${evidence.runtimeState || 'unknown'}\``,
    `- Failure reason: \`${evidence.failureReason || 'none'}\``,
    `- Blocked reason: \`${evidence.blockedReason || 'none'}\``,
    `- Report produced: \`${String(evidence.reportExists)}\``,
    `- Run directory: \`${evidence.runDir}\``,
    '',
    '## Diagnostics manifest entries',
    manifestList,
    '',
    '## Next step',
    nextStep
  ]
    .filter((line) => line !== '')
    .join('\n');

  return { title, body, labels: isObservation ? [...OBSERVATIONAL_LABELS] : [...DEFAULT_LABELS] };
}

function buildGhIssueCreateArgs(content, repo, bodyFilePath) {
  const args = ['issue', 'create', '--repo', repo, '--title', content.title];
  for (const label of content.labels) {
    args.push('--label', label);
  }
  args.push('--body-file', bodyFilePath);
  return args;
}

function fileIssue(content, options, deps = {}) {
  const writeFileSync = deps.writeFileSync || fs.writeFileSync;
  const spawnSyncImpl = deps.spawnSync || spawnSync;

  const bodyFilePath = path.join(options.runDir, ISSUE_BODY_FILENAME);
  writeFileSync(bodyFilePath, content.body, 'utf8');

  if (options.dryRun) {
    return { filed: false, bodyFilePath, title: content.title, labels: content.labels };
  }

  if (!isValidRepoSlug(options.repo)) {
    throw new Error(`Refusing to file: invalid repo slug ${options.repo}`);
  }
  assertAllowedExecutableCommand('gh');
  const args = buildGhIssueCreateArgs(content, options.repo, bodyFilePath);
  const result = spawnSyncImpl('gh', args, { encoding: 'utf8', timeout: GH_TIMEOUT_MS });

  if (result.error) {
    throw result.error;
  }
  if (typeof result.status === 'number' && result.status !== 0) {
    throw new Error(
      `gh issue create failed (status ${result.status}): ${String(result.stderr || '').trim()}`
    );
  }

  return {
    filed: true,
    bodyFilePath,
    title: content.title,
    labels: content.labels,
    url: String(result.stdout || '').trim()
  };
}

function main(argv = process.argv.slice(2), deps = {}) {
  const stdout = deps.stdout || process.stdout;
  const options = parseArgs(argv);

  if (options.help) {
    stdout.write(`${usage()}\n`);
    return;
  }

  const evidence = readRunEvidence(options.runDir, deps);
  const gap = detectGap(evidence, options);

  if (gap.severity === 'none') {
    stdout.write(
      'No validation gap detected (run succeeded and matched expectations, or the failure ' +
        'matched --expected-block). Nothing filed.\n'
    );
    return;
  }

  const content = composeIssueContent(evidence, gap, options);
  const result = fileIssue(content, options, deps);

  const kindLabel = gap.severity === 'observational' ? 'observation' : 'gap';
  if (result.filed) {
    stdout.write(`Filed validation ${kindLabel} issue: ${result.url || '(url unavailable)'}\n`);
  } else {
    stdout.write(
      `Dry run: composed issue "${result.title}" written to ${result.bodyFilePath} (not filed).\n`
    );
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
  DEFAULT_REPO,
  DEFAULT_LABELS,
  OBSERVATIONAL_LABELS,
  ALLOWED_EXECUTABLE_COMMANDS,
  RELATED_VALIDATION_ISSUE,
  ISSUE_BODY_FILENAME,
  isAllowedExecutableCommand,
  assertAllowedExecutableCommand,
  isValidRepoSlug,
  parseArgs,
  usage,
  readRunEvidence,
  detectGap,
  derivePlatformLabel,
  composeIssueContent,
  buildGhIssueCreateArgs,
  fileIssue,
  main
};

#!/usr/bin/env node

const childProcess = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const storageDoctor = require('./doctorVagrantStorage.js');

const SCHEMA = 'vi-history-suite/vagrant-acceptance-runner-readiness@v1';
const DEFAULT_HOST_DOCTOR_SCRIPT = 'scripts/vagrant/doctor-vagrant-host.sh';
const DEFAULT_RECEIPT_ROOT = path.join(
  os.homedir(),
  '.gitlab-runner',
  'receipts',
  'vagrant-acceptance-readiness'
);
const DEFAULT_CI_EVIDENCE_DIR = 'vagrant-runner-readiness-evidence';
const BUSY_ISSUE_CATEGORIES = new Set([
  'runner-busy',
  'golden-vm-active'
]);

function getUsage() {
  return [
    'Usage: node scripts/runVagrantAcceptanceRunnerReadiness.js [options]',
    '',
    `Runs the fail-closed ${SCHEMA} check for the governed Vagrant acceptance runner.`,
    '',
    'Options:',
    `  --active-root PATH       Active Vagrant storage root. Defaults to ${storageDoctor.DEFAULT_ACTIVE_ROOT}`,
    `  --standby-root PATH      Standby Vagrant storage root. Defaults to ${storageDoctor.DEFAULT_STANDBY_ROOT}`,
    `  --archive-root PATH      Evidence archive root. Defaults to ${storageDoctor.DEFAULT_ARCHIVE_ROOT}`,
    `  --vagrant-home PATH      Vagrant home to inspect. Defaults to ${storageDoctor.DEFAULT_VAGRANT_HOME}`,
    `  --host-doctor PATH       Host doctor script. Defaults to ${DEFAULT_HOST_DOCTOR_SCRIPT}`,
    `  --evidence-dir PATH      Write CI readiness evidence under PATH. Defaults to ${DEFAULT_CI_EVIDENCE_DIR} when CI is set.`,
    `  --receipt-root PATH      Write latest/timestamped host receipts under PATH. Defaults to ${DEFAULT_RECEIPT_ROOT} when VIHS_VAGRANT_READINESS_RECEIPT_ROOT is set.`,
    '  --allow-busy             Classify expected active VM states as nonfatal busy receipts for the systemd timer.',
    '  --help                  Show this help.'
  ].join('\n');
}

function parseArgs(argv, env = process.env) {
  const parsed = {
    helpRequested: false,
    activeRoot: env.VIHS_VAGRANT_STORAGE_ROOT || storageDoctor.DEFAULT_ACTIVE_ROOT,
    standbyRoot: env.VIHS_VAGRANT_STANDBY_ROOT || storageDoctor.DEFAULT_STANDBY_ROOT,
    archiveRoot: env.VIHS_EVIDENCE_ARCHIVE_ROOT || storageDoctor.DEFAULT_ARCHIVE_ROOT,
    vagrantHome: env.VAGRANT_HOME || storageDoctor.DEFAULT_VAGRANT_HOME,
    hostDoctorScript: DEFAULT_HOST_DOCTOR_SCRIPT,
    evidenceDir: env.CI ? DEFAULT_CI_EVIDENCE_DIR : '',
    receiptRoot: env.VIHS_VAGRANT_READINESS_RECEIPT_ROOT || '',
    allowBusy: env.VIHS_VAGRANT_READINESS_ALLOW_BUSY === 'true'
  };

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    const requireValue = (flag) => {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) {
        throw new Error(`Missing value for ${flag}.\n\n${getUsage()}`);
      }
      index += 1;
      return value;
    };

    if (current === '--help' || current === '-h') {
      parsed.helpRequested = true;
      continue;
    }
    if (current === '--active-root') {
      parsed.activeRoot = path.resolve(requireValue('--active-root'));
      continue;
    }
    if (current === '--standby-root') {
      parsed.standbyRoot = path.resolve(requireValue('--standby-root'));
      continue;
    }
    if (current === '--archive-root') {
      parsed.archiveRoot = path.resolve(requireValue('--archive-root'));
      continue;
    }
    if (current === '--vagrant-home') {
      parsed.vagrantHome = path.resolve(requireValue('--vagrant-home'));
      continue;
    }
    if (current === '--host-doctor') {
      parsed.hostDoctorScript = requireValue('--host-doctor');
      continue;
    }
    if (current === '--evidence-dir') {
      parsed.evidenceDir = path.resolve(requireValue('--evidence-dir'));
      continue;
    }
    if (current === '--receipt-root') {
      parsed.receiptRoot = path.resolve(requireValue('--receipt-root'));
      continue;
    }
    if (current === '--allow-busy') {
      parsed.allowBusy = true;
      continue;
    }

    throw new Error(`Unknown argument: ${current}\n\n${getUsage()}`);
  }

  return parsed;
}

function timestampLeaf(date) {
  return date.toISOString().replace(/[:.]/gu, '-');
}

function extractErrorLines(text) {
  return String(text || '')
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.includes('ERROR:'))
    .map((line) => line.replace(/^\[[^\]]+\]\s*/u, ''));
}

function classifyIssue(issue) {
  if (/^Vagrant host doctor failed with exit code \d+$/u.test(issue)) {
    return 'host-doctor-summary';
  }
  if (/^ERROR: Vagrant CI VM '[^']+' is already running$/u.test(issue)) {
    return 'runner-busy';
  }
  if (/^ERROR: Golden VM '[^']+' exists but is '[^']+', expected 'poweroff'$/u.test(issue)) {
    return 'golden-vm-active';
  }
  return 'host-doctor-drift';
}

function classifyBusyState(issues) {
  const issueCategories = issues.map((issue) => ({
    issue,
    category: classifyIssue(issue)
  }));
  const actionableCategories = issueCategories
    .map((entry) => entry.category)
    .filter((category) => category !== 'host-doctor-summary');
  const busyCategories = actionableCategories.filter((category) =>
    BUSY_ISSUE_CATEGORIES.has(category)
  );

  return {
    issueCategories,
    busy: busyCategories.length > 0 &&
      actionableCategories.length > 0 &&
      busyCategories.length === actionableCategories.length,
    busyCategories: [...new Set(busyCategories)].sort()
  };
}

function normalizeHostDoctorResult(result) {
  const exitCode = typeof result?.status === 'number'
    ? result.status
    : typeof result?.exitCode === 'number'
      ? result.exitCode
      : result?.error
        ? 1
        : 0;
  const stderr = result?.stderr ? String(result.stderr) : '';
  const stdout = result?.stdout ? String(result.stdout) : '';
  const error = result?.error instanceof Error ? result.error.message : '';

  return {
    status: exitCode === 0 ? 'passed' : 'failed',
    healthy: exitCode === 0,
    exitCode,
    stdout,
    stderr,
    error
  };
}

function runHostDoctor(options, deps = {}) {
  if (deps.runHostDoctor) {
    return normalizeHostDoctorResult(deps.runHostDoctor(options));
  }

  const cwd = deps.cwd ?? path.resolve(__dirname, '..');
  const scriptPath = path.isAbsolute(options.hostDoctorScript)
    ? options.hostDoctorScript
    : path.join(cwd, options.hostDoctorScript);
  const runner = deps.runCommand ?? childProcess.spawnSync;
  const result = runner('bash', [scriptPath], {
    cwd,
    encoding: 'utf8',
    env: deps.env ?? process.env
  });

  return normalizeHostDoctorResult(result);
}

function buildNextAction(report) {
  if (!report.storageDoctor.activeHealthy) {
    const activeMountPoint = path.dirname(report.activeRoot);
    return `Mount ${activeMountPoint} or restore the active mirror from ${report.standbyRoot} before retrying the Vagrant acceptance lane.`;
  }
  if (report.status === 'busy') {
    if (report.busyCategories?.includes('golden-vm-active')) {
      return 'Runner is busy because the golden VM is active; power it off before starting Vagrant acceptance. No storage repair is indicated.';
    }
    return 'Runner is busy with the disposable Vagrant CI VM; let the current Vagrant job finish or stop and clean the VM before admission. No storage repair is indicated.';
  }
  if (!report.hostDoctor.healthy) {
    return 'Repair the Vagrant/VirtualBox host doctor issues before retrying the Vagrant acceptance lane.';
  }
  return 'Runner ready for Vagrant Windows VSIX acceptance.';
}

function buildMarkdown(report) {
  const issueLines = report.issues.length > 0
    ? report.issues.map((issue) => `- ${issue}`)
    : ['- none'];
  const storageIssueLines = report.storageDoctor.issues?.length > 0
    ? report.storageDoctor.issues.map((issue) => `- ${issue}`)
    : ['- none'];

  return [
    '# Vagrant Acceptance Runner Readiness',
    '',
    `- Schema: ${report.schema}`,
    `- Generated at: ${report.generatedAt}`,
    `- Hostname: ${report.hostname}`,
    `- Status: ${report.status}`,
    `- Healthy: ${String(report.healthy)}`,
    `- Admission eligible: ${String(report.admissionEligible)}`,
    `- Busy categories: ${report.busyCategories?.length ? report.busyCategories.join(', ') : 'none'}`,
    `- Active root: ${report.activeRoot}`,
    `- Standby root: ${report.standbyRoot}`,
    `- Archive root: ${report.archiveRoot}`,
    '',
    '## Issues',
    ...issueLines,
    '',
    '## Next Action',
    '',
    report.nextAction,
    '',
    '## Storage Doctor',
    '',
    `- Status: ${report.storageDoctor.status}`,
    `- Active healthy: ${String(report.storageDoctor.activeHealthy)}`,
    ...storageIssueLines,
    '',
    '## Host Doctor',
    '',
    `- Status: ${report.hostDoctor.status}`,
    `- Exit code: ${report.hostDoctor.exitCode}`
  ].join('\n') + '\n';
}

function writeReceiptFiles(targetRoot, report, fsApi = fs) {
  fsApi.mkdirSync(targetRoot, { recursive: true });
  const timestampedReceiptPath = path.join(targetRoot, `${timestampLeaf(new Date(report.generatedAt))}.json`);
  const latestReceiptPath = path.join(targetRoot, 'latest.json');
  const payload = {
    ...report,
    receiptRoot: targetRoot,
    latestReceiptPath,
    timestampedReceiptPath
  };
  const serialized = `${JSON.stringify(payload, null, 2)}\n`;
  fsApi.writeFileSync(timestampedReceiptPath, serialized, 'utf8');
  fsApi.writeFileSync(latestReceiptPath, serialized, 'utf8');
  return { latestReceiptPath, timestampedReceiptPath };
}

function writeEvidenceFiles(evidenceDir, report, fsApi = fs) {
  fsApi.mkdirSync(evidenceDir, { recursive: true });
  fsApi.writeFileSync(
    path.join(evidenceDir, 'vagrant-acceptance-runner-readiness.json'),
    `${JSON.stringify(report, null, 2)}\n`,
    'utf8'
  );
  fsApi.writeFileSync(
    path.join(evidenceDir, 'vagrant-acceptance-runner-readiness.md'),
    buildMarkdown(report),
    'utf8'
  );
}

function runVagrantAcceptanceRunnerReadiness(options = {}, deps = {}) {
  const now = deps.now ?? (() => new Date());
  const fsApi = deps.fsApi ?? fs;
  const activeRoot = path.resolve(options.activeRoot ?? storageDoctor.DEFAULT_ACTIVE_ROOT);
  const standbyRoot = path.resolve(options.standbyRoot ?? storageDoctor.DEFAULT_STANDBY_ROOT);
  const archiveRoot = path.resolve(options.archiveRoot ?? storageDoctor.DEFAULT_ARCHIVE_ROOT);
  const vagrantHome = path.resolve(options.vagrantHome ?? storageDoctor.DEFAULT_VAGRANT_HOME);
  const hostDoctorScript = options.hostDoctorScript ?? DEFAULT_HOST_DOCTOR_SCRIPT;
  const generatedAt = now().toISOString();

  const runStorageDoctor = deps.runStorageDoctor ?? storageDoctor.runVagrantStorageDoctor;
  const storageDoctorReport = runStorageDoctor(
    {
      activeRoot,
      standbyRoot,
      archiveRoot,
      vagrantHome
    },
    deps.storageDoctorDeps ?? deps
  );
  const hostDoctorReport = runHostDoctor({ hostDoctorScript }, deps);
  const issues = [];
  let hostDoctorIssues = [];

  if (!storageDoctorReport.activeHealthy) {
    issues.push(...(storageDoctorReport.issues || []));
    if (issues.length === 0) {
      issues.push(`Vagrant active storage drift detected at ${activeRoot}`);
    }
  }
  if (!hostDoctorReport.healthy) {
    hostDoctorIssues = [
      `Vagrant host doctor failed with exit code ${hostDoctorReport.exitCode}`,
      ...extractErrorLines(hostDoctorReport.stderr)
    ];
    if (hostDoctorReport.error) {
      hostDoctorIssues.push(hostDoctorReport.error);
    }
  }

  const busyState = classifyBusyState(hostDoctorIssues);
  const busyAllowed = options.allowBusy === true;
  const busyOnly = busyAllowed && storageDoctorReport.activeHealthy && busyState.busy;
  if (hostDoctorIssues.length > 0) {
    issues.push(...hostDoctorIssues);
  }

  const status = issues.length === 0
    ? 'passed'
    : busyOnly
      ? 'busy'
      : 'failed';

  const report = {
    schema: SCHEMA,
    generatedAt,
    hostname: deps.hostname ?? os.hostname(),
    status,
    healthy: status === 'passed',
    admissionEligible: status === 'passed',
    activeRoot,
    standbyRoot,
    archiveRoot,
    storageDoctor: storageDoctorReport,
    hostDoctor: hostDoctorReport,
    issueCategories: busyState.issueCategories,
    busy: status === 'busy',
    busyCategories: status === 'busy' ? busyState.busyCategories : [],
    issues,
    nextAction: ''
  };
  report.nextAction = buildNextAction(report);

  if (options.evidenceDir) {
    writeEvidenceFiles(path.resolve(options.evidenceDir), report, fsApi);
  }
  if (options.receiptRoot) {
    report.receiptPaths = writeReceiptFiles(path.resolve(options.receiptRoot), report, fsApi);
  }

  return report;
}

function runVagrantAcceptanceRunnerReadinessCli(argv, deps = {}) {
  const stdout = deps.stdout ?? process.stdout;
  const parsed = parseArgs(argv, deps.env ?? process.env);
  if (parsed.helpRequested) {
    stdout.write(`${getUsage()}\n`);
    return 'help';
  }

  const report = runVagrantAcceptanceRunnerReadiness(parsed, deps);
  stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.healthy && report.status !== 'busy') {
    throw new Error(`Vagrant acceptance runner readiness failed.\n${report.issues.join('\n')}`);
  }

  return report.status;
}

module.exports = {
  DEFAULT_CI_EVIDENCE_DIR,
  DEFAULT_HOST_DOCTOR_SCRIPT,
  DEFAULT_RECEIPT_ROOT,
  SCHEMA,
  buildMarkdown,
  buildNextAction,
  classifyBusyState,
  classifyIssue,
  getUsage,
  parseArgs,
  runVagrantAcceptanceRunnerReadiness,
  runVagrantAcceptanceRunnerReadinessCli,
  writeEvidenceFiles,
  writeReceiptFiles
};

if (require.main === module) {
  try {
    runVagrantAcceptanceRunnerReadinessCli(process.argv.slice(2));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
}

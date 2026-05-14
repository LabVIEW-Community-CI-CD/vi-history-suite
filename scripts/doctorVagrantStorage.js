#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const SCHEMA = 'vi-history-suite/vagrant-storage-doctor@v1';
const DEFAULT_ACTIVE_ROOT = '/run/media/sergio/Data/vihs-vagrant';
const DEFAULT_STANDBY_ROOT = '/run/media/sergio/Data1/vihs-vagrant';
const DEFAULT_ARCHIVE_ROOT = '/run/media/sergio/MAJOR GENER/VI History Suite Evidence';
const DEFAULT_VAGRANT_HOME = '/home/sergio/.vagrant.d';

function getUsage() {
  return [
    'Usage: node scripts/doctorVagrantStorage.js [options]',
    '',
    'Non-mutating storage topology doctor for the governed Vagrant Windows VSIX acceptance runner.',
    '',
    'Options:',
    `  --active-root PATH       Active Vagrant storage root. Defaults to ${DEFAULT_ACTIVE_ROOT}`,
    `  --standby-root PATH      Standby Vagrant storage root. Defaults to ${DEFAULT_STANDBY_ROOT}`,
    `  --archive-root PATH      Evidence archive root. Defaults to ${DEFAULT_ARCHIVE_ROOT}`,
    `  --vagrant-home PATH      Vagrant home to inspect. Defaults to ${DEFAULT_VAGRANT_HOME}`,
    '  --evidence-dir PATH      Retain vagrant-storage-doctor.json/.md under PATH.',
    '  --fail-on-active-drift  Exit nonzero when active storage drift is detected.',
    '  --fail-on-drift         Exit nonzero when any required storage check fails.',
    '  --require-standby       Treat standby drift as a failure instead of a warning.',
    '  --require-archive       Treat archive drift as a failure instead of a warning.',
    '  --help                  Show this help.'
  ].join('\n');
}

function parseArgs(argv) {
  const parsed = {
    helpRequested: false,
    activeRoot: DEFAULT_ACTIVE_ROOT,
    standbyRoot: DEFAULT_STANDBY_ROOT,
    archiveRoot: DEFAULT_ARCHIVE_ROOT,
    vagrantHome: DEFAULT_VAGRANT_HOME,
    evidenceDir: '',
    failOnActiveDrift: false,
    failOnDrift: false,
    requireStandby: false,
    requireArchive: false
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
    if (current === '--evidence-dir') {
      parsed.evidenceDir = path.resolve(requireValue('--evidence-dir'));
      continue;
    }
    if (current === '--fail-on-active-drift') {
      parsed.failOnActiveDrift = true;
      continue;
    }
    if (current === '--fail-on-drift') {
      parsed.failOnDrift = true;
      continue;
    }
    if (current === '--require-standby') {
      parsed.requireStandby = true;
      continue;
    }
    if (current === '--require-archive') {
      parsed.requireArchive = true;
      continue;
    }

    throw new Error(`Unknown argument: ${current}\n\n${getUsage()}`);
  }

  return parsed;
}

function normalizePath(candidatePath) {
  const resolved = path.resolve(candidatePath);
  return resolved.length > 1 ? resolved.replace(/[\\/]+$/u, '') : resolved;
}

function decodeMountInfoPath(value) {
  return value.replace(/\\([0-7]{3})/gu, (_match, octal) =>
    String.fromCharCode(Number.parseInt(octal, 8))
  );
}

function readMountPoints(fsApi = fs) {
  const mountInfoPath = '/proc/self/mountinfo';
  if (!fsApi.existsSync(mountInfoPath)) {
    return [];
  }

  return fsApi
    .readFileSync(mountInfoPath, 'utf8')
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((line) => {
      const fields = line.split(' ');
      return fields[4] ? normalizePath(decodeMountInfoPath(fields[4])) : '';
    })
    .filter(Boolean);
}

function isMounted(mountPoint, mountPoints) {
  const normalized = normalizePath(mountPoint);
  return mountPoints.map(normalizePath).includes(normalized);
}

function pathExists(candidatePath, fsApi = fs) {
  try {
    fsApi.accessSync(candidatePath, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function isDirectory(candidatePath, fsApi = fs) {
  try {
    return fsApi.statSync(candidatePath).isDirectory();
  } catch {
    return false;
  }
}

function isFile(candidatePath, fsApi = fs) {
  try {
    return fsApi.statSync(candidatePath).isFile();
  } catch {
    return false;
  }
}

function probeWritable(directoryPath, fsApi = fs) {
  const probePath = path.join(
    directoryPath,
    `.vihs-storage-doctor-write-probe-${process.pid}-${Date.now()}-${Math.random()
      .toString(16)
      .slice(2)}`
  );

  try {
    fsApi.writeFileSync(probePath, 'ok\n', { flag: 'wx' });
    fsApi.unlinkSync(probePath);
    return { writable: true };
  } catch (error) {
    try {
      if (pathExists(probePath, fsApi)) {
        fsApi.unlinkSync(probePath);
      }
    } catch {
      // Best effort cleanup only.
    }
    return {
      writable: false,
      reason: error instanceof Error ? error.message : String(error)
    };
  }
}

function createCheckAccumulator(required) {
  const issues = [];
  const warnings = [];
  return {
    issues,
    warnings,
    record: (message) => {
      if (required) {
        issues.push(message);
      } else {
        warnings.push(message);
      }
    }
  };
}

function inspectStorageRoot(options, deps = {}) {
  const fsApi = deps.fsApi ?? fs;
  const root = normalizePath(options.root);
  const mountPoint = normalizePath(options.mountPoint ?? path.dirname(root));
  const required = Boolean(options.required);
  const accumulator = createCheckAccumulator(required);
  const mountPoints = deps.mountPoints ?? readMountPoints(fsApi);
  const mounted = isMounted(mountPoint, mountPoints);
  const exists = isDirectory(root, fsApi);

  if (!mounted) {
    accumulator.record(`${options.label} mount point is not mounted: ${mountPoint}`);
  }

  if (!exists) {
    accumulator.record(`${options.label} storage root is missing: ${root}`);
  }

  let writable = false;
  let writableFailure = '';
  if (exists) {
    const writableProbe = probeWritable(root, fsApi);
    writable = writableProbe.writable;
    if (!writableProbe.writable) {
      writableFailure = writableProbe.reason ?? 'unknown write failure';
      accumulator.record(`${options.label} storage root is not writable: ${root} (${writableFailure})`);
    }
  }

  const assets = [];
  for (const asset of options.assets ?? []) {
    const assetPath = path.join(root, asset.relativePath);
    const present =
      asset.type === 'file' ? isFile(assetPath, fsApi) : isDirectory(assetPath, fsApi);
    let size = null;
    let valid = present;
    if (present && asset.type === 'file') {
      size = fsApi.statSync(assetPath).size;
      if (asset.minBytes && size < asset.minBytes) {
        valid = false;
      }
    }

    assets.push({
      id: asset.id,
      path: assetPath,
      type: asset.type,
      present,
      size,
      valid
    });

    if (!valid) {
      const reason = present
        ? `${asset.label} is too small: ${assetPath}`
        : `${asset.label} is missing: ${assetPath}`;
      accumulator.record(`${options.label} ${reason}`);
    }
  }

  return {
    label: options.label,
    root,
    mountPoint,
    mounted,
    exists,
    writable,
    writableFailure,
    assets,
    healthy: accumulator.issues.length === 0,
    issues: accumulator.issues,
    warnings: accumulator.warnings
  };
}

function inspectVagrantBoxesLink(options, deps = {}) {
  const fsApi = deps.fsApi ?? fs;
  const vagrantHome = normalizePath(options.vagrantHome);
  const expectedTarget = normalizePath(options.expectedTarget);
  const expectedTmpTarget = normalizePath(options.expectedTmpTarget);
  const boxesPath = path.join(vagrantHome, 'boxes');
  const tmpPath = path.join(vagrantHome, 'tmp');
  const issues = [];
  const warnings = [];
  const result = {
    vagrantHome,
    boxesPath,
    expectedTarget,
    tmpPath,
    expectedTmpTarget,
    exists: false,
    kind: 'missing',
    target: null,
    tmpExists: false,
    tmpKind: 'missing',
    tmpTarget: null,
    healthy: true,
    issues,
    warnings
  };

  function inspectLink(linkPath, expectedLinkTarget, label) {
    let stat;
    try {
      stat = fsApi.lstatSync(linkPath);
    } catch {
      warnings.push(`Vagrant ${label} path is missing and will be created by prepare-vagrant-home: ${linkPath}`);
      return { exists: false, kind: 'missing', target: null };
    }

    if (stat.isSymbolicLink()) {
      const rawTarget = fsApi.readlinkSync(linkPath);
      const target = normalizePath(path.resolve(path.dirname(linkPath), rawTarget));
      if (target !== expectedLinkTarget) {
        issues.push(`Vagrant ${label} symlink points at ${target}, expected ${expectedLinkTarget}`);
      }
      return { exists: true, kind: 'symlink', target };
    }

    if (stat.isDirectory()) {
      const entries = fsApi.readdirSync(linkPath);
      if (entries.length === 0) {
        warnings.push(`Vagrant ${label} path is an empty directory; prepare-vagrant-home can replace it: ${linkPath}`);
      } else {
        issues.push(`Vagrant ${label} path is a non-empty directory instead of a symlink to ${expectedLinkTarget}`);
      }
      return { exists: true, kind: 'directory', target: null };
    }

    issues.push(`Vagrant ${label} path exists but is not a symlink or directory: ${linkPath}`);
    return { exists: true, kind: 'other', target: null };
  }

  const boxes = inspectLink(boxesPath, expectedTarget, 'boxes');
  result.exists = boxes.exists;
  result.kind = boxes.kind;
  result.target = boxes.target;

  const tmp = inspectLink(tmpPath, expectedTmpTarget, 'tmp');
  result.tmpExists = tmp.exists;
  result.tmpKind = tmp.kind;
  result.tmpTarget = tmp.target;

  result.healthy = issues.length === 0;
  return result;
}

function buildMarkdown(report) {
  const lines = [
    '# Vagrant Storage Doctor',
    '',
    `- Schema: ${report.schema}`,
    `- Generated at: ${report.generatedAt}`,
    `- Status: ${report.status}`,
    `- Hostname: ${report.hostname}`,
    `- Active root: ${report.active.root}`,
    `- Standby root: ${report.standby.root}`,
    `- Archive root: ${report.archive.root}`,
    '',
    '## Issues'
  ];

  if (report.issues.length === 0) {
    lines.push('- none');
  } else {
    for (const issue of report.issues) {
      lines.push(`- ${issue}`);
    }
  }

  lines.push('', '## Warnings');
  if (report.warnings.length === 0) {
    lines.push('- none');
  } else {
    for (const warning of report.warnings) {
      lines.push(`- ${warning}`);
    }
  }

  lines.push('', '## Storage Roots');
  for (const root of [report.active, report.standby, report.archive]) {
    lines.push(
      '',
      `### ${root.label}`,
      '',
      `- Root: ${root.root}`,
      `- Mount point: ${root.mountPoint}`,
      `- Mounted: ${root.mounted}`,
      `- Exists: ${root.exists}`,
      `- Writable: ${root.writable}`
    );
    for (const asset of root.assets) {
      lines.push(`- Asset ${asset.id}: ${asset.valid ? 'ok' : 'missing-or-invalid'} (${asset.path})`);
    }
  }

  lines.push(
    '',
    '## Vagrant Home',
    '',
    `- Vagrant home: ${report.vagrantHome.vagrantHome}`,
    `- Boxes path: ${report.vagrantHome.boxesPath}`,
    `- Expected target: ${report.vagrantHome.expectedTarget}`,
    `- Kind: ${report.vagrantHome.kind}`,
    `- Target: ${report.vagrantHome.target ?? '<none>'}`,
    `- Tmp path: ${report.vagrantHome.tmpPath}`,
    `- Expected tmp target: ${report.vagrantHome.expectedTmpTarget}`,
    `- Tmp kind: ${report.vagrantHome.tmpKind}`,
    `- Tmp target: ${report.vagrantHome.tmpTarget ?? '<none>'}`
  );

  return `${lines.join('\n')}\n`;
}

function writeEvidence(evidenceDir, report, fsApi = fs) {
  fsApi.mkdirSync(evidenceDir, { recursive: true });
  fsApi.writeFileSync(
    path.join(evidenceDir, 'vagrant-storage-doctor.json'),
    `${JSON.stringify(report, null, 2)}\n`,
    'utf8'
  );
  fsApi.writeFileSync(
    path.join(evidenceDir, 'vagrant-storage-doctor.md'),
    buildMarkdown(report),
    'utf8'
  );
}

function runVagrantStorageDoctor(options = {}, deps = {}) {
  const fsApi = deps.fsApi ?? fs;
  const activeRoot = normalizePath(options.activeRoot ?? DEFAULT_ACTIVE_ROOT);
  const standbyRoot = normalizePath(options.standbyRoot ?? DEFAULT_STANDBY_ROOT);
  const archiveRoot = normalizePath(options.archiveRoot ?? DEFAULT_ARCHIVE_ROOT);
  const vagrantHome = normalizePath(options.vagrantHome ?? DEFAULT_VAGRANT_HOME);
  const mountPoints = deps.mountPoints ?? readMountPoints(fsApi);
  const now = deps.now ?? (() => new Date());

  const active = inspectStorageRoot(
    {
      label: 'active',
      root: activeRoot,
      required: true,
      assets: [
        {
          id: 'windows11-box',
          label: 'Windows 11 Vagrant box',
          type: 'file',
          relativePath: 'box-cache/windows11.box',
          minBytes: 1
        },
        {
          id: 'vagrant-home',
          label: 'large-drive Vagrant home',
          type: 'dir',
          relativePath: 'vagrant-home'
        },
        {
          id: 'vagrant-boxes',
          label: 'large-drive Vagrant boxes directory',
          type: 'dir',
          relativePath: 'vagrant-home/boxes'
        },
        {
          id: 'vagrant-tmp',
          label: 'large-drive Vagrant temporary directory',
          type: 'dir',
          relativePath: 'vagrant-home/tmp'
        }
      ]
    },
    { fsApi, mountPoints }
  );
  const standby = inspectStorageRoot(
    {
      label: 'standby',
      root: standbyRoot,
      required: Boolean(options.requireStandby),
      assets: [
        {
          id: 'windows11-box',
          label: 'standby Windows 11 Vagrant box',
          type: 'file',
          relativePath: 'box-cache/windows11.box',
          minBytes: 1
        }
      ]
    },
    { fsApi, mountPoints }
  );
  const archive = inspectStorageRoot(
    {
      label: 'archive',
      root: archiveRoot,
      mountPoint: path.dirname(archiveRoot),
      required: Boolean(options.requireArchive),
      assets: []
    },
    { fsApi, mountPoints }
  );
  const vagrantHomeResult = inspectVagrantBoxesLink(
    {
      vagrantHome,
      expectedTarget: path.join(activeRoot, 'vagrant-home', 'boxes'),
      expectedTmpTarget: path.join(activeRoot, 'vagrant-home', 'tmp')
    },
    { fsApi }
  );

  const issues = [
    ...active.issues,
    ...vagrantHomeResult.issues,
    ...standby.issues,
    ...archive.issues
  ];
  const warnings = [
    ...active.warnings,
    ...vagrantHomeResult.warnings,
    ...standby.warnings,
    ...archive.warnings
  ];

  const report = {
    schema: SCHEMA,
    generatedAt: now().toISOString(),
    hostname: deps.hostname ?? os.hostname(),
    status: issues.length === 0 ? 'passed' : 'failed',
    healthy: issues.length === 0,
    activeHealthy: active.issues.length === 0 && vagrantHomeResult.issues.length === 0,
    issues,
    warnings,
    active,
    standby,
    archive,
    vagrantHome: vagrantHomeResult
  };

  if (options.evidenceDir) {
    writeEvidence(path.resolve(options.evidenceDir), report, fsApi);
  }

  return report;
}

function runVagrantStorageDoctorCli(argv, deps = {}) {
  const stdout = deps.stdout ?? process.stdout;
  const parsed = parseArgs(argv);
  if (parsed.helpRequested) {
    stdout.write(`${getUsage()}\n`);
    return 'help';
  }

  const report = runVagrantStorageDoctor(parsed, deps);
  stdout.write(`${JSON.stringify(report, null, 2)}\n`);

  if (parsed.failOnActiveDrift && !report.activeHealthy) {
    throw new Error(`Vagrant active storage drift detected.\n${report.issues.join('\n')}`);
  }
  if (parsed.failOnDrift && !report.healthy) {
    throw new Error(`Vagrant storage drift detected.\n${report.issues.join('\n')}`);
  }

  return report.status;
}

module.exports = {
  DEFAULT_ACTIVE_ROOT,
  DEFAULT_ARCHIVE_ROOT,
  DEFAULT_STANDBY_ROOT,
  DEFAULT_VAGRANT_HOME,
  SCHEMA,
  buildMarkdown,
  decodeMountInfoPath,
  getUsage,
  inspectStorageRoot,
  inspectVagrantBoxesLink,
  parseArgs,
  readMountPoints,
  runVagrantStorageDoctor,
  runVagrantStorageDoctorCli,
  writeEvidence
};

if (require.main === module) {
  try {
    runVagrantStorageDoctorCli(process.argv.slice(2));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
}

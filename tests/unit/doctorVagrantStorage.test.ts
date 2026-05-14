import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '..', '..');

// eslint-disable-next-line @typescript-eslint/no-var-requires
const doctor = require(path.join(repoRoot, 'scripts', 'doctorVagrantStorage.js')) as {
  SCHEMA: string;
  getUsage: () => string;
  parseArgs: (argv: string[]) => {
    activeRoot: string;
    standbyRoot: string;
    archiveRoot: string;
    evidenceDir: string;
    failOnActiveDrift: boolean;
  };
  runVagrantStorageDoctor: (
    options: {
      activeRoot: string;
      standbyRoot: string;
      archiveRoot: string;
      vagrantHome: string;
      evidenceDir?: string;
      requireStandby?: boolean;
      requireArchive?: boolean;
    },
    deps?: {
      mountPoints?: string[];
      now?: () => Date;
      hostname?: string;
    }
  ) => {
    schema: string;
    status: string;
    healthy: boolean;
    activeHealthy: boolean;
    issues: string[];
    warnings: string[];
    active: { issues: string[]; warnings: string[] };
    standby: { issues: string[]; warnings: string[] };
    archive: { issues: string[]; warnings: string[] };
  };
  runVagrantStorageDoctorCli: (
    argv: string[],
    deps?: {
      mountPoints?: string[];
      now?: () => Date;
      hostname?: string;
      stdout?: { write: (text: string) => void };
    }
  ) => string;
};

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

function makeTempRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vihs-vagrant-storage-'));
  tempRoots.push(root);
  return root;
}

function createHealthyTopology(): {
  activeMount: string;
  activeRoot: string;
  standbyMount: string;
  standbyRoot: string;
  archiveMount: string;
  archiveRoot: string;
  vagrantHome: string;
  mountPoints: string[];
} {
  const root = makeTempRoot();
  const activeMount = path.join(root, 'Data');
  const activeRoot = path.join(activeMount, 'vihs-vagrant');
  const standbyMount = path.join(root, 'Data1');
  const standbyRoot = path.join(standbyMount, 'vihs-vagrant');
  const archiveMount = path.join(root, 'MAJOR GENER');
  const archiveRoot = path.join(archiveMount, 'VI History Suite Evidence');
  const vagrantHome = path.join(root, '.vagrant.d');

  fs.mkdirSync(path.join(activeRoot, 'box-cache'), { recursive: true });
  fs.mkdirSync(path.join(activeRoot, 'vagrant-home', 'boxes'), { recursive: true });
  fs.mkdirSync(path.join(activeRoot, 'vagrant-home', 'tmp'), { recursive: true });
  fs.writeFileSync(path.join(activeRoot, 'box-cache', 'windows11.box'), 'box\n', 'utf8');

  fs.mkdirSync(path.join(standbyRoot, 'box-cache'), { recursive: true });
  fs.writeFileSync(path.join(standbyRoot, 'box-cache', 'windows11.box'), 'box\n', 'utf8');
  fs.mkdirSync(archiveRoot, { recursive: true });

  fs.mkdirSync(vagrantHome, { recursive: true });
  fs.symlinkSync(path.join(activeRoot, 'vagrant-home', 'boxes'), path.join(vagrantHome, 'boxes'));
  fs.symlinkSync(path.join(activeRoot, 'vagrant-home', 'tmp'), path.join(vagrantHome, 'tmp'));

  return {
    activeMount,
    activeRoot,
    standbyMount,
    standbyRoot,
    archiveMount,
    archiveRoot,
    vagrantHome,
    mountPoints: [activeMount, standbyMount, archiveMount]
  };
}

function runTopology(
  topology: ReturnType<typeof createHealthyTopology>,
  overrides: Partial<Parameters<typeof doctor.runVagrantStorageDoctor>[0]> = {}
) {
  return doctor.runVagrantStorageDoctor(
    {
      activeRoot: topology.activeRoot,
      standbyRoot: topology.standbyRoot,
      archiveRoot: topology.archiveRoot,
      vagrantHome: topology.vagrantHome,
      ...overrides
    },
    {
      mountPoints: topology.mountPoints,
      now: () => new Date('2026-05-13T12:00:00.000Z'),
      hostname: 'vihs-runner'
    }
  );
}

describe('Vagrant storage doctor', () => {
  it('parses command arguments and documents storage flags', () => {
    const parsed = doctor.parseArgs([
      '--active-root',
      '/active',
      '--standby-root',
      '/standby',
      '--archive-root',
      '/archive',
      '--evidence-dir',
      'vagrant/evidence',
      '--fail-on-active-drift'
    ]);

    expect(parsed.activeRoot).toBe('/active');
    expect(parsed.standbyRoot).toBe('/standby');
    expect(parsed.archiveRoot).toBe('/archive');
    expect(parsed.evidenceDir).toBe(path.resolve('vagrant/evidence'));
    expect(parsed.failOnActiveDrift).toBe(true);
    expect(doctor.getUsage()).toContain('--require-standby');
    expect(doctor.getUsage()).toContain('--require-archive');
  });

  it('passes when the active root, standby root, archive root, and Vagrant boxes link are healthy', () => {
    const topology = createHealthyTopology();
    const report = runTopology(topology);

    expect(report.schema).toBe(doctor.SCHEMA);
    expect(report.status).toBe('passed');
    expect(report.healthy).toBe(true);
    expect(report.activeHealthy).toBe(true);
    expect(report.issues).toEqual([]);
    expect(report.warnings).toEqual([]);
  });

  it('fails active drift when the active root is missing', () => {
    const topology = createHealthyTopology();
    fs.rmSync(topology.activeRoot, { recursive: true, force: true });

    const report = runTopology(topology);
    expect(report.status).toBe('failed');
    expect(report.activeHealthy).toBe(false);
    expect(report.issues.join('\n')).toContain('active storage root is missing');
  });

  it('fails active drift when the Windows box core asset is missing', () => {
    const topology = createHealthyTopology();
    fs.rmSync(path.join(topology.activeRoot, 'box-cache', 'windows11.box'));

    const report = runTopology(topology);
    expect(report.status).toBe('failed');
    expect(report.issues.join('\n')).toContain('active Windows 11 Vagrant box is missing');
  });

  it('fails active drift when the Vagrant boxes symlink points at the wrong target', () => {
    const topology = createHealthyTopology();
    fs.rmSync(path.join(topology.vagrantHome, 'boxes'));
    fs.symlinkSync(path.join(topology.standbyRoot, 'vagrant-home', 'boxes'), path.join(topology.vagrantHome, 'boxes'));

    const report = runTopology(topology);
    expect(report.status).toBe('failed');
    expect(report.issues.join('\n')).toContain('Vagrant boxes symlink points at');
    expect(report.issues.join('\n')).toContain(path.join(topology.activeRoot, 'vagrant-home', 'boxes'));
  });

  it('fails active drift when the Vagrant tmp symlink points at the wrong target', () => {
    const topology = createHealthyTopology();
    fs.rmSync(path.join(topology.vagrantHome, 'tmp'));
    fs.mkdirSync(path.join(topology.standbyRoot, 'vagrant-home', 'tmp'), { recursive: true });
    fs.symlinkSync(path.join(topology.standbyRoot, 'vagrant-home', 'tmp'), path.join(topology.vagrantHome, 'tmp'));

    const report = runTopology(topology);
    expect(report.status).toBe('failed');
    expect(report.issues.join('\n')).toContain('Vagrant tmp symlink points at');
    expect(report.issues.join('\n')).toContain(path.join(topology.activeRoot, 'vagrant-home', 'tmp'));
  });

  it('reports missing standby storage as a warning by default and as a failure when required', () => {
    const topology = createHealthyTopology();
    fs.rmSync(topology.standbyRoot, { recursive: true, force: true });

    const warningReport = runTopology(topology);
    expect(warningReport.status).toBe('passed');
    expect(warningReport.warnings.join('\n')).toContain('standby storage root is missing');

    const requiredReport = runTopology(topology, { requireStandby: true });
    expect(requiredReport.status).toBe('failed');
    expect(requiredReport.issues.join('\n')).toContain('standby storage root is missing');
  });

  it('reports missing archive storage as a warning by default and as a failure when required', () => {
    const topology = createHealthyTopology();
    fs.rmSync(topology.archiveRoot, { recursive: true, force: true });

    const warningReport = runTopology(topology);
    expect(warningReport.status).toBe('passed');
    expect(warningReport.warnings.join('\n')).toContain('archive storage root is missing');

    const requiredReport = runTopology(topology, { requireArchive: true });
    expect(requiredReport.status).toBe('failed');
    expect(requiredReport.issues.join('\n')).toContain('archive storage root is missing');
  });

  it('writes retained JSON and Markdown evidence', () => {
    const topology = createHealthyTopology();
    const evidenceDir = path.join(makeTempRoot(), 'evidence');

    const report = runTopology(topology, { evidenceDir });

    const jsonPath = path.join(evidenceDir, 'vagrant-storage-doctor.json');
    const markdownPath = path.join(evidenceDir, 'vagrant-storage-doctor.md');
    expect(report.status).toBe('passed');
    expect(JSON.parse(fs.readFileSync(jsonPath, 'utf8'))).toMatchObject({
      schema: doctor.SCHEMA,
      status: 'passed',
      hostname: 'vihs-runner'
    });
    expect(fs.readFileSync(markdownPath, 'utf8')).toContain('# Vagrant Storage Doctor');
  });

  it('throws from the CLI wrapper when active drift is configured as fatal', () => {
    const topology = createHealthyTopology();
    fs.rmSync(topology.activeRoot, { recursive: true, force: true });
    const stdout: string[] = [];

    expect(() =>
      doctor.runVagrantStorageDoctorCli(
        [
          '--active-root',
          topology.activeRoot,
          '--standby-root',
          topology.standbyRoot,
          '--archive-root',
          topology.archiveRoot,
          '--vagrant-home',
          topology.vagrantHome,
          '--fail-on-active-drift'
        ],
        {
          mountPoints: topology.mountPoints,
          now: () => new Date('2026-05-13T12:00:00.000Z'),
          hostname: 'vihs-runner',
          stdout: { write: (text: string) => stdout.push(text) }
        }
      )
    ).toThrow('Vagrant active storage drift detected');
    expect(stdout.join('')).toContain('"status": "failed"');
  });
});

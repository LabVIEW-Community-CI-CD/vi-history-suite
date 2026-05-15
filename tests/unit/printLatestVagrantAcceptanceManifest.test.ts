import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '..', '..');

// eslint-disable-next-line @typescript-eslint/no-var-requires
const printer = require(path.join(repoRoot, 'scripts', 'printLatestVagrantAcceptanceManifest.js')) as {
  findLatestVagrantAcceptanceManifest: (
    evidenceRoot: string
  ) => { runId: string; runDirectory: string; manifestPath: string } | undefined;
  parseArgs: (argv: string[]) => { evidenceRoot: string; helpRequested: boolean };
  printLatestVagrantAcceptanceManifest: (
    options: { evidenceRoot: string },
    deps: { stdout: { write: (text: string) => void } }
  ) => string;
};

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

function createTempRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vihs-vagrant-manifest-print-'));
  tempRoots.push(root);
  return root;
}

function writeFile(filePath: string, text: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, text, 'utf8');
}

describe('latest Vagrant acceptance manifest printer', () => {
  it('selects the newest timestamped run directory that contains manifest.json', () => {
    const evidenceRoot = createTempRoot();
    writeFile(path.join(evidenceRoot, '20260507-184132', 'manifest.json'), '{"run":"old"}\n');
    writeFile(path.join(evidenceRoot, '20260508-090001', 'manifest.json'), '{"run":"new"}\n');
    writeFile(path.join(evidenceRoot, 'assertion', 'vagrant-vsix-acceptance-assertion.json'), '{}\n');
    writeFile(path.join(evidenceRoot, 'pipeline-freshness', 'manifest.json'), '{"ignored":true}\n');
    writeFile(path.join(evidenceRoot, 'acceptance-provision.log'), 'log\n');

    const latest = printer.findLatestVagrantAcceptanceManifest(evidenceRoot);
    const stdout: string[] = [];
    const result = printer.printLatestVagrantAcceptanceManifest(
      { evidenceRoot },
      { stdout: { write: (text: string) => stdout.push(text) } }
    );

    expect(latest?.runId).toBe('20260508-090001');
    expect(latest?.manifestPath).toBe(path.join(evidenceRoot, '20260508-090001', 'manifest.json'));
    expect(result).toBe('printed');
    expect(stdout.join('')).toContain('=== Vagrant Acceptance Manifest ===');
    expect(stdout.join('')).toContain('"run":"new"');
  });

  it('does not confuse evidence files or assertion directories for retained run manifests', () => {
    const evidenceRoot = createTempRoot();
    writeFile(path.join(evidenceRoot, '20260508-090001', 'not-manifest.json'), '{}\n');
    writeFile(path.join(evidenceRoot, 'assertion', 'manifest.json'), '{"ignored":true}\n');
    writeFile(path.join(evidenceRoot, 'acceptance-provision.log'), 'log\n');

    const stdout: string[] = [];
    const result = printer.printLatestVagrantAcceptanceManifest(
      { evidenceRoot },
      { stdout: { write: (text: string) => stdout.push(text) } }
    );

    expect(printer.findLatestVagrantAcceptanceManifest(evidenceRoot)).toBeUndefined();
    expect(result).toBe('missing');
    expect(stdout.join('')).toContain('No Vagrant acceptance manifest found under');
  });

  it('parses the GitLab after_script evidence root argument', () => {
    const parsed = printer.parseArgs(['--evidence-root', 'vagrant/evidence']);

    expect(parsed.helpRequested).toBe(false);
    expect(parsed.evidenceRoot).toBe(path.resolve('vagrant/evidence'));
  });
});

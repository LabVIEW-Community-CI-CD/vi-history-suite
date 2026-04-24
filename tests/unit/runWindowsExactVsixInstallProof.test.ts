import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '..', '..');
const tempRoots = new Set<string>();

// eslint-disable-next-line @typescript-eslint/no-var-requires
const installProof = require(path.join(
  repoRoot,
  'scripts',
  'runWindowsExactVsixInstallProof.js'
)) as {
  DEFAULT_CODE_COMMAND: string;
  DEFAULT_EVIDENCE_DIR: string;
  DEFAULT_EXTENSION_ID: string;
  buildIsolatedRoots: (evidenceDir: string, extensionId?: string) => Record<string, string>;
  buildLauncherCommandEnv: (
    roots: Record<string, string>,
    baseEnv?: NodeJS.ProcessEnv
  ) => NodeJS.ProcessEnv;
  parseArgs: (argv: string[]) => Record<string, unknown>;
  runWindowsExactVsixInstallProof: (
    argv?: string[],
    deps?: Record<string, unknown>
  ) => Promise<{ outcome: string; report: Record<string, any> } | string>;
};

function makeTempRoot(prefix: string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempRoots.add(root);
  return root;
}

function getArgValue(args: string[], flag: string): string | null {
  const index = args.indexOf(flag);
  if (index < 0 || index + 1 >= args.length) {
    return null;
  }
  return args[index + 1] ?? null;
}

afterEach(() => {
  for (const root of tempRoots) {
    fs.rmSync(root, { recursive: true, force: true });
  }
  tempRoots.clear();
});

describe('windows exact vsix install proof', () => {
  it('retains a deterministic CLI contract and isolated root helpers', () => {
    expect(installProof.parseArgs([])).toEqual({
      helpRequested: false,
      tag: null,
      evidenceDir: installProof.DEFAULT_EVIDENCE_DIR,
      codeCommand: 'code',
      extensionId: 'svelderrainruiz.vi-history-suite',
      vsixPath: null
    });

    const roots = installProof.buildIsolatedRoots('C:\\proof-root');
    expect(roots).toMatchObject({
      isolatedRoot: 'C:\\proof-root\\isolated-vscode',
      userDataDir: 'C:\\proof-root\\isolated-vscode\\appdata\\Roaming\\Code',
      extensionsRoot: 'C:\\proof-root\\isolated-vscode\\extensions'
    });

    const commandEnv = installProof.buildLauncherCommandEnv(roots, {
      SystemRoot: 'C:\\Windows',
      VI_HISTORY_SUITE_NODE_EXE: 'C:\\node\\node.exe'
    });
    expect(commandEnv.PATH).toBe(`${roots.launcherRoot};C:\\Windows\\System32`);
    expect(commandEnv.VI_HISTORY_SUITE_NODE_EXE).toBeUndefined();
  });

  it('installs the exact authority VSIX into isolated roots and fails closed unless vihs --validate is ready', async () => {
    const tempRoot = makeTempRoot('vihs-windows-vsix-install-proof-');
    const authorityRoot = path.join(tempRoot, 'authority');
    const evidenceDir = path.join(tempRoot, 'evidence');
    const vsixPath = path.join(authorityRoot, 'vi-history-suite-1.3.9.vsix');
    const checksumPath = path.join(authorityRoot, 'vi-history-suite-1.3.9.vsix.sha256');
    const manifestPath = path.join(authorityRoot, 'release-manifest.json');

    fs.mkdirSync(authorityRoot, { recursive: true });
    fs.writeFileSync(vsixPath, 'exact-vsix-proof', 'utf8');
    const vsixSha256 = crypto.createHash('sha256').update(fs.readFileSync(vsixPath)).digest('hex');
    fs.writeFileSync(checksumPath, `${vsixSha256}  vi-history-suite-1.3.9.vsix\n`, 'utf8');
    fs.writeFileSync(
      manifestPath,
      JSON.stringify({
        tag: 'v1.3.9',
        packageVersion: '1.3.9',
        vsixArtifact: {
          fileName: 'vi-history-suite-1.3.9.vsix',
          sha256: vsixSha256
        }
      }),
      'utf8'
    );

    let observedLauncherRoot: string | null = null;

    const result = await installProof.runWindowsExactVsixInstallProof(
      ['--tag', 'v1.3.9', '--evidence-dir', evidenceDir, '--vsix-path', vsixPath],
      {
        platform: 'win32',
        releaseManifest: {
          manifestPath,
          manifestRoot: authorityRoot,
          vsixPath,
          checksumPath,
          manifest: {
            tag: 'v1.3.9',
            packageVersion: '1.3.9',
            vsixArtifact: {
              fileName: 'vi-history-suite-1.3.9.vsix',
              sha256: vsixSha256
            }
          },
          checksumText: `${vsixSha256}  vi-history-suite-1.3.9.vsix\n`,
          checksumSha256: crypto
            .createHash('sha256')
            .update(fs.readFileSync(checksumPath))
            .digest('hex')
        },
        env: {
          SystemRoot: 'C:\\Windows',
          ComSpec: 'C:\\Windows\\System32\\cmd.exe',
          PATHEXT: '.COM;.EXE;.BAT;.CMD',
          VI_HISTORY_SUITE_NODE_EXE: 'C:\\node\\node.exe'
        },
        spawnSync: (command: string, args: string[], options: { env: NodeJS.ProcessEnv }) => {
          if (String(args).includes('install-vihs-extension.ps1')) {
            const userDataDir = getArgValue(args, '-UserDataDir');
            const extensionsRoot = getArgValue(args, '-ExtensionsRoot');
            const extensionId = getArgValue(args, '-ExtensionId') ?? installProof.DEFAULT_EXTENSION_ID;
            if (!userDataDir || !extensionsRoot) {
              throw new Error('Missing isolated roots in install proof bootstrap arguments.');
            }

            observedLauncherRoot = path.join(
              userDataDir,
              'User',
              'globalStorage',
              extensionId,
              'local-runtime-settings-cli'
            );
            const installedExtensionRoot = path.join(
              extensionsRoot,
              `${extensionId}-1.3.9`,
              'out',
              'tooling'
            );
            fs.mkdirSync(installedExtensionRoot, { recursive: true });
            fs.mkdirSync(observedLauncherRoot, { recursive: true });
            fs.writeFileSync(path.join(installedExtensionRoot, 'localRuntimeSettingsCli.js'), '', 'utf8');
            fs.writeFileSync(path.join(observedLauncherRoot, 'vihs.cmd'), '@echo off\r\n', 'ascii');
            return {
              status: 0,
              stdout: `launcherRoot=${observedLauncherRoot}\nsettingsFilePath=${path.join(
                userDataDir,
                'User',
                'settings.json'
              )}\n`,
              stderr: ''
            };
          }

          if (args.join(' ') === '/d /c vihs') {
            expect(observedLauncherRoot).not.toBeNull();
            expect(options.env.PATH).toBe(`${observedLauncherRoot};C:\\Windows\\System32`);
            expect(options.env.VI_HISTORY_SUITE_NODE_EXE).toBeUndefined();
            return {
              status: 0,
              stdout: 'commandOutcome=ready\n',
              stderr: ''
            };
          }

          if (args.join(' ') === '/d /c vihs --validate') {
            expect(observedLauncherRoot).not.toBeNull();
            expect(options.env.PATH).toBe(`${observedLauncherRoot};C:\\Windows\\System32`);
            expect(options.env.VI_HISTORY_SUITE_NODE_EXE).toBeUndefined();
            return {
              status: 0,
              stdout: 'runtimeValidationOutcome=ready\n',
              stderr: ''
            };
          }

          throw new Error(`Unexpected process invocation: ${command} ${args.join(' ')}`);
        }
      }
    );

    expect(result).toMatchObject({
      outcome: 'passed',
      report: {
        status: 'passed',
        authority: {
          tag: 'v1.3.9',
          packageVersion: '1.3.9',
          vsixSha256Verified: true
        },
        launcher: {
          pathStrippedToLauncherAndSystem32: true,
          ambientNodeOnPathRequired: false
        }
      }
    });

    const receiptPath = path.join(evidenceDir, 'windows-exact-vsix-install-proof.json');
    const receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8')) as {
      status: string;
      authority: { observedVsixSha256: string };
      launcher: {
        pathStrippedToLauncherAndSystem32: boolean;
        ambientNodeOnPathRequired: boolean;
      };
      commands: Array<{ id: string; status: string; runtimeValidationOutcome?: string }>;
      receiptPaths: { json: string; markdown: string };
    };

    expect(receipt.status).toBe('passed');
    expect(receipt.authority.observedVsixSha256).toBe(vsixSha256);
    expect(receipt.launcher).toEqual({
      pathStrippedToLauncherAndSystem32: true,
      ambientNodeOnPathRequired: false,
      bootstrapPersistedUserPath: false
    });
    expect(receipt.commands).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'install-exact-vsix', status: 'passed' }),
        expect.objectContaining({ id: 'vihs', status: 'passed' }),
        expect.objectContaining({
          id: 'vihs-validate',
          status: 'passed',
          runtimeValidationOutcome: 'ready'
        })
      ])
    );
    expect(receipt.receiptPaths).toEqual({
      json: path.relative(repoRoot, path.join(evidenceDir, 'windows-exact-vsix-install-proof.json')).replaceAll(path.sep, '/'),
      markdown: path
        .relative(repoRoot, path.join(evidenceDir, 'windows-exact-vsix-install-proof.md'))
        .replaceAll(path.sep, '/')
    });
  });
});

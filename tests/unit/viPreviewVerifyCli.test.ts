import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import type {
  ComparisonRuntimeSelection,
  locateComparisonRuntime
} from '../../src/reporting/comparisonRuntimeLocator';
import type { ViPreviewVerificationProof } from '../../src/reporting/viPreview/viPreviewVerification';
import {
  buildNodeViPreviewRenderDeps,
  defaultOperationDirectory,
  defaultSampleViPath,
  main,
  parseArgs,
  PREVIEW_VERIFICATION_PROOF_FILE_NAME,
  PREVIEW_VERIFICATION_PROOF_SCHEMA,
  resolveAndVerifyViPreview
} from '../../src/tooling/viPreviewVerifyCli';

const htmlWith = (images: number): string =>
  `<html>${'<img src="data:image/png;base64,AAAA"/>'.repeat(images)}</html>`;

function makeRenderDeps(html: string, outputExists = true) {
  return {
    createWorkspaceDirectory: vi.fn().mockResolvedValue('/tmp/ws'),
    listSourceFiles: vi.fn().mockResolvedValue([]),
    ensureDirectory: vi.fn().mockResolvedValue(undefined),
    copyFile: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn().mockResolvedValue(html),
    removeDirectory: vi.fn().mockResolvedValue(undefined),
    execution: {
      runCommand: vi.fn().mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' }),
      pathExists: vi.fn().mockResolvedValue(outputExists)
    }
  };
}

function fakeLocateRuntime(selection: Partial<ComparisonRuntimeSelection>): typeof locateComparisonRuntime {
  return (async () => selection as ComparisonRuntimeSelection) as typeof locateComparisonRuntime;
}

describe('resolveAndVerifyViPreview', () => {
  it('renders the sample VI through the resolved runtime and returns a passing proof', async () => {
    const proof = await resolveAndVerifyViPreview(
      { operationDirectory: '/ops', sampleViPath: '/repo/Sample.vi' },
      {
        processPlatform: 'win32',
        locateRuntime: fakeLocateRuntime({
          provider: 'host-native',
          labviewCli: { path: 'C:\\LabVIEWCLI.exe', source: 'scan', exists: true, kind: 'labview-cli' },
          hostLabviewTcpPort: 3364
        }),
        renderDeps: makeRenderDeps(htmlWith(10))
      }
    );
    expect(proof.outcome).toBe('rendered');
    expect(proof.provider).toBe('host-native');
    expect(proof.inlineImageCount).toBe(10);
  });

  it('returns a blocked proof (never throws) when the runtime cannot render', async () => {
    const proof = await resolveAndVerifyViPreview(
      { operationDirectory: '/ops', sampleViPath: '/repo/Sample.vi' },
      {
        processPlatform: 'win32',
        // host-native with no resolved LabVIEWCLI => the render blocks.
        locateRuntime: fakeLocateRuntime({ provider: 'host-native' }),
        renderDeps: makeRenderDeps(htmlWith(0), false)
      }
    );
    expect(proof.outcome).toBe('blocked');
    expect(proof.inlineImageCount).toBe(0);
  });
});

describe('parseArgs (VHS-REQ-659)', () => {
  it('maps --labview-path and --labview-version for host targeting', () => {
    const parsed = parseArgs([
      '--provider',
      'host',
      '--labview-path',
      'C:\\Program Files\\National Instruments\\LabVIEW 2026\\LabVIEW.exe',
      '--labview-version',
      '2026'
    ]);
    expect(parsed.requestedProvider).toBe('host');
    expect(parsed.labviewExePath).toBe(
      'C:\\Program Files\\National Instruments\\LabVIEW 2026\\LabVIEW.exe'
    );
    expect(parsed.labviewVersion).toBe('2026');
  });
});

describe('resolveAndVerifyViPreview LabVIEW targeting (VHS-REQ-659)', () => {
  it('forwards labviewExePath/labviewVersion settings to the runtime locator', async () => {
    const locate = vi.fn(
      async () =>
        ({
          provider: 'host-native',
          labviewCli: { path: 'C:\\LabVIEWCLI.exe', source: 'scan', exists: true, kind: 'labview-cli' },
          labviewExe: {
            path: 'C:\\Program Files\\National Instruments\\LabVIEW 2026\\LabVIEW.exe',
            source: 'scan',
            exists: true,
            kind: 'labview'
          },
          hostLabviewTcpPort: 3364
        }) as ComparisonRuntimeSelection
    );
    const proof = await resolveAndVerifyViPreview(
      {
        operationDirectory: '/ops',
        sampleViPath: '/repo/Sample.vi',
        settings: {
          labviewExePath: 'C:\\Program Files\\National Instruments\\LabVIEW 2026\\LabVIEW.exe',
          labviewVersion: '2026'
        }
      },
      {
        processPlatform: 'win32',
        locateRuntime: locate as unknown as typeof locateComparisonRuntime,
        renderDeps: makeRenderDeps(htmlWith(10))
      }
    );
    expect(proof.outcome).toBe('rendered');
    expect(locate).toHaveBeenCalledWith(
      'win32',
      expect.objectContaining({
        labviewExePath: 'C:\\Program Files\\National Instruments\\LabVIEW 2026\\LabVIEW.exe',
        labviewVersion: '2026'
      })
    );
  });
});

describe('buildNodeViPreviewRenderDeps (VHS-REQ-659)', () => {
  let tempRoot: string;

  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'vihs-vpv-deps-'));
  });

  afterEach(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  it('createWorkspaceDirectory makes a real, uniquely-prefixed temp directory', async () => {
    const deps = buildNodeViPreviewRenderDeps();
    const workspace = await deps.createWorkspaceDirectory();
    try {
      expect(path.basename(workspace)).toContain('vihs-vi-preview-verify-');
      expect((await fs.stat(workspace)).isDirectory()).toBe(true);
    } finally {
      await fs.rm(workspace, { recursive: true, force: true });
    }
  });

  it('listSourceFiles recursively enumerates only LabVIEW source files with size/mtime', async () => {
    await fs.writeFile(path.join(tempRoot, 'Top.vi'), 'a');
    await fs.writeFile(path.join(tempRoot, 'notes.txt'), 'ignore me');
    await fs.mkdir(path.join(tempRoot, 'sub'));
    await fs.writeFile(path.join(tempRoot, 'sub', 'Nested.vi'), 'bb');
    const deps = buildNodeViPreviewRenderDeps();
    const entries = await deps.listSourceFiles(tempRoot);
    const relativePaths = entries.map((entry) => entry.relativePath.replace(/\\/g, '/')).sort();
    expect(relativePaths).toEqual(['Top.vi', 'sub/Nested.vi']);
    const top = entries.find((entry) => entry.relativePath.replace(/\\/g, '/') === 'Top.vi');
    expect(top?.sizeBytes).toBe(1);
    expect(typeof top?.mtimeMs).toBe('number');
  });

  it('listSourceFiles returns an empty list when the directory cannot be read', async () => {
    const deps = buildNodeViPreviewRenderDeps();
    expect(await deps.listSourceFiles(path.join(tempRoot, 'does-not-exist'))).toEqual([]);
  });

  it('resolveStagingBaseDirectory walks up to the enclosing LabVIEW project', async () => {
    await fs.writeFile(path.join(tempRoot, 'Bench.lvproj'), '<Project/>');
    const nested = path.join(tempRoot, 'a', 'b');
    await fs.mkdir(nested, { recursive: true });
    const deps = buildNodeViPreviewRenderDeps();
    expect(await deps.resolveStagingBaseDirectory(path.join(nested, 'Leaf.vi'))).toBe(tempRoot);
  });

  it('resolveStagingBaseDirectory returns undefined when no project is found', async () => {
    const nested = path.join(tempRoot, 'x', 'y');
    await fs.mkdir(nested, { recursive: true });
    const deps = buildNodeViPreviewRenderDeps();
    expect(await deps.resolveStagingBaseDirectory(path.join(nested, 'Leaf.vi'))).toBeUndefined();
  });

  it('ensureDirectory / copyFile / readFile / removeDirectory operate on the real filesystem', async () => {
    const deps = buildNodeViPreviewRenderDeps();
    const nestedDir = path.join(tempRoot, 'made', 'here');
    await deps.ensureDirectory(nestedDir);
    expect((await fs.stat(nestedDir)).isDirectory()).toBe(true);

    const source = path.join(tempRoot, 'source.txt');
    const destination = path.join(nestedDir, 'copied.txt');
    await fs.writeFile(source, 'payload');
    await deps.copyFile(source, destination);
    expect(await deps.readFile(destination)).toBe('payload');

    await deps.removeDirectory(nestedDir);
    await expect(fs.stat(nestedDir)).rejects.toThrow();
  });

  it('execution.runCommand returns exitCode 0 with stdout/stderr for a successful command', async () => {
    const deps = buildNodeViPreviewRenderDeps();
    const result = await deps.execution.runCommand({
      executable: process.execPath,
      args: ['-e', 'process.stdout.write("out"); process.stderr.write("warn")']
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('out');
    expect(result.stderr).toContain('warn');
  });

  it('execution.runCommand maps a non-zero process exit to its numeric exitCode', async () => {
    const deps = buildNodeViPreviewRenderDeps();
    const result = await deps.execution.runCommand({
      executable: process.execPath,
      args: ['-e', 'process.stderr.write("boom"); process.exit(3)']
    });
    expect(result.exitCode).toBe(3);
    expect(result.stderr).toContain('boom');
  });

  it('execution.runCommand maps a spawn failure (missing executable) to exitCode 1', async () => {
    const deps = buildNodeViPreviewRenderDeps();
    const result = await deps.execution.runCommand({
      executable: path.join(tempRoot, 'no-such-binary'),
      args: []
    });
    expect(result.exitCode).toBe(1);
    expect(typeof result.stderr).toBe('string');
  });

  it('execution.pathExists reflects real filesystem presence', async () => {
    const deps = buildNodeViPreviewRenderDeps();
    const present = path.join(tempRoot, 'present.txt');
    await fs.writeFile(present, 'x');
    expect(await deps.execution.pathExists(present)).toBe(true);
    expect(await deps.execution.pathExists(path.join(tempRoot, 'absent.txt'))).toBe(false);
  });
});

describe('parseArgs full flag coverage (VHS-REQ-659)', () => {
  it('parses every supported flag with valid values', () => {
    const parsed = parseArgs([
      '--proof-out',
      'out/dir',
      '--operation-dir',
      '/ops',
      '--sample-vi',
      '/repo/S.vi',
      '--provider',
      'docker',
      '--container-image',
      'ni/labview:2026',
      '--port',
      '3364',
      '--connect-timeout',
      '90'
    ]);
    expect(parsed).toEqual({
      proofOutDirectoryPath: 'out/dir',
      operationDirectory: '/ops',
      sampleViPath: '/repo/S.vi',
      requestedProvider: 'docker',
      containerImage: 'ni/labview:2026',
      portNumber: 3364,
      connectTimeoutSeconds: 90
    });
  });

  it('ignores an unrecognized provider and non-positive/non-integer numeric values', () => {
    const parsed = parseArgs(['--provider', 'cloud', '--port', '0', '--connect-timeout', 'abc']);
    expect(parsed.requestedProvider).toBeUndefined();
    expect(parsed.portNumber).toBeUndefined();
    expect(parsed.connectTimeoutSeconds).toBeUndefined();
  });

  it('returns an empty parse for no args and ignores unknown flags', () => {
    expect(parseArgs([])).toEqual({});
    expect(parseArgs(['--unknown', 'value', 'positional'])).toEqual({});
  });
});

describe('defaultOperationDirectory / defaultSampleViPath (VHS-REQ-659)', () => {
  it('resolves the vendored operation directory and its sample VI', () => {
    const operationDirectory = defaultOperationDirectory();
    expect(path.isAbsolute(operationDirectory)).toBe(true);
    expect(operationDirectory.replace(/\\/g, '/')).toContain('resources/labview-cli-operations');
    expect(defaultSampleViPath(operationDirectory).replace(/\\/g, '/')).toContain(
      'resources/labview-cli-operations/PrintToSingleFileHtml/Make path absolute.vi'
    );
  });
});

describe('main (VHS-REQ-659)', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  const renderedProof: ViPreviewVerificationProof = {
    outcome: 'rendered',
    provider: 'host-native',
    sampleViPath: '/repo/Sample.vi',
    htmlBytes: 2048,
    inlineImageCount: 7,
    cached: false
  };

  it('maps CLI flags into runtime settings and exits 0 for a passing render', async () => {
    const resolve = vi.fn(async () => renderedProof);
    const code = await main(
      [
        '--provider',
        'docker',
        '--container-image',
        'ni/labview:2026',
        '--labview-path',
        'C:\\LV\\LabVIEW.exe',
        '--labview-version',
        '2026',
        '--port',
        '3364',
        '--connect-timeout',
        '45',
        '--operation-dir',
        '/ops',
        '--sample-vi',
        '/repo/Sample.vi'
      ],
      { resolve: resolve as never }
    );
    expect(code).toBe(0);
    expect(resolve).toHaveBeenCalledWith(
      expect.objectContaining({
        operationDirectory: '/ops',
        sampleViPath: '/repo/Sample.vi',
        connectTimeoutSeconds: 45,
        portNumber: 3364,
        settings: {
          requestedProvider: 'docker',
          labviewExePath: 'C:\\LV\\LabVIEW.exe',
          labviewVersion: '2026',
          windowsContainerImage: 'ni/labview:2026',
          linuxContainerImage: 'ni/labview:2026'
        }
      })
    );
  });

  it('exits 1 for a blocked render', async () => {
    const resolve = vi.fn(async () => ({
      ...renderedProof,
      outcome: 'blocked' as const,
      inlineImageCount: 0,
      failureReason: 'no runtime'
    }));
    expect(await main([], { resolve: resolve as never })).toBe(1);
  });

  it('writes a schema-tagged proof file to --proof-out', async () => {
    const proofRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'vihs-vpv-proof-'));
    try {
      const resolve = vi.fn(async () => renderedProof);
      const code = await main(['--proof-out', proofRoot], { resolve: resolve as never });
      expect(code).toBe(0);
      const written = JSON.parse(
        await fs.readFile(path.join(proofRoot, PREVIEW_VERIFICATION_PROOF_FILE_NAME), 'utf8')
      );
      expect(written.schema).toBe(PREVIEW_VERIFICATION_PROOF_SCHEMA);
      expect(written.passing).toBe(true);
      expect(written.outcome).toBe('rendered');
      expect(written.inlineImageCount).toBe(7);
      expect(typeof written.generatedAt).toBe('string');
    } finally {
      await fs.rm(proofRoot, { recursive: true, force: true });
    }
  });
});

import { describe, expect, it, vi } from 'vitest';

import type {
  ComparisonRuntimeSelection,
  locateComparisonRuntime
} from '../../src/reporting/comparisonRuntimeLocator';
import { parseArgs, resolveAndVerifyViPreview } from '../../src/tooling/viPreviewVerifyCli';

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

import { describe, expect, it, vi } from 'vitest';

import {
  validateCanonicalRuntimeOverrideArgs,
  validateCanonicalRuntimeOverrideExecutionSurface
} from '../../src/cli/canonicalRuntimeOverrideValidation';

const USAGE = 'usage';
const WINDOWS_X86_LABVIEW_CLI_PATH =
  'C:\\Program Files (x86)\\National Instruments\\Shared\\LabVIEW CLI\\LabVIEWCLI.exe';
const WINDOWS_X86_LABVIEW_EXE_PATH =
  'C:\\Program Files (x86)\\National Instruments\\LabVIEW 2026\\LabVIEW.exe';
const WINDOWS_X64_LABVIEW_EXE_PATH =
  'C:\\Program Files\\National Instruments\\LabVIEW 2026\\LabVIEW.exe';
const WINDOWS_X64_LVCOMPARE_PATH =
  'C:\\Program Files\\National Instruments\\Shared\\LabVIEW Compare\\LVCompare.exe';

describe('canonicalRuntimeOverrideValidation', () => {
  it('rejects mixed Windows bitness bundles even when prefer-bitness is omitted', () => {
    expect(() =>
      validateCanonicalRuntimeOverrideArgs(
        {
          runtimePlatform: 'win32',
          runtimeEngineOverride: 'labview-cli',
          labviewCliPath: WINDOWS_X86_LABVIEW_CLI_PATH,
          labviewExePath: WINDOWS_X64_LABVIEW_EXE_PATH
        },
        USAGE
      )
    ).toThrow(/must form one coherent bitness bundle/);

    expect(() =>
      validateCanonicalRuntimeOverrideArgs(
        {
          runtimePlatform: 'win32',
          runtimeEngineOverride: 'lvcompare',
          labviewExePath: WINDOWS_X86_LABVIEW_EXE_PATH,
          lvComparePath: WINDOWS_X64_LVCOMPARE_PATH
        },
        USAGE
      )
    ).toThrow(/must form one coherent bitness bundle/);
  });

  it('accepts coherent Windows bundles without an explicit prefer-bitness override', () => {
    expect(() =>
      validateCanonicalRuntimeOverrideArgs(
        {
          runtimePlatform: 'win32',
          runtimeEngineOverride: 'labview-cli',
          labviewCliPath: WINDOWS_X86_LABVIEW_CLI_PATH,
          labviewExePath: WINDOWS_X86_LABVIEW_EXE_PATH
        },
        USAGE
      )
    ).not.toThrow();
  });

  it('fails closed on missing explicit Windows runtime paths on the canonical host', async () => {
    await expect(
      validateCanonicalRuntimeOverrideExecutionSurface(
        {
          runtimePlatform: 'win32',
          runtimeEngineOverride: 'labview-cli',
          labviewCliPath: WINDOWS_X86_LABVIEW_CLI_PATH,
          labviewExePath: WINDOWS_X86_LABVIEW_EXE_PATH
        },
        USAGE,
        {
          hostPlatform: 'win32',
          pathExists: vi.fn(async (candidatePath: string) => candidatePath !== WINDOWS_X86_LABVIEW_CLI_PATH)
        }
      )
    ).rejects.toThrow(/does not exist on the canonical Windows host/);
  });
});

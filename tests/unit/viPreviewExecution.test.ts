import * as path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import {
  buildViPreviewCommandPlan,
  executeViPreview,
  type ExecuteViPreviewOptions,
  type RunViPreviewCommandResult
} from '../../src/reporting/viPreview/viPreviewExecution';

function baseOptions(overrides: Partial<ExecuteViPreviewOptions> = {}): ExecuteViPreviewOptions {
  return {
    runtime: { provider: 'host-native', labviewCliPath: '/usr/local/bin/LabVIEWCLI' },
    workspaceDirectory: '/host/report',
    viFilename: 'input.vi',
    outputFilename: 'preview.html',
    operationDirectory: '/ext/resources/labview-cli-operations',
    ...overrides
  };
}

function argValue(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

describe('buildViPreviewCommandPlan', () => {
  it('builds a host-native plan using the resolved LabVIEWCLI executable (VHS-REQ-659.6)', () => {
    const result = buildViPreviewCommandPlan(baseOptions());
    expect(result.outcome).toBe('ready');
    if (result.outcome !== 'ready') {
      return;
    }
    expect(result.commandPlan.executable).toBe('/usr/local/bin/LabVIEWCLI');
    // Production joins workspace + filename with path.join, so the expected path
    // must be built the same way to stay separator-agnostic across win32/posix.
    expect(argValue(result.commandPlan.args, '-VI')).toBe(path.join('/host/report', 'input.vi'));
    expect(argValue(result.commandPlan.args, '-OutputPath')).toBe(
      path.join('/host/report', 'preview.html')
    );
    expect(result.commandPlan.args).not.toContain('-Headless');
  });

  it('blocks host-native when the LabVIEWCLI path is missing (VHS-REQ-659.6)', () => {
    const result = buildViPreviewCommandPlan(
      baseOptions({ runtime: { provider: 'host-native' } })
    );
    expect(result.outcome).toBe('blocked');
    expect((result as { failureReason?: string }).failureReason).toBe(
      'labview-cli-selection-incomplete'
    );
  });

  it('builds a docker plan for the linux-container provider (VHS-REQ-659.6)', () => {
    const result = buildViPreviewCommandPlan(
      baseOptions({
        runtime: {
          provider: 'linux-container',
          containerImage: 'nationalinstruments/labview:2026q1patch2-linux'
        }
      })
    );
    expect(result.outcome).toBe('ready');
    if (result.outcome !== 'ready') {
      return;
    }
    expect(result.commandPlan.executable).toBe('docker');
    expect(result.commandPlan.args).toContain('nationalinstruments/labview:2026q1patch2-linux');
  });

  it('blocks linux-container when no image is selected (VHS-REQ-659.6)', () => {
    const result = buildViPreviewCommandPlan(
      baseOptions({ runtime: { provider: 'linux-container' } })
    );
    expect(result.outcome).toBe('blocked');
    expect((result as { failureReason?: string }).failureReason).toBe('container-image-unavailable');
  });

  it('builds a host-PowerShell plan for the windows-container provider', () => {
    const result = buildViPreviewCommandPlan(
      baseOptions({
        runtime: {
          provider: 'windows-container',
          containerImage: 'ni/labview:2026-windows',
          containerLabviewPath: 'C:\\LV\\LabVIEW.exe',
          windowsPowerShellHostExecutable: 'powershell.exe'
        }
      })
    );
    expect(result.outcome).toBe('ready');
    if (result.outcome !== 'ready') {
      return;
    }
    expect(result.commandPlan.executable).toBe('powershell.exe');
    expect(result.commandPlan.args.slice(0, 2)).toEqual(['-NoProfile', '-EncodedCommand']);
  });

  it('blocks windows-container when no image is selected', () => {
    const result = buildViPreviewCommandPlan(
      baseOptions({
        runtime: { provider: 'windows-container', windowsPowerShellHostExecutable: 'powershell.exe' }
      })
    );
    expect(result.outcome).toBe('blocked');
    expect((result as { failureReason?: string }).failureReason).toBe('container-image-unavailable');
  });

  it('blocks windows-container when the host PowerShell executable is unresolved (VHS-REQ-659.4)', () => {
    const result = buildViPreviewCommandPlan(
      baseOptions({
        runtime: { provider: 'windows-container', containerImage: 'ni/labview:2026-windows' }
      })
    );
    expect(result.outcome).toBe('blocked');
    expect((result as { failureReason?: string }).failureReason).toBe(
      'windows-powershell-host-unavailable'
    );
  });
});

describe('executeViPreview', () => {
  function deps(run: RunViPreviewCommandResult, outputExists: boolean) {
    return {
      runCommand: vi.fn().mockResolvedValue(run),
      pathExists: vi.fn().mockResolvedValue(outputExists)
    };
  }

  it('reports rendered when the command succeeds and the output exists (VHS-REQ-659.6)', async () => {
    const dependencies = deps({ exitCode: 0, stdout: 'ok', stderr: '' }, true);
    const result = await executeViPreview(baseOptions(), dependencies);

    expect(result.outcome).toBe('rendered');
    expect(result.reportFilePath).toBe(path.join('/host/report', 'preview.html'));
    expect(dependencies.runCommand).toHaveBeenCalledOnce();
  });

  it('reports failed with command-exited-nonzero on a nonzero exit (VHS-REQ-659.6)', async () => {
    const dependencies = deps({ exitCode: 1, stdout: '', stderr: 'boom' }, false);
    const result = await executeViPreview(baseOptions(), dependencies);

    expect(result.outcome).toBe('failed');
    expect(result.failureReason).toBe('command-exited-nonzero');
    expect(result.stderr).toBe('boom');
    expect(dependencies.pathExists).not.toHaveBeenCalled();
  });

  it('reports failed with preview-output-not-produced when no document is written (VHS-REQ-659.6)', async () => {
    const dependencies = deps({ exitCode: 0, stdout: 'ok', stderr: '' }, false);
    const result = await executeViPreview(baseOptions(), dependencies);

    expect(result.outcome).toBe('failed');
    expect(result.failureReason).toBe('preview-output-not-produced');
  });

  it('does not run the command when the plan is blocked (VHS-REQ-659.6)', async () => {
    const dependencies = deps({ exitCode: 0, stdout: '', stderr: '' }, true);
    const result = await executeViPreview(
      baseOptions({ runtime: { provider: 'host-native' } }),
      dependencies
    );

    expect(result.outcome).toBe('blocked');
    expect(dependencies.runCommand).not.toHaveBeenCalled();
  });

  it('retries host-native on a cold-launch -350000 and renders on the warm retry (VHS-REQ-659.6)', async () => {
    const runCommand = vi
      .fn()
      .mockResolvedValueOnce({ exitCode: 1, stdout: '', stderr: 'Error code : -350000' })
      .mockResolvedValueOnce({ exitCode: 0, stdout: 'ok', stderr: '' });
    const sleep = vi.fn().mockResolvedValue(undefined);
    const result = await executeViPreview(baseOptions(), {
      runCommand,
      pathExists: vi.fn().mockResolvedValue(true),
      sleep
    });

    expect(result.outcome).toBe('rendered');
    expect(runCommand).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledOnce();
  });

  it('classifies host-native as labview-cli-connection-failed after exhausting -350000 retries (VHS-REQ-659.6)', async () => {
    const runCommand = vi.fn().mockResolvedValue({
      exitCode: 1,
      stdout: '',
      stderr: 'failed to establish a connection with LabVIEW (-350000)'
    });
    const sleep = vi.fn().mockResolvedValue(undefined);
    const result = await executeViPreview(baseOptions(), {
      runCommand,
      pathExists: vi.fn().mockResolvedValue(false),
      sleep
    });

    expect(result.outcome).toBe('failed');
    expect(result.failureReason).toBe('labview-cli-connection-failed');
    // 1 initial attempt + VI_PREVIEW_STARTUP_RETRY_COUNT (2) retries = 3 runs.
    expect(runCommand).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it('does not orchestrator-retry a container connectivity failure (retry is in-script) (VHS-REQ-659.6)', async () => {
    const runCommand = vi
      .fn()
      .mockResolvedValue({ exitCode: 1, stdout: '', stderr: 'Error code : -350000' });
    const sleep = vi.fn().mockResolvedValue(undefined);
    const result = await executeViPreview(
      baseOptions({
        runtime: {
          provider: 'linux-container',
          containerImage: 'nationalinstruments/labview:2026q1patch2-linux'
        }
      }),
      { runCommand, pathExists: vi.fn().mockResolvedValue(false), sleep }
    );

    expect(result.outcome).toBe('failed');
    expect(result.failureReason).toBe('labview-cli-connection-failed');
    expect(runCommand).toHaveBeenCalledOnce();
    expect(sleep).not.toHaveBeenCalled();
  });

  it('does not retry a host-native non-connectivity failure (VHS-REQ-659.6)', async () => {
    const runCommand = vi
      .fn()
      .mockResolvedValue({ exitCode: 2, stdout: '', stderr: 'some other error' });
    const sleep = vi.fn().mockResolvedValue(undefined);
    const result = await executeViPreview(baseOptions(), {
      runCommand,
      pathExists: vi.fn().mockResolvedValue(false),
      sleep
    });

    expect(result.outcome).toBe('failed');
    expect(result.failureReason).toBe('command-exited-nonzero');
    expect(runCommand).toHaveBeenCalledOnce();
    expect(sleep).not.toHaveBeenCalled();
  });

  it('classifies the operation-class load failure (error 1125) as labview-preview-operation-load-failed and does not retry (VHS-REQ-659.6)', async () => {
    const runCommand = vi.fn().mockResolvedValue({
      exitCode: 1,
      stdout: '',
      stderr:
        'Error code : 1125\nError message : Get LV Class Default Value.vi\nLabVIEW attempted to load the class at this path:\nC:\\ops\\PrintToSingleFileHtml\\PrintToSingleFileHtml.lvclass'
    });
    const sleep = vi.fn().mockResolvedValue(undefined);
    const result = await executeViPreview(baseOptions(), {
      runCommand,
      pathExists: vi.fn().mockResolvedValue(false),
      sleep
    });

    expect(result.outcome).toBe('failed');
    expect(result.failureReason).toBe('labview-preview-operation-load-failed');
    expect(runCommand).toHaveBeenCalledOnce();
    expect(sleep).not.toHaveBeenCalled();
  });
});

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
  it('builds a host-native plan using the resolved LabVIEWCLI executable', () => {
    const result = buildViPreviewCommandPlan(baseOptions());
    expect(result.outcome).toBe('ready');
    if (result.outcome !== 'ready') {
      return;
    }
    expect(result.commandPlan.executable).toBe('/usr/local/bin/LabVIEWCLI');
    expect(argValue(result.commandPlan.args, '-VI')).toBe('/host/report/input.vi');
    expect(argValue(result.commandPlan.args, '-OutputPath')).toBe('/host/report/preview.html');
    expect(result.commandPlan.args).not.toContain('-Headless');
  });

  it('blocks host-native when the LabVIEWCLI path is missing', () => {
    const result = buildViPreviewCommandPlan(
      baseOptions({ runtime: { provider: 'host-native' } })
    );
    expect(result.outcome).toBe('blocked');
    expect((result as { failureReason?: string }).failureReason).toBe(
      'labview-cli-selection-incomplete'
    );
  });

  it('builds a docker plan for the linux-container provider', () => {
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

  it('blocks linux-container when no image is selected', () => {
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

  it('blocks windows-container when the host PowerShell executable is unresolved', () => {
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

  it('reports rendered when the command succeeds and the output exists', async () => {
    const dependencies = deps({ exitCode: 0, stdout: 'ok', stderr: '' }, true);
    const result = await executeViPreview(baseOptions(), dependencies);

    expect(result.outcome).toBe('rendered');
    expect(result.reportFilePath).toBe('/host/report/preview.html');
    expect(dependencies.runCommand).toHaveBeenCalledOnce();
  });

  it('reports failed with command-exited-nonzero on a nonzero exit', async () => {
    const dependencies = deps({ exitCode: 1, stdout: '', stderr: 'boom' }, false);
    const result = await executeViPreview(baseOptions(), dependencies);

    expect(result.outcome).toBe('failed');
    expect(result.failureReason).toBe('command-exited-nonzero');
    expect(result.stderr).toBe('boom');
    expect(dependencies.pathExists).not.toHaveBeenCalled();
  });

  it('reports failed with preview-output-not-produced when no document is written', async () => {
    const dependencies = deps({ exitCode: 0, stdout: 'ok', stderr: '' }, false);
    const result = await executeViPreview(baseOptions(), dependencies);

    expect(result.outcome).toBe('failed');
    expect(result.failureReason).toBe('preview-output-not-produced');
  });

  it('does not run the command when the plan is blocked', async () => {
    const dependencies = deps({ exitCode: 0, stdout: '', stderr: '' }, true);
    const result = await executeViPreview(
      baseOptions({ runtime: { provider: 'host-native' } }),
      dependencies
    );

    expect(result.outcome).toBe('blocked');
    expect(dependencies.runCommand).not.toHaveBeenCalled();
  });
});

import { describe, expect, it } from 'vitest';

import {
  buildLabviewCliPrintToSingleFileHtmlPlan,
  buildLinuxContainerExecViPreviewCommandPlan,
  buildLinuxContainerSessionHardenScript,
  buildLinuxContainerSessionStartArgs,
  buildLinuxContainerViPreviewCommandPlan,
  buildLinuxContainerViPreviewScript,
  buildWindowsContainerExecViPreviewCommandPlan,
  buildWindowsContainerSessionHardenCommandPlan,
  buildWindowsContainerSessionHardenScript,
  buildWindowsContainerSessionStartArgs,
  buildWindowsContainerViPreviewCommandPlan,
  buildWindowsContainerViPreviewScript,
  DEFAULT_VI_PREVIEW_VI_SERVER_PORT,
  LINUX_CONTAINER_VI_PREVIEW_OPERATION_ROOT,
  LINUX_CONTAINER_VI_PREVIEW_WORKSPACE_ROOT,
  resolveWindowsPowerShellHostExecutable,
  rewriteViPreviewArgsForLinuxContainerWorkspace,
  rewriteViPreviewArgsForWindowsContainerWorkspace,
  VI_PREVIEW_OPERATION_NAME,
  WINDOWS_CONTAINER_VI_PREVIEW_OPERATION_ROOT,
  WINDOWS_CONTAINER_VI_PREVIEW_TEMP_ROOT,
  WINDOWS_CONTAINER_VI_PREVIEW_WORKSPACE_ROOT
} from '../../src/reporting/viPreview/viPreviewCommandPlan';

function argValue(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

describe('buildLabviewCliPrintToSingleFileHtmlPlan', () => {
  it('builds the PrintToSingleFileHtml host command with -VI/-OutputPath and default flags (VHS-REQ-659.1)', () => {
    const plan = buildLabviewCliPrintToSingleFileHtmlPlan({
      viPath: '/repo/staging/Foo.vi',
      outputHtmlPath: '/out/preview.html',
      additionalOperationDirectory: '/ext/resources/labview-cli-operations'
    });

    expect(plan.executable).toBe('LabVIEWCLI');
    expect(argValue(plan.args, '-OperationName')).toBe(VI_PREVIEW_OPERATION_NAME);
    expect(argValue(plan.args, '-VI')).toBe('/repo/staging/Foo.vi');
    expect(argValue(plan.args, '-OutputPath')).toBe('/out/preview.html');
    expect(argValue(plan.args, '-AdditionalOperationDirectory')).toBe(
      '/ext/resources/labview-cli-operations'
    );
    expect(argValue(plan.args, '-LogToConsole')).toBe('TRUE');
    // Defaults: create output dir + overwrite, no headless on host.
    expect(plan.args).toContain('-c');
    expect(plan.args).toContain('-o');
    expect(plan.args).not.toContain('-Headless');
    // Never emits the comparison operation's two-VI flags.
    expect(plan.args).not.toContain('-VI1');
    expect(plan.args).not.toContain('-ReportPath');
  });

  it('emits optional -LabVIEWPath, -PortNumber, and -Headless only when requested (VHS-REQ-659.1)', () => {
    const plan = buildLabviewCliPrintToSingleFileHtmlPlan({
      viPath: '/repo/Foo.vi',
      outputHtmlPath: '/out/preview.html',
      additionalOperationDirectory: '/ops',
      labviewPath: '/usr/local/natinst/LabVIEW-2026-64/labviewprofull',
      portNumber: 3363,
      headless: true
    });

    expect(argValue(plan.args, '-LabVIEWPath')).toBe(
      '/usr/local/natinst/LabVIEW-2026-64/labviewprofull'
    );
    expect(argValue(plan.args, '-PortNumber')).toBe('3363');
    expect(plan.args).toContain('-Headless');
  });

  it('omits -c and -o when explicitly disabled and sets -LogToConsole FALSE', () => {
    const plan = buildLabviewCliPrintToSingleFileHtmlPlan({
      viPath: '/repo/Foo.vi',
      outputHtmlPath: '/out/preview.html',
      additionalOperationDirectory: '/ops',
      overwrite: false,
      createOutputDirectory: false,
      logToConsole: false
    });

    expect(plan.args).not.toContain('-c');
    expect(plan.args).not.toContain('-o');
    expect(argValue(plan.args, '-LogToConsole')).toBe('FALSE');
  });

  it('rejects empty required inputs', () => {
    expect(() =>
      buildLabviewCliPrintToSingleFileHtmlPlan({
        viPath: '   ',
        outputHtmlPath: '/out/preview.html',
        additionalOperationDirectory: '/ops'
      })
    ).toThrow(/viPath/);
  });
});

describe('rewriteViPreviewArgsForLinuxContainerWorkspace', () => {
  it('rewrites -VI/-OutputPath to workspace-relative and -AdditionalOperationDirectory to the mount (VHS-REQ-659.2)', () => {
    const hostPlan = buildLabviewCliPrintToSingleFileHtmlPlan({
      viPath: '/host/staging/Foo.vi',
      outputHtmlPath: '/host/out/preview.html',
      additionalOperationDirectory: '/host/resources/labview-cli-operations',
      labviewPath: '/host/LabVIEW.exe'
    });

    const rewritten = rewriteViPreviewArgsForLinuxContainerWorkspace(hostPlan.args, {
      viFilename: 'staging/Foo.vi',
      outputFilename: 'preview.html',
      containerLabviewPath: '/usr/local/natinst/LabVIEW-2026-64/labviewprofull'
    });

    expect(argValue(rewritten, '-VI')).toBe(
      `${LINUX_CONTAINER_VI_PREVIEW_WORKSPACE_ROOT}/staging/Foo.vi`
    );
    expect(argValue(rewritten, '-OutputPath')).toBe(
      `${LINUX_CONTAINER_VI_PREVIEW_WORKSPACE_ROOT}/preview.html`
    );
    expect(argValue(rewritten, '-AdditionalOperationDirectory')).toBe(
      LINUX_CONTAINER_VI_PREVIEW_OPERATION_ROOT
    );
    // Host LabVIEW path is replaced with the in-container executable exactly once.
    expect(rewritten.filter((value) => value === '-LabVIEWPath')).toHaveLength(1);
    expect(argValue(rewritten, '-LabVIEWPath')).toBe(
      '/usr/local/natinst/LabVIEW-2026-64/labviewprofull'
    );
    // Headless is present exactly once for container runs.
    expect(rewritten.filter((value) => value === '-Headless')).toHaveLength(1);
  });

  it('omits -Headless when headless is explicitly disabled and strips leading slashes', () => {
    const rewritten = rewriteViPreviewArgsForLinuxContainerWorkspace(
      ['-OperationName', VI_PREVIEW_OPERATION_NAME, '-VI', '/host/Foo.vi', '-OutputPath', '/host/out.html'],
      {
        viFilename: '/staging/Foo.vi',
        outputFilename: '/preview.html',
        headless: false
      }
    );

    expect(argValue(rewritten, '-VI')).toBe(
      `${LINUX_CONTAINER_VI_PREVIEW_WORKSPACE_ROOT}/staging/Foo.vi`
    );
    expect(argValue(rewritten, '-OutputPath')).toBe(
      `${LINUX_CONTAINER_VI_PREVIEW_WORKSPACE_ROOT}/preview.html`
    );
    expect(rewritten).not.toContain('-Headless');
  });
});

describe('buildLinuxContainerViPreviewScript', () => {
  it('embeds the CLI args, VI Server hardening, and one-shot -350000 retry (VHS-REQ-659.5)', () => {
    const script = buildLinuxContainerViPreviewScript(
      'LabVIEWCLI',
      ['-OperationName', VI_PREVIEW_OPERATION_NAME, '-VI', '/workspace/staging/Foo.vi'],
      { containerLabviewPath: '/usr/local/natinst/LabVIEW-2026-64/labviewprofull' }
    );

    expect(script).toContain("cli_path='LabVIEWCLI'");
    expect(script).toContain('server.tcp.enabled');
    expect(script).toContain('-350000');
    expect(script).toContain('max_attempts=3');
    expect(script).toContain('exit $rc');
  });

  it('honors a custom connect timeout and falls back to the default for invalid values', () => {
    const custom = buildLinuxContainerViPreviewScript('LabVIEWCLI', ['-OperationName'], {
      connectTimeoutSeconds: 240
    });
    expect(custom).toContain('connect_timeout=240');

    const fallback = buildLinuxContainerViPreviewScript('LabVIEWCLI', ['-OperationName'], {
      connectTimeoutSeconds: 0
    });
    expect(fallback).toContain('connect_timeout=180');
  });
});

describe('buildLinuxContainerViPreviewCommandPlan', () => {
  it('assembles a docker run plan with workspace + read-only operation mounts (VHS-REQ-659.3)', () => {
    const plan = buildLinuxContainerViPreviewCommandPlan({
      hostWorkspaceDirectory: '/host/report',
      hostOperationDirectory: '/host/ext/resources/labview-cli-operations',
      containerImage: 'nationalinstruments/labview:2026q1patch2-linux',
      viFilename: 'staging/Foo.vi',
      outputFilename: 'preview.html'
    });

    expect(plan.executable).toBe('docker');
    expect(plan.args.slice(0, 2)).toEqual(['run', '--rm']);
    expect(plan.args).toContain(
      `/host/report:${LINUX_CONTAINER_VI_PREVIEW_WORKSPACE_ROOT}`
    );
    expect(plan.args).toContain(
      `/host/ext/resources/labview-cli-operations:${LINUX_CONTAINER_VI_PREVIEW_OPERATION_ROOT}:ro`
    );
    expect(plan.args).toContain('nationalinstruments/labview:2026q1patch2-linux');

    const lcIndex = plan.args.indexOf('-lc');
    expect(plan.args[lcIndex - 1]).toBe('bash');
    const script = plan.args[lcIndex + 1];
    expect(script).toContain(VI_PREVIEW_OPERATION_NAME);
    expect(script).toContain(`${LINUX_CONTAINER_VI_PREVIEW_WORKSPACE_ROOT}/staging/Foo.vi`);
    // Default VI Server port is threaded into the container command.
    expect(script).toContain(String(DEFAULT_VI_PREVIEW_VI_SERVER_PORT));
  });

  it('passes -Headless for a 2026 Q1+ Linux image (cli-headless) (VHS-REQ-659.3)', () => {
    const plan = buildLinuxContainerViPreviewCommandPlan({
      hostWorkspaceDirectory: '/host/report',
      hostOperationDirectory: '/host/ops',
      containerImage: 'nationalinstruments/labview:2026q1patch2-linux',
      viFilename: 'staging/Foo.vi',
      outputFilename: 'preview.html'
    });
    const script = plan.args[plan.args.indexOf('-lc') + 1];
    expect(script).toContain('-Headless');
    expect(script).not.toContain('EnableCICDFeaturesForLabVIEW=TRUE');
    // Derives the 2026 headless binary from the image profile.
    expect(script).toContain('labviewprofull');
  });

  it('uses the EnableCICDFeaturesForLabVIEW env toggle for an older Linux image (enable-cicd-env) (VHS-REQ-659.3)', () => {
    const plan = buildLinuxContainerViPreviewCommandPlan({
      hostWorkspaceDirectory: '/host/report',
      hostOperationDirectory: '/host/ops',
      containerImage: 'nationalinstruments/labview:2025q3-linux',
      viFilename: 'staging/Foo.vi',
      outputFilename: 'preview.html'
    });
    const script = plan.args[plan.args.indexOf('-lc') + 1];
    // Older images do NOT take -Headless; they export the CICD env toggle and
    // use the plain `labview` binary.
    expect(script).toContain('export EnableCICDFeaturesForLabVIEW=TRUE');
    expect(script).not.toContain('-Headless');
    expect(script).toContain("lv_exe='/usr/local/natinst/LabVIEW-2025-64/labview'");
  });
});

describe('buildLinuxContainerSessionStartArgs', () => {
  it('starts a detached, named, long-lived container with workspace + read-only ops mounts (VHS-REQ-659.13)', () => {
    const args = buildLinuxContainerSessionStartArgs({
      containerName: 'vihs-vi-preview-abc',
      containerImage: 'nationalinstruments/labview:2026q1patch2-linux',
      hostSessionRoot: '/host/session',
      hostOperationDirectory: '/host/ops'
    });
    expect(args.slice(0, 4)).toEqual(['run', '-d', '--name', 'vihs-vi-preview-abc']);
    expect(args).toContain(`/host/session:${LINUX_CONTAINER_VI_PREVIEW_WORKSPACE_ROOT}`);
    expect(args).toContain(`/host/ops:${LINUX_CONTAINER_VI_PREVIEW_OPERATION_ROOT}:ro`);
    expect(args).toContain('nationalinstruments/labview:2026q1patch2-linux');
    expect(String(args.at(-1))).toContain('sleep infinity');
  });
});

describe('buildLinuxContainerSessionHardenScript', () => {
  it('enables VI Server with a widened connect window (VHS-REQ-659.13)', () => {
    const script = buildLinuxContainerSessionHardenScript({
      containerLabviewPath: '/usr/local/natinst/LabVIEW-2026-64/labviewprofull',
      connectTimeoutSeconds: 200
    });
    expect(script).toContain('server.tcp.enabled');
    expect(script).toContain('connect_timeout=200');
    expect(script).toContain('harden_conf');
  });
});

describe('buildLinuxContainerExecViPreviewCommandPlan', () => {
  it('builds a docker exec plan targeting the per-render subdirectory (VHS-REQ-659.13)', () => {
    const plan = buildLinuxContainerExecViPreviewCommandPlan({
      containerName: 'vihs-vi-preview-abc',
      workspaceSubdirectory: 'render-xyz',
      viFilename: 'vi/Foo.vi',
      outputFilename: 'preview.html',
      containerLabviewPath: '/usr/local/natinst/LabVIEW-2026-64/labviewprofull'
    });
    expect(plan.executable).toBe('docker');
    expect(plan.args.slice(0, 3)).toEqual(['exec', 'vihs-vi-preview-abc', 'bash']);
    const script = String(plan.args.at(-1));
    expect(script).toContain(`${LINUX_CONTAINER_VI_PREVIEW_WORKSPACE_ROOT}/render-xyz/vi/Foo.vi`);
    expect(script).toContain(`${LINUX_CONTAINER_VI_PREVIEW_WORKSPACE_ROOT}/render-xyz/preview.html`);
    expect(script).toContain(VI_PREVIEW_OPERATION_NAME);
    expect(script).toContain('-350000');
  });
});

describe('resolveWindowsPowerShellHostExecutable', () => {
  it('resolves powershell.exe on win32, the WSL interop path on linux, undefined elsewhere', () => {
    expect(resolveWindowsPowerShellHostExecutable('win32')).toBe('powershell.exe');
    expect(resolveWindowsPowerShellHostExecutable('linux')).toContain('powershell.exe');
    expect(resolveWindowsPowerShellHostExecutable('darwin')).toBeUndefined();
  });
});

describe('rewriteViPreviewArgsForWindowsContainerWorkspace', () => {
  it('rewrites -VI/-OutputPath to Windows workspace paths and points the operation dir at the mount', () => {
    const hostPlan = buildLabviewCliPrintToSingleFileHtmlPlan({
      viPath: '/host/staging/Foo.vi',
      outputHtmlPath: '/host/out/preview.html',
      additionalOperationDirectory: '/host/resources/labview-cli-operations',
      labviewPath: '/host/LabVIEW.exe'
    });
    const rewritten = rewriteViPreviewArgsForWindowsContainerWorkspace(hostPlan.args, {
      viFilename: 'staging/Foo.vi',
      outputFilename: 'preview.html',
      containerLabviewPath: 'C:\\Program Files\\National Instruments\\LabVIEW 2026\\LabVIEW.exe'
    });

    expect(argValue(rewritten, '-VI')).toBe(`${WINDOWS_CONTAINER_VI_PREVIEW_WORKSPACE_ROOT}\\staging\\Foo.vi`);
    expect(argValue(rewritten, '-OutputPath')).toBe(`${WINDOWS_CONTAINER_VI_PREVIEW_WORKSPACE_ROOT}\\preview.html`);
    expect(argValue(rewritten, '-AdditionalOperationDirectory')).toBe(
      WINDOWS_CONTAINER_VI_PREVIEW_OPERATION_ROOT
    );
    expect(rewritten.filter((value) => value === '-LabVIEWPath')).toHaveLength(1);
    expect(argValue(rewritten, '-LabVIEWPath')).toBe(
      'C:\\Program Files\\National Instruments\\LabVIEW 2026\\LabVIEW.exe'
    );
    expect(rewritten.filter((value) => value === '-Headless')).toHaveLength(1);
  });
});

describe('buildWindowsContainerViPreviewScript', () => {
  it('hardens the LabVIEWCLI.ini connect timeouts and retries on -350000 (VHS-REQ-659.4)', () => {
    const script = buildWindowsContainerViPreviewScript(
      'LabVIEWCLI',
      ['-OperationName', VI_PREVIEW_OPERATION_NAME, '-VI', 'C:\\vi-history-suite\\staging\\Foo.vi'],
      { containerLabviewPath: 'C:\\LV\\LabVIEW.exe', connectTimeoutSeconds: 200 }
    );
    expect(script).toContain('OpenAppReferenceTimeoutInSecond');
    expect(script).toContain('AfterLaunchOpenAppReferenceTimeoutInSecond');
    expect(script).toContain("-Value '200'");
    expect(script).toContain('-350000');
    expect(script).toContain('Set-IniToken');
    expect(script).toContain('exit $lastExit');
    // Creates the scratch/temp root before use (Windows does not auto-create TEMP).
    expect(script).toContain('New-Item -ItemType Directory -Force');
    expect(script).toContain(`-Path '${WINDOWS_CONTAINER_VI_PREVIEW_TEMP_ROOT}'`);
  });

  it('falls back to the default connect timeout for invalid values', () => {
    const script = buildWindowsContainerViPreviewScript('LabVIEWCLI', ['-OperationName'], {
      connectTimeoutSeconds: 0
    });
    expect(script).toContain("-Value '180'");
  });
});

describe('buildWindowsContainerViPreviewCommandPlan', () => {
  it('assembles a host-PowerShell EncodedCommand plan that runs docker run with both mounts (VHS-REQ-659.4)', () => {
    const plan = buildWindowsContainerViPreviewCommandPlan({
      hostWorkspaceDirectory: 'C:\\host\\report',
      hostOperationDirectory: 'C:\\host\\ops',
      containerImage: 'ni/labview:2026-windows',
      viFilename: 'staging/Foo.vi',
      outputFilename: 'preview.html',
      containerLabviewPath: 'C:\\LV\\LabVIEW.exe',
      hostPowerShellExecutable: 'powershell.exe'
    });

    expect(plan.executable).toBe('powershell.exe');
    expect(plan.args.slice(0, 2)).toEqual(['-NoProfile', '-EncodedCommand']);

    const outer = Buffer.from(plan.args[2], 'base64').toString('utf16le');
    expect(outer).toContain('docker run --rm');
    expect(outer).toContain(`C:\\host\\report:${WINDOWS_CONTAINER_VI_PREVIEW_WORKSPACE_ROOT}`);
    expect(outer).toContain(`C:\\host\\ops:${WINDOWS_CONTAINER_VI_PREVIEW_OPERATION_ROOT}`);
    expect(outer).toContain('ni/labview:2026-windows');
    expect(outer).toContain('powershell -NoProfile -EncodedCommand');

    const innerMatch = outer.match(/-EncodedCommand ([A-Za-z0-9+/=]+)/);
    expect(innerMatch).toBeTruthy();
    const inner = Buffer.from(innerMatch![1], 'base64').toString('utf16le');
    expect(inner).toContain(VI_PREVIEW_OPERATION_NAME);
    expect(inner).toContain(`${WINDOWS_CONTAINER_VI_PREVIEW_WORKSPACE_ROOT}\\staging\\Foo.vi`);
  });

  it('throws when the host PowerShell executable is missing', () => {
    expect(() =>
      buildWindowsContainerViPreviewCommandPlan({
        hostWorkspaceDirectory: 'C:\\host\\report',
        hostOperationDirectory: 'C:\\host\\ops',
        containerImage: 'ni/labview:2026-windows',
        viFilename: 'staging/Foo.vi',
        outputFilename: 'preview.html',
        hostPowerShellExecutable: '   '
      })
    ).toThrow(/hostPowerShellExecutable/);
  });
});

describe('buildWindowsContainerSessionStartArgs', () => {
  it('starts a detached, named, long-lived container with workspace + ops mounts', () => {
    const args = buildWindowsContainerSessionStartArgs({
      containerName: 'vihs-vi-preview-abc',
      containerImage: 'ni/labview:2026-windows',
      hostSessionRoot: 'C:\\host\\session',
      hostOperationDirectory: 'C:\\host\\ops'
    });
    expect(args.slice(0, 4)).toEqual(['run', '-d', '--name', 'vihs-vi-preview-abc']);
    expect(args).toContain(`C:\\host\\session:${WINDOWS_CONTAINER_VI_PREVIEW_WORKSPACE_ROOT}`);
    expect(args).toContain(`C:\\host\\ops:${WINDOWS_CONTAINER_VI_PREVIEW_OPERATION_ROOT}`);
    expect(args).toContain('ni/labview:2026-windows');
    expect(args.slice(-4, -1)).toEqual(['powershell', '-NoProfile', '-EncodedCommand']);
    const keepAlive = Buffer.from(String(args.at(-1)), 'base64').toString('utf16le');
    expect(keepAlive).toContain('Start-Sleep');
  });
});

describe('buildWindowsContainerSessionHardenScript', () => {
  it('creates the temp root and hardens the CLI ini connect timeouts (no prelaunch)', () => {
    const script = buildWindowsContainerSessionHardenScript({ connectTimeoutSeconds: 200 });
    expect(script).toContain('New-Item -ItemType Directory -Force');
    expect(script).toContain(`-Path '${WINDOWS_CONTAINER_VI_PREVIEW_TEMP_ROOT}'`);
    expect(script).toContain('Set-IniToken');
    expect(script).toContain("-Value '200'");
    // Harden runs once at session start; LabVIEW is launched by the first render,
    // not pre-launched here.
    expect(script).not.toContain('Start-Process');
  });

  it('falls back to the default connect timeout for invalid values', () => {
    const script = buildWindowsContainerSessionHardenScript({ connectTimeoutSeconds: 0 });
    expect(script).toContain("-Value '180'");
  });
});

describe('buildWindowsContainerSessionHardenCommandPlan', () => {
  it('wraps the harden script in a docker exec EncodedCommand plan', () => {
    const plan = buildWindowsContainerSessionHardenCommandPlan({
      containerName: 'vihs-vi-preview-abc',
      connectTimeoutSeconds: 180
    });
    expect(plan.executable).toBe('docker');
    expect(plan.args.slice(0, 5)).toEqual([
      'exec',
      'vihs-vi-preview-abc',
      'powershell',
      '-NoProfile',
      '-EncodedCommand'
    ]);
    const script = Buffer.from(String(plan.args.at(-1)), 'base64').toString('utf16le');
    expect(script).toContain('Set-IniToken');
  });
});

describe('buildWindowsContainerExecViPreviewCommandPlan', () => {
  it('builds a docker exec render plan targeting the per-render subdirectory', () => {
    const plan = buildWindowsContainerExecViPreviewCommandPlan({
      containerName: 'vihs-vi-preview-abc',
      workspaceSubdirectory: 'render-xyz',
      viFilename: 'vi/Foo.vi',
      outputFilename: 'preview.html',
      containerLabviewPath: 'C:\\LV\\LabVIEW.exe'
    });
    expect(plan.executable).toBe('docker');
    expect(plan.args.slice(0, 5)).toEqual([
      'exec',
      'vihs-vi-preview-abc',
      'powershell',
      '-NoProfile',
      '-EncodedCommand'
    ]);
    const script = Buffer.from(String(plan.args.at(-1)), 'base64').toString('utf16le');
    expect(script).toContain(`${WINDOWS_CONTAINER_VI_PREVIEW_WORKSPACE_ROOT}\\render-xyz\\vi\\Foo.vi`);
    expect(script).toContain(`${WINDOWS_CONTAINER_VI_PREVIEW_WORKSPACE_ROOT}\\render-xyz\\preview.html`);
    expect(script).toContain(VI_PREVIEW_OPERATION_NAME);
    expect(script).toContain('-350000');
    expect(script).toContain('retryAttempts');
    // Each render recreates the scratch temp root (harden is fail-soft).
    expect(script).toContain('New-Item -ItemType Directory -Force');
    expect(script).toContain(`-Path '${WINDOWS_CONTAINER_VI_PREVIEW_TEMP_ROOT}'`);
  });
});

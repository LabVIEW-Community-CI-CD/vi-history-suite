import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import {
  assertLinuxVsCodeRuntimeReady,
  assertWindowsVsCodeRuntimeReady,
  collectMissingLinuxSharedLibraries,
  inspectIntegrationHostStrategy,
  normalizeIntegrationHostOverride,
  resolveStandardWindowsCodeCliPath,
  VI_HISTORY_SUITE_LINUX_BOOTSTRAP_COMMAND
} from '../../src/tooling/integrationHostRuntime';

function elfStub(): Buffer {
  return Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0x02, 0x01, 0x01, 0x00]);
}

describe('integrationHostRuntime', () => {
  it('normalizes explicit integration-host overrides and rejects unsupported values', () => {
    expect(normalizeIntegrationHostOverride(undefined)).toBe('auto');
    expect(normalizeIntegrationHostOverride('auto')).toBe('auto');
    expect(normalizeIntegrationHostOverride('windows')).toBe('windows');
    expect(normalizeIntegrationHostOverride('linux')).toBe('linux');
    expect(() => normalizeIntegrationHostOverride('wsl')).toThrow(
      /Unsupported VI_HISTORY_SUITE_INTEGRATION_HOST value/
    );
  });

  it('selects the integration host deterministically from overrides and Windows host state', () => {
    expect(
      inspectIntegrationHostStrategy('/mnt/c/Program Files/Microsoft VS Code/Code.exe', 'linux')
    ).toEqual({
      mode: 'linux',
      reason: 'env-override-linux'
    });
    expect(
      inspectIntegrationHostStrategy('/mnt/c/Program Files/Microsoft VS Code/Code.exe', 'windows')
    ).toEqual({
      mode: 'windows',
      reason: 'env-override-windows'
    });
    expect(
      inspectIntegrationHostStrategy('/missing/Code.exe', undefined, {
        existsSync: () => false
      })
    ).toEqual({
      mode: 'linux'
    });
    expect(
      inspectIntegrationHostStrategy('/mnt/c/Program Files/Microsoft VS Code/Code.exe', undefined, {
        existsSync: () => true,
        windowsCodeAlreadyRunning: () => true
      })
    ).toEqual({
      mode: 'linux',
      reason: 'windows-vscode-instance-already-running'
    });
    expect(
      inspectIntegrationHostStrategy('/mnt/c/Program Files/Microsoft VS Code/Code.exe', undefined, {
        existsSync: () => true,
        windowsCodeAlreadyRunning: () => false
      })
    ).toEqual({
      mode: 'windows'
    });
  });

  it('fails fast with actionable remediation when the native Windows VS Code host is missing (VHS-REQ-598.7)', () => {
    // Reproduces run 27477253718: native-Windows host selected but VS Code is
    // not installed. The guard must throw a clear, doctor-pointing message
    // instead of letting the launcher die with CommandNotFoundException.
    expect(() =>
      assertWindowsVsCodeRuntimeReady('C:\\Program Files\\Microsoft VS Code\\bin\\code.cmd', {
        existsSync: () => false
      })
    ).toThrow(/system-wide VS Code install/);
    expect(() =>
      assertWindowsVsCodeRuntimeReady('C:\\Program Files\\Microsoft VS Code\\bin\\code.cmd', {
        existsSync: () => false
      })
    ).toThrow(/checkMaintainerRunnerPrerequisites\.js/);
  });

  it('passes the Windows VS Code readiness guard when the CLI exists', () => {
    expect(() =>
      assertWindowsVsCodeRuntimeReady('C:\\Program Files\\Microsoft VS Code\\bin\\code.cmd', {
        existsSync: (candidate) => candidate === 'C:\\Program Files\\Microsoft VS Code\\bin\\code.cmd'
      })
    ).not.toThrow();
  });

  it('resolves only the standard stable Windows VS Code CLI install locations', () => {
    expect(
      resolveStandardWindowsCodeCliPath('win32', 'C:\\Users\\sveld\\AppData\\Local', {
        existsSync: (candidate) => candidate === 'C:\\Program Files\\Microsoft VS Code\\bin\\code.cmd'
      })
    ).toBe('C:\\Program Files\\Microsoft VS Code\\bin\\code.cmd');

    expect(
      resolveStandardWindowsCodeCliPath('win32', 'C:\\Users\\sveld\\AppData\\Local', {
        existsSync: (candidate) =>
          candidate ===
          'C:\\Users\\sveld\\AppData\\Local\\Programs\\Microsoft VS Code\\bin\\code.cmd'
      })
    ).toBe('C:\\Users\\sveld\\AppData\\Local\\Programs\\Microsoft VS Code\\bin\\code.cmd');

    expect(
      resolveStandardWindowsCodeCliPath('linux', 'C:\\Users\\sveld\\AppData\\Local', {
        existsSync: (candidate) =>
          candidate === '/mnt/c/Users/sveld/AppData/Local/Programs/Microsoft VS Code/bin/code'
      })
    ).toBe('/mnt/c/Users/sveld/AppData/Local/Programs/Microsoft VS Code/bin/code');
  });

  it('deduplicates missing Linux runtime libraries across the VS Code runtime tree', async () => {
    const runtimeRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'vihs-linux-runtime-'));
    const runtimeCodePath = path.join(runtimeRoot, 'code');
    const nativeKeymapPath = path.join(
      runtimeRoot,
      'resources',
      'app',
      'node_modules',
      'native-keymap',
      'build',
      'Release',
      'keymapping.node'
    );
    const authRuntimePath = path.join(
      runtimeRoot,
      'resources',
      'app',
      'extensions',
      'microsoft-authentication',
      'dist',
      'msal-node-runtime.node'
    );

    await fs.mkdir(path.dirname(nativeKeymapPath), { recursive: true });
    await fs.mkdir(path.dirname(authRuntimePath), { recursive: true });
    await fs.writeFile(runtimeCodePath, elfStub());
    await fs.writeFile(nativeKeymapPath, elfStub());
    await fs.writeFile(authRuntimePath, elfStub());

    const shellCompletionPath = path.join(runtimeRoot, 'resources', 'completions', 'bash', 'code');
    await fs.mkdir(path.dirname(shellCompletionPath), { recursive: true });
    await fs.writeFile(shellCompletionPath, '');

    const execFileSync = vi.fn((command: string, args: readonly string[]) => {
      expect(command).toBe('ldd');
      const target = String(args[0]);
      if (target.includes(path.join('resources', 'completions', 'bash', 'code'))) {
        const error = new Error('Command failed: ldd shell-completion/code\n\tnot a dynamic executable\n') as Error & {
          stderr?: string;
        };
        error.stderr = '\tnot a dynamic executable\n';
        throw error;
      }
      if (target === runtimeCodePath) {
        return 'linux-vdso.so.1 =>  (0x0000)\n';
      }
      if (target.endsWith('keymapping.node')) {
        return 'libxkbfile.so.1 => not found\nlibnss3.so => not found\n';
      }
      return 'libsecret-1.so.0 => not found\nlibnss3.so => not found\n';
    });

    expect(
      collectMissingLinuxSharedLibraries(runtimeRoot, {
        execFileSync: execFileSync as never
      })
    ).toEqual(['libnss3.so', 'libsecret-1.so.0', 'libxkbfile.so.1']);
  });

  it('fails closed with actionable bootstrap guidance when Linux runtime libraries are missing', async () => {
    const runtimeRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'vihs-linux-runtime-'));
    const runtimeCodePath = path.join(runtimeRoot, 'code');
    await fs.writeFile(runtimeCodePath, elfStub());

    expect(() =>
      assertLinuxVsCodeRuntimeReady(runtimeCodePath, {
        execFileSync: vi.fn().mockReturnValue('libnspr4.so => not found\n') as never
      })
    ).toThrow(
      new RegExp(VI_HISTORY_SUITE_LINUX_BOOTSTRAP_COMMAND.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    );
  });

  it('accepts a Linux runtime when no shared libraries are missing', async () => {
    const runtimeRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'vihs-linux-runtime-ready-'));
    const runtimeCodePath = path.join(runtimeRoot, 'code');
    await fs.writeFile(runtimeCodePath, elfStub());

    expect(() =>
      assertLinuxVsCodeRuntimeReady(runtimeCodePath, {
        execFileSync: vi.fn().mockReturnValue('linux-vdso.so.1 =>  (0x0000)\n') as never
      })
    ).not.toThrow();
  });

  it('checks shared-object runtime artifacts and ignores unreadable ELF probes', async () => {
    const runtimeRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'vihs-linux-runtime-shared-'));
    const sharedObjectPath = path.join(runtimeRoot, 'libexample.so.1');
    await fs.writeFile(sharedObjectPath, elfStub());

    const missingProbePath = path.join(runtimeRoot, 'missing-libexample.so.1');
    const readdirSync = vi.fn((current: string) => {
      if (current !== runtimeRoot) {
        return [];
      }

      return [
        {
          name: path.basename(sharedObjectPath),
          isDirectory: () => false
        },
        {
          name: path.basename(missingProbePath),
          isDirectory: () => false
        }
      ];
    });

    const statSync = vi.fn((target: string) => ({
      isFile: () => target === sharedObjectPath || target === missingProbePath
    }));

    const execFileSync = vi.fn((command: string, args: readonly string[]) => {
      expect(command).toBe('ldd');
      expect(String(args[0])).toBe(sharedObjectPath);
      return 'libwebkit2gtk-4.1.so.0 => not found\n';
    });

    expect(
      collectMissingLinuxSharedLibraries(runtimeRoot, {
        readdirSync: readdirSync as never,
        statSync: statSync as never,
        execFileSync: execFileSync as never
      })
    ).toEqual(['libwebkit2gtk-4.1.so.0']);
    expect(execFileSync).toHaveBeenCalledTimes(1);
  });

  it('skips runtime tree entries whose stat probe does not resolve to a regular file', async () => {
    const runtimeRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'vihs-linux-runtime-nonfile-'));
    const pseudoTargetPath = path.join(runtimeRoot, 'code');
    await fs.writeFile(pseudoTargetPath, elfStub());

    const readdirSync = vi.fn((current: string) => {
      if (current !== runtimeRoot) {
        return [];
      }

      return [
        {
          name: 'code',
          isDirectory: () => false
        }
      ];
    });
    const statSync = vi.fn(() => ({
      isFile: () => false
    }));
    const execFileSync = vi.fn();

    expect(
      collectMissingLinuxSharedLibraries(runtimeRoot, {
        readdirSync: readdirSync as never,
        statSync: statSync as never,
        execFileSync: execFileSync as never
      })
    ).toEqual([]);
    expect(execFileSync).not.toHaveBeenCalled();
  });

  it('ignores ELF targets whose ldd probe reports that they are not dynamic executables', async () => {
    const runtimeRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'vihs-linux-runtime-static-'));
    const runtimeCodePath = path.join(runtimeRoot, 'code');
    await fs.writeFile(runtimeCodePath, elfStub());

    const execFileSync = vi.fn(() => {
      const error = new Error('ldd reported not a dynamic executable') as Error & {
        stderr?: string;
      };
      error.stderr = 'not a dynamic executable';
      throw error;
    });

    expect(
      collectMissingLinuxSharedLibraries(runtimeRoot, {
        execFileSync: execFileSync as never
      })
    ).toEqual([]);
    expect(execFileSync).toHaveBeenCalledTimes(1);
  });

  it('rethrows unexpected ldd probe failures while collecting missing Linux shared libraries', async () => {
    const runtimeRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'vihs-linux-runtime-ldd-error-'));
    const runtimeCodePath = path.join(runtimeRoot, 'code');
    await fs.writeFile(runtimeCodePath, elfStub());

    const execFileSync = vi.fn(() => {
      const error = new Error('ldd failed with permission denied') as Error & {
        stderr?: string;
      };
      error.stderr = 'permission denied';
      throw error;
    });

    expect(() =>
      collectMissingLinuxSharedLibraries(runtimeRoot, {
        execFileSync: execFileSync as never
      })
    ).toThrow('ldd failed with permission denied');
    expect(execFileSync).toHaveBeenCalledTimes(1);
  });
});

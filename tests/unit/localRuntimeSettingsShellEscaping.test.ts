import { describe, expect, it } from 'vitest';

import {
  buildPathPrependValue,
  escapeSingleQuotedShellString,
  escapeWindowsBatchEcho,
  quoteLauncherPathForShell,
  resolveCurrentPlatformLauncherPath
} from '../../src/tooling/localRuntimeSettingsShellEscaping';

describe('resolveCurrentPlatformLauncherPath', () => {
  it('selects the windows launcher on win32 and the posix launcher elsewhere', () => {
    expect(resolveCurrentPlatformLauncherPath('win.cmd', 'posix.sh', 'win32')).toBe('win.cmd');
    expect(resolveCurrentPlatformLauncherPath('win.cmd', 'posix.sh', 'linux')).toBe('posix.sh');
    expect(resolveCurrentPlatformLauncherPath('win.cmd', 'posix.sh', 'darwin')).toBe('posix.sh');
  });
});

describe('buildPathPrependValue', () => {
  it('appends the platform PATH separator', () => {
    expect(buildPathPrependValue('C:/tools', 'win32')).toBe('C:/tools;');
    expect(buildPathPrependValue('/opt/tools', 'linux')).toBe('/opt/tools:');
  });
});

describe('quoteLauncherPathForShell', () => {
  it('double-quotes and escapes embedded quotes on win32', () => {
    expect(quoteLauncherPathForShell('C:/a b/vihs.cmd', 'win32')).toBe('"C:/a b/vihs.cmd"');
    expect(quoteLauncherPathForShell('C:/a"b/vihs.cmd', 'win32')).toBe('"C:/a""b/vihs.cmd"');
  });

  it('single-quotes and escapes embedded single quotes on posix', () => {
    expect(quoteLauncherPathForShell('/opt/a b/vihs', 'linux')).toBe("'/opt/a b/vihs'");
    expect(quoteLauncherPathForShell("/opt/a'b/vihs", 'linux')).toBe(`'/opt/a'"'"'b/vihs'`);
  });
});

describe('escapeWindowsBatchEcho', () => {
  it('doubles double-quotes', () => {
    expect(escapeWindowsBatchEcho('say "hi"')).toBe('say ""hi""');
    expect(escapeWindowsBatchEcho('plain')).toBe('plain');
  });
});

describe('escapeSingleQuotedShellString', () => {
  it('escapes single quotes for a POSIX single-quoted string', () => {
    expect(escapeSingleQuotedShellString("it's")).toBe(`it'"'"'s`);
    expect(escapeSingleQuotedShellString('plain')).toBe('plain');
  });
});

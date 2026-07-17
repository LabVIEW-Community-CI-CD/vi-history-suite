import { describe, expect, it } from 'vitest';

import {
  resolveWindowsPowerShellHostExecutable,
  encodeWindowsPowerShellScript,
  quotePowerShellLiteral,
  quoteBashLiteral
} from '../../src/reporting/runtime/shellScriptEncoding';

describe('resolveWindowsPowerShellHostExecutable', () => {
  it('returns powershell.exe on win32', () => {
    expect(resolveWindowsPowerShellHostExecutable('win32')).toBe('powershell.exe');
  });

  it('returns the /mnt WSL path on linux', () => {
    expect(resolveWindowsPowerShellHostExecutable('linux')).toBe(
      '/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe'
    );
  });

  it('returns undefined on other platforms', () => {
    expect(resolveWindowsPowerShellHostExecutable('darwin')).toBeUndefined();
  });
});

describe('encodeWindowsPowerShellScript', () => {
  it('encodes a script as base64 of its UTF-16LE bytes', () => {
    const script = 'Write-Host "hi"';
    expect(encodeWindowsPowerShellScript(script)).toBe(
      Buffer.from(script, 'utf16le').toString('base64')
    );
  });
});

describe('quotePowerShellLiteral', () => {
  it('wraps in single quotes and doubles embedded single quotes', () => {
    expect(quotePowerShellLiteral("it's")).toBe("'it''s'");
    expect(quotePowerShellLiteral('plain')).toBe("'plain'");
  });
});

describe('quoteBashLiteral', () => {
  it('wraps in single quotes and escapes embedded single quotes', () => {
    expect(quoteBashLiteral("it's")).toBe(`'it'"'"'s'`);
    expect(quoteBashLiteral('plain')).toBe("'plain'");
  });
});

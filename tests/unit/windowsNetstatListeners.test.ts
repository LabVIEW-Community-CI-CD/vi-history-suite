import { describe, expect, it } from 'vitest';

import {
  resolveWindowsSystem32Executable,
  parseWindowsNetstatListeners
} from '../../src/reporting/runtime/windowsNetstatListeners';

describe('resolveWindowsSystem32Executable', () => {
  it('returns the interop /mnt path off Windows', () => {
    expect(resolveWindowsSystem32Executable('linux', 'netstat.exe')).toBe(
      '/mnt/c/Windows/System32/netstat.exe'
    );
  });

  it('returns a native System32 path on win32', () => {
    const resolved = resolveWindowsSystem32Executable('win32', 'tasklist.exe');
    expect(resolved.toLowerCase()).toContain('system32');
    expect(resolved.toLowerCase()).toContain('tasklist.exe');
  });
});

describe('parseWindowsNetstatListeners', () => {
  it('parses well-formed LISTENING rows', () => {
    const stdout = [
      '  TCP    127.0.0.1:3363   0.0.0.0:0   LISTENING   4321',
      '  TCP    0.0.0.0:80       0.0.0.0:0   LISTENING   10'
    ].join('\n');
    expect(parseWindowsNetstatListeners(stdout)).toEqual([
      { localAddress: '127.0.0.1', localPort: 3363, pid: 4321 },
      { localAddress: '0.0.0.0', localPort: 80, pid: 10 }
    ]);
  });

  it('ignores non-LISTENING and malformed rows', () => {
    const stdout = [
      '  TCP    127.0.0.1:3363   1.2.3.4:5   ESTABLISHED   99',
      'garbage line',
      '  TCP    127.0.0.1:3363   0.0.0.0:0   LISTENING   7'
    ].join('\n');
    expect(parseWindowsNetstatListeners(stdout)).toEqual([
      { localAddress: '127.0.0.1', localPort: 3363, pid: 7 }
    ]);
  });

  it('returns an empty array for empty stdout', () => {
    expect(parseWindowsNetstatListeners('')).toEqual([]);
  });
});

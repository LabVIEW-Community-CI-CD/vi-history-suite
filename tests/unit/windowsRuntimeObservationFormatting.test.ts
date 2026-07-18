import { describe, expect, it } from 'vitest';

import {
  describeObservedRuntimeProcesses,
  describeObservedWindowsTcpListeners
} from '../../src/reporting/runtime/windowsRuntimeObservationFormatting';

describe('describeObservedRuntimeProcesses', () => {
  it('renders each process as `image (pid N)` joined with " | "', () => {
    expect(
      describeObservedRuntimeProcesses([
        { imageName: 'LabVIEW.exe', pid: 10 },
        { imageName: 'LVCompare.exe', pid: 20 }
      ])
    ).toBe('LabVIEW.exe (pid 10) | LVCompare.exe (pid 20)');
  });

  it('de-duplicates identical image/pid pairs', () => {
    expect(
      describeObservedRuntimeProcesses([
        { imageName: 'LabVIEW.exe', pid: 10 },
        { imageName: 'LabVIEW.exe', pid: 10 }
      ])
    ).toBe('LabVIEW.exe (pid 10)');
  });

  it('returns an empty string for no processes', () => {
    expect(describeObservedRuntimeProcesses([])).toBe('');
  });
});

describe('describeObservedWindowsTcpListeners', () => {
  it('renders each listener with its process name', () => {
    expect(
      describeObservedWindowsTcpListeners([
        { localAddress: '127.0.0.1', localPort: 3363, pid: 5, processName: 'LabVIEW.exe' }
      ])
    ).toBe('LabVIEW.exe listening on 127.0.0.1:3363');
  });

  it('falls back to `pid N` when the process name is missing', () => {
    expect(
      describeObservedWindowsTcpListeners([
        { localAddress: '0.0.0.0', localPort: 80, pid: 42 }
      ])
    ).toBe('pid 42 listening on 0.0.0.0:80');
  });

  it('joins multiple listeners with " | "', () => {
    expect(
      describeObservedWindowsTcpListeners([
        { localAddress: '127.0.0.1', localPort: 1, pid: 1, processName: 'a' },
        { localAddress: '127.0.0.1', localPort: 2, pid: 2, processName: 'b' }
      ])
    ).toBe('a listening on 127.0.0.1:1 | b listening on 127.0.0.1:2');
  });
});

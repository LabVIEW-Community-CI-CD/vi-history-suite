import { describe, expect, it } from 'vitest';

import {
  rewriteLabviewCliArgsForContainerWorkspace,
  rewriteLvcompareArgsForContainerWorkspace,
  rewriteLvcompareArgsForLinuxContainerWorkspace
} from '../../src/reporting/runtime/containerWorkspaceArgRewrite';

const WORKSPACE = 'C:\\ws';
const LINUX_WORKSPACE = '/ws';

describe('rewriteLabviewCliArgsForContainerWorkspace', () => {
  it('remaps VI/report paths to the Windows staging root and forces headless', () => {
    const out = rewriteLabviewCliArgsForContainerWorkspace(
      ['-VI1', 'a.vi', '-VI2', 'b.vi', '-ReportPath', 'r.html'],
      {
        containerWorkspaceRoot: WORKSPACE,
        leftFilename: 'left.vi',
        rightFilename: 'right.vi',
        reportFilename: 'report.html'
      }
    );
    expect(out).toEqual([
      '-VI1', 'C:\\ws\\staging\\left.vi',
      '-VI2', 'C:\\ws\\staging\\right.vi',
      '-ReportPath', 'C:\\ws\\report.html',
      '-Headless'
    ]);
  });

  it('drops an existing -LabVIEWPath and appends the provided one', () => {
    const out = rewriteLabviewCliArgsForContainerWorkspace(
      ['-LabVIEWPath', 'X', '-VI1', 'a.vi'],
      {
        containerWorkspaceRoot: WORKSPACE,
        leftFilename: 'left.vi',
        rightFilename: 'right.vi',
        reportFilename: 'report.html',
        labviewPath: '  C:\\LabVIEW\\labview.exe  '
      }
    );
    expect(out).toContain('-LabVIEWPath');
    expect(out).toContain('C:\\LabVIEW\\labview.exe');
    expect(out).not.toContain('X');
  });
});

describe('rewriteLvcompareArgsForContainerWorkspace', () => {
  it('returns undefined for fewer than two operands', () => {
    expect(
      rewriteLvcompareArgsForContainerWorkspace(['only'], {
        containerWorkspaceRoot: WORKSPACE,
        leftFilename: 'l.vi',
        rightFilename: 'r.vi'
      })
    ).toBeUndefined();
  });

  it('remaps operands and substitutes the labview path override', () => {
    const out = rewriteLvcompareArgsForContainerWorkspace(
      ['old-left.vi', 'old-right.vi', '-lvpath', 'ignored', '-nobdcosm'],
      {
        containerWorkspaceRoot: WORKSPACE,
        leftFilename: 'l.vi',
        rightFilename: 'r.vi',
        labviewPath: 'C:\\LV\\labview.exe'
      }
    );
    expect(out).toEqual([
      'C:\\ws\\staging\\l.vi',
      'C:\\ws\\staging\\r.vi',
      '-lvpath', 'C:\\LV\\labview.exe',
      '-nobdcosm'
    ]);
  });
});

describe('rewriteLvcompareArgsForLinuxContainerWorkspace', () => {
  it('remaps operands with forward slashes and the LabVIEW 2026 lvpath fallback', () => {
    const out = rewriteLvcompareArgsForLinuxContainerWorkspace(
      ['old-left.vi', 'old-right.vi', '-lvpath', 'ignored'],
      {
        containerWorkspaceRoot: LINUX_WORKSPACE,
        leftFilename: 'l.vi',
        rightFilename: 'r.vi'
      }
    );
    expect(out).toEqual([
      '/ws/staging/l.vi',
      '/ws/staging/r.vi',
      '-lvpath', '/usr/local/natinst/LabVIEW-2026-64/labview'
    ]);
  });

  it('uses the provided container labview path when set', () => {
    const out = rewriteLvcompareArgsForLinuxContainerWorkspace(
      ['a.vi', 'b.vi', '-lvpath', 'ignored'],
      {
        containerWorkspaceRoot: LINUX_WORKSPACE,
        leftFilename: 'l.vi',
        rightFilename: 'r.vi',
        containerLabviewPath: '/opt/lv/labview'
      }
    );
    expect(out).toContain('/opt/lv/labview');
  });

  it('returns undefined for fewer than two operands', () => {
    expect(
      rewriteLvcompareArgsForLinuxContainerWorkspace([], {
        containerWorkspaceRoot: LINUX_WORKSPACE,
        leftFilename: 'l.vi',
        rightFilename: 'r.vi'
      })
    ).toBeUndefined();
  });
});

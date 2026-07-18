import { describe, expect, it } from 'vitest';

import {
  buildHistoryLoadFailureMessage,
  buildIneligibilityMessage,
  formatUntrustedWorkspaceWarning,
  isGitRepositoryResolutionFailure,
  isInstalledProgramFilesLvIconPath
} from '../../src/commands/openViHistoryCommandMessages';
import type { ViHistoryViewModel } from '../../src/services/viHistoryModel';

function model(overrides: Partial<ViHistoryViewModel> = {}): ViHistoryViewModel {
  return {
    signature: 'vi',
    commits: [{ hash: 'a' }, { hash: 'b' }],
    ...overrides
  } as ViHistoryViewModel;
}

describe('formatUntrustedWorkspaceWarning', () => {
  it('composes the prefix with the trust rationale and allowed-paths suffix', () => {
    const message = formatUntrustedWorkspaceWarning('VI History is disabled');
    expect(message).toContain('VI History is disabled in untrusted workspaces');
    expect(message).toContain('to prevent external process execution');
    expect(message).toContain('Documentation and local runtime settings CLI preparation remain available.');
  });
});

describe('isInstalledProgramFilesLvIconPath', () => {
  it('detects the Program Files National Instruments lv_icon.vi (forward or back slashes)', () => {
    expect(
      isInstalledProgramFilesLvIconPath('C:/Program Files/National Instruments/LabVIEW 2026/lv_icon.vi')
    ).toBe(true);
    expect(
      isInstalledProgramFilesLvIconPath('C:\\Program Files\\National Instruments\\LabVIEW 2026\\lv_icon.vi')
    ).toBe(true);
  });

  it('rejects a repo-backed lv_icon.vi or other files', () => {
    expect(isInstalledProgramFilesLvIconPath('/repo/resource/plugins/lv_icon.vi')).toBe(false);
    expect(
      isInstalledProgramFilesLvIconPath('C:/Program Files/National Instruments/LabVIEW 2026/other.vi')
    ).toBe(false);
  });
});

describe('isGitRepositoryResolutionFailure', () => {
  it('is true only for git-resolution error messages', () => {
    expect(isGitRepositoryResolutionFailure(new Error('fatal: not a git repository'))).toBe(true);
    expect(isGitRepositoryResolutionFailure(new Error('git rev-parse failed'))).toBe(true);
    expect(isGitRepositoryResolutionFailure(new Error('--show-toplevel error'))).toBe(true);
    expect(isGitRepositoryResolutionFailure(new Error('some other error'))).toBe(false);
    expect(isGitRepositoryResolutionFailure('not an error')).toBe(false);
  });
});

describe('buildHistoryLoadFailureMessage', () => {
  it('prefers the Program Files lv_icon.vi guidance', () => {
    expect(
      buildHistoryLoadFailureMessage(
        'C:/Program Files/National Instruments/LabVIEW 2026/lv_icon.vi',
        undefined
      )
    ).toContain('installed copy of lv_icon.vi is not the review surface');
  });

  it('falls back to git-repository guidance, then the generic message', () => {
    expect(buildHistoryLoadFailureMessage('/repo/Foo.vi', new Error('not a git repository'))).toContain(
      'not inside a tracked Git repository'
    );
    expect(buildHistoryLoadFailureMessage('/repo/Foo.vi', new Error('boom'))).toBe(
      'VI History could not load the selected file.'
    );
  });
});

describe('buildIneligibilityMessage', () => {
  it('covers unknown-signature and commit-count combinations', () => {
    expect(buildIneligibilityMessage(model({ signature: 'unknown', commits: [] }))).toContain(
      'not a recognized LabVIEW VI format and has no Git commit history'
    );
    expect(buildIneligibilityMessage(model({ signature: 'unknown' }))).toContain(
      'not a recognized LabVIEW VI format'
    );
    expect(buildIneligibilityMessage(model({ commits: [] }))).toContain('no Git commit history');
    expect(buildIneligibilityMessage(model({ commits: [{ hash: 'a' }] as never }))).toContain(
      'only one Git commit'
    );
    expect(buildIneligibilityMessage(model())).toContain('not currently eligible for VI History');
  });
});

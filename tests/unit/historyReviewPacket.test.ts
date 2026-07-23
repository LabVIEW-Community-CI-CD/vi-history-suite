import { describe, expect, it } from 'vitest';

import { ViHistoryCommit, ViHistoryViewModel } from '../../src/services/viHistoryModel';
import { renderHistoryReviewPacketText } from '../../src/ui/historyPanel';

function createTestCommit(overrides: Partial<ViHistoryCommit> = {}): ViHistoryCommit {
  return {
    hash: 'abc1234567890def1234567890abcdef12345678',
    authorName: 'Test Author',
    authorDate: '2025-01-15',
    subject: 'Test commit subject',
    body: 'Test commit body',
    ...overrides
  };
}

function createTestViewModel(overrides: Partial<ViHistoryViewModel> = {}): ViHistoryViewModel {
  const defaultCommits = [
    createTestCommit({
      hash: 'newest1234567890abcdef1234567890abcdef12',
      previousHash: 'older12345678901234567890123456789012345',
      authorDate: '2025-01-20',
      subject: 'Newest commit'
    }),
    createTestCommit({
      hash: 'older12345678901234567890123456789012345',
      authorDate: '2025-01-15',
      subject: 'Oldest retained revision'
    })
  ];
  const commits = overrides.commits ?? defaultCommits;
  const commitCount = commits.length;

  return {
    repositoryName: 'vi-history-suite',
    repositoryRoot: '/home/user/projects/vi-history-suite',
    repositoryUrl: 'https://github.com/LabVIEW-Community-CI-CD/vi-history-suite',
    relativePath: 'Examples/Sample.vi',
    signature: 'LVIN',
    eligible: true,
    commits,
    historyWindow: overrides.historyWindow ?? {
      mode: 'auto',
      configuredMaxEntries: 100,
      effectiveEntryCeiling: 1000,
      loadedCommitCount: commitCount,
      totalCommitCount: commitCount,
      truncated: false,
      decision: 'auto-full-history'
    },
    ...overrides
  };
}

describe('historyReviewPacket', () => {
  it('renders direct factual fields and per-retained-commit subject and body facts (VHS-REQ-040.1, VHS-REQ-040.3)', () => {
    const text = renderHistoryReviewPacketText(createTestViewModel());

    expect(text).toContain('VI History Review Packet');
    expect(text).toContain('Repository: vi-history-suite');
    expect(text).toContain('Root: /home/user/projects/vi-history-suite');
    expect(text).toContain(
      'Origin: https://github.com/LabVIEW-Community-CI-CD/vi-history-suite'
    );
    expect(text).toContain('Path: Examples/Sample.vi');
    expect(text).toContain('Signature: LVIN');
    expect(text).toContain('Retained revisions: 2');
    expect(text).toContain('History window: full history loaded automatically (2/2 commits)');
    expect(text).toContain('Newest retained commit: newest12 · 2025-01-20 · Test Author');
    expect(text).toContain('Oldest retained commit: older123 · 2025-01-15 · Test Author');
    expect(text).toContain('Per-retained-commit facts:');
    expect(text).toContain('- newest12 :: Newest commit :: Test commit body');
    expect(text).toContain('- older123 :: Oldest retained revision :: Test commit body');
    expect(text).not.toContain('Retained compare pairs:');
    expect(text).not.toContain('vs older123');
    expect(text).toContain(
      '- Needs external comparison tooling: binary semantic differences, visual or cosmetic change detection, and LabVIEW comparison-report output.'
    );
    expect(text).not.toContain('semantic VI differences detected');
    expect(text).not.toContain('LabVIEW comparison succeeded');
  });

  it('uses factual fallback text for unavailable origin and empty retained history (VHS-REQ-040.2)', () => {
    const text = renderHistoryReviewPacketText(
      createTestViewModel({
        repositoryUrl: undefined,
        commits: [],
        historyWindow: undefined
      })
    );

    expect(text).toContain('Origin: Unavailable');
    expect(text).toContain('Retained revisions: 0');
    expect(text).toContain('History window: 0 retained commit(s) loaded.');
    expect(text).toContain('Newest retained commit: No retained commits');
    expect(text).toContain('Oldest retained commit: No retained commits');
    expect(text).toContain(
      'Per-retained-commit facts:\n- No retained commits were loaded, so no commit facts are available.'
    );
  });

  it('uses a factual fallback for retained commits with an empty body (VHS-REQ-040.2)', () => {
    const text = renderHistoryReviewPacketText(
      createTestViewModel({
        commits: [
          createTestCommit({
            hash: 'feedface1234567890abcdef1234567890abcd',
            subject: 'No body commit',
            body: ''
          })
        ]
      })
    );

    expect(text).toContain('- feedface :: No body commit :: No commit body');
  });

  it('keeps copied packet content plain-text-safe for multiline and markup-like facts (VHS-REQ-040.2)', () => {
    const text = renderHistoryReviewPacketText(
      createTestViewModel({
        repositoryName: 'repo <strong>',
        relativePath: 'Examples/\nInjected.vi',
        commits: [
          createTestCommit({
            hash: 'feedface1234567890abcdef1234567890abcd',
            authorName: 'Reviewer <script>alert(1)</script>\nName',
            subject: 'Compare <br /> packet\nsubject',
            body: 'Body <b>bold</b>\nsecond line'
          })
        ]
      })
    );

    expect(text).toContain('Repository: repo &lt;strong&gt;');
    expect(text).toContain('Path: Examples/ Injected.vi');
    expect(text).toContain(
      'Newest retained commit: feedface · 2025-01-15 · Reviewer &lt;script&gt;alert(1)&lt;/script&gt; Name'
    );
    expect(text).toContain(
      '- feedface :: Compare &lt;br /&gt; packet subject :: Body &lt;b&gt;bold&lt;/b&gt; second line'
    );
    expect(text).not.toContain('<strong>');
    expect(text).not.toContain('<script>');
    expect(text).not.toContain('<br />');
    expect(text).not.toContain('<b>bold</b>');
    expect(text).not.toContain('\r');
  });

  it('renders a not-eligible signature and an undefined commit body as factual fallbacks', () => {
    const text = renderHistoryReviewPacketText(
      createTestViewModel({
        eligible: false,
        commits: [
          createTestCommit({
            hash: 'beadfeed1234567890abcdef1234567890abcd',
            subject: 'Body-less commit',
            body: undefined
          })
        ]
      })
    );
    // eligible=false renders the "Not eligible" arm.
    expect(text).toContain('Eligibility: Not eligible');
    // An undefined body (not merely empty) still renders the factual fallback via
    // the `commit.body ?? ''` default.
    expect(text).toContain('- beadfeed :: Body-less commit :: No commit body');
  });

  it('summarizes every history-window mode and truncation combination', () => {
    const windowSummary = (historyWindow: ViHistoryViewModel['historyWindow']): string => {
      const text = renderHistoryReviewPacketText(createTestViewModel({ historyWindow }));
      const line = text.split('\n').find((entry) => entry.startsWith('History window: '));
      return (line ?? '').replace('History window: ', '');
    };

    // capped, not truncated, with a known total (the capped full-history arm).
    expect(
      windowSummary({
        mode: 'capped',
        configuredMaxEntries: 100,
        effectiveEntryCeiling: 100,
        loadedCommitCount: 2,
        totalCommitCount: 2,
        truncated: false,
        decision: 'capped-full-history'
      })
    ).toBe('full history loaded within capped mode (2/2 commits)');

    // auto, truncated at the automatic safety ceiling.
    expect(
      windowSummary({
        mode: 'auto',
        configuredMaxEntries: 100,
        effectiveEntryCeiling: 1000,
        loadedCommitCount: 1000,
        totalCommitCount: 5000,
        truncated: true,
        decision: 'auto-truncated-to-ceiling'
      })
    ).toContain(
      'auto window truncated to 1000/5000 commits at the automatic safety ceiling (1000)'
    );

    // capped, truncated at the configured ceiling.
    expect(
      windowSummary({
        mode: 'capped',
        configuredMaxEntries: 50,
        effectiveEntryCeiling: 50,
        loadedCommitCount: 50,
        totalCommitCount: 200,
        truncated: true,
        decision: 'capped-truncated-to-max'
      })
    ).toContain('capped window truncated to 50/200 commits at the configured ceiling (50)');

    // auto, total count unavailable.
    expect(
      windowSummary({
        mode: 'auto',
        configuredMaxEntries: 100,
        effectiveEntryCeiling: 1000,
        loadedCommitCount: 12,
        totalCommitCount: undefined,
        truncated: false,
        decision: 'auto-fallback-unknown-total'
      })
    ).toBe('loaded 12 commits under auto mode; total history count was unavailable');

    // capped, total count unavailable.
    expect(
      windowSummary({
        mode: 'capped',
        configuredMaxEntries: 100,
        effectiveEntryCeiling: 100,
        loadedCommitCount: 7,
        totalCommitCount: undefined,
        truncated: false,
        decision: 'capped-fallback-unknown-total'
      })
    ).toBe('loaded 7 commits under capped mode; total history count was unavailable');
  });
});

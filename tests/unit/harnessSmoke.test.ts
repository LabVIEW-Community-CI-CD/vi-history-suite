import { describe, expect, it } from 'vitest';

import {
  getCanonicalHarnessDefinition,
  HARNESS_VHS_001,
  HARNESS_VHS_002
} from '../../src/harness/canonicalHarnesses';
import {
  renderHarnessSmokeHtml,
  renderHarnessSmokeMarkdown
} from '../../src/harness/harnessSmoke';

describe('canonical harness definitions', () => {
  it('returns the canonical harness by id', () => {
    expect(getCanonicalHarnessDefinition('HARNESS-VHS-001')).toEqual(HARNESS_VHS_001);
    expect(getCanonicalHarnessDefinition('HARNESS-VHS-002')).toEqual(HARNESS_VHS_002);
  });

  it('fails closed for unknown harness ids', () => {
    expect(() => getCanonicalHarnessDefinition('HARNESS-VHS-999')).toThrowError(
      'Unknown harness id: HARNESS-VHS-999'
    );
  });
});

describe('harness smoke renderers', () => {
  const report = {
    harnessId: 'HARNESS-VHS-001',
    repositoryUrl: 'https://github.com/ni/labview-icon-editor.git',
    cloneDirectory: '/tmp/harness',
    targetRelativePath: 'Tooling/deployment/VIP_Pre-Install Custom Action.vi',
    head: 'abcdef1234567890',
    tracked: true,
    signature: 'LVIN' as const,
    eligible: true,
    commitCount: 2,
    generatedAt: '2026-04-02T00:00:00.000Z',
    commits: [
      {
        hash: 'abcdef1234567890',
        authorDate: '2026-04-02T00:00:00Z',
        authorName: 'A User',
        subject: 'First subject',
        previousHash: '1111111122222222'
      },
      {
        hash: '1111111122222222',
        authorDate: '2026-04-01T00:00:00Z',
        authorName: 'B User',
        subject: 'Second subject'
      }
    ]
  };

  it('renders markdown with factual smoke fields', () => {
    const markdown = renderHarnessSmokeMarkdown(report);

    expect(markdown).toContain('HARNESS-VHS-001');
    expect(markdown).toContain('Eligible: yes');
    expect(markdown).toContain('VIP_Pre-Install Custom Action.vi');
    expect(markdown).toContain('First subject');
    expect(HARNESS_VHS_002.targetRelativePath).toBe('resource/plugins/lv_icon.vi');
  });

  it('renders html with factual smoke fields', () => {
    const html = renderHarnessSmokeHtml(report);

    expect(html).toContain('Harness Smoke Report');
    expect(html).toContain('abcdef12');
    expect(html).toContain('A User');
    expect(html).toContain('First subject');
  });
});

import { describe, expect, it } from 'vitest';

import { resolveConfiguredContainerImageReference } from '../../src/reporting/runtime/containerImageReference';

describe('resolveConfiguredContainerImageReference', () => {
  it('returns a trimmed explicit full override when present', () => {
    expect(
      resolveConfiguredContainerImageReference({
        fullOverride: '  my/registry:tag  ',
        versionSelection: '2026q1',
        platform: 'windows',
        defaultReference: 'default/image:tag'
      })
    ).toBe('my/registry:tag');
  });

  it('falls back to the default reference when no override and no resolvable selection', () => {
    expect(
      resolveConfiguredContainerImageReference({
        fullOverride: undefined,
        versionSelection: undefined,
        platform: 'linux',
        defaultReference: 'default/linux:tag'
      })
    ).toBe('default/linux:tag');
  });

  it('falls back to the default reference for an unparseable version selection', () => {
    expect(
      resolveConfiguredContainerImageReference({
        fullOverride: '   ',
        versionSelection: 'not-a-valid-version',
        platform: 'windows',
        defaultReference: 'default/windows:tag'
      })
    ).toBe('default/windows:tag');
  });
});

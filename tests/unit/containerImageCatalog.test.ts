import { describe, expect, it, vi } from 'vitest';

import {
  AvailableContainerImageVersion,
  LABVIEW_CONTAINER_IMAGE_REPOSITORY,
  compareLabviewContainerImageVersionsNewestFirst,
  discoverLocalContainerImageVersions,
  discoverPublishedContainerImageVersions,
  formatLabviewContainerImageReference,
  formatLabviewContainerImageTag,
  mergeAvailableContainerImageVersions,
  parseLabviewContainerImageReference,
  parseLabviewContainerImageTag,
  resolveContainerImageSelection
} from '../../src/tooling/containerImageCatalog';

describe('containerImageCatalog tag model (VHS-REQ-646)', () => {
  it('parses a base quarterly tag', () => {
    expect(parseLabviewContainerImageTag('2026q1-windows')).toEqual({
      year: 2026,
      quarter: 1,
      patch: undefined,
      platform: 'windows',
      tag: '2026q1-windows',
      reference: 'nationalinstruments/labview:2026q1-windows'
    });
  });

  it('parses a patch tag and a linux tag', () => {
    expect(parseLabviewContainerImageTag('2026q1patch2-windows')).toMatchObject({
      year: 2026,
      quarter: 1,
      patch: 2,
      platform: 'windows'
    });
    expect(parseLabviewContainerImageTag('2026q3-linux')).toMatchObject({
      year: 2026,
      quarter: 3,
      platform: 'linux'
    });
  });

  it('rejects malformed, patch-0, and out-of-grammar tags', () => {
    for (const bad of [
      '',
      '   ',
      '2026-windows',
      '2026q5-windows',
      '2026q1patch0-windows',
      '2026q1patch-windows',
      '2026q1-macos',
      'latest',
      '2026q1patch2',
      'v2026q1-windows'
    ]) {
      expect(parseLabviewContainerImageTag(bad), bad).toBeUndefined();
    }
  });

  it('parses a full namespace-pinned reference and rejects foreign namespaces', () => {
    expect(
      parseLabviewContainerImageReference('nationalinstruments/labview:2026q1patch2-windows')
    ).toMatchObject({ year: 2026, patch: 2, platform: 'windows' });

    for (const foreign of [
      'evil/labview:2026q1-windows',
      'nationalinstruments/labviewx:2026q1-windows',
      'ghcr.io/nationalinstruments/labview:2026q1-windows',
      'nationalinstruments/labview'
    ]) {
      expect(parseLabviewContainerImageReference(foreign), foreign).toBeUndefined();
    }
  });

  it('round-trips parse -> format for every valid tag', () => {
    for (const tag of [
      '2025q1-windows',
      '2026q1-windows',
      '2026q1patch1-windows',
      '2026q1patch2-linux',
      '2027q3-linux'
    ]) {
      const parsed = parseLabviewContainerImageTag(tag);
      expect(parsed).toBeDefined();
      expect(formatLabviewContainerImageTag(parsed!)).toBe(tag);
      expect(formatLabviewContainerImageReference(parsed!)).toBe(
        `${LABVIEW_CONTAINER_IMAGE_REPOSITORY}:${tag}`
      );
    }
  });

  it('orders newest-first: year, then quarter, then patch (base is oldest in its group)', () => {
    const tags = [
      '2026q1-windows',
      '2026q1patch2-windows',
      '2026q1patch1-windows',
      '2026q3-windows',
      '2027q1-windows',
      '2025q1-windows'
    ];
    const ordered = tags
      .map((tag) => parseLabviewContainerImageTag(tag)!)
      .sort(compareLabviewContainerImageVersionsNewestFirst)
      .map((version) => version.tag);
    expect(ordered).toEqual([
      '2027q1-windows',
      '2026q3-windows',
      '2026q1patch2-windows',
      '2026q1patch1-windows',
      '2026q1-windows',
      '2025q1-windows'
    ]);
  });
});

describe('published registry discovery (VHS-REQ-647)', () => {
  it('filters to platform and year floor, parses, and orders newest-first', async () => {
    const fetchTags = vi.fn().mockResolvedValue([
      '2026q1-windows',
      '2026q1patch1-windows',
      '2026q1-linux', // wrong platform
      '2024q1-windows', // below floor
      'latest', // unparseable
      '2027q1-windows'
    ]);
    const result = await discoverPublishedContainerImageVersions('windows', { fetchTags });
    expect(fetchTags).toHaveBeenCalledWith(LABVIEW_CONTAINER_IMAGE_REPOSITORY);
    expect(result.versions.map((version) => version.tag)).toEqual([
      '2027q1-windows',
      '2026q1patch1-windows',
      '2026q1-windows'
    ]);
    expect(result.note).toBeUndefined();
  });

  it('degrades to an empty result with a non-fatal note when the fetch throws', async () => {
    const fetchTags = vi.fn().mockRejectedValue(new Error('ETIMEDOUT'));
    const result = await discoverPublishedContainerImageVersions('linux', { fetchTags });
    expect(result.versions).toEqual([]);
    expect(result.note).toContain('registry query failed');
  });

  it('honors an explicit minimum year override', async () => {
    const fetchTags = vi.fn().mockResolvedValue(['2026q1-windows', '2027q1-windows']);
    const result = await discoverPublishedContainerImageVersions('windows', {
      fetchTags,
      minimumYear: 2027
    });
    expect(result.versions.map((version) => version.tag)).toEqual(['2027q1-windows']);
  });
});

describe('local image discovery (VHS-REQ-648)', () => {
  it('parses local references for the platform and ignores the rest', async () => {
    const listLocalImages = vi.fn().mockResolvedValue([
      'nationalinstruments/labview:2026q1patch2-windows',
      'nationalinstruments/labview:2026q1-windows',
      'nationalinstruments/labview:2026q1-linux',
      'someother/image:tag'
    ]);
    const result = await discoverLocalContainerImageVersions('windows', { listLocalImages });
    expect(result.versions.map((version) => version.tag)).toEqual([
      '2026q1patch2-windows',
      '2026q1-windows'
    ]);
  });

  it('returns empty (not error) when the lister throws (no Docker CLI)', async () => {
    const listLocalImages = vi.fn().mockRejectedValue(new Error('docker not found'));
    const result = await discoverLocalContainerImageVersions('windows', { listLocalImages });
    expect(result.versions).toEqual([]);
    expect(result.note).toContain('local image query failed');
  });
});

describe('merge availability (VHS-REQ-648)', () => {
  it('marks local presence and registry publication and keeps local-only versions', () => {
    const registry = [
      parseLabviewContainerImageTag('2027q1-windows')!,
      parseLabviewContainerImageTag('2026q1-windows')!
    ];
    const local = [
      parseLabviewContainerImageTag('2026q1patch2-windows')!,
      parseLabviewContainerImageTag('2026q1-windows')!
    ];
    const merged = mergeAvailableContainerImageVersions(registry, local);
    expect(merged.map((version) => version.tag)).toEqual([
      '2027q1-windows',
      '2026q1patch2-windows',
      '2026q1-windows'
    ]);
    const byTag = new Map(merged.map((version) => [version.tag, version]));
    expect(byTag.get('2027q1-windows')).toMatchObject({
      locallyPresent: false,
      publishedToRegistry: true
    });
    expect(byTag.get('2026q1patch2-windows')).toMatchObject({
      locallyPresent: true,
      publishedToRegistry: false
    });
    expect(byTag.get('2026q1-windows')).toMatchObject({
      locallyPresent: true,
      publishedToRegistry: true
    });
  });
});

describe('selection resolution (VHS-REQ-649/650)', () => {
  const available: AvailableContainerImageVersion[] = [
    {
      ...parseLabviewContainerImageTag('2026q1patch2-windows')!,
      locallyPresent: true,
      publishedToRegistry: true
    }
  ];

  it('resolves the default reference when no selection is set', () => {
    const result = resolveContainerImageSelection({
      platform: 'windows',
      defaultReference: 'nationalinstruments/labview:2026q1-windows'
    });
    expect(result).toMatchObject({
      outcome: 'resolved',
      source: 'default',
      reference: 'nationalinstruments/labview:2026q1-windows'
    });
  });

  it('resolves a valid selection to its reference and annotates availability', () => {
    const result = resolveContainerImageSelection({
      platform: 'windows',
      selection: '2026q1patch2-windows',
      defaultReference: 'nationalinstruments/labview:2026q1-windows',
      available
    });
    expect(result).toMatchObject({
      outcome: 'resolved',
      source: 'selected',
      reference: 'nationalinstruments/labview:2026q1patch2-windows',
      locallyPresent: true,
      publishedToRegistry: true
    });
  });

  it('fails closed on an unparseable selection instead of substituting the default', () => {
    const result = resolveContainerImageSelection({
      platform: 'windows',
      selection: 'banana',
      defaultReference: 'nationalinstruments/labview:2026q1-windows'
    });
    expect(result.outcome).toBe('invalid-selection');
  });

  it('fails closed when the selection targets the wrong platform', () => {
    const result = resolveContainerImageSelection({
      platform: 'windows',
      selection: '2026q1-linux',
      defaultReference: 'nationalinstruments/labview:2026q1-windows'
    });
    expect(result).toMatchObject({ outcome: 'invalid-selection' });
    if (result.outcome === 'invalid-selection') {
      expect(result.detail).toContain('linux');
    }
  });
});

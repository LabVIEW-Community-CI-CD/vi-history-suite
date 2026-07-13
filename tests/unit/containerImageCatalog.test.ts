import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import {
  AvailableContainerImageVersion,
  LABVIEW_CONTAINER_IMAGE_REPOSITORY,
  compareLabviewContainerImageVersionsNewestFirst,
  detectContainerImageVersionPlatformConflict,
  discoverLocalContainerImageVersions,
  discoverPublishedContainerImageVersions,
  formatLabviewContainerImageReference,
  formatLabviewContainerImageTag,
  mergeAvailableContainerImageVersions,
  parseLabviewContainerImageReference,
  parseLabviewContainerImageTag,
  resolveContainerImageSelection,
  resolveLinuxContainerLabviewProfile
} from '../../src/tooling/containerImageCatalog';

describe('resolveLinuxContainerLabviewProfile (VHS-REQ-657)', () => {
  it('derives the 2026 Q1 profile: labviewprofull + cli-headless (VHS-REQ-657.1)', () => {
    expect(
      resolveLinuxContainerLabviewProfile('nationalinstruments/labview:2026q1-linux')
    ).toEqual({
      year: 2026,
      installDirectory: '/usr/local/natinst/LabVIEW-2026-64',
      labviewCliPath: '/usr/local/natinst/LabVIEW-2026-64/labviewprofull',
      lvcomparePath: '/usr/local/natinst/LabVIEW-2026-64/labview',
      headlessMode: 'cli-headless'
    });
  });

  it('derives the 2025 Q3 profile: plain labview + enable-cicd-env (VHS-REQ-657.2)', () => {
    expect(
      resolveLinuxContainerLabviewProfile('nationalinstruments/labview:2025q3-linux')
    ).toEqual({
      year: 2025,
      installDirectory: '/usr/local/natinst/LabVIEW-2025-64',
      labviewCliPath: '/usr/local/natinst/LabVIEW-2025-64/labview',
      lvcomparePath: '/usr/local/natinst/LabVIEW-2025-64/labview',
      headlessMode: 'enable-cicd-env'
    });
  });

  it('treats a future year as headless-flag based (2027)', () => {
    const profile = resolveLinuxContainerLabviewProfile(
      'nationalinstruments/labview:2027q1-linux'
    );
    expect(profile.year).toBe(2027);
    expect(profile.labviewCliPath).toBe('/usr/local/natinst/LabVIEW-2027-64/labviewprofull');
    expect(profile.headlessMode).toBe('cli-headless');
  });

  it('falls back to the LabVIEW 2026 profile when the reference is unparseable (VHS-REQ-657.3)', () => {
    for (const unparseable of [undefined, '', 'not-a-labview-image', 'ubuntu:24.04']) {
      const profile = resolveLinuxContainerLabviewProfile(unparseable);
      expect(profile.year).toBeUndefined();
      expect(profile.labviewCliPath).toBe(
        '/usr/local/natinst/LabVIEW-2026-64/labviewprofull'
      );
      expect(profile.headlessMode).toBe('cli-headless');
    }
  });
});

describe('containerImageCatalog tag model (VHS-REQ-646)', () => {
  it('keeps the tag model free of VS Code, filesystem, child-process, and network dependencies (VHS-REQ-646.5)', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, '../../src/tooling/containerImageCatalog.ts'),
      'utf8'
    );

    expect(source).not.toMatch(
      /from ['"](?:vscode|(?:node:)?fs(?:\/promises)?|(?:node:)?child_process)['"]|require\(['"](?:vscode|(?:node:)?fs(?:\/promises)?|(?:node:)?child_process)['"]\)|\bfetch\s*\(|https?/u
    );
  });

  it('parses a base quarterly tag (VHS-REQ-646.1)', () => {
    expect(parseLabviewContainerImageTag('2026q1-windows')).toEqual({
      year: 2026,
      quarter: 1,
      patch: undefined,
      platform: 'windows',
      tag: '2026q1-windows',
      reference: 'nationalinstruments/labview:2026q1-windows'
    });
  });

  it('parses a patch tag and a linux tag (VHS-REQ-646.1)', () => {
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

  it('rejects malformed, patch-0, and out-of-grammar tags (VHS-REQ-646.2)', () => {
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

  it('parses a full namespace-pinned reference and rejects foreign namespaces (VHS-REQ-646.2)', () => {
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

  it('round-trips parse -> format for every valid tag (VHS-REQ-646.4)', () => {
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

  it('orders newest-first: year, then quarter, then patch (base is oldest in its group) (VHS-REQ-646.3)', () => {
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
  it('filters to platform and year floor, parses, and orders newest-first (VHS-REQ-647.2)', async () => {
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

  it('degrades to an empty result with a non-fatal note when the fetch throws (VHS-REQ-647.3, VHS-REQ-647.4)', async () => {
    const fetchTags = vi.fn().mockRejectedValue(new Error('ETIMEDOUT'));
    const result = await discoverPublishedContainerImageVersions('linux', { fetchTags });
    expect(result.versions).toEqual([]);
    expect(result.note).toContain('registry query failed');
  });

  it('honors an explicit minimum year override (VHS-REQ-647.2)', async () => {
    const fetchTags = vi.fn().mockResolvedValue(['2026q1-windows', '2027q1-windows']);
    const result = await discoverPublishedContainerImageVersions('windows', {
      fetchTags,
      minimumYear: 2027
    });
    expect(result.versions.map((version) => version.tag)).toEqual(['2027q1-windows']);
  });
});

describe('local image discovery (VHS-REQ-648)', () => {
  it('parses local references for the platform and ignores the rest (VHS-REQ-648.1, VHS-REQ-648.5)', async () => {
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

  it('returns empty with localPresenceUnknown when the lister rejects (Docker engine offline) (VHS-REQ-648.4)', async () => {
    // VHS-REQ-649: a rejected lister means the Docker CLI was present but the
    // host's pulled images could not be enumerated (daemon unreachable), so
    // local presence is unknown — not "no images pulled".
    const listLocalImages = vi.fn().mockRejectedValue(new Error('docker images exited with code 1'));
    const result = await discoverLocalContainerImageVersions('windows', { listLocalImages });
    expect(result.versions).toEqual([]);
    expect(result.localPresenceUnknown).toBe(true);
    expect(result.note).toContain('Docker engine may be offline');
  });

  it('does not flag localPresenceUnknown when the lister resolves an empty list (no images pulled) (VHS-REQ-648.4)', async () => {
    const listLocalImages = vi.fn().mockResolvedValue([]);
    const result = await discoverLocalContainerImageVersions('windows', { listLocalImages });
    expect(result.versions).toEqual([]);
    expect(result.localPresenceUnknown).toBeUndefined();
  });
});

describe('merge availability (VHS-REQ-648)', () => {
  it('marks local presence and registry publication and keeps local-only versions (VHS-REQ-648.2)', () => {
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

  it('resolves the default reference when no selection is set (VHS-REQ-650.2)', () => {
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

  it('resolves a valid selection to its reference and annotates availability (VHS-REQ-650.1)', () => {
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

describe('detectContainerImageVersionPlatformConflict (VHS-REQ-650)', () => {
  it('flags a selection whose platform differs from the confirmed active platform (VHS-REQ-650.5)', () => {
    expect(
      detectContainerImageVersionPlatformConflict('2026q1-windows', 'linux')
    ).toEqual({
      selectedTag: '2026q1-windows',
      selectedReference: 'nationalinstruments/labview:2026q1-windows',
      selectedPlatform: 'windows',
      activePlatform: 'linux'
    });
  });

  it('returns undefined when the selection matches the active platform', () => {
    expect(
      detectContainerImageVersionPlatformConflict('2026q1-linux', 'linux')
    ).toBeUndefined();
  });

  it('returns undefined when the active platform is not confirmed (VHS-REQ-650.6)', () => {
    // Unknown / undefined active platform must never flag a conflict (a valid
    // selection is never flagged against a host-OS guess).
    expect(
      detectContainerImageVersionPlatformConflict('2026q1-windows', undefined)
    ).toBeUndefined();
    expect(
      detectContainerImageVersionPlatformConflict('2026q1-windows', 'unknown')
    ).toBeUndefined();
  });

  it('returns undefined for an empty or unparseable selection', () => {
    expect(detectContainerImageVersionPlatformConflict(undefined, 'linux')).toBeUndefined();
    expect(detectContainerImageVersionPlatformConflict('  ', 'linux')).toBeUndefined();
    expect(detectContainerImageVersionPlatformConflict('banana', 'linux')).toBeUndefined();
  });
});

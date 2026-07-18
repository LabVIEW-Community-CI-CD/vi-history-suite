import { describe, expect, it } from 'vitest';

import {
  DEFAULT_DOCKER_IMAGE_LABEL_TAG,
  DEFAULT_WINDOWS_DOCKER_IMAGE_LABEL_TAG,
  STATUS_BAR_TEXT_AVAILABLE,
  STATUS_BAR_TEXT_MISSING,
  STATUS_BAR_TEXT_WARNING,
  STATUS_BAR_TOOLTIP_MISSING,
  buildAvailableStatusBarSuffix,
  buildStatusBarPresentation,
  resolveDefaultDockerImageLabelTag
} from '../../src/ui/runtimeStatusBarPresentation';
import type { RuntimeAvailabilitySnapshot } from '../../src/ui/runtimeAvailabilityNotice';

describe('resolveDefaultDockerImageLabelTag', () => {
  it('uses the Windows default only when the platform is confirmed Windows', () => {
    expect(resolveDefaultDockerImageLabelTag('windows')).toBe(
      DEFAULT_WINDOWS_DOCKER_IMAGE_LABEL_TAG
    );
  });

  it('keeps the Linux stand-in for unknown or linux platforms', () => {
    expect(resolveDefaultDockerImageLabelTag(undefined)).toBe(DEFAULT_DOCKER_IMAGE_LABEL_TAG);
    expect(resolveDefaultDockerImageLabelTag('linux')).toBe(DEFAULT_DOCKER_IMAGE_LABEL_TAG);
  });
});

describe('buildAvailableStatusBarSuffix', () => {
  it('renders the host version + bitness', () => {
    expect(
      buildAvailableStatusBarSuffix({ provider: 'host', labviewVersion: '2026', labviewBitness: 'x64' })
    ).toBe('LabVIEW 2026 x64');
  });

  it('returns empty for an incomplete host label', () => {
    expect(buildAvailableStatusBarSuffix({ provider: 'host' })).toBe('');
  });

  it('names the selected docker image tag when set', () => {
    expect(
      buildAvailableStatusBarSuffix({ provider: 'docker', containerImageVersion: '2026q1patch1-windows' })
    ).toBe('Docker @ 2026q1patch1-windows');
  });

  it('falls back to the platform default docker tag when unset', () => {
    expect(buildAvailableStatusBarSuffix({ provider: 'docker' }, 'windows')).toBe(
      `Docker @ ${DEFAULT_WINDOWS_DOCKER_IMAGE_LABEL_TAG}`
    );
    expect(buildAvailableStatusBarSuffix({ provider: 'docker' })).toBe(
      `Docker @ ${DEFAULT_DOCKER_IMAGE_LABEL_TAG}`
    );
  });

  it('returns empty for a none provider', () => {
    expect(buildAvailableStatusBarSuffix({ provider: 'none' })).toBe('');
  });
});

describe('buildStatusBarPresentation', () => {
  const recommendation = { provider: 'none' } as RuntimeAvailabilitySnapshot['recommendation'];

  it('renders the available text + tooltip with a persisted source line', () => {
    const snapshot: RuntimeAvailabilitySnapshot = {
      kind: 'available',
      source: 'persisted',
      label: { provider: 'host', labviewVersion: '2026', labviewBitness: 'x64' },
      recommendation
    };
    const presentation = buildStatusBarPresentation(snapshot);
    expect(presentation.text).toBe(`${STATUS_BAR_TEXT_AVAILABLE}: LabVIEW 2026 x64`);
    expect(presentation.tooltip).toContain('Selected via settings.json');
  });

  it('renders the bare available text when there is no suffix', () => {
    const snapshot: RuntimeAvailabilitySnapshot = {
      kind: 'available',
      source: 'auto-detected',
      label: { provider: 'host' },
      recommendation
    };
    expect(buildStatusBarPresentation(snapshot).text).toBe(STATUS_BAR_TEXT_AVAILABLE);
  });

  it('renders a warning state on a confirmed docker platform conflict', () => {
    const snapshot: RuntimeAvailabilitySnapshot = {
      kind: 'available',
      source: 'persisted',
      label: { provider: 'docker', containerImageVersion: '2026q1-windows' },
      recommendation
    };
    const presentation = buildStatusBarPresentation(snapshot, 'linux');
    expect(presentation.text.startsWith(STATUS_BAR_TEXT_WARNING)).toBe(true);
  });

  it('renders the missing text + tooltip', () => {
    const snapshot: RuntimeAvailabilitySnapshot = {
      kind: 'missing',
      source: 'auto-detected',
      label: { provider: 'none' },
      recommendation
    };
    expect(buildStatusBarPresentation(snapshot)).toEqual({
      text: STATUS_BAR_TEXT_MISSING,
      tooltip: STATUS_BAR_TOOLTIP_MISSING
    });
  });
});

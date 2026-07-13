/**
 * Unit tests for the VHS-REQ-620 runtime provider selection helpers.
 *
 * The status-bar runtime quick-pick was replaced by the Runtime & Report
 * Settings panel (`openRuntimeReportPanelCommand`); these tests cover the pure
 * builder and settings writer the panel reuses to persist the runtime triple.
 */

import { describe, expect, it, vi } from 'vitest';

vi.mock('vscode', async () => {
  const { defaultVsCodeTestHarness } = await import('./vscodeTestHarness');
  return defaultVsCodeTestHarness.vscode;
});

import * as vscode from 'vscode';

import {
  applyPickRuntimeProviderSelection,
  applyViPreviewEnabledSelection,
  buildPickRuntimeProviderItems
} from '../../src/commands/pickRuntimeProviderCommand';
import type { DetectedRuntimes } from '../../src/tooling/runtimeAutoDetect';

const detectionBoth: DetectedRuntimes = {
  platform: 'win32',
  host: {
    installations: [
      {
        year: '2025',
        bitness: 'x86',
        labviewExePath: 'C:\\Program Files (x86)\\NI\\LabVIEW 2025\\LabVIEW.exe'
      },
      {
        year: '2026',
        bitness: 'x64',
        labviewExePath: 'C:\\Program Files\\NI\\LabVIEW 2026\\LabVIEW.exe'
      }
    ]
  },
  docker: { cliAvailable: true, cliPath: 'C:\\Program Files\\Docker\\docker.exe' }
};

const detectionEmpty: DetectedRuntimes = {
  platform: 'darwin',
  host: { installations: [] },
  docker: { cliAvailable: false }
};

describe('buildPickRuntimeProviderItems (VHS-REQ-620)', () => {
  it('emits one entry per host installation, one for docker, plus a clear option (VHS-REQ-620.5, VHS-REQ-657.7)', () => {
    const items = buildPickRuntimeProviderItems(detectionBoth);
    expect(items).toHaveLength(4);
    expect(items[0]).toMatchObject({
      kind: 'host',
      runtimeProvider: 'host',
      labviewVersion: '2025',
      labviewBitness: 'x86'
    });
    expect(items[1]).toMatchObject({
      kind: 'host',
      runtimeProvider: 'host',
      labviewVersion: '2026',
      labviewBitness: 'x64'
    });
    expect(items[2]).toMatchObject({
      kind: 'docker',
      runtimeProvider: 'docker',
      label: '$(server) Docker'
    });
    // VHS-REQ-657: the Docker provider is LabVIEW-agnostic — no version/bitness.
    expect(items[2].labviewVersion).toBeUndefined();
    expect(items[2].labviewBitness).toBeUndefined();
    expect(items[3]).toMatchObject({ kind: 'clear' });
  });

  it('omits the docker entry when the docker CLI is unavailable', () => {
    const items = buildPickRuntimeProviderItems({
      platform: 'win32',
      host: detectionBoth.host,
      docker: { cliAvailable: false }
    });
    expect(items.some((item) => item.kind === 'docker')).toBe(false);
    expect(items.some((item) => item.kind === 'clear')).toBe(true);
  });

  it('returns an empty list when no runtimes are detected (no clear option)', () => {
    expect(buildPickRuntimeProviderItems(detectionEmpty)).toHaveLength(0);
  });
});

describe('applyPickRuntimeProviderSelection (VHS-REQ-620)', () => {
  it('writes all three keys to Global target for a host pick (VHS-REQ-620.5)', async () => {
    const update = vi.fn(async () => undefined);
    await applyPickRuntimeProviderSelection(
      {
        kind: 'host',
        label: 'irrelevant',
        runtimeProvider: 'host',
        labviewVersion: '2025',
        labviewBitness: 'x86'
      },
      { update }
    );
    expect(update).toHaveBeenCalledTimes(3);
    expect(update).toHaveBeenNthCalledWith(
      1,
      'runtimeProvider',
      'host',
      vscode.ConfigurationTarget.Global
    );
    expect(update).toHaveBeenNthCalledWith(
      2,
      'labviewVersion',
      '2025',
      vscode.ConfigurationTarget.Global
    );
    expect(update).toHaveBeenNthCalledWith(
      3,
      'labviewBitness',
      'x86',
      vscode.ConfigurationTarget.Global
    );
  });

  it('clears all three keys (sets undefined) for a clear pick (VHS-REQ-620.5)', async () => {
    const update = vi.fn(async () => undefined);
    await applyPickRuntimeProviderSelection(
      { kind: 'clear', label: 'irrelevant' },
      { update }
    );
    expect(update).toHaveBeenCalledTimes(3);
    expect(update.mock.calls.map((call) => call[1])).toEqual([
      undefined,
      undefined,
      undefined
    ]);
  });

  it('writes the provider and clears version/bitness for a docker pick (VHS-REQ-620.5, VHS-REQ-657.7)', async () => {
    const update = vi.fn(async () => undefined);
    await applyPickRuntimeProviderSelection(
      { kind: 'docker', label: '$(server) Docker', runtimeProvider: 'docker' },
      { update }
    );
    expect(update).toHaveBeenCalledTimes(3);
    expect(update).toHaveBeenNthCalledWith(
      1,
      'runtimeProvider',
      'docker',
      vscode.ConfigurationTarget.Global
    );
    expect(update).toHaveBeenNthCalledWith(
      2,
      'labviewVersion',
      undefined,
      vscode.ConfigurationTarget.Global
    );
    expect(update).toHaveBeenNthCalledWith(
      3,
      'labviewBitness',
      undefined,
      vscode.ConfigurationTarget.Global
    );
  });
});

describe('applyViPreviewEnabledSelection (VHS-REQ-659.7)', () => {
  it('writes preview.enabled=true to the Global target', async () => {
    const update = vi.fn(async () => undefined);
    await applyViPreviewEnabledSelection(true, { update });
    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith(
      'preview.enabled',
      true,
      vscode.ConfigurationTarget.Global
    );
  });

  it('writes preview.enabled=false to the Global target', async () => {
    const update = vi.fn(async () => undefined);
    await applyViPreviewEnabledSelection(false, { update });
    expect(update).toHaveBeenCalledWith(
      'preview.enabled',
      false,
      vscode.ConfigurationTarget.Global
    );
  });
});

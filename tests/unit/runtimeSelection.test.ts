import { describe, expect, it } from 'vitest';

import {
  decideFirstRunPresentation,
  evaluateRuntimeAvailability,
  selectActiveRuntime
} from '../../src/ui/runtimeSelection';
import type { RuntimeAvailabilitySnapshot } from '../../src/ui/runtimeAvailabilityNotice';
import type { DetectedRuntimes } from '../../src/tooling/runtimeAutoDetect';

function detection(overrides: Partial<DetectedRuntimes> = {}): DetectedRuntimes {
  return {
    host: { installations: [] },
    docker: { cliAvailable: false },
    ...overrides
  } as DetectedRuntimes;
}

function hostInstallation(year: string, bitness: 'x86' | 'x64') {
  return { year, bitness, labviewCliPath: `/lv/${year}/${bitness}/labviewcli` };
}

describe('selectActiveRuntime', () => {
  it('uses a satisfiable persisted host selection', () => {
    const snapshot = selectActiveRuntime(
      detection({ host: { installations: [hostInstallation('2026', 'x64')] } } as never),
      { runtimeProvider: 'host', labviewVersion: '2026', labviewBitness: 'x64' }
    );
    expect(snapshot.kind).toBe('available');
    expect(snapshot.source).toBe('persisted');
    expect(snapshot.label.provider).toBe('host');
    expect(snapshot.label.labviewVersion).toBe('2026');
  });

  it('treats a persisted docker selection as complete with the provider key alone', () => {
    const snapshot = selectActiveRuntime(
      detection({ docker: { cliAvailable: true } } as never),
      { runtimeProvider: 'docker', containerImageVersion: '2026q1-linux' }
    );
    expect(snapshot.source).toBe('persisted');
    expect(snapshot.label.provider).toBe('docker');
    expect(snapshot.label.containerImageVersion).toBe('2026q1-linux');
  });

  it('falls back to the auto-detection recommendation when no persisted selection is satisfiable', () => {
    const snapshot = selectActiveRuntime(detection(), {});
    expect(snapshot.source).toBe('auto-detected');
    expect(['available', 'missing']).toContain(snapshot.kind);
  });
});

describe('evaluateRuntimeAvailability', () => {
  it('is the persistence-free selectActiveRuntime', () => {
    const snapshot = evaluateRuntimeAvailability(detection());
    expect(snapshot.source).toBe('auto-detected');
  });
});

describe('decideFirstRunPresentation', () => {
  const available = { kind: 'available' } as RuntimeAvailabilitySnapshot;
  const missing = { kind: 'missing' } as RuntimeAvailabilitySnapshot;

  it('stays silent when a runtime is available', () => {
    expect(decideFirstRunPresentation(available, false)).toEqual({
      kind: 'silent',
      shouldMarkShown: false
    });
  });

  it('stays silent when the first-run notice was already shown', () => {
    expect(decideFirstRunPresentation(missing, true)).toEqual({
      kind: 'silent',
      shouldMarkShown: false
    });
  });

  it('shows the first-run notice once when missing and not yet shown', () => {
    expect(decideFirstRunPresentation(missing, false)).toEqual({
      kind: 'first-run-info',
      shouldMarkShown: true
    });
  });
});

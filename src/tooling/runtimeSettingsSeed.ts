/**
 * Apply runtime-settings seed-or-repair policy at activation (VHS-REQ-616).
 *
 * Decision matrix:
 *   - No VI History keys persisted  -> seed using the recommendation.
 *   - All keys persisted and the persisted combination is satisfiable by the
 *     current detection -> preserve (no-op).
 *   - Any keys persisted but the combination is not satisfiable -> repair by
 *     overwriting with the recommendation.
 *   - No runtime detected at all -> return `no-runtime-detected` and leave
 *     persisted settings unchanged.
 *
 * Workspace trust does not gate this step: user `settings.json` is global and
 * the helpers below merely write JSONC values, never executing host code.
 */

import * as fsPromises from 'node:fs/promises';

import {
  readPersistedRuntimeSettingsFacts,
  writeVsCodeSettingsFile
} from './localRuntimeSettingsCli';
import {
  recommendRuntimeFromDetection,
  type DetectedRuntimes,
  type RuntimeRecommendation
} from './runtimeAutoDetect';

export interface RuntimeSettingsSeedDeps {
  fs?: Pick<typeof fsPromises, 'mkdir' | 'readFile' | 'writeFile'>;
}

export type RuntimeSettingsSeedOutcome =
  | 'seeded'
  | 'preserved'
  | 'repaired'
  | 'no-runtime-detected'
  | 'no-recommendation-required';

export interface PersistedRuntimeSelection {
  runtimeProvider?: string;
  labviewVersion?: string;
  labviewBitness?: string;
}

export interface RuntimeSettingsSeedResult {
  outcome: RuntimeSettingsSeedOutcome;
  settingsFilePath: string;
  recommendation: RuntimeRecommendation;
  previous: PersistedRuntimeSelection;
  applied?: {
    runtimeProvider: 'host' | 'docker';
    labviewVersion: string;
    labviewBitness: 'x86' | 'x64';
  };
}

export async function applyRuntimeSettingsSeed(
  detection: DetectedRuntimes,
  settingsFilePath: string,
  deps: RuntimeSettingsSeedDeps = {}
): Promise<RuntimeSettingsSeedResult> {
  const fs = deps.fs ?? fsPromises;
  const recommendation = recommendRuntimeFromDetection(detection);

  const facts = await readPersistedRuntimeSettingsFacts(settingsFilePath, fs);
  const previous: PersistedRuntimeSelection = {
    runtimeProvider: facts.persistedProvider,
    labviewVersion: facts.persistedLabviewVersion,
    labviewBitness: facts.persistedLabviewBitness
  };

  const persistedKeyCount =
    (previous.runtimeProvider ? 1 : 0) +
    (previous.labviewVersion ? 1 : 0) +
    (previous.labviewBitness ? 1 : 0);
  const allKeysPersisted = persistedKeyCount === 3;
  const noKeysPersisted = persistedKeyCount === 0;

  if (recommendation.provider === 'none') {
    // Without a recommendation we cannot seed or repair. Preserve any persisted
    // values verbatim so a user-editable settings.json survives an offline boot.
    return {
      outcome: 'no-runtime-detected',
      settingsFilePath,
      recommendation,
      previous
    };
  }

  if (allKeysPersisted && isPersistedSelectionSatisfiable(previous, detection)) {
    return {
      outcome: 'preserved',
      settingsFilePath,
      recommendation,
      previous
    };
  }

  if (noKeysPersisted) {
    await writeRecommendation(fs, settingsFilePath, recommendation);
    return {
      outcome: 'seeded',
      settingsFilePath,
      recommendation,
      previous,
      applied: extractApplied(recommendation)
    };
  }

  await writeRecommendation(fs, settingsFilePath, recommendation);
  return {
    outcome: 'repaired',
    settingsFilePath,
    recommendation,
    previous,
    applied: extractApplied(recommendation)
  };
}

export function isPersistedSelectionSatisfiable(
  selection: PersistedRuntimeSelection,
  detection: DetectedRuntimes
): boolean {
  const provider = selection.runtimeProvider;
  const version = selection.labviewVersion;
  const bitness = selection.labviewBitness;
  if (!provider || !version || !bitness) {
    return false;
  }
  if (provider !== 'host' && provider !== 'docker') {
    return false;
  }
  if (bitness !== 'x86' && bitness !== 'x64') {
    return false;
  }
  if (provider === 'docker') {
    // Daemon reachability is *not* checked here (too slow for activation); CLI
    // presence is the activation-time satisfiability bar.
    return detection.docker.cliAvailable;
  }
  // Host provider: an installation must match the persisted year+bitness.
  return detection.host.installations.some(
    (installation) => installation.year === version && installation.bitness === bitness
  );
}

async function writeRecommendation(
  fs: Pick<typeof fsPromises, 'mkdir' | 'readFile' | 'writeFile'>,
  settingsFilePath: string,
  recommendation: RuntimeRecommendation
): Promise<void> {
  if (recommendation.provider === 'none') {
    return;
  }
  await writeVsCodeSettingsFile(
    settingsFilePath,
    recommendation.provider,
    recommendation.labviewVersion,
    recommendation.labviewBitness,
    fs
  );
}

function extractApplied(
  recommendation: RuntimeRecommendation
): RuntimeSettingsSeedResult['applied'] {
  if (recommendation.provider === 'none') {
    return undefined;
  }
  return {
    runtimeProvider: recommendation.provider,
    labviewVersion: recommendation.labviewVersion,
    labviewBitness: recommendation.labviewBitness
  };
}

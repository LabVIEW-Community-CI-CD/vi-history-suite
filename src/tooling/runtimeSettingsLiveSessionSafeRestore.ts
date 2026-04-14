import * as fs from 'node:fs/promises';
import * as path from 'node:path';

export interface RuntimeSettingsLiveSessionMutationRequest {
  provider: 'host' | 'docker';
  labviewVersion: string;
  labviewBitness: 'x86' | 'x64';
}

export interface RuntimeSettingsFileSnapshot {
  existed: boolean;
  text?: string;
}

interface RuntimeSettingsLiveSessionSafeRestoreDeps {
  fs?: Pick<typeof fs, 'mkdir' | 'readFile' | 'rm' | 'writeFile'>;
}

export function deriveRuntimeSettingsLiveSessionMutationRequest(input: {
  persistedProvider?: string;
  persistedLabviewVersion?: string;
  persistedLabviewBitness?: string;
}): RuntimeSettingsLiveSessionMutationRequest {
  const persistedProvider = normalizeTrimmed(input.persistedProvider)?.toLowerCase();
  if (persistedProvider !== 'host' && persistedProvider !== 'docker') {
    throw new Error(
      'Runtime settings live-session probe requires persisted viHistorySuite.runtimeProvider to be host or docker before safe-restore mutation can run.'
    );
  }

  const persistedLabviewVersion = normalizeTrimmed(input.persistedLabviewVersion);
  if (!persistedLabviewVersion) {
    throw new Error(
      'Runtime settings live-session probe requires persisted viHistorySuite.labviewVersion before safe-restore mutation can run.'
    );
  }

  const persistedLabviewBitness = normalizeTrimmed(input.persistedLabviewBitness)?.toLowerCase();
  if (persistedLabviewBitness !== 'x86' && persistedLabviewBitness !== 'x64') {
    throw new Error(
      'Runtime settings live-session probe requires persisted viHistorySuite.labviewBitness to be x86 or x64 before safe-restore mutation can run.'
    );
  }

  return {
    provider: persistedProvider === 'host' ? 'docker' : 'host',
    labviewVersion: persistedLabviewVersion,
    labviewBitness: persistedLabviewBitness
  };
}

export async function captureRuntimeSettingsFileSnapshot(
  settingsFilePath: string,
  deps: RuntimeSettingsLiveSessionSafeRestoreDeps = {}
): Promise<RuntimeSettingsFileSnapshot> {
  const fsApi = deps.fs ?? fs;
  try {
    const text = await fsApi.readFile(settingsFilePath, 'utf8');
    return {
      existed: true,
      text
    };
  } catch (error) {
    if (isMissingFileError(error)) {
      return {
        existed: false
      };
    }

    throw error;
  }
}

export async function restoreRuntimeSettingsFileSnapshot(
  settingsFilePath: string,
  snapshot: RuntimeSettingsFileSnapshot,
  deps: RuntimeSettingsLiveSessionSafeRestoreDeps = {}
): Promise<void> {
  const fsApi = deps.fs ?? fs;
  if (snapshot.existed) {
    await fsApi.mkdir(path.dirname(settingsFilePath), { recursive: true });
    await fsApi.writeFile(settingsFilePath, snapshot.text ?? '', 'utf8');
    return;
  }

  await fsApi.rm(settingsFilePath, { force: true });
}

export async function verifyRuntimeSettingsFileSnapshot(
  settingsFilePath: string,
  snapshot: RuntimeSettingsFileSnapshot,
  deps: RuntimeSettingsLiveSessionSafeRestoreDeps = {}
): Promise<boolean> {
  const current = await captureRuntimeSettingsFileSnapshot(settingsFilePath, deps);
  if (snapshot.existed !== current.existed) {
    return false;
  }

  if (!snapshot.existed) {
    return true;
  }

  return (snapshot.text ?? '') === (current.text ?? '');
}

export async function runWithRuntimeSettingsSafeRestore<T>(
  settingsFilePath: string,
  operation: () => Promise<T>,
  deps: RuntimeSettingsLiveSessionSafeRestoreDeps = {}
): Promise<{ value: T; safeRestoreVerified: true }> {
  const snapshot = await captureRuntimeSettingsFileSnapshot(settingsFilePath, deps);
  let operationValue: T | undefined;
  let operationError: unknown;

  try {
    operationValue = await operation();
  } catch (error) {
    operationError = error;
  }

  let restoreError: unknown;
  try {
    await restoreRuntimeSettingsFileSnapshot(settingsFilePath, snapshot, deps);
    const restored = await verifyRuntimeSettingsFileSnapshot(settingsFilePath, snapshot, deps);
    if (!restored) {
      throw new Error(
        `Runtime settings live-session probe restore verification failed for ${settingsFilePath}.`
      );
    }
  } catch (error) {
    restoreError = error;
  }

  if (restoreError) {
    const restoreMessage =
      restoreError instanceof Error ? restoreError.message : String(restoreError);
    if (operationError) {
      const operationMessage =
        operationError instanceof Error ? operationError.message : String(operationError);
      throw new Error(
        `Runtime settings live-session probe failed and could not safely restore settings (${restoreMessage}). Original probe failure: ${operationMessage}`
      );
    }
    throw new Error(
      `Runtime settings live-session probe could not safely restore settings (${restoreMessage}).`
    );
  }

  if (operationError) {
    throw operationError;
  }

  return {
    value: operationValue as T,
    safeRestoreVerified: true
  };
}

function normalizeTrimmed(value: string | undefined): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function isMissingFileError(error: unknown): error is NodeJS.ErrnoException {
  return (
    !!error &&
    typeof error === 'object' &&
    'code' in error &&
    (error as NodeJS.ErrnoException).code === 'ENOENT'
  );
}

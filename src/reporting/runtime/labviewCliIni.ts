import { randomBytes } from 'node:crypto';
import * as fs from 'node:fs/promises';

export const LABVIEW_CLI_INI_OPEN_APP_KEY = 'OpenAppReferenceTimeoutInSecond';
export const LABVIEW_CLI_INI_AFTER_LAUNCH_KEY = 'AfterLaunchOpenAppReferenceTimeoutInSecond';
export const LABVIEW_CLI_INI_BACKUP_SUFFIX = '.vhs-backup';

export const DEFAULT_LABVIEW_CLI_INI_CANDIDATE_PATHS: readonly string[] = [
  'C:\\ProgramData\\National Instruments\\LabVIEW CLI\\LabVIEWCLI.ini',
  'C:\\ProgramData\\National Instruments\\LabVIEWCLI\\LabVIEWCLI.ini',
  'C:\\Program Files\\National Instruments\\Shared\\LabVIEW CLI\\LabVIEWCLI.ini',
  'C:\\Program Files (x86)\\National Instruments\\Shared\\LabVIEW CLI\\LabVIEWCLI.ini'
];

export type LabVIEWCliIniHardeningReason =
  | 'already-current'
  | 'no-candidate'
  | 'read-failed'
  | 'write-failed'
  | 'rename-failed'
  | 'invalid-value';

export interface LabVIEWCliIniHardeningResult {
  readonly applied: boolean;
  readonly iniPath?: string;
  readonly requestedValue: number;
  readonly previousValues?: Record<string, string | undefined>;
  readonly currentValues?: Record<string, string | undefined>;
  readonly backupCreated?: boolean;
  readonly reason?: LabVIEWCliIniHardeningReason;
}

export interface LabVIEWCliIniHardeningDeps {
  readFile?: typeof fs.readFile;
  writeFile?: typeof fs.writeFile;
  rename?: typeof fs.rename;
  pathExists?: (filePath: string) => Promise<boolean>;
  randomToken?: () => string;
}

export interface LabVIEWCliIniHardeningOptions {
  readonly candidatePaths?: readonly string[];
  readonly requestedValueSeconds: number;
  readonly deps?: LabVIEWCliIniHardeningDeps;
}

const KEY_LINE_PATTERN = (key: string): RegExp =>
  new RegExp(`^\\s*${escapeRegExp(key)}\\s*=.*$`, 'm');

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function defaultPathExists(filePath: string): Promise<boolean> {
  return fs
    .stat(filePath)
    .then(() => true)
    .catch(() => false);
}

function defaultRandomToken(): string {
  return randomBytes(6).toString('hex');
}

export function parseLabVIEWCliIniValue(
  contents: string,
  key: string
): string | undefined {
  const pattern = new RegExp(`^\\s*${escapeRegExp(key)}\\s*=\\s*(.*?)\\s*$`, 'm');
  const match = pattern.exec(contents);
  if (!match) {
    return undefined;
  }
  return match[1];
}

export function setLabVIEWCliIniValue(
  contents: string,
  key: string,
  value: string
): string {
  const pattern = KEY_LINE_PATTERN(key);
  if (pattern.test(contents)) {
    return contents.replace(pattern, `${key}=${value}`);
  }
  const trimmed = contents.replace(/\s+$/, '');
  const eol = '\n';
  const prefix = trimmed.length === 0 ? '' : `${trimmed}${eol}`;
  return `${prefix}${key}=${value}${eol}`;
}

/**
 * Idempotently writes the LabVIEW CLI connect-window timeout keys into the first existing
 * `LabVIEWCLI.ini` candidate. Atomic via tempfile + rename. Fail-soft: any IO error returns
 * `{ applied: false, reason }` and never throws. Compare must never fail because of this helper.
 */
export async function applyLabVIEWCliIniHardening(
  options: LabVIEWCliIniHardeningOptions
): Promise<LabVIEWCliIniHardeningResult> {
  const { requestedValueSeconds } = options;
  if (
    !Number.isFinite(requestedValueSeconds) ||
    !Number.isInteger(requestedValueSeconds) ||
    requestedValueSeconds <= 0
  ) {
    return { applied: false, requestedValue: requestedValueSeconds, reason: 'invalid-value' };
  }
  const candidates = options.candidatePaths ?? DEFAULT_LABVIEW_CLI_INI_CANDIDATE_PATHS;
  const deps = options.deps ?? {};
  const readFile = deps.readFile ?? fs.readFile;
  const writeFile = deps.writeFile ?? fs.writeFile;
  const rename = deps.rename ?? fs.rename;
  const pathExists = deps.pathExists ?? defaultPathExists;
  const randomToken = deps.randomToken ?? defaultRandomToken;
  const requestedValue = String(requestedValueSeconds);

  let iniPath: string | undefined;
  for (const candidate of candidates) {
    if (await pathExists(candidate)) {
      iniPath = candidate;
      break;
    }
  }
  if (!iniPath) {
    return { applied: false, requestedValue: requestedValueSeconds, reason: 'no-candidate' };
  }

  let originalContents: string;
  try {
    const buffer = await readFile(iniPath, 'utf8');
    originalContents = typeof buffer === 'string' ? buffer : Buffer.from(buffer).toString('utf8');
  } catch {
    return {
      applied: false,
      iniPath,
      requestedValue: requestedValueSeconds,
      reason: 'read-failed'
    };
  }

  const previousOpen = parseLabVIEWCliIniValue(originalContents, LABVIEW_CLI_INI_OPEN_APP_KEY);
  const previousAfter = parseLabVIEWCliIniValue(
    originalContents,
    LABVIEW_CLI_INI_AFTER_LAUNCH_KEY
  );
  if (previousOpen === requestedValue && previousAfter === requestedValue) {
    return {
      applied: false,
      iniPath,
      requestedValue: requestedValueSeconds,
      previousValues: {
        [LABVIEW_CLI_INI_OPEN_APP_KEY]: previousOpen,
        [LABVIEW_CLI_INI_AFTER_LAUNCH_KEY]: previousAfter
      },
      currentValues: {
        [LABVIEW_CLI_INI_OPEN_APP_KEY]: previousOpen,
        [LABVIEW_CLI_INI_AFTER_LAUNCH_KEY]: previousAfter
      },
      reason: 'already-current'
    };
  }

  let updated = setLabVIEWCliIniValue(
    originalContents,
    LABVIEW_CLI_INI_OPEN_APP_KEY,
    requestedValue
  );
  updated = setLabVIEWCliIniValue(updated, LABVIEW_CLI_INI_AFTER_LAUNCH_KEY, requestedValue);

  const backupPath = `${iniPath}${LABVIEW_CLI_INI_BACKUP_SUFFIX}`;
  let backupCreated = false;
  try {
    if (!(await pathExists(backupPath))) {
      await writeFile(backupPath, originalContents, 'utf8');
      backupCreated = true;
    }
  } catch {
    /* fail-soft on backup; proceed with primary write */
  }

  const tempPath = `${iniPath}.${randomToken()}.vhs-tmp`;
  try {
    await writeFile(tempPath, updated, 'utf8');
  } catch {
    return {
      applied: false,
      iniPath,
      requestedValue: requestedValueSeconds,
      previousValues: {
        [LABVIEW_CLI_INI_OPEN_APP_KEY]: previousOpen,
        [LABVIEW_CLI_INI_AFTER_LAUNCH_KEY]: previousAfter
      },
      backupCreated,
      reason: 'write-failed'
    };
  }
  try {
    await rename(tempPath, iniPath);
  } catch {
    try {
      await fs.unlink(tempPath);
    } catch {
      /* ignore cleanup failure */
    }
    return {
      applied: false,
      iniPath,
      requestedValue: requestedValueSeconds,
      previousValues: {
        [LABVIEW_CLI_INI_OPEN_APP_KEY]: previousOpen,
        [LABVIEW_CLI_INI_AFTER_LAUNCH_KEY]: previousAfter
      },
      backupCreated,
      reason: 'rename-failed'
    };
  }

  return {
    applied: true,
    iniPath,
    requestedValue: requestedValueSeconds,
    previousValues: {
      [LABVIEW_CLI_INI_OPEN_APP_KEY]: previousOpen,
      [LABVIEW_CLI_INI_AFTER_LAUNCH_KEY]: previousAfter
    },
    currentValues: {
      [LABVIEW_CLI_INI_OPEN_APP_KEY]: requestedValue,
      [LABVIEW_CLI_INI_AFTER_LAUNCH_KEY]: requestedValue
    },
    backupCreated
  };
}

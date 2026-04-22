import * as fsSync from 'node:fs';
import { execFileSync } from 'node:child_process';
import * as path from 'node:path';

export type ViHistoryIntegrationHostMode = 'windows' | 'linux';

export interface ViHistoryIntegrationHostStrategy {
  mode: ViHistoryIntegrationHostMode;
  reason?: string;
}

export interface InspectIntegrationHostStrategyDeps {
  existsSync?: (filePath: string) => boolean;
  windowsCodeAlreadyRunning?: () => boolean;
}

export interface CollectMissingLinuxSharedLibrariesDeps {
  readdirSync?: typeof fsSync.readdirSync;
  statSync?: typeof fsSync.statSync;
  execFileSync?: typeof execFileSync;
}

export interface ResolveStandardWindowsCodeCliPathDeps {
  existsSync?: (filePath: string) => boolean;
}

export const VI_HISTORY_SUITE_LINUX_BOOTSTRAP_COMMAND =
  'npm run public:host:bootstrap-linux';

export const VI_HISTORY_SUITE_LINUX_RUNTIME_PACKAGES = {
  debian: [
    'libasound2',
    'libatk1.0-0',
    'libatk-bridge2.0-0',
    'libatspi2.0-0',
    'libdbus-1-3',
    'libgbm1',
    'libgtk-3-0',
    'libnspr4',
    'libnss3',
    'libsecret-1-0',
    'libsoup-3.0-0',
    'libwebkit2gtk-4.1-0',
    'libxcomposite1',
    'libxdamage1',
    'libxfixes3',
    'xauth',
    'libxkbcommon0',
    'libxkbfile1',
    'libxrandr2',
    'xvfb'
  ],
  ubuntu: [
    'libnspr4',
    'libnss3',
    'libasound2t64',
    'libatk1.0-0',
    'libatk-bridge2.0-0',
    'libatspi2.0-0',
    'libdbus-1-3',
    'libgbm1',
    'libgtk-3-0',
    'libsecret-1-0',
    'libsoup-3.0-0',
    'libwebkit2gtk-4.1-0',
    'libxcomposite1',
    'libxdamage1',
    'libxfixes3',
    'xauth',
    'libxkbcommon0',
    'libxkbfile1',
    'libxrandr2',
    'xvfb'
  ]
} as const;

function toWslMountedPath(windowsPath: string): string {
  const normalized = windowsPath.replace(/\\/g, '/');
  const driveMatch = /^([A-Za-z]):(.*)$/.exec(normalized);
  if (!driveMatch) {
    return normalized;
  }

  return `/mnt/${driveMatch[1].toLowerCase()}${driveMatch[2]}`;
}

export function resolveStandardWindowsCodeCliPath(
  platform = process.platform,
  localAppData = process.env.LOCALAPPDATA,
  deps: ResolveStandardWindowsCodeCliPathDeps = {}
): string {
  const existsSync = deps.existsSync ?? fsSync.existsSync;
  const normalizedLocalAppData =
    localAppData?.trim().replace(/\//g, '\\') || 'C:\\Users\\sveld\\AppData\\Local';
  const windowsCandidates = [
    'C:\\Program Files\\Microsoft VS Code\\bin\\code.cmd',
    path.win32.join(normalizedLocalAppData, 'Programs', 'Microsoft VS Code', 'bin', 'code.cmd')
  ];
  const platformCandidates =
    platform === 'win32'
      ? windowsCandidates
      : windowsCandidates.map((candidate) =>
          toWslMountedPath(candidate).replace(/\/code\.cmd$/, '/code')
        );

  return platformCandidates.find((candidate) => existsSync(candidate)) ?? platformCandidates[0];
}

export function normalizeIntegrationHostOverride(
  value: string | undefined
): 'auto' | ViHistoryIntegrationHostMode {
  const normalized = value?.trim().toLowerCase();
  if (!normalized || normalized === 'auto') {
    return 'auto';
  }

  if (normalized === 'windows' || normalized === 'linux') {
    return normalized;
  }

  throw new Error(
    `Unsupported VI_HISTORY_SUITE_INTEGRATION_HOST value: ${value}. Expected auto, windows, or linux.`
  );
}

export function inspectIntegrationHostStrategy(
  windowsCodePath: string,
  hostOverrideRaw?: string,
  deps: InspectIntegrationHostStrategyDeps = {}
): ViHistoryIntegrationHostStrategy {
  const existsSync = deps.existsSync ?? fsSync.existsSync;
  const windowsCodeAlreadyRunning = deps.windowsCodeAlreadyRunning ?? (() => false);
  const hostOverride = normalizeIntegrationHostOverride(hostOverrideRaw);

  if (hostOverride === 'linux') {
    return {
      mode: 'linux',
      reason: 'env-override-linux'
    };
  }

  if (hostOverride === 'windows') {
    return {
      mode: 'windows',
      reason: 'env-override-windows'
    };
  }

  if (!existsSync(windowsCodePath)) {
    return { mode: 'linux' };
  }

  if (windowsCodeAlreadyRunning()) {
    return {
      mode: 'linux',
      reason: 'windows-vscode-instance-already-running'
    };
  }

  return { mode: 'windows' };
}

export function collectMissingLinuxSharedLibraries(
  runtimeRoot: string,
  deps: CollectMissingLinuxSharedLibrariesDeps = {}
): string[] {
  const readdirSyncImpl = deps.readdirSync ?? fsSync.readdirSync;
  const statSyncImpl = deps.statSync ?? fsSync.statSync;
  const execFileSyncImpl = deps.execFileSync ?? execFileSync;
  const targets: string[] = [];
  const stack = [runtimeRoot];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      continue;
    }

    for (const entry of readdirSyncImpl(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }

      if (!shouldCheckLinuxRuntimeDependency(entry.name)) {
        continue;
      }

      const stats = statSyncImpl(fullPath);
      if (!stats.isFile()) {
        continue;
      }
      if (!isElfBinary(fullPath)) {
        continue;
      }

      targets.push(fullPath);
    }
  }

  const missingLibraries = new Set<string>();
  for (const target of targets) {
    let output = '';
    try {
      output = execFileSyncImpl('ldd', [target], {
        encoding: 'utf8'
      });
    } catch (error) {
      const details =
        error instanceof Error
          ? `${error.message}\n${String((error as { stderr?: unknown }).stderr ?? '')}`
          : String(error);
      if (details.includes('not a dynamic executable')) {
        continue;
      }
      throw error;
    }
    for (const line of output.split(/\r?\n/)) {
      if (!line.includes('=> not found')) {
        continue;
      }
      missingLibraries.add(line.trim().split(' => ')[0] ?? line.trim());
    }
  }

  return Array.from(missingLibraries).sort((left, right) => left.localeCompare(right));
}

export function assertLinuxVsCodeRuntimeReady(
  vscodeExecutablePath: string,
  deps: CollectMissingLinuxSharedLibrariesDeps = {}
): void {
  const runtimeRoot = path.dirname(vscodeExecutablePath);
  const missingLibraries = collectMissingLinuxSharedLibraries(runtimeRoot, deps);
  if (missingLibraries.length === 0) {
    return;
  }

  throw new Error(
    [
      `The Linux VS Code test host is missing native libraries: ${missingLibraries.join(', ')}.`,
      `Run ${VI_HISTORY_SUITE_LINUX_BOOTSTRAP_COMMAND}`,
      `Expected Debian packages: ${VI_HISTORY_SUITE_LINUX_RUNTIME_PACKAGES.debian.join(', ')}.`,
      `Expected Ubuntu packages: ${VI_HISTORY_SUITE_LINUX_RUNTIME_PACKAGES.ubuntu.join(', ')}.`
    ].join(' ')
  );
}

function shouldCheckLinuxRuntimeDependency(fileName: string): boolean {
  return (
    fileName === 'code' ||
    fileName.endsWith('.node') ||
    fileName.includes('.so')
  );
}

function isElfBinary(filePath: string): boolean {
  try {
    const fileHandle = fsSync.openSync(filePath, 'r');
    try {
      const header = Buffer.alloc(4);
      const bytesRead = fsSync.readSync(fileHandle, header, 0, header.length, 0);
      return (
        bytesRead === 4 &&
        header[0] === 0x7f &&
        header[1] === 0x45 &&
        header[2] === 0x4c &&
        header[3] === 0x46
      );
    } finally {
      fsSync.closeSync(fileHandle);
    }
  } catch {
    return false;
  }
}

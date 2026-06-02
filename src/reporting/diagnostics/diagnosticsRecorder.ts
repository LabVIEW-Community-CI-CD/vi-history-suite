import { createHash } from 'node:crypto';
import * as fsSync from 'node:fs';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { ComparisonReportPacketRecord } from '../comparisonReportPacket';
import {
  ObserveWindowsProcessesOptions,
  ObserveWindowsTcpListenersOptions,
  RuntimeProcessObservation,
  WindowsTcpListenerObservation
} from '../comparisonReportRuntimeExecution';

export const DIAGNOSTICS_SCHEMA_VERSION = 1;

export const DIAGNOSTICS_DIRECTORY_NAME = 'diagnostics';
export const DIAGNOSTICS_MANIFEST_FILENAME = 'diagnostics-manifest.json';
export const ENVIRONMENT_FINGERPRINT_FILENAME = 'environment-fingerprint.json';
export const PRE_LAUNCH_BASELINE_FILENAME = 'pre-launch-baseline.json';
export const FAILURE_CLASSIFICATION_FILENAME = 'failure-classification.json';
export const ATTEMPT_DIRECTORY_PREFIX = 'attempt-';

export interface DiagnosticsRecorderDeps {
  mkdir?: typeof fs.mkdir;
  writeFile?: typeof fs.writeFile;
  readFile?: typeof fs.readFile;
  stat?: typeof fs.stat;
  processPlatform?: NodeJS.Platform;
  nowIso?: () => string;
  observeWindowsProcesses?: (
    options: ObserveWindowsProcessesOptions
  ) => Promise<RuntimeProcessObservation | undefined>;
  observeWindowsTcpListeners?: (
    options: ObserveWindowsTcpListenersOptions
  ) => Promise<WindowsTcpListenerObservation[]>;
  /** Optional override exposing extension version (defaults to package.json read). */
  resolveExtensionVersion?: () => string | undefined;
}

export interface EnvironmentFingerprint {
  schemaVersion: number;
  capturedAt: string;
  extensionVersion?: string;
  os: {
    platform: NodeJS.Platform;
    release: string;
    arch: string;
    hostname?: string;
  };
  node: {
    version: string;
  };
  reportingProvider?: {
    provider?: string;
    engine?: string;
    bitness?: string;
    platform?: string;
  };
  toolchain?: {
    labviewExecutablePath?: string;
    labviewExecutableMtime?: string;
    labviewCliExecutablePath?: string;
    labviewCliExecutableMtime?: string;
    lvCompareExecutablePath?: string;
    lvCompareExecutableMtime?: string;
    labviewIniPath?: string;
    labviewIniMtime?: string;
    labviewIniSha256?: string;
    labviewIniStartupKeys?: Record<string, string | undefined>;
    labviewTcpPort?: number;
  };
}

export interface PreLaunchBaselineSnapshot {
  schemaVersion: number;
  capturedAt: string;
  attemptIndex: number;
  hostPlatform: NodeJS.Platform;
  applicable: boolean;
  notApplicableReason?: string;
  processObservation?: RuntimeProcessObservation;
  listenerObservations?: WindowsTcpListenerObservation[];
  observedListenerOnRequestedPort?: boolean;
  requestedTcpPort?: number;
}

export interface FailureClassificationRecord {
  schemaVersion: number;
  capturedAt: string;
  attemptIndex: number;
  failureReason: string;
  diagnosticReason?: string;
  exitCode?: number;
  signal?: string;
  durationMs?: number;
  matchedFragment?: string;
  matchedFragmentSource?: 'stdout' | 'stderr' | 'diagnostic-log';
  artifactPaths: {
    stdout?: string;
    stderr?: string;
    diagnosticLog?: string;
    processObservation?: string;
  };
}

export interface DiagnosticsManifestEntry {
  kind: string;
  filename: string;
  filePath: string;
  attemptIndex?: number;
}

export interface DiagnosticsManifest {
  schemaVersion: number;
  generatedAt: string;
  reportDirectory: string;
  diagnosticsDirectory: string;
  analysisHint: string;
  entries: DiagnosticsManifestEntry[];
}

export interface DiagnosticsRecorder {
  recordEnvironmentFingerprint(record: ComparisonReportPacketRecord): Promise<void>;
  recordPreLaunchBaseline(
    record: ComparisonReportPacketRecord,
    attemptIndex: number,
    options?: { requestedTcpPort?: number }
  ): Promise<void>;
  recordFailureClassification(
    record: ComparisonReportPacketRecord,
    attemptIndex: number,
    classification: Omit<FailureClassificationRecord, 'schemaVersion' | 'capturedAt' | 'attemptIndex'>
  ): Promise<void>;
  archiveAttemptArtifacts(
    record: ComparisonReportPacketRecord,
    attemptIndex: number
  ): Promise<void>;
  flushManifest(record: ComparisonReportPacketRecord): Promise<void>;
}

const ANALYSIS_HINT =
  'Open this manifest first, then read environment-fingerprint.json, the listed attempt-* baselines, runtime-stdout.txt / runtime-stderr.txt / runtime-diagnostic-log.txt, runtime-process-observation.json, and any failure-classification.json. The schemaVersion field gates format changes.';

const NOOP_RECORDER: DiagnosticsRecorder = {
  async recordEnvironmentFingerprint() {
    /* no-op */
  },
  async recordPreLaunchBaseline() {
    /* no-op */
  },
  async recordFailureClassification() {
    /* no-op */
  },
  async archiveAttemptArtifacts() {
    /* no-op */
  },
  async flushManifest() {
    /* no-op */
  }
};

export function noopDiagnosticsRecorder(): DiagnosticsRecorder {
  return NOOP_RECORDER;
}

export function attemptDirectoryPath(reportDirectory: string, attemptIndex: number): string {
  if (!Number.isInteger(attemptIndex) || attemptIndex < 1) {
    throw new Error('attemptIndex must be a positive integer');
  }
  return path.join(
    reportDirectory,
    DIAGNOSTICS_DIRECTORY_NAME,
    `${ATTEMPT_DIRECTORY_PREFIX}${attemptIndex}`
  );
}

export function diagnosticsDirectoryPath(reportDirectory: string): string {
  return path.join(reportDirectory, DIAGNOSTICS_DIRECTORY_NAME);
}

export function diagnosticsManifestFilePath(reportDirectory: string): string {
  return path.join(reportDirectory, DIAGNOSTICS_DIRECTORY_NAME, DIAGNOSTICS_MANIFEST_FILENAME);
}

export function environmentFingerprintFilePath(reportDirectory: string): string {
  return path.join(reportDirectory, DIAGNOSTICS_DIRECTORY_NAME, ENVIRONMENT_FINGERPRINT_FILENAME);
}

export function createDiagnosticsRecorder(deps: DiagnosticsRecorderDeps = {}): DiagnosticsRecorder {
  const mkdir = deps.mkdir ?? fs.mkdir;
  const writeFile = deps.writeFile ?? fs.writeFile;
  const readFile = deps.readFile ?? fs.readFile;
  const stat = deps.stat ?? fs.stat;
  const processPlatform = deps.processPlatform ?? process.platform;
  const nowIso = deps.nowIso ?? (() => new Date().toISOString());
  const observeWindowsProcesses = deps.observeWindowsProcesses;
  const observeWindowsTcpListeners = deps.observeWindowsTcpListeners;
  const resolveExtensionVersion = deps.resolveExtensionVersion ?? readBundledExtensionVersion;

  const manifestEntries = new Map<string, DiagnosticsManifestEntry>();

  const registerEntry = (entry: DiagnosticsManifestEntry) => {
    manifestEntries.set(entry.filePath, entry);
  };

  const safeWriteJson = async (filePath: string, value: unknown): Promise<boolean> => {
    try {
      await mkdir(path.dirname(filePath), { recursive: true });
      await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
      return true;
    } catch {
      return false;
    }
  };

  const captureFileFingerprint = async (
    filePath: string | undefined
  ): Promise<{ mtime?: string; sha256?: string }> => {
    if (!filePath) {
      return {};
    }
    const result: { mtime?: string; sha256?: string } = {};
    try {
      const fileStat = await stat(filePath);
      if (fileStat?.mtime) {
        result.mtime = new Date(fileStat.mtime).toISOString();
      }
    } catch {
      /* ignore */
    }
    return result;
  };

  const captureIniFingerprint = async (
    filePath: string | undefined
  ): Promise<{
    mtime?: string;
    sha256?: string;
    startupKeys?: Record<string, string | undefined>;
  }> => {
    if (!filePath) {
      return {};
    }
    const out: {
      mtime?: string;
      sha256?: string;
      startupKeys?: Record<string, string | undefined>;
    } = {};
    try {
      const fileStat = await stat(filePath);
      if (fileStat?.mtime) {
        out.mtime = new Date(fileStat.mtime).toISOString();
      }
    } catch {
      /* ignore */
    }
    try {
      const buffer = await readFile(filePath);
      const bytes = typeof buffer === 'string' ? Buffer.from(buffer, 'utf8') : Buffer.from(buffer);
      out.sha256 = createHash('sha256').update(bytes).digest('hex');
      out.startupKeys = extractLabviewIniStartupKeys(bytes.toString('utf8'));
    } catch {
      /* ignore */
    }
    return out;
  };

  return {
    async recordEnvironmentFingerprint(record) {
      try {
        const runtime = record.runtimeExecution ?? ({} as ComparisonReportPacketRecord['runtimeExecution']);
        const selection = record.runtimeSelection;
        const labviewExe = selection?.labviewExe?.path;
        const labviewCliExe = selection?.labviewCli?.path;
        const lvCompareExe = selection?.lvCompare?.path;
        const labviewIni = runtime?.labviewIniPath ?? selection?.hostLabviewIniPath;

        const [
          labviewExeFp,
          labviewCliExeFp,
          lvCompareExeFp,
          labviewIniFp
        ] = await Promise.all([
          captureFileFingerprint(labviewExe),
          captureFileFingerprint(labviewCliExe),
          captureFileFingerprint(lvCompareExe),
          captureIniFingerprint(labviewIni)
        ]);

        const fingerprint: EnvironmentFingerprint = {
          schemaVersion: DIAGNOSTICS_SCHEMA_VERSION,
          capturedAt: nowIso(),
          extensionVersion: resolveExtensionVersion(),
          os: {
            platform: processPlatform,
            release: safeOsRelease(),
            arch: process.arch,
            hostname: safeHostname()
          },
          node: {
            version: process.version
          },
          reportingProvider: {
            provider: selection?.provider,
            engine: selection?.engine,
            bitness: selection?.bitness,
            platform: selection?.platform
          },
          toolchain: {
            labviewExecutablePath: labviewExe,
            labviewExecutableMtime: labviewExeFp.mtime,
            labviewCliExecutablePath: labviewCliExe,
            labviewCliExecutableMtime: labviewCliExeFp.mtime,
            lvCompareExecutablePath: lvCompareExe,
            lvCompareExecutableMtime: lvCompareExeFp.mtime,
            labviewIniPath: labviewIni,
            labviewIniMtime: labviewIniFp.mtime,
            labviewIniSha256: labviewIniFp.sha256,
            labviewIniStartupKeys: labviewIniFp.startupKeys,
            labviewTcpPort: runtime?.labviewTcpPort ?? selection?.hostLabviewTcpPort
          }
        };

        const filePath = environmentFingerprintFilePath(record.artifactPlan.reportDirectory);
        const ok = await safeWriteJson(filePath, fingerprint);
        if (ok) {
          registerEntry({
            kind: 'environment-fingerprint',
            filename: ENVIRONMENT_FINGERPRINT_FILENAME,
            filePath
          });
        }
      } catch {
        /* never fail compare on diagnostics errors */
      }
    },

    async recordPreLaunchBaseline(record, attemptIndex, options) {
      try {
        const requestedPort = options?.requestedTcpPort;
        const baselineDir = attemptDirectoryPath(
          record.artifactPlan.reportDirectory,
          attemptIndex
        );
        const filePath = path.join(baselineDir, PRE_LAUNCH_BASELINE_FILENAME);

        const isWindowsHost =
          processPlatform === 'win32' && record.runtimeSelection.provider === 'host-native';

        if (!isWindowsHost || !observeWindowsProcesses) {
          const snapshot: PreLaunchBaselineSnapshot = {
            schemaVersion: DIAGNOSTICS_SCHEMA_VERSION,
            capturedAt: nowIso(),
            attemptIndex,
            hostPlatform: processPlatform,
            applicable: false,
            notApplicableReason: !isWindowsHost
              ? 'baseline-only-applies-to-windows-host-native'
              : 'observeWindowsProcesses-not-injected',
            requestedTcpPort: requestedPort
          };
          const ok = await safeWriteJson(filePath, snapshot);
          if (ok) {
            registerEntry({
              kind: 'pre-launch-baseline',
              filename: PRE_LAUNCH_BASELINE_FILENAME,
              filePath,
              attemptIndex
            });
          }
          return;
        }

        let processObservation: RuntimeProcessObservation | undefined;
        try {
          processObservation = await observeWindowsProcesses({
            hostPlatform: processPlatform,
            runtimePlatform: 'win32',
            trigger: 'pre-launch-baseline'
          });
        } catch {
          /* ignore */
        }

        let listenerObservations: WindowsTcpListenerObservation[] = [];
        if (observeWindowsTcpListeners && requestedPort && requestedPort > 0) {
          try {
            listenerObservations = await observeWindowsTcpListeners({
              hostPlatform: processPlatform,
              runtimePlatform: 'win32',
              localPorts: [requestedPort]
            });
          } catch {
            /* ignore */
          }
        }

        const observedListenerOnRequestedPort =
          requestedPort != null
            ? listenerObservations.some((entry) => entry.localPort === requestedPort)
            : undefined;

        const snapshot: PreLaunchBaselineSnapshot = {
          schemaVersion: DIAGNOSTICS_SCHEMA_VERSION,
          capturedAt: nowIso(),
          attemptIndex,
          hostPlatform: processPlatform,
          applicable: true,
          processObservation,
          listenerObservations,
          observedListenerOnRequestedPort,
          requestedTcpPort: requestedPort
        };
        const ok = await safeWriteJson(filePath, snapshot);
        if (ok) {
          registerEntry({
            kind: 'pre-launch-baseline',
            filename: PRE_LAUNCH_BASELINE_FILENAME,
            filePath,
            attemptIndex
          });
        }
      } catch {
        /* never fail compare on diagnostics errors */
      }
    },

    async recordFailureClassification(record, attemptIndex, classification) {
      try {
        const dir = attemptDirectoryPath(record.artifactPlan.reportDirectory, attemptIndex);
        const filePath = path.join(dir, FAILURE_CLASSIFICATION_FILENAME);
        let { matchedFragment, matchedFragmentSource } = classification;
        if (!matchedFragment) {
          const extracted = await extractFailureFragment(
            classification.failureReason,
            classification.artifactPaths,
            readFile
          );
          if (extracted) {
            matchedFragment = extracted.fragment;
            matchedFragmentSource = extracted.source;
          }
        }
        const payload: FailureClassificationRecord = {
          schemaVersion: DIAGNOSTICS_SCHEMA_VERSION,
          capturedAt: nowIso(),
          attemptIndex,
          ...classification,
          matchedFragment: clampFragment(matchedFragment),
          matchedFragmentSource
        };
        const ok = await safeWriteJson(filePath, payload);
        if (ok) {
          registerEntry({
            kind: 'failure-classification',
            filename: FAILURE_CLASSIFICATION_FILENAME,
            filePath,
            attemptIndex
          });
        }
      } catch {
        /* never fail compare on diagnostics errors */
      }
    },

    async archiveAttemptArtifacts(record, attemptIndex) {
      try {
        const reportDir = record.artifactPlan.reportDirectory;
        const attemptDir = attemptDirectoryPath(reportDir, attemptIndex);
        try {
          await mkdir(attemptDir, { recursive: true });
        } catch {
          return;
        }

        const plan = record.artifactPlan;
        const targets: Array<{ kind: string; sourcePath: string }> = [
          { kind: 'runtime-stdout', sourcePath: plan.runtimeStdoutFilePath },
          { kind: 'runtime-stderr', sourcePath: plan.runtimeStderrFilePath },
          { kind: 'runtime-diagnostic-log', sourcePath: plan.runtimeDiagnosticLogFilePath },
          { kind: 'runtime-process-observation', sourcePath: plan.runtimeProcessObservationFilePath }
        ];

        for (const target of targets) {
          const filename = path.basename(target.sourcePath);
          const destPath = path.join(attemptDir, filename);
          let copied = false;
          try {
            const data = await readFile(target.sourcePath);
            const buffer = typeof data === 'string' ? Buffer.from(data, 'utf8') : Buffer.from(data);
            await writeFile(destPath, buffer);
            copied = true;
          } catch {
            /* source missing or unreadable — skip silently */
          }
          if (copied) {
            registerEntry({
              kind: target.kind,
              filename,
              filePath: destPath,
              attemptIndex
            });
          }
        }
      } catch {
        /* never fail compare on diagnostics errors */
      }
    },

    async flushManifest(record) {
      try {
        const reportDir = record.artifactPlan.reportDirectory;
        const diagnosticsDir = diagnosticsDirectoryPath(reportDir);
        registerExistingArtifact(manifestEntries, record);

        const manifest: DiagnosticsManifest = {
          schemaVersion: DIAGNOSTICS_SCHEMA_VERSION,
          generatedAt: nowIso(),
          reportDirectory: reportDir,
          diagnosticsDirectory: diagnosticsDir,
          analysisHint: ANALYSIS_HINT,
          entries: Array.from(manifestEntries.values()).sort(compareManifestEntries)
        };
        await safeWriteJson(diagnosticsManifestFilePath(reportDir), manifest);
      } catch {
        /* never fail compare on diagnostics errors */
      }
    }
  };
}

function registerExistingArtifact(
  entries: Map<string, DiagnosticsManifestEntry>,
  record: ComparisonReportPacketRecord
): void {
  const plan = record.artifactPlan;
  const candidates: DiagnosticsManifestEntry[] = [
    {
      kind: 'runtime-stdout',
      filename: path.basename(plan.runtimeStdoutFilePath),
      filePath: plan.runtimeStdoutFilePath
    },
    {
      kind: 'runtime-stderr',
      filename: path.basename(plan.runtimeStderrFilePath),
      filePath: plan.runtimeStderrFilePath
    },
    {
      kind: 'runtime-diagnostic-log',
      filename: path.basename(plan.runtimeDiagnosticLogFilePath),
      filePath: plan.runtimeDiagnosticLogFilePath
    },
    {
      kind: 'runtime-process-observation',
      filename: path.basename(plan.runtimeProcessObservationFilePath),
      filePath: plan.runtimeProcessObservationFilePath
    },
    {
      kind: 'report-metadata',
      filename: path.basename(plan.metadataFilePath),
      filePath: plan.metadataFilePath
    },
    {
      kind: 'report-packet',
      filename: path.basename(plan.packetFilePath),
      filePath: plan.packetFilePath
    }
  ];
  for (const entry of candidates) {
    if (!entries.has(entry.filePath)) {
      entries.set(entry.filePath, entry);
    }
  }
}

function compareManifestEntries(
  a: DiagnosticsManifestEntry,
  b: DiagnosticsManifestEntry
): number {
  const attemptDelta = (a.attemptIndex ?? 0) - (b.attemptIndex ?? 0);
  if (attemptDelta !== 0) {
    return attemptDelta;
  }
  if (a.kind !== b.kind) {
    return a.kind.localeCompare(b.kind);
  }
  return a.filename.localeCompare(b.filename);
}

const STARTUP_KEY_NAMES = new Set(
  [
    'server.tcp.enabled',
    'server.tcp.port',
    'server.tcp.serviceName',
    'LoadAddOns',
    'RestoreOnLaunch',
    'showWelcomeOnLaunch',
    'autoLoadProject',
    'recentProjectsListSize'
  ].map((key) => key.toLowerCase())
);

function extractLabviewIniStartupKeys(content: string): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const rawLine of content.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith(';') || line.startsWith('[')) {
      continue;
    }
    const eq = line.indexOf('=');
    if (eq <= 0) {
      continue;
    }
    const key = line.slice(0, eq).trim();
    if (!STARTUP_KEY_NAMES.has(key.toLowerCase())) {
      continue;
    }
    out[key] = line.slice(eq + 1).trim() || undefined;
  }
  return out;
}

function clampFragment(value: string | undefined): string | undefined {
  if (!value) {
    return value;
  }
  if (value.length <= 500) {
    return value;
  }
  return `${value.slice(0, 500)}…`;
}

const FAILURE_REASON_ANCHORS: Record<string, RegExp> = {
  'labview-cli-connection-failed': /Error code\s*:\s*-350000\b/i,
  'password-protected-vi': /Password[- ]protected/i,
  'command-timed-out': /timed out/i
};

async function extractFailureFragment(
  failureReason: string | undefined,
  artifactPaths: FailureClassificationRecord['artifactPaths'] | undefined,
  readFile: (filePath: string) => Promise<string | Buffer>
): Promise<{ fragment: string; source: 'stdout' | 'stderr' | 'diagnostic-log' } | undefined> {
  if (!failureReason || !artifactPaths) {
    return undefined;
  }
  const anchor = FAILURE_REASON_ANCHORS[failureReason];
  if (!anchor) {
    return undefined;
  }
  const sources: Array<{ source: 'stdout' | 'stderr' | 'diagnostic-log'; filePath?: string }> = [
    { source: 'stderr', filePath: artifactPaths.stderr },
    { source: 'diagnostic-log', filePath: artifactPaths.diagnosticLog },
    { source: 'stdout', filePath: artifactPaths.stdout }
  ];
  for (const candidate of sources) {
    if (!candidate.filePath) {
      continue;
    }
    let text: string;
    try {
      const data = await readFile(candidate.filePath);
      text = typeof data === 'string' ? data : data.toString('utf8');
    } catch {
      continue;
    }
    const match = anchor.exec(text);
    if (!match || match.index == null) {
      continue;
    }
    const start = Math.max(0, match.index - 100);
    const end = Math.min(text.length, match.index + match[0].length + 200);
    return { fragment: text.slice(start, end).trim(), source: candidate.source };
  }
  return undefined;
}

function safeOsRelease(): string {
  try {
    return os.release();
  } catch {
    return 'unknown';
  }
}

function safeHostname(): string | undefined {
  try {
    return os.hostname();
  } catch {
    return undefined;
  }
}

function readBundledExtensionVersion(): string | undefined {
  try {
    const candidate = path.join(__dirname, '..', '..', 'package.json');
    if (!fsSync.existsSync(candidate)) {
      return undefined;
    }
    const raw = fsSync.readFileSync(candidate, 'utf8');
    const parsed = JSON.parse(raw) as { version?: unknown };
    return typeof parsed.version === 'string' ? parsed.version : undefined;
  } catch {
    return undefined;
  }
}

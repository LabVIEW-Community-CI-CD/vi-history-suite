import * as fs from 'node:fs/promises';
import { spawn } from 'node:child_process';
import * as path from 'node:path';

import {
  buildDesignGatePlan,
  defaultAssuranceScriptPath,
  defaultAssuranceScriptPathCandidates,
  designGateAssuranceMirrorRoot,
  designGateAssuranceMirrorScriptPath,
  designGateCoverageSummaryPath,
  designGateDevelopmentQueuePath,
  DesignGateReport,
  DesignGateStepResult,
  DevelopmentQueueEntry,
  designGateReportJsonPath,
  designGateReportMarkdownPath,
  extractAssuranceGateSummary,
  extractWeakestCoverageFocus,
  isMountedWindowsPath,
  renderDesignGateMarkdown,
  selectNextDevelopmentTranche
} from './designGate';

export interface DesignGateRunnerDeps {
  now?: () => string;
  runStep?: DesignGateStepExecutor;
  readFile?: (filePath: string, encoding: BufferEncoding) => Promise<string>;
  mkdir?: (directoryPath: string, options?: { recursive?: boolean }) => Promise<void>;
  writeFile?: (filePath: string, contents: string) => Promise<void>;
  access?: typeof fs.access;
  realpath?: typeof fs.realpath;
  copyDirectory?: typeof fs.cp;
  assuranceScriptCandidates?: string[];
  env?: NodeJS.ProcessEnv;
}

export interface DesignGateStepSpawnDeps {
  spawnImpl?: typeof spawn;
  stdout?: Pick<NodeJS.WriteStream, 'write'>;
  stderr?: Pick<NodeJS.WriteStream, 'write'>;
  nowMs?: () => number;
  timeoutMs?: number;
  setTimeoutImpl?: typeof setTimeout;
  clearTimeoutImpl?: typeof clearTimeout;
}

export type DesignGateStepExecutor = (
  command: string,
  args: string[],
  cwd: string,
  id: string,
  title: string
) => Promise<DesignGateStepResult>;

export async function runDesignGate(
  repoRoot: string,
  deps: DesignGateRunnerDeps = {}
): Promise<DesignGateReport> {
  const assuranceScriptPath = await resolveDesignGateAssuranceScriptPath(repoRoot, deps);
  const steps = buildDesignGatePlan(repoRoot, assuranceScriptPath);
  const results: DesignGateStepResult[] = [];
  let status: 'pass' | 'fail' = 'pass';
  let assuranceGateSummary: string | undefined;

  for (const step of steps) {
    const stepIndex = results.length;
    const result = deps.runStep
      ? await deps.runStep(step.command, step.args, repoRoot, step.id, step.title)
      : await spawnDesignGateStep(step.command, step.args, repoRoot, step.id, step.title, {
          timeoutMs: step.timeoutMs
        });
    results.push(result);

    if (step.id === 'standards-assurance') {
      assuranceGateSummary = extractAssuranceGateSummary(result.stdout);
    }

    if (result.exitCode !== 0) {
      status = 'fail';
      break;
    }

    const nextPendingStep = steps[stepIndex + 1];
    if (nextPendingStep) {
      const runningReport = await buildDesignGateReport(
        repoRoot,
        status,
        assuranceGateSummary,
        results,
        deps.readFile,
        deps.now,
        'running',
        nextPendingStep
      );
      await persistDesignGateReport(repoRoot, runningReport, deps.mkdir, deps.writeFile);
    }
  }

  const report = await buildDesignGateReport(
    repoRoot,
    status,
    assuranceGateSummary,
    results,
    deps.readFile,
    deps.now,
    'complete'
  );
  await persistDesignGateReport(repoRoot, report, deps.mkdir, deps.writeFile);
  return report;
}

export async function resolveDesignGateAssuranceScriptPath(
  repoRoot: string,
  deps: Pick<
    DesignGateRunnerDeps,
    'access' | 'realpath' | 'mkdir' | 'copyDirectory' | 'assuranceScriptCandidates' | 'env'
  > = {}
): Promise<string> {
  const access = deps.access ?? fs.access;
  const realpath = deps.realpath ?? fs.realpath;
  const mkdir = deps.mkdir ?? defaultMkdir;
  const copyDirectory = deps.copyDirectory ?? fs.cp;
  const env = deps.env ?? process.env;
  const explicitScriptPath = env.VI_HISTORY_SUITE_ASSURANCE_SCRIPT?.trim();
  const mirrorScriptPath = designGateAssuranceMirrorScriptPath(repoRoot);

  if (explicitScriptPath && (await pathIsAccessible(explicitScriptPath, access))) {
    return explicitScriptPath;
  }

  if (await pathIsAccessible(mirrorScriptPath, access)) {
    return mirrorScriptPath;
  }

  const candidates =
    deps.assuranceScriptCandidates ??
    defaultAssuranceScriptPathCandidates(undefined, env);
  for (const candidate of candidates) {
    if (!(await pathIsAccessible(candidate, access))) {
      continue;
    }

    const resolvedCandidate = await realpath(candidate).catch(() => path.resolve(candidate));
    if (!isMountedWindowsPath(resolvedCandidate)) {
      return resolvedCandidate;
    }

    const mirrorRoot = designGateAssuranceMirrorRoot(repoRoot);
    await mkdir(path.dirname(mirrorRoot), { recursive: true });
    await copyDirectory(path.dirname(path.dirname(resolvedCandidate)), mirrorRoot, {
      recursive: true,
      force: true
    });
    return mirrorScriptPath;
  }

  return explicitScriptPath || candidates[0] || defaultAssuranceScriptPath();
}

async function buildDesignGateReport(
  repoRoot: string,
  status: 'pass' | 'fail',
  assuranceGateSummary: string | undefined,
  results: DesignGateStepResult[],
  readFile: DesignGateRunnerDeps['readFile'],
  now: DesignGateRunnerDeps['now'],
  completionState: 'running' | 'complete',
  pendingStep?: { id: string; title: string }
): Promise<DesignGateReport> {
  const coverageFocus = await readDesignGateCoverageFocus(repoRoot, readFile);
  const nextCoverageFocusEntry =
    coverageFocus.status === 'available' && coverageFocus.entries.length > 0
      ? coverageFocus.entries[0]
      : undefined;
  const nextTranche =
    nextCoverageFocusEntry && nextCoverageFocusEntry.linesPct >= 100
      ? await readDesignGateNextTranche(repoRoot, readFile)
      : undefined;

  return {
    generatedAt: (now ?? defaultNow)(),
    repoRoot,
    status,
    completionState,
    pendingStepId: completionState === 'running' ? pendingStep?.id : undefined,
    pendingStepTitle: completionState === 'running' ? pendingStep?.title : undefined,
    assuranceGateSummary,
    coverageFocus: coverageFocus.status === 'available' ? coverageFocus.entries : undefined,
    coverageFocusUnavailableReason:
      coverageFocus.status === 'unavailable' ? coverageFocus.reason : undefined,
    nextFocus:
      nextCoverageFocusEntry && nextCoverageFocusEntry.linesPct < 100
        ? `${nextCoverageFocusEntry.relativePath} (${nextCoverageFocusEntry.linesPct.toFixed(1)}% lines)`
        : undefined,
    nextTranche: nextTranche?.status === 'available' ? `${nextTranche.entry.id}: ${nextTranche.entry.title}` : undefined,
    nextTrancheUnavailableReason:
      nextTranche?.status === 'unavailable' ? nextTranche.reason : undefined,
    steps: [...results]
  };
}

export async function readDesignGateNextTranche(
  repoRoot: string,
  readFile: DesignGateRunnerDeps['readFile'] = defaultReadFile
): Promise<
  | { status: 'available'; entry: DevelopmentQueueEntry }
  | { status: 'unavailable'; reason: string }
> {
  const queuePath = designGateDevelopmentQueuePath(repoRoot);

  try {
    const queueText = await readFile(queuePath, 'utf8');
    const parsed = JSON.parse(queueText) as DevelopmentQueueEntry[];
    const entry = selectNextDevelopmentTranche(parsed);
    if (!entry) {
      return {
        status: 'unavailable',
        reason: `no-active-or-queued-development-tranche:${queuePath}`
      };
    }

    return {
      status: 'available',
      entry
    };
  } catch (error) {
    return {
      status: 'unavailable',
      reason: `development-queue-unavailable:${queuePath}:${String(error)}`
    };
  }
}

export async function readDesignGateCoverageFocus(
  repoRoot: string,
  readFile: DesignGateRunnerDeps['readFile'] = defaultReadFile
): Promise<
  | { status: 'available'; entries: ReturnType<typeof extractWeakestCoverageFocus> }
  | { status: 'unavailable'; reason: string }
> {
  const coverageSummaryPath = designGateCoverageSummaryPath(repoRoot);

  try {
    const coverageSummaryText = await readFile(coverageSummaryPath, 'utf8');
    const entries = extractWeakestCoverageFocus(repoRoot, coverageSummaryText);

    if (entries.length === 0) {
      return {
        status: 'unavailable',
        reason: `no-src-coverage-entries:${coverageSummaryPath}`
      };
    }

    return {
      status: 'available',
      entries
    };
  } catch (error) {
    return {
      status: 'unavailable',
      reason: `coverage-summary-unavailable:${coverageSummaryPath}:${String(error)}`
    };
  }
}

export async function persistDesignGateReport(
  repoRoot: string,
  report: DesignGateReport,
  mkdir: DesignGateRunnerDeps['mkdir'] = defaultMkdir,
  writeFile: DesignGateRunnerDeps['writeFile'] = defaultWriteFile
): Promise<void> {
  await mkdir(path.dirname(designGateReportJsonPath(repoRoot)), { recursive: true });
  await writeFile(designGateReportJsonPath(repoRoot), JSON.stringify(report, null, 2));
  await writeFile(designGateReportMarkdownPath(repoRoot), renderDesignGateMarkdown(report));
}

export async function spawnDesignGateStep(
  command: string,
  args: string[],
  cwd: string,
  id: string,
  title: string,
  deps: DesignGateStepSpawnDeps = {}
): Promise<DesignGateStepResult> {
  return new Promise((resolve) => {
    const nowMs = deps.nowMs ?? defaultNowMs;
    const setTimeoutImpl = deps.setTimeoutImpl ?? setTimeout;
    const clearTimeoutImpl = deps.clearTimeoutImpl ?? clearTimeout;
    const startedAt = nowMs();
    const child = (deps.spawnImpl ?? spawn)(command, args, {
      cwd,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    const stdoutWriter = deps.stdout ?? process.stdout;
    const stderrWriter = deps.stderr ?? process.stderr;

    let stdout = '';
    let stderr = '';
    let settled = false;
    const timeoutHandle =
      typeof deps.timeoutMs === 'number' && deps.timeoutMs > 0
        ? setTimeoutImpl(() => {
            if (settled) {
              return;
            }

            settled = true;
            child.kill?.('SIGKILL');
            const timeoutSummary = `design gate step timed out after ${deps.timeoutMs}ms\n`;
            stderr += timeoutSummary;
            stderrWriter.write(timeoutSummary);
            resolve({
              id,
              title,
              command,
              args,
              exitCode: 124,
              durationMs: nowMs() - startedAt,
              stdout,
              stderr
            });
          }, deps.timeoutMs)
        : undefined;

    child.stdout?.on('data', (chunk: Buffer | string) => {
      const text = String(chunk);
      stdout += text;
      stdoutWriter.write(text);
    });

    child.stderr?.on('data', (chunk: Buffer | string) => {
      const text = String(chunk);
      stderr += text;
      stderrWriter.write(text);
    });

    child.on('error', (error) => {
      if (settled) {
        return;
      }

      settled = true;
      if (timeoutHandle) {
        clearTimeoutImpl(timeoutHandle);
      }
      stderr += `${String(error)}\n`;
      resolve({
        id,
        title,
        command,
        args,
        exitCode: 1,
        durationMs: nowMs() - startedAt,
        stdout,
        stderr
      });
    });

    child.on('close', (code) => {
      if (settled) {
        return;
      }

      settled = true;
      if (timeoutHandle) {
        clearTimeoutImpl(timeoutHandle);
      }
      resolve({
        id,
        title,
        command,
        args,
        exitCode: code ?? 1,
        durationMs: nowMs() - startedAt,
        stdout,
        stderr
      });
    });
  });
}

async function pathIsAccessible(
  targetPath: string,
  access: DesignGateRunnerDeps['access'] = fs.access
): Promise<boolean> {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

function defaultNow(): string {
  return new Date().toISOString();
}

function defaultNowMs(): number {
  return Date.now();
}

async function defaultReadFile(filePath: string, encoding: BufferEncoding): Promise<string> {
  return fs.readFile(filePath, encoding);
}

async function defaultMkdir(
  directoryPath: string,
  options?: { recursive?: boolean }
): Promise<void> {
  await fs.mkdir(directoryPath, options);
}

async function defaultWriteFile(filePath: string, contents: string): Promise<void> {
  await fs.writeFile(filePath, contents);
}

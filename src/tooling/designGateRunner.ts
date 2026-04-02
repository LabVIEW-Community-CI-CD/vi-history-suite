import * as fs from 'node:fs/promises';
import { spawn } from 'node:child_process';
import * as path from 'node:path';

import {
  buildDesignGatePlan,
  designGateCoverageSummaryPath,
  designGateDevelopmentQueuePath,
  DesignGateReport,
  DesignGateStepResult,
  DevelopmentQueueEntry,
  designGateReportJsonPath,
  designGateReportMarkdownPath,
  extractAssuranceGateSummary,
  extractWeakestCoverageFocus,
  renderDesignGateMarkdown,
  selectNextDevelopmentTranche
} from './designGate';

export interface DesignGateRunnerDeps {
  now?: () => string;
  runStep?: DesignGateStepExecutor;
  readFile?: (filePath: string, encoding: BufferEncoding) => Promise<string>;
  mkdir?: (directoryPath: string, options?: { recursive?: boolean }) => Promise<void>;
  writeFile?: (filePath: string, contents: string) => Promise<void>;
}

export interface DesignGateStepSpawnDeps {
  spawnImpl?: typeof spawn;
  stdout?: Pick<NodeJS.WriteStream, 'write'>;
  stderr?: Pick<NodeJS.WriteStream, 'write'>;
  nowMs?: () => number;
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
  const steps = buildDesignGatePlan(repoRoot);
  const results: DesignGateStepResult[] = [];
  let status: 'pass' | 'fail' = 'pass';
  let assuranceGateSummary: string | undefined;

  for (const step of steps) {
    const result = await (deps.runStep ?? spawnDesignGateStep)(
      step.command,
      step.args,
      repoRoot,
      step.id,
      step.title
    );
    results.push(result);

    if (step.id === 'standards-assurance') {
      assuranceGateSummary = extractAssuranceGateSummary(result.stdout);
    }

    if (result.exitCode !== 0) {
      status = 'fail';
      break;
    }
  }

  const coverageFocus = await readDesignGateCoverageFocus(repoRoot, deps.readFile);
  const nextCoverageFocusEntry =
    coverageFocus.status === 'available' && coverageFocus.entries.length > 0
      ? coverageFocus.entries[0]
      : undefined;
  const nextTranche =
    nextCoverageFocusEntry && nextCoverageFocusEntry.linesPct >= 100
      ? await readDesignGateNextTranche(repoRoot, deps.readFile)
      : undefined;

  const report: DesignGateReport = {
    generatedAt: (deps.now ?? defaultNow)(),
    repoRoot,
    status,
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
    steps: results
  };

  await persistDesignGateReport(repoRoot, report, deps.mkdir, deps.writeFile);
  return report;
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

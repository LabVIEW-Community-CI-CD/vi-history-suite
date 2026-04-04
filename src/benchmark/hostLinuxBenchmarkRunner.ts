import { ChildProcess, spawn, spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';

import { HARNESS_VHS_002 } from '../harness/canonicalHarnesses';

const HOST_BENCHMARK_CONTAINER_NAME = 'vihs-host-linux-benchmark';
const HOST_BENCHMARK_IMAGE_OVERRIDE_ENV_VAR = 'VIHS_HOST_LINUX_BENCHMARK_IMAGE';
const HOST_BENCHMARK_DEFAULT_IMAGE =
  'ghcr.io/svelderrainruiz/vi-history-suite-source-experiments/linux-dashboard-benchmark:main';
const HOST_BENCHMARK_LAUNCH_ROOT_RELATIVE_PATH = path.join(
  '.cache',
  'host-linux-dashboard-benchmark'
);
const HOST_BENCHMARK_LAUNCH_RECEIPT_RELATIVE_PATH = path.join(
  HOST_BENCHMARK_LAUNCH_ROOT_RELATIVE_PATH,
  'latest-launch.json'
);
const HOST_BENCHMARK_WORKSPACE_STAGE_DIRECTORY_NAME = 'workspace-stage';
const HOST_BENCHMARK_STAGED_WORKSPACE_DIRECTORY_NAME = 'current';
const HOST_BENCHMARK_STAGE_EXCLUDED_ENTRY_NAMES = new Set([
  '.cache',
  '.git',
  '.vscode-test',
  'coverage',
  'node_modules'
]);

export interface HostLinuxBenchmarkRunRequest {
  authorityRepoRoot: string;
  reportProgress?: (update: { message: string; increment?: number }) => void | Promise<void>;
  cancellationToken?: { isCancellationRequested?: boolean };
}

export interface HostLinuxBenchmarkRunResult {
  authorityRepoRoot: string;
  benchmarkWorkspacePath: string;
  launchReceiptPath: string;
  logPath: string;
  image: string;
}

export class HostLinuxBenchmarkRunner {
  private currentProcess: ChildProcess | undefined;
  private currentLogPath: string | undefined;

  isRunning(): boolean {
    return this.currentProcess !== undefined;
  }

  async start(request: HostLinuxBenchmarkRunRequest): Promise<HostLinuxBenchmarkRunResult> {
    if (this.currentProcess) {
      throw new Error('The host Linux benchmark is already running.');
    }

    const authorityRepoRoot = request.authorityRepoRoot;
    const launchRoot = path.join(authorityRepoRoot, HOST_BENCHMARK_LAUNCH_ROOT_RELATIVE_PATH);
    await fsp.mkdir(launchRoot, { recursive: true });

    const image = await this.resolveBenchmarkImage(authorityRepoRoot);
    const benchmarkWorkspacePath = await stageHostLinuxBenchmarkWorkspace(authorityRepoRoot);
    const logPath = path.join(
      launchRoot,
      `run-${buildRunId(new Date())}.log`
    );
    this.currentLogPath = logPath;

    await request.reportProgress?.({
      message: 'Preparing host Linux benchmark container launch from Docker Desktop.'
    });
    await this.runDockerCommand(
      ['--context', 'desktop-linux', 'rm', '-f', HOST_BENCHMARK_CONTAINER_NAME],
      authorityRepoRoot,
      logPath,
      true
    );
    await this.runDockerCommand(
      ['--context', 'desktop-linux', 'pull', image],
      authorityRepoRoot,
      logPath,
      false,
      request.reportProgress
    );

    if (request.cancellationToken?.isCancellationRequested) {
      throw new Error('The host Linux benchmark was cancelled before container launch.');
    }

    const launchReceiptPath = path.join(
      authorityRepoRoot,
      HOST_BENCHMARK_LAUNCH_RECEIPT_RELATIVE_PATH
    );
    const sourceCommit = resolveGitHead(authorityRepoRoot);
    const dockerArgs = [
      '--context',
      'desktop-linux',
      'run',
      '--rm',
      '--name',
      HOST_BENCHMARK_CONTAINER_NAME,
      '-e',
      `VIHS_GITHUB_BENCHMARK_HARNESS_ID=${HARNESS_VHS_002.id}`,
      '-e',
      'VIHS_GITHUB_BENCHMARK_RUNTIME_IMAGE=nationalinstruments/labview:2026q1-linux',
      '-e',
      `VIHS_GITHUB_BENCHMARK_IMAGE_REF=${stripDigest(image)}`,
      '-e',
      `VIHS_GITHUB_BENCHMARK_IMAGE_DIGEST=${extractDigest(image) ?? ''}`,
      '-v',
      `${benchmarkWorkspacePath}:/workspace`,
      '-w',
      '/workspace',
      image,
      'bash',
      '/workspace/docker/github-linux-dashboard-benchmark/run-benchmark.sh'
    ];

    const processRef = spawn('docker', dockerArgs, {
      cwd: authorityRepoRoot,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    this.currentProcess = processRef;
    await fsp.writeFile(
      launchReceiptPath,
      `${JSON.stringify(
        {
          startedAt: new Date().toISOString(),
          pid: processRef.pid,
          logPath,
          repoPath: benchmarkWorkspacePath,
          sourceAuthorityRepoPath: authorityRepoRoot,
          image,
          harnessId: HARNESS_VHS_002.id,
          sourceCommit,
          containerName: HOST_BENCHMARK_CONTAINER_NAME
        },
        null,
        2
      )}\n`
    );

    const logStream = fs.createWriteStream(logPath, { flags: 'a' });
    const forwardChunk = async (chunk: Buffer): Promise<void> => {
      const text = chunk.toString('utf8');
      logStream.write(text);
      const lines = text.split(/\r?\n/u);
      const latestLine = selectLatestProgressLine(lines);
      if (latestLine) {
        await request.reportProgress?.({
          message: truncateProgressLine(latestLine)
        });
      }
    };

    processRef.stdout?.on('data', (chunk: Buffer) => {
      void forwardChunk(chunk);
    });
    processRef.stderr?.on('data', (chunk: Buffer) => {
      void forwardChunk(chunk);
    });

    const completion = new Promise<void>((resolve, reject) => {
      processRef.once('error', reject);
      processRef.once('exit', (code) => {
        logStream.end();
        this.currentProcess = undefined;
        this.currentLogPath = undefined;
        if (code === 0) {
          resolve();
          return;
        }
        reject(
          new Error(
            `The host Linux benchmark container exited with code ${String(code ?? 'unknown')}.`
          )
        );
      });
    });

    if (request.cancellationToken) {
      while (!request.cancellationToken.isCancellationRequested && this.currentProcess) {
        await delay(500);
      }
      if (request.cancellationToken.isCancellationRequested && this.currentProcess) {
        await this.stop(authorityRepoRoot);
      }
    }

    await completion;
    await request.reportProgress?.({
      message: 'Host Linux benchmark completed. Refresh the benchmark status panel for the retained summary.'
    });

    return {
      authorityRepoRoot,
      benchmarkWorkspacePath,
      launchReceiptPath,
      logPath,
      image
    };
  }

  async stop(authorityRepoRoot: string): Promise<void> {
    const runningProcess = this.currentProcess;
    this.currentProcess = undefined;
    this.currentLogPath = undefined;
    if (runningProcess) {
      runningProcess.kill();
    }
    await this.runDockerCommand(
      ['--context', 'desktop-linux', 'stop', HOST_BENCHMARK_CONTAINER_NAME],
      authorityRepoRoot,
      undefined,
      true
    );
  }

  private async resolveBenchmarkImage(authorityRepoRoot: string): Promise<string> {
    void authorityRepoRoot;
    return resolveHostLinuxBenchmarkImage(process.env);
  }

  private async runDockerCommand(
    args: string[],
    cwd: string,
    logPath?: string,
    ignoreFailure = false,
    reportProgress?: (update: { message: string; increment?: number }) => void | Promise<void>
  ): Promise<void> {
    await reportProgress?.({
      message: `Running docker ${args.slice(2).join(' ')}`
    });
    const result = spawnSync('docker', args, {
      cwd,
      env: process.env,
      encoding: 'utf8'
    });
    if (logPath) {
      const combined = [result.stdout, result.stderr].filter(Boolean).join('\n');
      const shouldRetainCommandOutput = !(ignoreFailure && result.status !== 0);
      if (combined && shouldRetainCommandOutput) {
        await fsp.appendFile(logPath, `${combined}\n`);
      }
    }
    if (!ignoreFailure && result.status !== 0) {
      throw new Error(
        result.stderr?.trim() ||
          result.stdout?.trim() ||
          `docker ${args.join(' ')} failed with exit code ${String(result.status)}`
      );
    }
  }
}

async function stageHostLinuxBenchmarkWorkspace(authorityRepoRoot: string): Promise<string> {
  const stageBaseRoot = resolveHostLinuxBenchmarkStageRoot(authorityRepoRoot);
  const stagedWorkspacePath = path.join(
    stageBaseRoot,
    HOST_BENCHMARK_STAGED_WORKSPACE_DIRECTORY_NAME
  );

  await fsp.rm(stagedWorkspacePath, { recursive: true, force: true });
  await fsp.mkdir(stageBaseRoot, { recursive: true });
  await fsp.cp(authorityRepoRoot, stagedWorkspacePath, {
    recursive: true,
    filter: (sourcePath) =>
      shouldIncludeStagedWorkspacePath(sourcePath, authorityRepoRoot, stageBaseRoot)
  });

  return stagedWorkspacePath;
}

function resolveHostLinuxBenchmarkStageRoot(authorityRepoRoot: string): string {
  if (isWindowsUncPath(authorityRepoRoot)) {
    const localAppData = process.env.LOCALAPPDATA?.trim();
    if (localAppData) {
      return path.join(
        localAppData,
        'VI History Suite',
        'host-linux-dashboard-benchmark',
        HOST_BENCHMARK_WORKSPACE_STAGE_DIRECTORY_NAME
      );
    }
  }

  return path.join(
    authorityRepoRoot,
    HOST_BENCHMARK_LAUNCH_ROOT_RELATIVE_PATH,
    HOST_BENCHMARK_WORKSPACE_STAGE_DIRECTORY_NAME
  );
}

export function shouldIncludeStagedWorkspacePath(
  sourcePath: string,
  authorityRepoRoot: string,
  stageBaseRoot: string
): boolean {
  const relativePath = path.relative(authorityRepoRoot, sourcePath);
  if (!relativePath || relativePath === '') {
    return true;
  }

  if (
    relativePath === HOST_BENCHMARK_LAUNCH_ROOT_RELATIVE_PATH ||
    relativePath.startsWith(`${HOST_BENCHMARK_LAUNCH_ROOT_RELATIVE_PATH}${path.sep}`)
  ) {
    return false;
  }

  if (
    sourcePath === stageBaseRoot ||
    sourcePath.startsWith(`${stageBaseRoot}${path.sep}`)
  ) {
    return false;
  }

  const pathParts = relativePath.split(path.sep);
  return pathParts.every((part) => !HOST_BENCHMARK_STAGE_EXCLUDED_ENTRY_NAMES.has(part));
}

export function resolveHostLinuxBenchmarkImage(
  env: NodeJS.ProcessEnv
): string {
  const overrideImage = env[HOST_BENCHMARK_IMAGE_OVERRIDE_ENV_VAR]?.trim();
  if (overrideImage) {
    return overrideImage;
  }

  return HOST_BENCHMARK_DEFAULT_IMAGE;
}

export function selectLatestProgressLine(lines: string[]): string | undefined {
  const normalized = lines
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const explicitProgress = normalized
    .filter((line) => line.startsWith('VIHS_PROGRESS:'))
    .map((line) => line.slice('VIHS_PROGRESS:'.length).trim());
  if (explicitProgress.length > 0) {
    return explicitProgress[explicitProgress.length - 1];
  }

  const filtered = normalized.filter(
    (line) =>
      !/^npm warn\b/iu.test(line) &&
      !/^npm notice\b/iu.test(line)
  );
  if (filtered.length > 0) {
    return filtered[filtered.length - 1];
  }

  return normalized[normalized.length - 1];
}

function isWindowsUncPath(value: string): boolean {
  return value.startsWith('\\\\');
}

function buildRunId(now: Date): string {
  const parts = [
    String(now.getFullYear()).padStart(4, '0'),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
    '-',
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0'),
    String(now.getSeconds()).padStart(2, '0')
  ];
  return parts.join('');
}

function extractDigest(image: string): string | undefined {
  const index = image.indexOf('@');
  return index >= 0 ? image.slice(index + 1) : undefined;
}

function stripDigest(image: string): string {
  const index = image.indexOf('@');
  return index >= 0 ? image.slice(0, index) : image;
}

function resolveGitHead(repoRoot: string): string | undefined {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], {
    cwd: repoRoot,
    env: process.env,
    encoding: 'utf8'
  });
  return result.status === 0 ? result.stdout.trim() : undefined;
}

function truncateProgressLine(line: string): string {
  return line.length > 160 ? `${line.slice(0, 157)}...` : line;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

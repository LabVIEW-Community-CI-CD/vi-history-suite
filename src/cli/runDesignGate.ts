import * as fs from 'node:fs/promises';
import { spawn } from 'node:child_process';
import * as path from 'node:path';

import {
  buildDesignGatePlan,
  DesignGateReport,
  DesignGateStepResult,
  designGateReportJsonPath,
  designGateReportMarkdownPath,
  extractAssuranceGateSummary,
  renderDesignGateMarkdown
} from '../tooling/designGate';

async function main(): Promise<void> {
  const repoRoot = path.resolve(__dirname, '..', '..');
  const steps = buildDesignGatePlan(repoRoot);
  const results: DesignGateStepResult[] = [];
  let status: 'pass' | 'fail' = 'pass';
  let assuranceGateSummary: string | undefined;

  for (const step of steps) {
    const result = await runStep(step.command, step.args, repoRoot, step.id, step.title);
    results.push(result);

    if (step.id === 'standards-assurance') {
      assuranceGateSummary = extractAssuranceGateSummary(result.stdout);
    }

    if (result.exitCode !== 0) {
      status = 'fail';
      break;
    }
  }

  const report: DesignGateReport = {
    generatedAt: new Date().toISOString(),
    repoRoot,
    status,
    assuranceGateSummary,
    steps: results
  };

  await fs.mkdir(path.dirname(designGateReportJsonPath(repoRoot)), { recursive: true });
  await fs.writeFile(designGateReportJsonPath(repoRoot), JSON.stringify(report, null, 2));
  await fs.writeFile(designGateReportMarkdownPath(repoRoot), renderDesignGateMarkdown(report));

  if (status !== 'pass') {
    throw new Error('design gate failed');
  }
}

async function runStep(
  command: string,
  args: string[],
  cwd: string,
  id: string,
  title: string
): Promise<DesignGateStepResult> {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const child = spawn(command, args, {
      cwd,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';
    let settled = false;

    child.stdout.on('data', (chunk: Buffer | string) => {
      const text = String(chunk);
      stdout += text;
      process.stdout.write(text);
    });

    child.stderr.on('data', (chunk: Buffer | string) => {
      const text = String(chunk);
      stderr += text;
      process.stderr.write(text);
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
        durationMs: Date.now() - startedAt,
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
        durationMs: Date.now() - startedAt,
        stdout,
        stderr
      });
    });
  });
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

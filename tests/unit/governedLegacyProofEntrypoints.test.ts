import { describe, expect, it } from 'vitest';

import { maybeRunHarnessSmokeCliAsMain } from '../../src/cli/runHarnessSmoke';
import { maybeRunHarnessReportSmokeCliAsMain } from '../../src/cli/runHarnessReportSmoke';
import { maybeRunHarnessDashboardSmokeCliAsMain } from '../../src/cli/runHarnessDashboardSmoke';
import { maybeRunHarnessDecisionRecordCliAsMain } from '../../src/cli/runHarnessDecisionRecord';
import { maybeRunGitHubLinuxDashboardBenchmarkCliAsMain } from '../../src/cli/runGitHubLinuxDashboardBenchmark';
import { maybeRunGitHubWindowsDashboardBenchmarkCliAsMain } from '../../src/cli/runGitHubWindowsDashboardBenchmark';

describe('governed legacy proof entrypoints', () => {
  const cases = [
    {
      name: 'smoke',
      expectedCommand: 'npm run proof:run -- smoke',
      invoke: (
        mainModule: NodeModule | undefined,
        currentModule: NodeModule,
        processLike: { exitCode?: number },
        stderr: { write(text: string): unknown }
      ) => maybeRunHarnessSmokeCliAsMain([], mainModule, currentModule, {}, processLike, stderr)
    },
    {
      name: 'report-smoke',
      expectedCommand: 'npm run proof:run -- report-smoke',
      invoke: (
        mainModule: NodeModule | undefined,
        currentModule: NodeModule,
        processLike: { exitCode?: number },
        stderr: { write(text: string): unknown }
      ) => maybeRunHarnessReportSmokeCliAsMain([], mainModule, currentModule, {}, processLike, stderr)
    },
    {
      name: 'dashboard-smoke',
      expectedCommand: 'npm run proof:run -- dashboard-smoke',
      invoke: (
        mainModule: NodeModule | undefined,
        currentModule: NodeModule,
        processLike: { exitCode?: number },
        stderr: { write(text: string): unknown }
      ) => maybeRunHarnessDashboardSmokeCliAsMain([], mainModule, currentModule, {}, processLike, stderr)
    },
    {
      name: 'decision-record',
      expectedCommand: 'npm run proof:run -- decision-record',
      invoke: (
        mainModule: NodeModule | undefined,
        currentModule: NodeModule,
        processLike: { exitCode?: number },
        stderr: { write(text: string): unknown }
      ) => maybeRunHarnessDecisionRecordCliAsMain([], mainModule, currentModule, processLike, stderr)
    },
    {
      name: 'benchmark-linux',
      expectedCommand: 'npm run proof:run -- benchmark-linux',
      invoke: (
        mainModule: NodeModule | undefined,
        currentModule: NodeModule,
        processLike: { exitCode?: number },
        stderr: { write(text: string): unknown }
      ) => maybeRunGitHubLinuxDashboardBenchmarkCliAsMain([], mainModule, currentModule, {}, processLike, stderr)
    },
    {
      name: 'benchmark-windows',
      expectedCommand: 'npm run proof:run -- benchmark-windows',
      invoke: (
        mainModule: NodeModule | undefined,
        currentModule: NodeModule,
        processLike: { exitCode?: number },
        stderr: { write(text: string): unknown }
      ) => maybeRunGitHubWindowsDashboardBenchmarkCliAsMain([], mainModule, currentModule, {}, processLike, stderr)
    }
  ] as const;

  for (const testCase of cases) {
    it(`rejects direct legacy ${testCase.name} main execution`, () => {
      const processLike: { exitCode?: number } = {};
      const stderrWrites: string[] = [];
      const stderr = {
        write(text: string) {
          stderrWrites.push(text);
          return true;
        }
      };

      expect(
        testCase.invoke({} as NodeModule, {} as NodeModule, processLike, stderr)
      ).toBe(false);
      expect(processLike.exitCode).toBeUndefined();

      const sharedModule = {} as NodeModule;
      expect(
        testCase.invoke(sharedModule, sharedModule, processLike, stderr)
      ).toBe(true);
      expect(processLike.exitCode).toBe(1);
      expect(stderrWrites.join('')).toContain('single public proof entrypoint');
      expect(stderrWrites.join('')).toContain(testCase.expectedCommand);
    });
  }
});

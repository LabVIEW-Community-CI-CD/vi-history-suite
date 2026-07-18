import type { ComparisonReportPacketRecord } from '../comparisonReportPacket';
import type { ComparisonCommandPlan } from '../comparisonReportPlan';
import type { WindowsInteropLayout } from '../comparisonReportRuntimeExecution';
import {
  normalizeWindowsInteropPath,
  normalizeWindowsInteropExecutable
} from './windowsInteropPaths';

export function buildLinuxHostNativeShortPathCommandPlan(
  record: ComparisonReportPacketRecord,
  commandPlan: ComparisonCommandPlan,
  layout: WindowsInteropLayout
): ComparisonCommandPlan | undefined {
  if (record.runtimeSelection.engine === 'labview-cli') {
    const args: string[] = [];
    for (let index = 0; index < commandPlan.args.length; index += 1) {
      const current = commandPlan.args[index];
      if (current === '-VI1' || current === '-vi1') {
        args.push(current, layout.leftFilePath);
        index += 1;
        continue;
      }
      if (current === '-VI2' || current === '-vi2') {
        args.push(current, layout.rightFilePath);
        index += 1;
        continue;
      }
      if (current === '-ReportPath' || current === '-reportPath') {
        args.push(current, layout.reportFilePath);
        index += 1;
        continue;
      }
      args.push(current);
    }
    return {
      executable: commandPlan.executable,
      args
    };
  }

  if (record.runtimeSelection.engine === 'lvcompare') {
    if (commandPlan.args.length < 2) {
      return undefined;
    }
    const args = [layout.leftFilePath, layout.rightFilePath, ...commandPlan.args.slice(2)];
    return {
      executable: commandPlan.executable,
      args
    };
  }

  return undefined;
}

export function buildWindowsInteropCommandPlan(
  record: ComparisonReportPacketRecord,
  commandPlan: ComparisonCommandPlan,
  interopLayout: WindowsInteropLayout
): ComparisonCommandPlan | undefined {
  const executable = normalizeWindowsInteropExecutable(commandPlan.executable);
  if (!executable) {
    return undefined;
  }

  if (record.runtimeSelection.engine === 'labview-cli') {
    const args: string[] = [];
    for (let index = 0; index < commandPlan.args.length; index += 1) {
      const current = commandPlan.args[index];
      const next = commandPlan.args[index + 1];

      if (current === '-VI1' || current === '-vi1') {
        const leftFilePath = normalizeWindowsInteropPath(interopLayout.leftFilePath);
        if (!leftFilePath) {
          return undefined;
        }
        args.push(current, leftFilePath);
        index += 1;
        continue;
      }

      if (current === '-VI2' || current === '-vi2') {
        const rightFilePath = normalizeWindowsInteropPath(interopLayout.rightFilePath);
        if (!rightFilePath) {
          return undefined;
        }
        args.push(current, rightFilePath);
        index += 1;
        continue;
      }

      if (current === '-ReportPath' || current === '-reportPath') {
        const reportFilePath = normalizeWindowsInteropPath(interopLayout.reportFilePath);
        if (!reportFilePath) {
          return undefined;
        }
        args.push(current, reportFilePath);
        index += 1;
        continue;
      }

      if (current === '-LabVIEWPath') {
        const labviewPath = normalizeWindowsInteropPath(next ?? '');
        if (!labviewPath) {
          return undefined;
        }
        args.push(current, labviewPath);
        index += 1;
        continue;
      }

      args.push(current);
    }

    return {
      executable,
      args
    };
  }

  if (record.runtimeSelection.engine === 'lvcompare') {
    if (commandPlan.args.length < 2) {
      return undefined;
    }

    const leftFilePath = normalizeWindowsInteropPath(interopLayout.leftFilePath);
    const rightFilePath = normalizeWindowsInteropPath(interopLayout.rightFilePath);
    if (!leftFilePath || !rightFilePath) {
      return undefined;
    }

    const args = [
      leftFilePath,
      rightFilePath
    ];

    for (let index = 2; index < commandPlan.args.length; index += 1) {
      const current = commandPlan.args[index];
      const next = commandPlan.args[index + 1];
      if (current === '-lvpath') {
        const labviewPath = normalizeWindowsInteropPath(next ?? '');
        if (!labviewPath) {
          return undefined;
        }
        args.push(current, labviewPath);
        index += 1;
        continue;
      }

      args.push(current);
    }

    return {
      executable,
      args
    };
  }

  return undefined;
}

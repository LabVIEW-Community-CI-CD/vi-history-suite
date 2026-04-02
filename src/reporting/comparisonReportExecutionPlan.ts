import {
  buildLabviewCliCreateComparisonReportPlan,
  buildLvComparePlan,
  ComparisonCommandPlan
} from './comparisonReportPlan';
import { ComparisonReportPacketRecord } from './comparisonReportPacket';

export interface ComparisonReportExecutionPlan {
  outcome: 'ready' | 'blocked';
  engine?: 'labview-cli' | 'lvcompare';
  blockedReason?: string;
  commandPlan?: ComparisonCommandPlan;
}

export function buildComparisonReportExecutionPlan(
  record: ComparisonReportPacketRecord
): ComparisonReportExecutionPlan {
  if (record.reportStatus === 'blocked-preflight') {
    return {
      outcome: 'blocked',
      blockedReason: record.preflight.blockedReason ?? 'preflight-not-ready'
    };
  }

  if (record.reportStatus === 'blocked-runtime') {
    return {
      outcome: 'blocked',
      blockedReason: record.runtimeSelection.blockedReason ?? 'runtime-not-available'
    };
  }

  if (record.runtimeSelection.provider !== 'host-native') {
    return {
      outcome: 'blocked',
      blockedReason: 'unsupported-runtime-provider'
    };
  }

  if (record.runtimeSelection.engine === 'labview-cli') {
    const labviewExePath = record.runtimeSelection.labviewExe?.path?.trim();
    const labviewCliPath = record.runtimeSelection.labviewCli?.path?.trim();
    if (!labviewExePath || !labviewCliPath) {
      return {
        outcome: 'blocked',
        blockedReason: 'labview-cli-selection-incomplete'
      };
    }

    const commandPlan = buildLabviewCliCreateComparisonReportPlan({
      leftViPath: record.stagedRevisionPlan.leftFilePath,
      rightViPath: record.stagedRevisionPlan.rightFilePath,
      reportFilePath: record.artifactPlan.reportFilePath,
      reportFormat: 'HTMLSingleFile',
      labviewPath: labviewExePath,
      headless: true,
      overwrite: true,
      createOutputDirectory: true,
      includeDiagnostics: true
    });

    return {
      outcome: 'ready',
      engine: 'labview-cli',
      commandPlan: {
        executable: labviewCliPath,
        args: commandPlan.args
      }
    };
  }

  if (record.runtimeSelection.engine === 'lvcompare') {
    const labviewExePath = record.runtimeSelection.labviewExe?.path?.trim();
    const lvComparePath = record.runtimeSelection.lvCompare?.path?.trim();
    if (!labviewExePath || !lvComparePath) {
      return {
        outcome: 'blocked',
        blockedReason: 'lvcompare-selection-incomplete'
      };
    }

    const commandPlan = buildLvComparePlan({
      leftViPath: record.stagedRevisionPlan.leftFilePath,
      rightViPath: record.stagedRevisionPlan.rightFilePath,
      labviewPath: labviewExePath
    });

    return {
      outcome: 'ready',
      engine: 'lvcompare',
      commandPlan: {
        executable: lvComparePath,
        args: commandPlan.args
      }
    };
  }

  return {
    outcome: 'blocked',
    blockedReason: 'runtime-engine-not-selected'
  };
}

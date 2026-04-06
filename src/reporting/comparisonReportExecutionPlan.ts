import {
  buildLabviewCliCreateComparisonReportPlan,
  buildLvComparePlan,
  ComparisonCommandPlan
} from './comparisonReportPlan';
import { ComparisonReportPacketRecord } from './comparisonReportPacket';

export interface ComparisonReportExecutionPlan {
  outcome: 'ready' | 'blocked';
  provider?: 'host-native' | 'windows-container' | 'linux-container';
  engine?: 'labview-cli' | 'lvcompare';
  blockedReason?: string;
  commandPlan?: ComparisonCommandPlan;
}

function resolveEffectiveRuntimePlatform(
  record: ComparisonReportPacketRecord
): ComparisonReportPacketRecord['runtimeSelection']['platform'] {
  return record.runtimeSelection.containerRuntimePlatform ?? record.runtimeSelection.platform;
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

  if (
    record.runtimeSelection.provider !== 'host-native' &&
    record.runtimeSelection.provider !== 'windows-container' &&
    record.runtimeSelection.provider !== 'linux-container'
  ) {
    return {
      outcome: 'blocked',
      blockedReason: 'unsupported-runtime-provider'
    };
  }

  if (record.runtimeSelection.engine === 'labview-cli') {
    const labviewCliPath = record.runtimeSelection.labviewCli?.path?.trim();
    const labviewExePath = record.runtimeSelection.labviewExe?.path?.trim();
    const effectiveRuntimePlatform = resolveEffectiveRuntimePlatform(record);
    const headlessRequested =
      effectiveRuntimePlatform === 'linux' ||
      record.runtimeSelection.provider === 'windows-container' ||
      record.runtimeSelection.provider === 'linux-container' ||
      record.runtimeSelection.headlessRequested === true ||
      (effectiveRuntimePlatform === 'win32' &&
        process.env.LV_RTE_HEADLESS === '1');
    if (!labviewCliPath) {
      return {
        outcome: 'blocked',
        blockedReason: 'labview-cli-selection-incomplete'
      };
    }

    const commandPlan = buildLabviewCliCreateComparisonReportPlan({
      leftViPath: record.stagedRevisionPlan.leftFilePath,
      rightViPath: record.stagedRevisionPlan.rightFilePath,
      reportFilePath: record.artifactPlan.reportFilePath,
      labviewPath: labviewExePath,
      reportFormat: 'HTML',
      overwrite: true,
      createOutputDirectory: true,
      headless: headlessRequested
    });

    return {
      outcome: 'ready',
      provider: record.runtimeSelection.provider,
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
      provider: record.runtimeSelection.provider,
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

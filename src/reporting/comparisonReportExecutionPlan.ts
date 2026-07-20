import {
  buildLabviewCliCreateComparisonReportPlan,
  buildLvComparePlan,
  ComparisonCommandPlan,
  ComparisonReportOptions
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
  record: ComparisonReportPacketRecord,
  reportOptions?: ComparisonReportOptions
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
    // LabVIEW comparison rendering is ALWAYS headless everywhere, matching the
    // Docker Linux LabVIEW image (which always forces `-Headless`): a headless
    // run never opens an interactive LabVIEW GUI window, which otherwise orphans
    // a process and blocks the extension host. Linux host-native is
    // unconditionally headless (no opt-out) exactly like the container providers;
    // Windows host-native opts in with `LV_RTE_HEADLESS=1`.
    const linuxHostHeadless =
      effectiveRuntimePlatform === 'linux' &&
      record.runtimeSelection.provider === 'host-native';
    const headlessRequested =
      record.runtimeSelection.provider === 'windows-container' ||
      record.runtimeSelection.provider === 'linux-container' ||
      record.runtimeSelection.headlessRequested === true ||
      linuxHostHeadless ||
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
      // VHS-REQ-640: the report is always generated as a self-contained
      // single-file HTML document (hardcoded in the CLI plan), so there is no
      // format option to thread through here.
      // VHS-REQ-645: the user may add difference-suppression filters via
      // `viHistorySuite.report.*`; an omitted option preserves the default
      // (compare everything).
      overwrite: true,
      createOutputDirectory: true,
      headless: headlessRequested,
      ignoreViAttributes: reportOptions?.ignoreViAttributes,
      ignoreFrontPanel: reportOptions?.ignoreFrontPanel,
      ignoreFrontPanelObjectPosition: reportOptions?.ignoreFrontPanelObjectPosition,
      ignoreBlockDiagram: reportOptions?.ignoreBlockDiagram,
      ignoreBlockDiagramCosmetic: reportOptions?.ignoreBlockDiagramCosmetic
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

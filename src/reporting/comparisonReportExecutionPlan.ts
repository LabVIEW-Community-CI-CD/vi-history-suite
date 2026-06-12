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
    // Linux host-native LabVIEW host-headless mode is broken on at least LabVIEW 2026
    // 26.1.1f1 (HeadlessManager logs "Failed to initialize headless LabVIEW." and the
    // CLI hangs). Stay non-headless by default and let LV_RTE_LINUX_HEADLESS=1 opt in
    // for LabVIEW builds where headless mode works. The Linux container provider
    // continues to force -Headless because its bundled LabVIEW image initializes
    // headless mode correctly.
    const linuxHostHeadlessOptIn =
      effectiveRuntimePlatform === 'linux' &&
      record.runtimeSelection.provider === 'host-native' &&
      process.env.LV_RTE_LINUX_HEADLESS === '1';
    const headlessRequested =
      record.runtimeSelection.provider === 'windows-container' ||
      record.runtimeSelection.provider === 'linux-container' ||
      record.runtimeSelection.headlessRequested === true ||
      linuxHostHeadlessOptIn ||
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
      // VHS-REQ-640: default to a self-contained single-file report (images
      // embedded as base64 data URIs, no sibling `<report>_files/` directory).
      // The previous multi-file `HTML` format made the webview request hundreds
      // of per-object difference images at once, exhausting the resource loader
      // so later images rendered as their path text. A single file produces zero
      // sub-requests.
      // VHS-REQ-645: the user may override the format and add difference-
      // suppression filters via `viHistorySuite.report.*`; an omitted option
      // preserves this default behavior.
      reportFormat: reportOptions?.reportFormat ?? 'HTMLSingleFile',
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

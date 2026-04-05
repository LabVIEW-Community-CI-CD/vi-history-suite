import * as path from 'node:path';

import {
  defaultCliPathExists,
  validateCanonicalRuntimeOverrideArgs,
  validateCanonicalRuntimeOverrideExecutionSurface
} from './canonicalRuntimeOverrideValidation';
import {
  HarnessDecisionRecordOptions,
  HarnessDecisionRecordReport,
  runHarnessDecisionRecord
} from '../harness/harnessDecisionRecord';
import { ComparisonRuntimeEngine, RuntimePlatform } from '../reporting/comparisonRuntimeLocator';
import { ReviewDecisionConfidence, ReviewDecisionOutcome } from '../scenarios/decisionRecord';

export interface HarnessDecisionRecordCliArgs {
  harnessId: string;
  scenarioId?: string;
  strictRsrcHeader: boolean;
  helpRequested: boolean;
  reviewer?: string;
  reviewQuestion?: string;
  outcome?: ReviewDecisionOutcome;
  confidence?: ReviewDecisionConfidence;
  decisionRationale?: string;
  runtimePlatform?: RuntimePlatform;
  runtimeEngineOverride?: ComparisonRuntimeEngine;
  preferBitness?: 'auto' | 'x86' | 'x64';
  labviewCliPath?: string;
  labviewExePath?: string;
  lvComparePath?: string;
  dashboardCommitWindow?: number;
  additionalReportGenerationRequired: boolean;
  additionalManualLabVIEWInspectionRequired: boolean;
  issuesOrBacklogItemsCreated: string[];
}

export interface HarnessDecisionRecordCliDeps {
  repoRoot?: string;
  runner?: (
    harnessId: string,
    options: HarnessDecisionRecordOptions
  ) => Promise<{
    report: HarnessDecisionRecordReport;
    reportJsonPath: string;
    reportMarkdownPath: string;
  }>;
  pathExists?: (candidatePath: string) => Promise<boolean>;
  hostPlatform?: NodeJS.Platform;
  stdout?: { write(text: string): void };
}

export function getHarnessDecisionRecordUsage(): string {
  return [
    'Usage: runHarnessDecisionRecord [--harness-id <id>] [--scenario-id <id>] --reviewer <name> --review-question <text> --outcome <approved|rejected|needs-more-review> --confidence <low|medium|high> --decision-rationale <text> [--strict-rsrc-header] [--platform <win32|linux|darwin>] [--engine <labview-cli|lvcompare>] [--prefer-bitness <auto|x86|x64>] [--labview-cli-path <path>] [--labview-exe-path <path>] [--lvcompare-path <path>] [--dashboard-commit-window <count>] [--additional-report-generation-required] [--additional-manual-labview-inspection-required] [--issue <text>] [--help]',
    '',
    'Options:',
    '  --harness-id <id>                                Select the canonical harness to run.',
    '  --scenario-id <id>                               Override the review scenario id.',
    '  --reviewer <name>                                Record the human reviewer name.',
    '  --review-question <text>                         Record the bounded review question.',
    '  --outcome <value>                                Record approved, rejected, or needs-more-review.',
    '  --confidence <value>                             Record low, medium, or high confidence.',
    '  --decision-rationale <text>                      Record the human decision rationale.',
    '  --strict-rsrc-header                             Require RSRC header validation during VI detection.',
    '  --platform <value>                               Override runtime detection platform for report-tool selection.',
    '  --engine <value>                                 Override the selected report engine.',
    '  --prefer-bitness <value>                         Set runtime bitness preference for report-tool selection.',
    '  --labview-cli-path <path>                        Provide an explicit LabVIEWCLI path for report-tool selection.',
    '  --labview-exe-path <path>                        Provide an explicit LabVIEW executable path for report-tool selection.',
    '  --lvcompare-path <path>                          Provide an explicit LVCompare path for report-tool selection.',
    '  --dashboard-commit-window <n>                    Limit the retained dashboard window to at least 3 commits.',
    '  --additional-report-generation-required          Mark that more comparison-report generation is required.',
    '  --additional-manual-labview-inspection-required  Mark that more manual LabVIEW inspection is required.',
    '  --issue <text>                                   Record a follow-up issue or backlog item. Repeatable.',
    '  --help                                           Print this help and exit without running the harness.'
  ].join('\n');
}

export function parseHarnessDecisionRecordArgs(argv: string[]): HarnessDecisionRecordCliArgs {
  let harnessId = 'HARNESS-VHS-001';
  let scenarioId: string | undefined;
  let strictRsrcHeader = false;
  let helpRequested = false;
  let reviewer: string | undefined;
  let reviewQuestion: string | undefined;
  let outcome: ReviewDecisionOutcome | undefined;
  let confidence: ReviewDecisionConfidence | undefined;
  let decisionRationale: string | undefined;
  let runtimePlatform: RuntimePlatform | undefined;
  let runtimeEngineOverride: ComparisonRuntimeEngine | undefined;
  let preferBitness: 'auto' | 'x86' | 'x64' | undefined;
  let labviewCliPath: string | undefined;
  let labviewExePath: string | undefined;
  let lvComparePath: string | undefined;
  let dashboardCommitWindow: number | undefined;
  let additionalReportGenerationRequired = false;
  let additionalManualLabVIEWInspectionRequired = false;
  const issuesOrBacklogItemsCreated: string[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];

    const requireValue = (flag: string): string => {
      const candidate = argv[index + 1];
      if (!candidate || candidate.startsWith('--')) {
        throw new Error(`Missing value for ${flag}.\n\n${getHarnessDecisionRecordUsage()}`);
      }

      index += 1;
      return candidate;
    };

    if (current === '--harness-id') {
      harnessId = requireValue('--harness-id');
      continue;
    }

    if (current === '--scenario-id') {
      scenarioId = requireValue('--scenario-id');
      continue;
    }

    if (current === '--reviewer') {
      reviewer = requireValue('--reviewer');
      continue;
    }

    if (current === '--review-question') {
      reviewQuestion = requireValue('--review-question');
      continue;
    }

    if (current === '--outcome') {
      const candidate = requireValue('--outcome');
      if (candidate !== 'approved' && candidate !== 'rejected' && candidate !== 'needs-more-review') {
        throw new Error(`Unsupported value for --outcome: ${candidate}\n\n${getHarnessDecisionRecordUsage()}`);
      }

      outcome = candidate;
      continue;
    }

    if (current === '--confidence') {
      const candidate = requireValue('--confidence');
      if (candidate !== 'low' && candidate !== 'medium' && candidate !== 'high') {
        throw new Error(`Unsupported value for --confidence: ${candidate}\n\n${getHarnessDecisionRecordUsage()}`);
      }

      confidence = candidate;
      continue;
    }

    if (current === '--decision-rationale') {
      decisionRationale = requireValue('--decision-rationale');
      continue;
    }

    if (current === '--strict-rsrc-header') {
      strictRsrcHeader = true;
      continue;
    }

    if (current === '--platform') {
      const candidate = requireValue('--platform');
      if (candidate !== 'win32' && candidate !== 'linux' && candidate !== 'darwin') {
        throw new Error(`Unsupported value for --platform: ${candidate}\n\n${getHarnessDecisionRecordUsage()}`);
      }

      runtimePlatform = candidate;
      continue;
    }

    if (current === '--engine') {
      const candidate = requireValue('--engine');
      if (candidate !== 'labview-cli' && candidate !== 'lvcompare') {
        throw new Error(`Unsupported value for --engine: ${candidate}\n\n${getHarnessDecisionRecordUsage()}`);
      }

      runtimeEngineOverride = candidate;
      continue;
    }

    if (current === '--prefer-bitness') {
      const candidate = requireValue('--prefer-bitness');
      if (candidate !== 'auto' && candidate !== 'x86' && candidate !== 'x64') {
        throw new Error(`Unsupported value for --prefer-bitness: ${candidate}\n\n${getHarnessDecisionRecordUsage()}`);
      }

      preferBitness = candidate;
      continue;
    }

    if (current === '--labview-cli-path') {
      labviewCliPath = requireValue('--labview-cli-path');
      continue;
    }

    if (current === '--labview-exe-path') {
      labviewExePath = requireValue('--labview-exe-path');
      continue;
    }

    if (current === '--lvcompare-path') {
      lvComparePath = requireValue('--lvcompare-path');
      continue;
    }

    if (current === '--dashboard-commit-window') {
      const candidate = Number.parseInt(requireValue('--dashboard-commit-window'), 10);
      if (!Number.isFinite(candidate) || candidate < 3) {
        throw new Error(
          `Unsupported value for --dashboard-commit-window: ${String(candidate)}\n\n${getHarnessDecisionRecordUsage()}`
        );
      }

      dashboardCommitWindow = candidate;
      continue;
    }

    if (current === '--additional-report-generation-required') {
      additionalReportGenerationRequired = true;
      continue;
    }

    if (current === '--additional-manual-labview-inspection-required') {
      additionalManualLabVIEWInspectionRequired = true;
      continue;
    }

    if (current === '--issue') {
      issuesOrBacklogItemsCreated.push(requireValue('--issue'));
      continue;
    }

    if (current === '--help' || current === '-h') {
      helpRequested = true;
      continue;
    }

    throw new Error(`Unknown argument: ${current}\n\n${getHarnessDecisionRecordUsage()}`);
  }

  const parsedArgs = {
    harnessId,
    scenarioId,
    strictRsrcHeader,
    helpRequested,
    reviewer,
    reviewQuestion,
    outcome,
    confidence,
    decisionRationale,
    runtimePlatform,
    runtimeEngineOverride,
    preferBitness,
    labviewCliPath,
    labviewExePath,
    lvComparePath,
    dashboardCommitWindow,
    additionalReportGenerationRequired,
    additionalManualLabVIEWInspectionRequired,
    issuesOrBacklogItemsCreated
  };
  validateCanonicalRuntimeOverrideArgs(parsedArgs, getHarnessDecisionRecordUsage());
  return parsedArgs;
}

export async function runHarnessDecisionRecordCli(
  argv: string[],
  deps: HarnessDecisionRecordCliDeps = {}
): Promise<'pass' | 'help'> {
  const args = parseHarnessDecisionRecordArgs(argv);
  const stdout = deps.stdout ?? process.stdout;

  if (args.helpRequested) {
    stdout.write(`${getHarnessDecisionRecordUsage()}\n`);
    return 'help';
  }

  if (!args.reviewer || !args.reviewQuestion || !args.outcome || !args.confidence || !args.decisionRationale) {
    throw new Error(
      `Missing required reviewer, review-question, outcome, confidence, or decision-rationale.\n\n${getHarnessDecisionRecordUsage()}`
    );
  }

  await validateCanonicalRuntimeOverrideExecutionSurface(args, getHarnessDecisionRecordUsage(), {
    pathExists: deps.pathExists ?? defaultCliPathExists,
    hostPlatform: deps.hostPlatform ?? process.platform
  });

  const repoRoot = deps.repoRoot ?? path.resolve(__dirname, '..', '..');
  const cloneRoot = path.resolve(repoRoot, '.cache', 'harnesses');
  const reportRoot = path.resolve(repoRoot, '.cache', 'harness-reports');
  const result = await (deps.runner ?? runHarnessDecisionRecord)(args.harnessId, {
    cloneRoot,
    reportRoot,
    scenarioId: args.scenarioId,
    reviewer: args.reviewer,
    reviewQuestion: args.reviewQuestion,
    outcome: args.outcome,
    confidence: args.confidence,
    decisionRationale: args.decisionRationale,
    strictRsrcHeader: args.strictRsrcHeader,
    runtimePlatform: args.runtimePlatform,
    runtimeEngineOverride: args.runtimeEngineOverride,
    dashboardCommitWindow: args.dashboardCommitWindow,
    additionalReportGenerationRequired: args.additionalReportGenerationRequired,
    additionalManualLabVIEWInspectionRequired: args.additionalManualLabVIEWInspectionRequired,
    issuesOrBacklogItemsCreated: args.issuesOrBacklogItemsCreated,
    runtimeSettings: {
      preferBitness: args.preferBitness,
      labviewCliPath: args.labviewCliPath,
      labviewExePath: args.labviewExePath,
      lvComparePath: args.lvComparePath
    }
  });

  for (const line of formatHarnessDecisionRecordSuccess(result, args.harnessId)) {
    stdout.write(`${line}\n`);
  }

  return 'pass';
}

export function formatHarnessDecisionRecordSuccess(
  result: {
    report: HarnessDecisionRecordReport;
    reportJsonPath: string;
    reportMarkdownPath: string;
  },
  harnessId: string
): string[] {
  return [
    `Harness decision record completed for ${harnessId}`,
    `Scenario: ${result.report.scenarioId}`,
    `Reviewer: ${result.report.reviewer}`,
    `Outcome: ${result.report.outcome}`,
    `Confidence: ${result.report.confidence}`,
    `Decision JSON: ${result.reportJsonPath}`,
    `Decision Markdown: ${result.reportMarkdownPath}`,
    `Dashboard JSON: ${result.report.dashboardJsonPath}`,
    `Dashboard HTML: ${result.report.dashboardHtmlPath}`
  ];
}

if (require.main === module) {
  runHarnessDecisionRecordCli(process.argv.slice(2)).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}

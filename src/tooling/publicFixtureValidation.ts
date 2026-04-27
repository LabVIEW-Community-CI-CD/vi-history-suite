import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import {
  HarnessReportSmokeOptions,
  HarnessReportSmokeReport,
  runHarnessReportSmoke
} from '../harness/harnessReportSmoke';
import {
  ComparisonRuntimeSettings,
  RuntimePlatform
} from '../reporting/comparisonRuntimeLocator';

export const PUBLIC_VALIDATION_FIXTURE = {
  schema: 'vi-history-suite/public-fixture-validation-proof@v1',
  harnessId: 'HARNESS-VHS-002',
  repositoryUrl: 'https://github.com/ni/labview-icon-editor',
  repositoryCloneUrl: 'https://github.com/ni/labview-icon-editor.git',
  viPath: 'resource/plugins/lv_icon.vi',
  oldCommit: 'ab94f6c4b375062492036c63a6dab7ea8824748a',
  oldCommitDate: '2025-06-29',
  newCommit: '8741bb08026c104100720c0ef48621e4ab7762fd',
  newCommitDate: '2026-02-24',
  dockerImage: 'nationalinstruments/labview:2026q1-linux',
  linuxDockerImage: 'nationalinstruments/labview:2026q1-linux',
  windowsDockerImage: 'nationalinstruments/labview:2026q1-windows',
  windowsDockerRequiredOSType: 'windows',
  firstDockerPullApproximateSize: '1.4 GB',
  retainedPublicIssueRange: '#48-#59',
  retainedPublicParentIssue:
    'https://github.com/svelderrainruiz/vi-history-suite/issues/48',
  retainedPublicSuccessIssue:
    'https://github.com/svelderrainruiz/vi-history-suite/issues/49',
  retainedPublicRecipeIssue:
    'https://github.com/svelderrainruiz/vi-history-suite/issues/59',
  windowsDockerDesktopProofIssue:
    'https://github.com/svelderrainruiz/vi-history-suite/issues/65',
  windowsDockerDesktopIssueTemplate: 'windows-docker-desktop-validation.yml'
} as const;

const DEFAULT_PROOF_DIRECTORY_NAME = 'vihs-fixture-proof';
const FIXTURE_PROOF_JSON_FILE_NAME = 'vihs-fixture-validation-proof.json';
const FIXTURE_PROOF_ISSUE_FILE_NAME = 'vihs-fixture-validation-issue.md';

interface WritableStreamLike {
  write(text: string): unknown;
}

export interface PublicFixtureValidationOptions {
  cwd?: string;
  proofOutDirectoryPath?: string;
  runtimePlatform: RuntimePlatform;
  runtimeSettings: ComparisonRuntimeSettings;
  runtimeExecutionTimeoutMs?: number;
}

export interface PublicFixtureValidationResult {
  outcome: 'validated-fixture';
  proofRootPath: string;
  proofReportPath: string;
  proofIssueBodyPath: string;
  harnessReportJsonPath: string;
  harnessReportMarkdownPath: string;
  harnessReportHtmlPath: string;
  fixture: typeof PUBLIC_VALIDATION_FIXTURE;
  reportStatus: HarnessReportSmokeReport['reportStatus'];
  runtimeExecutionState: HarnessReportSmokeReport['runtimeExecutionState'];
  runtimeProvider?: HarnessReportSmokeReport['runtimeProvider'];
  runtimeEngine?: HarnessReportSmokeReport['runtimeEngine'];
  runtimeBlockedReason?: string;
  runtimeFailureReason?: string;
  generatedReportExists: boolean;
  validationClassification:
    | 'validation-success'
    | 'validation-failure'
    | 'feature-not-implemented'
    | 'blocked-prerequisite';
  suggestedIssueTemplate:
    | 'validation-success.yml'
    | 'validation-failure.yml'
    | 'feature-not-implemented.yml'
    | 'windows-docker-desktop-validation.yml';
}

export interface PublicFixtureValidationDeps {
  mkdir?: typeof fs.mkdir;
  writeFile?: typeof fs.writeFile;
  runHarnessReportSmoke?: (
    harnessId: string,
    options: HarnessReportSmokeOptions
  ) => Promise<{
    report: HarnessReportSmokeReport;
    reportJsonPath: string;
    reportMarkdownPath: string;
    reportHtmlPath: string;
  }>;
  stdout?: WritableStreamLike;
  now?: () => string;
}

export async function runPublicFixtureValidation(
  options: PublicFixtureValidationOptions,
  deps: PublicFixtureValidationDeps = {}
): Promise<PublicFixtureValidationResult> {
  const cwd = options.cwd ?? process.cwd();
  const proofRootPath = path.resolve(
    cwd,
    options.proofOutDirectoryPath ?? DEFAULT_PROOF_DIRECTORY_NAME
  );
  const cloneRoot = path.join(proofRootPath, 'fixture-clones');
  const reportRoot = path.join(proofRootPath, 'reports');

  await (deps.mkdir ?? fs.mkdir)(proofRootPath, { recursive: true });

  const harnessResult = await (deps.runHarnessReportSmoke ?? runHarnessReportSmoke)(
    PUBLIC_VALIDATION_FIXTURE.harnessId,
    {
      cloneRoot,
      reportRoot,
      historyLimit: 1000,
      selectedHash: PUBLIC_VALIDATION_FIXTURE.newCommit,
      baseHash: PUBLIC_VALIDATION_FIXTURE.oldCommit,
      allowNonAdjacentBaseHash: true,
      runtimePlatform: options.runtimePlatform,
      runtimeSettings: options.runtimeSettings,
      runtimeExecutionTimeoutMs: options.runtimeExecutionTimeoutMs
    }
  );

  const classification = deriveFixtureValidationClassification(harnessResult.report);
  const suggestedIssueTemplate = deriveSuggestedIssueTemplate(classification, options);
  const result: PublicFixtureValidationResult = {
    outcome: 'validated-fixture',
    proofRootPath,
    proofReportPath: path.join(proofRootPath, FIXTURE_PROOF_JSON_FILE_NAME),
    proofIssueBodyPath: path.join(proofRootPath, FIXTURE_PROOF_ISSUE_FILE_NAME),
    harnessReportJsonPath: harnessResult.reportJsonPath,
    harnessReportMarkdownPath: harnessResult.reportMarkdownPath,
    harnessReportHtmlPath: harnessResult.reportHtmlPath,
    fixture: PUBLIC_VALIDATION_FIXTURE,
    reportStatus: harnessResult.report.reportStatus,
    runtimeExecutionState: harnessResult.report.runtimeExecutionState,
    runtimeProvider: harnessResult.report.runtimeProvider,
    runtimeEngine: harnessResult.report.runtimeEngine,
    runtimeBlockedReason: harnessResult.report.runtimeBlockedReason,
    runtimeFailureReason: harnessResult.report.runtimeFailureReason,
    generatedReportExists: harnessResult.report.generatedReportExists,
    validationClassification: classification,
    suggestedIssueTemplate
  };

  const proof = buildPublicFixtureValidationProof(
    result,
    harnessResult.report,
    options,
    deps.now ?? defaultNow
  );
  await (deps.writeFile ?? fs.writeFile)(
    result.proofReportPath,
    `${JSON.stringify(proof, null, 2)}\n`,
    'utf8'
  );
  await (deps.writeFile ?? fs.writeFile)(
    result.proofIssueBodyPath,
    `${renderPublicFixtureValidationIssueBody(proof)}\n`,
    'utf8'
  );

  return result;
}

function buildPublicFixtureValidationProof(
  result: PublicFixtureValidationResult,
  report: HarnessReportSmokeReport,
  options: PublicFixtureValidationOptions,
  now: () => string
): Record<string, unknown> {
  return {
    schema: PUBLIC_VALIDATION_FIXTURE.schema,
    recordedAt: now(),
    classification: result.validationClassification,
    suggestedIssueTemplate: result.suggestedIssueTemplate,
    fixture: {
      repository: PUBLIC_VALIDATION_FIXTURE.repositoryUrl,
      cloneUrl: PUBLIC_VALIDATION_FIXTURE.repositoryCloneUrl,
      harnessId: PUBLIC_VALIDATION_FIXTURE.harnessId,
      viPath: PUBLIC_VALIDATION_FIXTURE.viPath,
      oldCommit: PUBLIC_VALIDATION_FIXTURE.oldCommit,
      oldCommitDate: PUBLIC_VALIDATION_FIXTURE.oldCommitDate,
      newCommit: PUBLIC_VALIDATION_FIXTURE.newCommit,
      newCommitDate: PUBLIC_VALIDATION_FIXTURE.newCommitDate,
      dockerImage: PUBLIC_VALIDATION_FIXTURE.dockerImage,
      linuxDockerImage: PUBLIC_VALIDATION_FIXTURE.linuxDockerImage,
      windowsDockerImage: PUBLIC_VALIDATION_FIXTURE.windowsDockerImage,
      windowsDockerRequiredOSType:
        PUBLIC_VALIDATION_FIXTURE.windowsDockerRequiredOSType,
      firstDockerPullApproximateSize:
        PUBLIC_VALIDATION_FIXTURE.firstDockerPullApproximateSize
    },
    selectedVariant: {
      platform: options.runtimePlatform,
      provider: options.runtimeSettings.requestedProvider ?? null,
      labviewVersion: options.runtimeSettings.labviewVersion ?? null,
      labviewBitness: options.runtimeSettings.bitness ?? null,
      executionMode: options.runtimeSettings.executionMode ?? null,
      runtimeExecutionTimeoutMs: options.runtimeExecutionTimeoutMs ?? null
    },
    result: {
      reportStatus: result.reportStatus,
      runtimeExecutionState: result.runtimeExecutionState,
      runtimeProvider: result.runtimeProvider ?? null,
      runtimeEngine: result.runtimeEngine ?? null,
      runtimeBlockedReason: result.runtimeBlockedReason ?? null,
      runtimeFailureReason: result.runtimeFailureReason ?? null,
      generatedReportExists: result.generatedReportExists
    },
    harnessReport: {
      jsonPath: result.harnessReportJsonPath,
      markdownPath: result.harnessReportMarkdownPath,
      htmlPath: result.harnessReportHtmlPath,
      generatedReportPath: report.reportFilePath ?? null,
      packetPath: report.packetFilePath ?? null,
      metadataPath: report.metadataFilePath ?? null
    },
    retainedPublicEvidence: {
      issueRange: PUBLIC_VALIDATION_FIXTURE.retainedPublicIssueRange,
      parentIssue: PUBLIC_VALIDATION_FIXTURE.retainedPublicParentIssue,
      successIssue: PUBLIC_VALIDATION_FIXTURE.retainedPublicSuccessIssue,
      recipeIssue: PUBLIC_VALIDATION_FIXTURE.retainedPublicRecipeIssue,
      windowsDockerDesktopProofIssue:
        PUBLIC_VALIDATION_FIXTURE.windowsDockerDesktopProofIssue
    },
    proofBoundary: {
      linuxDocker2026x64: 'admitted',
      linuxHostLabview2026x64: 'admitted-when-run-on-a-linux-host-with-labview-installed',
      windowsHostLabview2026x64:
        'admitted-when-run-on-a-windows-host-with-labview-2026-x64-installed',
      windowsDockerDesktopWindowsContainers:
        'community-deferred-requires-docker-desktop-windows-containers-proof',
      windowsDockerDesktopRequiredDockerOSType:
        PUBLIC_VALIDATION_FIXTURE.windowsDockerRequiredOSType,
      windowsDockerDesktopIssueTemplate:
        PUBLIC_VALIDATION_FIXTURE.windowsDockerDesktopIssueTemplate,
      unsupportedVariants:
        'selectable-for-validation-reporting-with-stable-error-code-or-feature-not-implemented-reporting'
    }
  };
}

function renderPublicFixtureValidationIssueBody(proof: Record<string, unknown>): string {
  const fixture = proof.fixture as Record<string, unknown>;
  const result = proof.result as Record<string, unknown>;
  const selectedVariant = proof.selectedVariant as Record<string, unknown>;
  const harnessReport = proof.harnessReport as Record<string, unknown>;
  return [
    '## VI History Suite Canonical Fixture Validation',
    '',
    `Suggested template: ${proof.suggestedIssueTemplate}`,
    '',
    '## Fixture',
    '',
    `- Repository: ${fixture.repository}`,
    `- VI: ${fixture.viPath}`,
    `- Old commit: ${fixture.oldCommit}`,
    `- New commit: ${fixture.newCommit}`,
    `- Docker image: ${fixture.dockerImage}`,
    `- First Docker pull: about ${fixture.firstDockerPullApproximateSize}`,
    `- Windows Docker Desktop image: ${fixture.windowsDockerImage ?? '<not-applicable>'}`,
    `- Windows Docker Desktop Docker OSType required: ${
      fixture.windowsDockerRequiredOSType ?? '<not-applicable>'
    }`,
    '',
    '## Selected Variant',
    '',
    `- Platform: ${selectedVariant.platform}`,
    `- Provider: ${selectedVariant.provider ?? '<missing>'}`,
    `- LabVIEW year: ${selectedVariant.labviewVersion ?? '<missing>'}`,
    `- Bitness: ${selectedVariant.labviewBitness ?? '<missing>'}`,
    '',
    '## Outcome',
    '',
    `- Classification: ${proof.classification}`,
    `- Report status: ${result.reportStatus}`,
    `- Runtime execution: ${result.runtimeExecutionState}`,
    `- Runtime provider: ${result.runtimeProvider ?? '<none>'}`,
    `- Runtime engine: ${result.runtimeEngine ?? '<none>'}`,
    `- Runtime blocked reason: ${result.runtimeBlockedReason ?? '<none>'}`,
    `- Runtime failure reason: ${result.runtimeFailureReason ?? '<none>'}`,
    `- Generated report exists: ${result.generatedReportExists}`,
    '',
    '## Proof Artifacts',
    '',
    `- Harness JSON: ${harnessReport.jsonPath}`,
    `- Harness Markdown: ${harnessReport.markdownPath}`,
    `- Harness HTML: ${harnessReport.htmlPath}`,
    `- Generated LabVIEW report: ${harnessReport.generatedReportPath ?? '<none>'}`,
    '',
    '## Windows Docker Desktop Community Proof',
    '',
    `- Public tracking issue: ${PUBLIC_VALIDATION_FIXTURE.windowsDockerDesktopProofIssue}`,
    `- Dedicated template: ${PUBLIC_VALIDATION_FIXTURE.windowsDockerDesktopIssueTemplate}`,
    '- Admissible proof requires a real Windows host with Docker Desktop switched to Windows containers.'
  ].join('\n');
}

function deriveFixtureValidationClassification(
  report: HarnessReportSmokeReport
): PublicFixtureValidationResult['validationClassification'] {
  if (report.runtimeExecutionState === 'succeeded' && report.generatedReportExists) {
    return 'validation-success';
  }

  if (report.runtimeBlockedReason?.includes('not-implemented')) {
    return 'feature-not-implemented';
  }

  if (
    report.reportStatus === 'blocked-runtime' ||
    report.runtimeExecutionState === 'not-available'
  ) {
    return 'blocked-prerequisite';
  }

  return 'validation-failure';
}

function deriveSuggestedIssueTemplate(
  classification: PublicFixtureValidationResult['validationClassification'],
  options: PublicFixtureValidationOptions
): PublicFixtureValidationResult['suggestedIssueTemplate'] {
  if (
    options.runtimePlatform === 'win32' &&
    options.runtimeSettings.requestedProvider === 'docker'
  ) {
    return PUBLIC_VALIDATION_FIXTURE.windowsDockerDesktopIssueTemplate;
  }

  if (classification === 'validation-success') {
    return 'validation-success.yml';
  }

  if (classification === 'feature-not-implemented') {
    return 'feature-not-implemented.yml';
  }

  return 'validation-failure.yml';
}

function defaultNow(): string {
  return new Date().toISOString();
}

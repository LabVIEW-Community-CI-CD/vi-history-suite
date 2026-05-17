import * as fs from 'node:fs';
import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '..', '..');

function readText(relativePath: string): string {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function readJson<T>(relativePath: string): T {
  return JSON.parse(readText(relativePath)) as T;
}

describe('dual-authority requirements bridge docs', () => {
  it('declares the post-v1.3.16 sibling product authorities', () => {
    const splitManifest = readJson<{
      splitBaseline?: { tag?: string; gitlabTagCommit?: string; githubTagCommit?: string };
      authorities?: Record<
        string,
        {
          packageName?: string;
          extensionId?: string;
          displayName?: string;
          firstPostSplitVersion?: string;
          releaseChannel?: string;
        }
      >;
      bridge?: { kind?: string; implementationSharing?: string };
      supersedesForFutureWork?: string[];
    }>('docs/product/dual-authority-split-manifest.json');
    const adr = readText(
      'docs/architecture/adr/ADR-0040-dual-authority-spec-kit-requirements-bridge.md'
    );
    const overview = readText('docs/architecture/overview.md');
    const informationItemMap = readText('docs/information-item-map.md');
    const currentState = readText('docs/product/current-state.md');
    const releaseProcedure = readText('docs/release-procedure.md');
    const sustainmentRules = readText('docs/product/post-release-sustainment-rules.md');

    expect(splitManifest.splitBaseline?.tag).toBe('v1.3.16');
    expect(splitManifest.authorities?.gitlab).toMatchObject({
      packageName: 'vi-history',
      extensionId: 'svelderrainruiz.vi-history',
      displayName: 'VI History',
      firstPostSplitVersion: '0.1.0',
      releaseChannel: 'GitLab Releases with VSIX, checksum, and evidence assets'
    });
    expect(splitManifest.authorities?.github).toMatchObject({
      packageName: 'vi-history-suite',
      extensionId: 'svelderrainruiz.vi-history-suite',
      displayName: 'VI History Suite',
      firstPostSplitVersion: '1.4.0'
    });
    expect(splitManifest.bridge).toMatchObject({
      kind: 'slice-based requirements-core export/import',
      implementationSharing: 'none by default'
    });
    expect(splitManifest.supersedesForFutureWork).toEqual(['ADR-0027', 'ADR-0028', 'ADR-0032']);
    expect(adr).toContain('Same wrong behavior in both repos');
    expect(adr).toContain('not source promotion');
    expect(adr).toContain('Implementation/code changes do not flow automatically between the repos.');
    expect(overview).toContain('ADR-0040');
    expect(overview).toContain(
      'Historical public GitHub facade and user-wiki boundary through `v1.3.16`'
    );
    expect(informationItemMap).toContain('Dual-authority split manifest');
    expect(informationItemMap).toContain('Dual-authority runtime-contract export packet');
    expect(currentState).toContain('public GitHub repo is the public sibling product authority');
    expect(currentState).toContain('requirements slice export/import rather than automatic source');
    expect(currentState).not.toContain(
      'public GitHub facade repo is the public source product surface'
    );
    expect(currentState).not.toContain(
      'public source promotion is now a governed one-way act'
    );
    expect(releaseProcedure).toContain('public sibling Linux smoke lane');
    expect(releaseProcedure).toContain(
      'explicit requirements-import, adoption, or porting issue'
    );
    expect(releaseProcedure).not.toContain('When the public source facade changes materially');
    expect(sustainmentRules).toContain('public sibling product proof before merge to `main`');
    expect(sustainmentRules).not.toContain('public-facade proof before merge to `main`');
  });

  it('retains a governed runtime-contract export packet for the public import', () => {
    const exportManifest = readJson<{
      schema?: string;
      sliceId?: string;
      sourceBaselineTag?: string;
      sourceCommit?: string;
      targetFeature?: string;
      publicImportPath?: string;
      importedRequirementIds?: string[];
      redactionStatus?: { status?: string; publicImportContainsPrivateTooling?: boolean };
      implementationSharing?: string;
      governedIterations?: Array<{
        iterationId?: string;
        workItem?: string;
        status?: string;
        bugOracleClassification?: string;
        publicMutationRequired?: boolean;
        retainedPacket?: string;
      }>;
      bugOracle?: Record<string, string>;
    }>('docs/product/dual-authority-requirements-bridge/runtime-contract-host-provider-v1/manifest.json');
    const redactionCheck = readJson<{
      status?: string;
      publicImportContainsForbiddenSignals?: boolean;
      forbiddenSignals?: string[];
    }>(
      'docs/product/dual-authority-requirements-bridge/runtime-contract-host-provider-v1/redaction-check.json'
    );
    const summary = readText(
      'docs/product/dual-authority-requirements-bridge/runtime-contract-host-provider-v1/export-summary.md'
    );

    expect(exportManifest.schema).toBe('vi-history/requirements-bridge-export@v1');
    expect(exportManifest.sliceId).toBe('runtime-contract-host-provider-v1');
    expect(exportManifest.sourceBaselineTag).toBe('v1.3.16');
    expect(exportManifest.sourceCommit).toBe('31add781bd04cc832d9fb55aa821a69305a91a37');
    expect(exportManifest.targetFeature).toBe('runtime-contract-host-provider');
    expect(exportManifest.publicImportPath).toBe(
      'docs/requirements/imports/runtime-contract-host-provider-v1/'
    );
    expect(exportManifest.importedRequirementIds).toHaveLength(16);
    expect(exportManifest.importedRequirementIds).toEqual(
      expect.arrayContaining([
        'VHS-SYS-REQ-004',
        'VHS-SYS-REQ-008',
        'VHS-REQ-094',
        'VHS-REQ-588',
        'VHS-REQ-589',
        'VHS-REQ-590'
      ])
    );
    expect(exportManifest.redactionStatus).toMatchObject({
      status: 'pass',
      publicImportContainsPrivateTooling: false
    });
    expect(exportManifest.implementationSharing).toBe('none-by-default');
    expect(exportManifest.governedIterations).toContainEqual(
      expect.objectContaining({
        iterationId: 'physical-host-labview-2026-proof-v1',
        workItem: '#24',
        status: 'physical-host-proof-admitted-with-validate-fixture-success',
        bugOracleClassification: 'implementation-defect-candidate',
        publicMutationRequired: false,
        retainedPacket:
          'docs/product/dual-authority-requirements-bridge/runtime-contract-host-provider-v1/iterations/physical-host-labview-2026-proof-v1.json'
      })
    );
    expect(exportManifest.bugOracle).toEqual({
      bothAuthoritiesSameWrongBehavior: 'requirement-defect-candidate',
      oneAuthorityWrongBehavior: 'implementation-defect-candidate',
      ambiguousBehavior: 'requirement-clarification-candidate'
    });
    expect(redactionCheck.status).toBe('pass');
    expect(redactionCheck.publicImportContainsForbiddenSignals).toBe(false);
    expect(redactionCheck.forbiddenSignals).toContain('repo-standards-review');
    expect(summary.replace(/\s+/g, ' ')).toContain(
      'No implementation source files, proof packets, or GitLab release credentials cross this boundary.'
    );
  });

  it('records the first governed bridge iteration against physical-host LabVIEW proof', () => {
    const iteration = readJson<{
      schema?: string;
      iterationId?: string;
      sliceId?: string;
      governedWorkItem?: { reference?: string; url?: string };
      followUpWorkItems?: Array<{
        reference?: string;
        url?: string;
        classification?: string;
        status?: string;
      }>;
      importedRequirementIds?: string[];
      bugOracleClassification?: string;
      status?: string;
      preflightAttempts?: Array<{
        attemptId?: string;
        mutationPerformed?: boolean;
        facts?: { sudoNoninteractive?: string; labviewCliDiscoverable?: boolean };
        blocker?: { kind?: string };
      }>;
      installAttempts?: Array<{
        attemptId?: string;
        mutationPerformed?: boolean;
        facts?: {
          aptInstallExit?: number;
          labviewCliPath?: string;
          activationAttemptedByCodex?: boolean;
          activationRequiredBeforeHostProof?: boolean;
          vihsValidateAttempted?: boolean;
        };
        nextOperatorAction?: string;
      }>;
      proofAttempts?: Array<{
        attemptId?: string;
        result?: string;
        bugOracleClassification?: string;
        facts?: {
          runtimeValidationOutcome?: string;
          errorCode?: string;
          fixtureRepositoryCloned?: boolean;
          headlessDiagnosticReason?: string;
          executionPlanHeadless?: boolean;
          publicCommandContractChanged?: boolean;
          runtimeExecutionState?: string;
          runtimeExitCode?: number;
          runtimeDiagnosticReason?: string | null;
          generatedReportExists?: boolean;
          reportSizeBytes?: number;
          reportSha256?: string;
          assetCount?: number;
          closeLabviewExit?: number;
          labviewProcessesRemainingAfterClose?: boolean;
        };
      }>;
      redactionBoundary?: { publicMutationRequired?: boolean; privateEvidenceRetainedInGitLabOnly?: boolean };
      nextActions?: string[];
    }>(
      'docs/product/dual-authority-requirements-bridge/runtime-contract-host-provider-v1/iterations/physical-host-labview-2026-proof-v1.json'
    );
    const iterationDoc = readText(
      'docs/product/dual-authority-requirements-bridge/runtime-contract-host-provider-v1/iterations/physical-host-labview-2026-proof-v1.md'
    );
    const summary = readText(
      'docs/product/dual-authority-requirements-bridge/runtime-contract-host-provider-v1/export-summary.md'
    );

    expect(iteration.schema).toBe('vi-history/requirements-bridge-iteration@v1');
    expect(iteration.iterationId).toBe('physical-host-labview-2026-proof-v1');
    expect(iteration.sliceId).toBe('runtime-contract-host-provider-v1');
    expect(iteration.governedWorkItem).toMatchObject({
      reference: '#24',
      url: 'https://gitlab.com/svelderrainruiz/vi-history-suite/-/work_items/24'
    });
    expect(iteration.followUpWorkItems).toContainEqual(
      expect.objectContaining({
        reference: '#25',
        url: 'https://gitlab.com/svelderrainruiz/vi-history-suite/-/work_items/25',
        classification: 'implementation-defect-candidate',
        status: 'resolved-by-linux-host-nonheadless-default'
      })
    );
    expect(iteration.status).toBe('physical-host-proof-admitted-with-validate-fixture-success');
    expect(iteration.importedRequirementIds).toEqual(
      expect.arrayContaining(['VHS-SYS-REQ-006', 'VHS-SYS-REQ-007', 'VHS-REQ-588'])
    );
    expect(iteration.bugOracleClassification).toBe('implementation-defect-candidate');
    expect(iteration.preflightAttempts).toContainEqual(
      expect.objectContaining({
        attemptId: 'physical-host-preflight-2026-05-16',
        mutationPerformed: false,
        facts: expect.objectContaining({
          sudoNoninteractive: 'unavailable',
          labviewCliDiscoverable: false
        }),
        blocker: expect.objectContaining({
          kind: 'operator-authentication-required'
        })
      })
    );
    expect(iteration.installAttempts).toContainEqual(
      expect.objectContaining({
        attemptId: 'physical-host-install-2026-05-16',
        mutationPerformed: true,
        facts: expect.objectContaining({
          aptInstallExit: 0,
          labviewCliPath: '/usr/local/bin/LabVIEWCLI',
          activationAttemptedByCodex: false,
          activationRequiredBeforeHostProof: true,
          vihsValidateAttempted: false
        }),
        nextOperatorAction: expect.stringContaining('Sergio activates LabVIEW 2026 Community')
      })
    );
    expect(iteration.proofAttempts).toContainEqual(
      expect.objectContaining({
        attemptId: 'vihs-validate-after-activation-2026-05-16',
        result: 'passed',
        facts: expect.objectContaining({
          runtimeValidationOutcome: 'ready',
          errorCode: 'VIHS_OK'
        })
      })
    );
    expect(iteration.proofAttempts).toContainEqual(
      expect.objectContaining({
        attemptId: 'validate-fixture-headless-2026-05-16',
        result: 'failed',
        bugOracleClassification: 'implementation-defect-candidate',
        facts: expect.objectContaining({
          fixtureRepositoryCloned: true,
          headlessDiagnosticReason: 'linux-headless-recursive-load'
        })
      })
    );
    expect(iteration.proofAttempts).toContainEqual(
      expect.objectContaining({
        attemptId: 'manual-create-comparison-after-activation-2026-05-16',
        result: 'passed',
        facts: expect.objectContaining({
          reportSizeBytes: 414111,
          reportSha256: 'bb1586a22f6948b2be434fb3df974576b0fd90b0b1338aed9d96596606767813',
          assetCount: 361,
          closeLabviewExit: 0,
          labviewProcessesRemainingAfterClose: false
        })
      })
    );
    expect(iteration.proofAttempts).toContainEqual(
      expect.objectContaining({
        attemptId: 'validate-fixture-host-nonheadless-2026-05-16',
        result: 'passed',
        bugOracleClassification: 'implementation-defect-candidate',
        facts: expect.objectContaining({
          executionPlanHeadless: false,
          publicCommandContractChanged: false,
          runtimeExecutionState: 'succeeded',
          runtimeExitCode: 0,
          runtimeDiagnosticReason: null,
          generatedReportExists: true,
          reportSizeBytes: 451669,
          reportSha256: '2f98e6bc367b826626108d05c0cddbe1f4beb4e81d8fd5c9166d87e30d863520',
          assetCount: 361,
          closeLabviewExit: 0,
          labviewProcessesRemainingAfterClose: false
        })
      })
    );
    expect(iteration.redactionBoundary).toMatchObject({
      publicMutationRequired: false,
      privateEvidenceRetainedInGitLabOnly: true
    });
    expect(iteration.nextActions?.join(' ')).toContain('Close #24');
    expect(iteration.nextActions?.join(' ')).toContain('Close #25');
    expect(iterationDoc).toContain('interactive authentication is required');
    expect(iterationDoc).toContain('/usr/local/bin/LabVIEWCLI');
    expect(iterationDoc).toContain('Codex did not activate');
    expect(iterationDoc).toContain('physical-host Linux');
    expect(iterationDoc).toContain('validate-fixture');
    expect(iterationDoc).toContain('linux-headless-recursive-load');
    expect(iterationDoc).toContain('work item #25');
    expect(iterationDoc).toContain('validate-fixture-host-nonheadless-2026-05-16');
    expect(iterationDoc).toContain('runtime diagnostic reason: `<none>`');
    expect(iterationDoc).toContain('not a Linux');
    expect(iterationDoc).toContain('Vagrant substitute');
    expect(iterationDoc).toContain('No public GitHub import mutation is required');
    expect(summary).toContain('physical-host-labview-2026-proof-v1');
    expect(summary).toContain('451669');
  });
});

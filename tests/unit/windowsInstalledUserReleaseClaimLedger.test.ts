import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const claimScript = require(path.resolve(
  __dirname,
  '..',
  '..',
  'scripts',
  'assertWindowsInstalledUserReleaseClaim.js'
)) as {
  evaluateReleaseClaimLedger: (options: {
    repoRoot: string;
    ledgerPath: string;
    hostProofPath: string;
    vsixProofPath: string;
    dockerBlockerPath: string;
    dockerProofPath: string;
    evidenceRoot: string;
  }) => {
    status: string;
    failures: Array<{ id: string; message: string }>;
    facts: {
      hostProof?: Record<string, unknown>;
      vsixProof?: Record<string, unknown>;
      dockerBlocker?: Record<string, unknown>;
      dockerProof?: Record<string, unknown>;
    };
  };
};

const repoRoot = path.resolve(__dirname, '..', '..');

function readText(relativePath: string): string {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function readJson<T>(relativePath: string): T {
  return JSON.parse(readText(relativePath)) as T;
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  await fsp.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

describe('Windows installed-user release-claim ledger', () => {
  it('retains the host-admitted Docker-blocked claim and mutation boundary in tracked docs', () => {
    const ledger = readJson<any>(
      'docs/product/windows-installed-user-release-claim-ledger-2026-05-14.json'
    );
    const ledgerDoc = readText(
      'docs/product/windows-installed-user-release-claim-ledger-2026-05-14.md'
    );
    const currentState = readText('docs/product/current-state.md');
    const informationItemMap = readText('docs/information-item-map.md');
    const packageManifest = readJson<{ scripts?: Record<string, string> }>('package.json');

    expect(ledger).toMatchObject({
      schema: 'vi-history-suite/windows-installed-user-release-claim-ledger@v1',
      status: 'host-proof-admitted-docker-proof-blocked-no-mutation',
      claim: {
        claimId: 'windows-installed-user-host-labview-2026-x64-v1.3.16-2026-05-14',
        packageVersion: '1.3.16',
        authorityTag: 'v1.3.16',
        scope: 'installed-user-host-labview-2026-x64'
      },
      admittedProofs: {
        windowsHostLabview2026x64: {
          status: 'admitted',
          receiptPath:
            '.cache/windows-host-labview-capability-proof/20260513T161541Z/fixture-proof/vihs-fixture-validation-proof.json',
          requiredResult: {
            classification: 'validation-success',
            runtimeExecutionState: 'succeeded',
            runtimeProvider: 'host-native',
            runtimeEngine: 'labview-cli',
            generatedReportExists: true
          }
        },
        exactVsixInstalledUser: {
          status: 'admitted',
          receiptPath:
            '.cache/windows-exact-vsix-install-proof/latest/windows-exact-vsix-install-proof.json',
          requiredResult: {
            status: 'passed',
            productionMutationAttempted: false,
            packageVersion: '1.3.16',
            tag: 'v1.3.16',
            vsixSha256Verified: true
          }
        }
      },
      blockedProofs: {
        windowsDockerDesktopWindowsContainers: {
          status: 'blocked-not-admitted',
          requiredDockerOSType: 'windows',
          observedDockerOSType: 'windows',
          admissionRule: 'do-not-substitute-host-proof-for-windows-container-proof',
          canonicalProofObservedResult: {
            runtimeExecutionState: 'failed',
            runtimeProvider: 'windows-container',
            runtimeEngine: 'labview-cli',
            generatedReportExists: false
          }
        }
      },
      mutationBoundary: {
        publicGitHubRelease: 'not-performed',
        publicGitHubSource: 'not-performed',
        vscodeMarketplace: 'not-performed',
        gitTags: 'not-performed',
        releaseBranches: 'not-deleted',
        retainedEvidenceDeleted: false
      }
    });
    expect(ledger.hostOnlyAcceptanceGate).toMatchObject({
      packageScript: 'npm run acceptance:windows:installed-user-host',
      scriptScope: 'host-only',
      dockerProofIncluded: false
    });
    expect(ledger.fullPrivateReleaseGate).toMatchObject({
      packageScript: 'npm run acceptance:windows:private-release',
      scriptScope: 'full',
      dockerProofIncluded: true
    });
    expect(ledger.claimAssertionGate.packageScript).toBe(
      'npm run proof:windows-installed-user-claim:assert'
    );
    expect(ledger.retentionBoundary.retainedEvidence).toEqual(
      expect.arrayContaining([
        '.cache/windows-host-labview-capability-proof/20260513T161541Z/',
        '.cache/windows-exact-vsix-install-proof/latest/',
        '.cache/windows-docker-desktop-proof-blocker/20260513T154353Z/',
        'vihs-fixture-proof/',
        'windows-installed-user-host-evidence/',
        '.cache/windows-installed-user-release-claim-assertion/latest/'
      ])
    );

    expect(ledgerDoc).toContain('Windows Installed-User Release-Claim Ledger - 2026-05-14');
    expect(ledgerDoc).toContain('runtimeProvider=host-native');
    expect(ledgerDoc).toContain('runtimeProvider=windows-container');
    expect(ledgerDoc).toContain('not be substituted for that Docker proof.');
    expect(ledgerDoc).toContain('npm run acceptance:windows:installed-user-host');
    expect(ledgerDoc).toContain('npm run proof:windows-installed-user-claim:assert');
    expect(ledgerDoc).toContain('VS Code Marketplace | not performed');
    expect(ledgerDoc).toContain('windows-installed-user-host-evidence/');
    expect(ledgerDoc).toContain('.cache/windows-installed-user-release-claim-assertion/latest/');

    expect(packageManifest.scripts?.['acceptance:windows:installed-user-host']).toContain(
      '--scope host-only'
    );
    expect(packageManifest.scripts?.['proof:windows-installed-user-claim:assert']).toBe(
      'node scripts/assertWindowsInstalledUserReleaseClaim.js'
    );
    expect(currentState).toContain('windows-installed-user-release-claim-ledger-2026-05-14.md');
    expect(informationItemMap).toContain('Windows installed-user release-claim ledger');
  });

  it('asserts retained host proof while failing closed if Docker proof becomes admissible under a blocked ledger', async () => {
    const tempRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'vihs-windows-claim-'));
    const ledger = readJson<any>(
      'docs/product/windows-installed-user-release-claim-ledger-2026-05-14.json'
    );
    ledger.admittedProofs.windowsHostLabview2026x64.receiptPath = 'receipts/host-proof.json';
    ledger.admittedProofs.exactVsixInstalledUser.receiptPath = 'receipts/vsix-proof.json';
    ledger.blockedProofs.windowsDockerDesktopWindowsContainers.blockerReceiptPath =
      'receipts/docker-blocker.json';
    ledger.blockedProofs.windowsDockerDesktopWindowsContainers.canonicalProofReceiptPath =
      'receipts/docker-proof.json';

    const ledgerPath = path.join(tempRoot, 'ledger.json');
    const hostProofPath = path.join(tempRoot, 'receipts', 'host-proof.json');
    const vsixProofPath = path.join(tempRoot, 'receipts', 'vsix-proof.json');
    const dockerBlockerPath = path.join(tempRoot, 'receipts', 'docker-blocker.json');
    const dockerProofPath = path.join(tempRoot, 'receipts', 'docker-proof.json');

    await writeJson(ledgerPath, ledger);
    await writeJson(hostProofPath, {
      schema: 'vi-history-suite/public-fixture-validation-proof@v1',
      classification: 'validation-success',
      selectedVariant: {
        platform: 'win32',
        provider: 'host',
        labviewVersion: '2026',
        labviewBitness: 'x64'
      },
      result: {
        runtimeExecutionState: 'succeeded',
        runtimeProvider: 'host-native',
        runtimeEngine: 'labview-cli',
        runtimeBlockedReason: null,
        runtimeFailureReason: null,
        generatedReportExists: true
      }
    });
    await writeJson(vsixProofPath, {
      schema: 'vi-history-suite/windows-exact-vsix-install-proof@v1',
      status: 'passed',
      productionMutationAttempted: false,
      authority: {
        packageVersion: '1.3.16',
        tag: 'v1.3.16',
        expectedVsixSha256:
          '56bc9b222ec859f530ea523eed215b2efde4ce96fa9fcc4974f6589da3b81170',
        observedVsixSha256:
          '56bc9b222ec859f530ea523eed215b2efde4ce96fa9fcc4974f6589da3b81170',
        vsixSha256Verified: true
      },
      commands: [
        { id: 'install-exact-vsix', status: 'passed', exitCode: 0 },
        { id: 'vihs', status: 'passed', exitCode: 0 },
        { id: 'vihs-validate', status: 'passed', exitCode: 0, runtimeValidationOutcome: 'ready' }
      ]
    });
    await writeJson(dockerBlockerPath, {
      schema: 'vi-history-suite/windows-docker-desktop-proof-blocker@v1',
      status: 'blocked',
      decision: 'not-admitted',
      docker: {
        requiredOSType: 'windows',
        observedOSType: 'windows',
        observedServerVersion: '29.4.3'
      },
      blocker: {
        code: 'ni-windows-labview-container-image-layer-fetch-unauthorized-after-docker-auth',
        admissibleSuccessBlocked: true
      },
      mutations: {
        publicGitHubRelease: 'not-performed',
        vscodeMarketplace: 'not-performed',
        gitTags: 'not-performed',
        releaseBranches: 'not-deleted',
        retainedEvidenceDeleted: false
      }
    });
    const dockerProof = {
      schema: 'vi-history-suite/public-fixture-validation-proof@v1',
      classification: 'validation-failure',
      selectedVariant: {
        platform: 'win32',
        provider: 'docker',
        labviewVersion: '2026',
        labviewBitness: 'x64'
      },
      result: {
        runtimeExecutionState: 'failed',
        runtimeProvider: 'windows-container',
        runtimeEngine: 'labview-cli',
        generatedReportExists: false
      }
    };
    await writeJson(dockerProofPath, dockerProof);

    const options = {
      repoRoot: tempRoot,
      ledgerPath,
      hostProofPath: '',
      vsixProofPath: '',
      dockerBlockerPath: '',
      dockerProofPath: '',
      evidenceRoot: path.join(tempRoot, 'evidence')
    };

    expect(claimScript.evaluateReleaseClaimLedger(options)).toEqual(
      expect.objectContaining({
        status: 'passed',
        failures: []
      })
    );

    await writeJson(dockerProofPath, {
      ...dockerProof,
      classification: 'validation-success',
      result: {
        ...dockerProof.result,
        runtimeExecutionState: 'succeeded',
        generatedReportExists: true
      }
    });

    const failed = claimScript.evaluateReleaseClaimLedger(options);
    expect(failed.status).toBe('failed');
    expect(failed.failures).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'docker-proof-still-blocked'
        })
      ])
    );
  });
});

import * as fs from 'node:fs';
import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '..', '..');

const packetJsonPath =
  'docs/product/benchmark-packets/HARNESS-VHS-002-linux-host-labview-2026-create-comparison-proof-2026-04-26.json';
const packetMarkdownPath =
  'docs/product/benchmark-packets/HARNESS-VHS-002-linux-host-labview-2026-create-comparison-proof-2026-04-26.md';
const fixtureRepository = 'https://github.com/ni/labview-icon-editor';
const fixtureViPath = 'resource/plugins/lv_icon.vi';
const oldCommit = 'ab94f6c4b375062492036c63a6dab7ea8824748a';
const newCommit = '8741bb08026c104100720c0ef48621e4ab7762fd';
const linuxLabviewPath = '/usr/local/natinst/LabVIEW-2026-64/labview';
const reportSha256 = '637055a103b25ecc77e4e308a6d216fc7adab0e1741038502bb53f129e5eb864';

function readText(relativePath: string): string {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function readJson<T>(relativePath: string): T {
  return JSON.parse(readText(relativePath)) as T;
}

describe('Linux host LabVIEW 2026 proof docs', () => {
  it('retains the Linux host proof packet with fixture, runtime, and artifact facts', () => {
    const packet = readJson<any>(packetJsonPath);

    expect(packet).toMatchObject({
      schema: 'vi-history-suite/linux-host-labview-2026-create-comparison-proof@v1',
      packetId: 'HARNESS-VHS-002-linux-host-labview-2026-create-comparison-proof-2026-04-26',
      proofDate: '2026-04-26',
      recordedAt: '2026-04-26T22:36:27.859Z',
      scope: {
        provider: 'host',
        runtimeProvider: 'host-native',
        engine: 'labview-cli',
        operation: 'CreateComparisonReport',
        platform: 'linux',
        labviewVersion: '2026',
        labviewBitness: 'x64',
        doesNotClaim: 'Windows installed-user LabVIEW proof'
      },
      host: {
        os: 'Ubuntu 25.10',
        kernel: '6.17.0-1017-oem',
        labviewExePath: linuxLabviewPath,
        labviewExeTarget: 'labviewcommunity',
        labviewCliPath: '/usr/local/bin/LabVIEWCLI',
        lvComparePath: '/usr/local/bin/LVCompare'
      },
      vihsRuntimeValidation: {
        proofStatus: 'ready',
        implementationStatus: 'implemented',
        errorCode: 'VIHS_OK',
        selectedSettings: {
          provider: 'host',
          labviewVersion: '2026',
          labviewBitness: 'x64'
        },
        validationOutcome: 'ready',
        runtimeProvider: 'host-native',
        runtimeEngine: 'labview-cli',
        runtimeBlockedReason: null
      },
      fixture: {
        repository: fixtureRepository,
        viPath: fixtureViPath,
        oldCommit,
        newCommit,
        viSignature: 'LVIN'
      },
      compareExecution: {
        exitCode: 0,
        result: 'succeeded',
        reportFile: 'diff-report-lv_icon.vi.html',
        reportSizeBytes: 214412,
        reportSha256,
        logEvidence: expect.arrayContaining(['CreateComparisonReport operation succeeded.'])
      },
      boundaries: {
        linuxHostLabviewProofState: 'admitted-local-maintainer-proof',
        windowsInstalledUserLabviewProofState: 'community-deferred',
        linuxHostLabviewProofMayProveWindowsInstalledUserLabview: false,
        publicGitHubMutation: 'not-performed',
        marketplaceMutation: 'not-performed'
      }
    });
    expect(packet.installation.localCompatibilityFixes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ description: expect.stringContaining('libglu1-mesa') }),
        expect.objectContaining({ postFixReadelf: 'GNU_STACK RW' })
      ])
    );
  });

  it('retains the release-control boundary separately from Windows installed-user proof', () => {
    const releaseState = readJson<any>('docs/product/release-publication-state.json');

    expect(releaseState.developPreview).toMatchObject({
      classification:
        'linux-docker-linux-host-windows-host-labview-and-vagrant-vsix-validated-preview',
      stateRole: 'retained-provider-lane-linux-host-windows-host-and-vagrant-acceptance-evidence',
      publicationState: 'develop-provider-lane-linux-host-and-windows-host-labview-evidence',
      linuxHostLabviewProofState: 'admitted-local-maintainer-proof',
      windowsInstalledUserProofState: 'admitted-for-host-labview-2026-x64',
      windowsDockerDesktopProofState: 'community-deferred',
      linuxHostLabviewProofMayProveWindowsInstalledUserLabview: false,
      publicGitHubMutation: 'not-performed-by-this-packet',
      marketplaceMutation: 'not-performed-by-this-packet'
    });
    expect(releaseState.developPreview.vagrantVsixAcceptanceEvidence).toMatchObject({
      packageScript: 'npm run vagrant:acceptance:assert',
      runtimeProvider: 'host-native',
      runtimeEngine: 'labview-cli',
      requiredRuntimeExecutionState: 'succeeded'
    });
    expect(releaseState.developPreview.linuxHostLabviewEvidence).toMatchObject({
      packetPath: packetMarkdownPath,
      packetJsonPath,
      status: 'passed',
      platform: 'linux',
      runtime: {
        errorCode: 'VIHS_OK',
        provider: 'host-native',
        engine: 'labview-cli',
        labviewExePath: linuxLabviewPath
      },
      fixture: {
        repository: fixtureRepository,
        viPath: fixtureViPath,
        oldCommit,
        newCommit
      },
      compare: {
        operation: 'CreateComparisonReport',
        exitCode: 0,
        result: 'succeeded',
        reportSizeBytes: 214412,
        reportSha256
      },
      windowsInstalledUserLabviewProofState: 'admitted-separate-windows-host-proof',
      linuxHostLabviewProofMayProveWindowsInstalledUserLabview: false,
      publicGitHubMutation: 'not-performed',
      marketplaceMutation: 'not-performed'
    });
    expect(releaseState.developPreview.windowsHostLabviewEvidence).toMatchObject({
      packetPath:
        'docs/product/benchmark-packets/HARNESS-VHS-002-public-fixture-validate-fixture-windows-host-labview-2026-v1.3.12-2026-04-26.md',
      packetJsonPath:
        'docs/product/benchmark-packets/HARNESS-VHS-002-public-fixture-validate-fixture-windows-host-labview-2026-v1.3.12-2026-04-26.json',
      status: 'passed',
      platform: 'win32',
      runtime: {
        errorCode: 'VIHS_OK',
        validationOutcome: 'ready',
        provider: 'host-native',
        engine: 'labview-cli'
      },
      fixture: {
        repository: fixtureRepository,
        viPath: fixtureViPath,
        oldCommit,
        newCommit
      },
      compare: {
        operation: 'CreateComparisonReport',
        exitCode: 0,
        result: 'succeeded',
        reportSizeBytes: 146915
      }
    });
    expect(releaseState.marketplaceCommunityValidationPreview.linuxHostLabviewEvidenceClaim).toContain(
      'admitted-and-carried-forward-from-1.3.12-public-validation-wording'
    );
    expect(releaseState.marketplaceCommunityValidationPreview.publicGitHubReleaseMutation).toBe(
      'published-and-verified-with-corrected-asset-release'
    );
  });

  it('keeps the proof traceable through docs, requirements, RTM, and tests', () => {
    const textSurfaces = [
      packetMarkdownPath,
      'docs/product/release-publication-state.md',
      'docs/product/current-state.md',
      'docs/requirements/srs.md',
      'docs/requirements/rtm.csv',
      'docs/testing/test-plan.md'
    ];

    for (const surface of textSurfaces) {
      const text = readText(surface);
      expect(text).toContain('VHS-REQ-588');
      expect(text).toContain(fixtureRepository);
      expect(text).toContain(fixtureViPath);
      expect(text).toContain(oldCommit);
      expect(text).toContain(newCommit);
      expect(text).toContain(linuxLabviewPath);
      expect(text).toContain('VIHS_OK');
      expect(text).toContain('host-native');
      expect(text).toContain('CreateComparisonReport');
      expect(text).toContain('community/deferred');
    }

    const rtm = readText('docs/requirements/rtm.csv');
    const testPlan = readText('docs/testing/test-plan.md');
    expect(rtm).toContain('TEST-UNIT-395; TEST-DOC-147');
    expect(rtm).toContain('tests/unit/linuxHostLabviewProofDocs.test.ts');
    expect(testPlan).toContain('TEST-UNIT-395');
    expect(testPlan).toContain('TEST-DOC-147');
  });

  it('retains the Linux host-discovery implementation contract in code and focused tests', () => {
    const locator = readText('src/reporting/comparisonRuntimeLocator.ts');
    const locatorTests = readText('tests/unit/comparisonRuntimeLocator.test.ts');

    expect(locator).toContain('LabVIEW(?:[- ])');
    expect(locator).toContain('labviewcommunity');
    expect(locatorTests).toContain(
      'recognizes the Linux LabVIEW 2026 Community host runtime scan roots'
    );
    expect(locatorTests).toContain(
      'filters Linux host runtime selection by requested LabVIEW version'
    );
    expect(locatorTests).toContain(linuxLabviewPath);
  });
});

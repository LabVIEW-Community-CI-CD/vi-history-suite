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

describe('Marketplace community-validation intake packet', () => {
  it('retains user validation instructions, proof wording, and a public-gated boundary', () => {
    const packet = readText('docs/product/marketplace-community-validation-intake-v1.3.10.md');
    const packetJson = readJson<any>(
      'docs/product/marketplace-community-validation-intake-v1.3.10.json'
    );
    const releaseState = readJson<any>('docs/product/release-publication-state.json');
    const ledger = readJson<any>('docs/product/vscode-marketplace-publication-ledger.json');
    const informationItemMap = readText('docs/information-item-map.md');

    expect(packetJson).toMatchObject({
      schema: 'vi-history-suite/marketplace-community-validation-intake@v1',
      status: 'prepared-public-github-gated',
      marketplace: {
        itemName: 'svelderrainruiz.vi-history-suite',
        communityValidationVersion: '1.3.10',
        regularExactVersionRetained: '1.3.9',
        publicationKind: 'pre-release',
        installCommand: 'code --install-extension svelderrainruiz.vi-history-suite@prerelease'
      },
      proofStatus: {
        linuxDockerClaim: 'linux-docker-validated-preview',
        windowsLabviewInstalledUserProof: 'deferred',
        selectableFeaturePolicy: 'selectable-with-proof-status-disclosure',
        forbiddenClaim:
          'do-not-use-linux-docker-evidence-as-windows-labview-installed-user-proof'
      },
      preparedPublicSourceArtifacts: {
        publicGitHubMutation: 'not-performed',
        promotionRequiredBeforePublicEffect: true,
        labelManifestPath: 'public-github-source/.github/labels.yml'
      }
    });

    expect(packet).toContain('code --install-extension svelderrainruiz.vi-history-suite@prerelease');
    expect(packet).toContain('4. Run `code --version` and retain the complete output.');
    expect(packet).toContain('5. Run `code --list-extensions --show-versions`');
    expect(packet).toContain('6. Run `vihs` and record whether');
    expect(packet).toContain('7. Run `vihs --validate` and retain the complete output.');
    expect(packet).toContain('Selectable does not mean maintainer-proven');
    expect(packet).toContain('Do not say that Linux/Docker evidence proves Windows/LabVIEW');
    expect(packet).toContain('Public GitHub mutation: gated separately');

    expect(packetJson.userValidationInstructions.steps).toEqual(
      expect.arrayContaining([
        'run code --version and retain the complete output',
        'run code --list-extensions --show-versions and retain the svelderrainruiz.vi-history-suite line',
        'run vihs and record whether the generated runtime-settings CLI opens',
        'run vihs --validate and retain the complete output'
      ])
    );
    expect(packetJson.userValidationInstructions.requiredCommands).toEqual([
      'code --version',
      'code --list-extensions --show-versions',
      'vihs',
      'vihs --validate'
    ]);
    expect(packetJson.userValidationInstructions.doNotCollect).toEqual(
      expect.arrayContaining(['PATs', 'access tokens', 'private GitLab material'])
    );

    expect(releaseState.marketplaceCommunityValidationPreview).toMatchObject({
      intakeStatus: 'prepared-public-github-gated',
      intakePacketPath: 'docs/product/marketplace-community-validation-intake-v1.3.10.md',
      preparedPublicIssueTemplatePath:
        'public-github-source/.github/ISSUE_TEMPLATE/community-validation-windows-labview.yml',
      preparedPublicLabelManifestPath: 'public-github-source/.github/labels.yml'
    });
    expect(ledger.communityValidationIntake).toMatchObject({
      status: 'prepared-public-github-gated',
      publicGitHubMutationAttempted: false,
      marketplaceMutationAttempted: false,
      proofStatusPolicy: 'selectable-does-not-mean-maintainer-proven'
    });
    expect(informationItemMap).toContain('Marketplace community-validation intake packet');
  });

  it('prepares public issue templates and labels without publishing them', () => {
    const template = readText(
      'public-github-source/.github/ISSUE_TEMPLATE/community-validation-windows-labview.yml'
    );
    const bugReport = readText('public-github-source/.github/ISSUE_TEMPLATE/bug-report.yml');
    const labviewRequest = readText(
      'public-github-source/.github/ISSUE_TEMPLATE/labview-version-support.yml'
    );
    const issueConfig = readText('public-github-source/.github/ISSUE_TEMPLATE/config.yml');
    const labels = readText('public-github-source/.github/labels.yml');

    expect(template).toContain('Marketplace community validation report');
    expect(template).toContain('Marketplace pre-release `1.3.10`');
    expect(template).toContain('Selectable does not mean maintainer-proven');
    expect(template).toContain('Validation outcome');
    expect(template).toContain('Proof-status acknowledgement');
    expect(template).toContain('vihs --validate');
    expect(template).not.toContain('PRIVATE-TOKEN');
    expect(template).not.toContain('PAT ');

    expect(bugReport).toContain('community-validation');
    expect(bugReport).toContain('Marketplace community-validation pre-release (`1.3.10`)');
    expect(labviewRequest).toContain('proof:deferred');
    expect(labviewRequest).toContain('proof-deferred');
    expect(issueConfig).toContain('Marketplace community validation');

    for (const label of [
      'community-validation',
      'marketplace-preview',
      'windows-labview',
      'proof:reported',
      'proof:reproduced',
      'proof:deferred',
      'needs-reproduction',
      'provider:host',
      'provider:docker',
      'labview:x64',
      'labview:x86'
    ]) {
      expect(labels).toContain(`name: ${label}`);
    }
  });
});

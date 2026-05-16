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
    expect(informationItemMap).toContain('Dual-authority split manifest');
    expect(informationItemMap).toContain('Dual-authority runtime-contract export packet');
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
        bugOracleClassification: 'requirement-clarification-candidate',
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
      importedRequirementIds?: string[];
      bugOracleClassification?: string;
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
    expect(iteration.importedRequirementIds).toEqual(
      expect.arrayContaining(['VHS-SYS-REQ-006', 'VHS-SYS-REQ-007', 'VHS-REQ-588'])
    );
    expect(iteration.bugOracleClassification).toBe('requirement-clarification-candidate');
    expect(iteration.redactionBoundary).toMatchObject({
      publicMutationRequired: false,
      privateEvidenceRetainedInGitLabOnly: true
    });
    expect(iteration.nextActions?.join(' ')).toContain('physical-host proof item');
    expect(iterationDoc).toContain('not a Linux Vagrant substitute');
    expect(iterationDoc).toContain('No public GitHub import mutation is required');
    expect(summary).toContain('physical-host-labview-2026-proof-v1');
  });
});

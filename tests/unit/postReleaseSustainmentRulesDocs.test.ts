import * as fs from 'node:fs';
import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '..', '..');

type SustainmentRules = {
  trancheId: string;
  issueId: string;
  programId: string;
  status: string;
  parallelOpenCloseout: {
    trancheId: string;
    issueId: string;
    programId: string;
    state: string;
  };
  releaseCadence: {
    model: string;
    versionLineContract: {
      retainedExactVersionReleases: string[];
      currentExactReleaseLine: string;
      currentMainPackageLine: string;
      publicCodespaceBranch: string;
    };
    maintainedSurfaces: string[];
    refreshTriggers: string[];
    strictSemverRule?: string[];
    explicitNonTriggers: string[];
  };
  benchmarkRefreshCadence: {
    model: string;
    acceptedComparablePrefix: {
      commitCount: number;
      pairCount: number;
    };
    acceptedCurrentContractBoundaries: Array<{
      surface: string;
      firstInvalidPair: number | string;
      characterization: string;
    }>;
    refreshTriggers: string[];
    explicitNonTriggers: string[];
    reopenTriggers: string[];
  };
  operatorSurfaceSustainment: {
    requiredAuthorityUpdates: string[];
    requiredVerification: string[];
    requiredDerivedUpdatesWhenReaderFacingTruthChanges: string[];
    prohibitedBypasses: string[];
  };
};

function readText(relativePath: string): string {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function readJson<T>(relativePath: string): T {
  return JSON.parse(readText(relativePath)) as T;
}

describe('post-release sustainment rules package', () => {
  it('keeps the active sustainment contract aligned across rules, queue, and entrypoint docs', () => {
    const rules = readJson<SustainmentRules>('docs/product/post-release-sustainment-rules.json');
    const rulesDoc = readText('docs/product/post-release-sustainment-rules.md');
    const readme = readText('README.md');
    const currentState = readText('docs/product/current-state.md');
    const ship = readText('docs/product/SHIP-0001-releasable-vi-history-suite.md');
    const program = readText(
      'docs/product/execution-programs/PROGRAM-0004-post-release-sustainment-and-release-cadence.md'
    );
    const issue = readText(
      'docs/product/issues/ISSUE-0409-post-release-sustainment-and-release-cadence.md'
    );
    const informationItemMap = readText('docs/information-item-map.md');

    expect(rules.trancheId).toBe('TRANCHE-012');
    expect(rules.issueId).toBe('ISSUE-0409');
    expect(rules.programId).toBe('PROGRAM-0004');
    expect(rules.status).toBe('active');
    expect(rules.parallelOpenCloseout).toEqual({
      trancheId: 'TRANCHE-010',
      issueId: 'ISSUE-0407',
      programId: 'PROGRAM-0002',
      state: 'reopened-on-docker-only-public-contract'
    });

    expect(rules.releaseCadence.model).toBe('event-driven');
    expect(rules.releaseCadence.versionLineContract).toEqual({
      retainedExactVersionReleases: ['v0.2.0', 'v1.0.0', 'v1.0.1', 'v1.0.2'],
      currentExactReleaseLine: 'v1.0.2',
      currentMainPackageLine: '1.0.2',
      publicCodespaceBranch: 'develop'
    });
    expect(rules.releaseCadence.maintainedSurfaces).toContain(
      'preview-evidence/vi-history-suite-<version>.vsix'
    );
    expect(rules.releaseCadence.maintainedSurfaces).toContain(
      'release-evidence/release-manifest.json'
    );
    expect(rules.releaseCadence.refreshTriggers).toContain('package.json version change');
    expect(rules.releaseCadence.refreshTriggers).toContain(
      'release-procedure, ship-control, or docs-workbench publication contract change'
    );
    expect(rules.releaseCadence.strictSemverRule).toEqual(
      expect.arrayContaining([
        'after an exact release is published, the current published package line on main shall match that exact release line',
        'any later repo change intended for publication shall advance package.json and the top CHANGELOG.md heading to the next SemVer line before further normalization or publication',
        'future sessions shall not treat an unreleased SemVer bump as complete until the matching public tag and public GitHub release are both published',
        'future sessions shall not keep landing post-release changes on the previous exact release version number'
      ])
    );

    expect(rules.benchmarkRefreshCadence.model).toBe('event-driven-bounded');
    expect(rules.benchmarkRefreshCadence.acceptedComparablePrefix).toEqual({
      commitCount: 129,
      pairCount: 128
    });
    expect(rules.benchmarkRefreshCadence.acceptedCurrentContractBoundaries).toContainEqual({
      surface: 'windows-benchmark-image',
      firstInvalidPair: 129,
      characterization: 'mixed-bitness-call-by-reference-seam'
    });
    expect(rules.benchmarkRefreshCadence.acceptedCurrentContractBoundaries).toContainEqual({
      surface: 'linux-benchmark-image',
      firstInvalidPair: '135/138',
      characterization:
        'linux-headless-recursive-load / labview-cli-connection-failed after one CloseLabVIEW recovery attempt'
    });
    expect(rules.benchmarkRefreshCadence.reopenTriggers).toContain(
      'the current governed Windows benchmark image contract gains same-bitness x86 provisioning'
    );
    expect(rules.benchmarkRefreshCadence.explicitNonTriggers).toContain(
      'out-of-scope alternative Windows x86 provisioning that is not part of the current governed image contract'
    );

    expect(rules.operatorSurfaceSustainment.requiredAuthorityUpdates).toContain(
      'docs/product/post-release-sustainment-rules.md'
    );
    expect(rules.operatorSurfaceSustainment.requiredDerivedUpdatesWhenReaderFacingTruthChanges).toContain(
      'docs/product/wiki-publication-ledger.json'
    );
    expect(rules.operatorSurfaceSustainment.requiredVerification).toContain(
      'npm run design:gate:assert-complete'
    );
    expect(rules.operatorSurfaceSustainment.prohibitedBypasses).toContain(
      'execution-policy bypass that skips canonical execution-request validation'
    );
    expect(rules.operatorSurfaceSustainment.prohibitedBypasses).toContain(
      'PowerShell ExecutionPolicy Bypass on governed benchmark-image or host-proof helper surfaces'
    );

    expect(rulesDoc).toContain('## Release Refresh Rules');
    expect(rulesDoc).toContain('Current version-line contract:');
    expect(rulesDoc).toContain('Strict SemVer rule after an exact release');
    expect(rulesDoc).toContain('## Benchmark Refresh Rules');
    expect(rulesDoc).toContain('## Operator And Documentation Upkeep Rules');
    expect(rulesDoc).toContain('PROGRAM-0002');
    expect(rulesDoc).toContain('execution-policy bypass');
    expect(rulesDoc).toContain('ExecutionPolicy Bypass');

    expect(readme).toContain(
      '[Post-Release Sustainment Rules](./docs/product/post-release-sustainment-rules.md)'
    );
    expect(currentState).toContain(
      '[post-release-sustainment-rules.md](./post-release-sustainment-rules.md)'
    );
    expect(ship).toContain('[post-release-sustainment-rules.md](./post-release-sustainment-rules.md)');
    expect(program).toContain('[post-release-sustainment-rules.md](../post-release-sustainment-rules.md)');
    expect(issue).toContain('docs/product/post-release-sustainment-rules.md');
    expect(issue).toContain('reopened `PROGRAM-0002`');

    expect(informationItemMap).toContain(
      '| Post-release sustainment rules | `docs/product/post-release-sustainment-rules.md` |'
    );
    expect(informationItemMap).toContain(
      '| Machine-readable post-release sustainment rules | `docs/product/post-release-sustainment-rules.json` |'
    );
  });
});

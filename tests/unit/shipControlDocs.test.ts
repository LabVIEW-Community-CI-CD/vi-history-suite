import * as fs from 'node:fs';
import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

interface QueueEntry {
  id?: string;
  status?: string;
}

interface ReadinessCriterion {
  id: string;
  issueId: string;
  status: 'done' | 'active' | 'blocked' | 'queued';
  blockerId: string | null;
  blocker: string | null;
  nextAction: string;
}

interface ReadinessMatrix {
  shipId: string;
  activeIssueId: string;
  currentPackageVersion: string;
  releaseTarget: string;
  targetVsixArtifact: string;
  targetReleaseManifest: string;
  activeTrancheId: string;
  criteria: ReadinessCriterion[];
}

interface BlockerLedgerEntry {
  id: string;
  criterionId: string;
  trancheId: string;
  issueId: string;
  status: 'open' | 'mitigated' | 'closed';
  summary: string;
}

interface BlockerLedger {
  shipId: string;
  releaseTarget: string;
  activeTrancheId: string;
  activeIssueId: string;
  blockers: BlockerLedgerEntry[];
}

interface PackageManifest {
  version: string;
}

function readText(relativePath: string): string {
  return fs.readFileSync(path.resolve(__dirname, '..', '..', relativePath), 'utf8');
}

function readJson<T>(relativePath: string): T {
  return JSON.parse(readText(relativePath)) as T;
}

describe('ship-control direction system', () => {
  it('defines an authoritative ship target with a concrete semver release target', () => {
    const shipDoc = readText('docs/product/SHIP-0001-releasable-vi-history-suite.md');

    expect(shipDoc).toContain('# SHIP-0001: Releasable VI History Suite');
    expect(shipDoc).toContain('- Target release: `v0.2.0`');
    expect(shipDoc).toContain('- Current package baseline: `0.1.0`');
    expect(shipDoc).toContain('- Target VSIX artifact: `vi-history-suite-0.2.0.vsix`');
    expect(shipDoc).toContain('- Target release manifest: `release-evidence/release-manifest.json`');
    expect(shipDoc).toContain('[release-readiness-matrix.json](./release-readiness-matrix.json)');
    expect(shipDoc).toContain('[blocker-ledger.json](./blocker-ledger.json)');
    expect(shipDoc).toContain('- `TRANCHE-009`');
  });

  it('keeps exactly one active tranche in the development queue and aligns it to the readiness matrix', () => {
    const queue = readJson<QueueEntry[]>('docs/product/development-queue.json');
    const matrix = readJson<ReadinessMatrix>('docs/product/release-readiness-matrix.json');
    const activeTranches = queue.filter((entry) => entry.status === 'active');

    expect(activeTranches).toHaveLength(1);
    expect(activeTranches[0]?.id).toBe(matrix.activeTrancheId);
  });

  it('retains a machine-readable readiness matrix with unique criteria and actionable non-done rows', () => {
    const matrix = readJson<ReadinessMatrix>('docs/product/release-readiness-matrix.json');
    const pkg = readJson<PackageManifest>('package.json');
    const ids = matrix.criteria.map((criterion) => criterion.id);

    expect(matrix.shipId).toBe('SHIP-0001');
    expect(matrix.activeIssueId).toBe('ISSUE-0406');
    expect(matrix.currentPackageVersion).toBe('0.1.0');
    expect(matrix.currentPackageVersion).toBe(pkg.version);
    expect(matrix.releaseTarget).toBe('v0.2.0');
    expect(matrix.targetVsixArtifact).toBe('vi-history-suite-0.2.0.vsix');
    expect(matrix.targetReleaseManifest).toBe('release-evidence/release-manifest.json');
    expect(new Set(ids).size).toBe(ids.length);
    expect(matrix.criteria.map((criterion) => criterion.status)).toEqual(
      expect.arrayContaining(['done', 'active'])
    );

    for (const criterion of matrix.criteria) {
      expect(criterion.issueId).toBe('ISSUE-0406');
      expect(criterion.nextAction.length).toBeGreaterThan(0);
      if (criterion.status === 'done') {
        expect(criterion.blockerId).toBeNull();
        expect(criterion.blocker).toBeNull();
      } else {
        expect(criterion.blockerId).toBeTruthy();
        expect(criterion.blocker).toBeTruthy();
      }
    }
  });

  it('retains a blocker ledger that references readiness criteria directly', () => {
    const matrix = readJson<ReadinessMatrix>('docs/product/release-readiness-matrix.json');
    const ledger = readJson<BlockerLedger>('docs/product/blocker-ledger.json');
    const criterionIds = new Set(matrix.criteria.map((criterion) => criterion.id));
    const blockerIds = new Set(ledger.blockers.map((blocker) => blocker.id));

    expect(ledger.shipId).toBe('SHIP-0001');
    expect(ledger.releaseTarget).toBe('v0.2.0');
    expect(ledger.activeTrancheId).toBe(matrix.activeTrancheId);
    expect(ledger.activeIssueId).toBe(matrix.activeIssueId);
    expect(ledger.blockers.length).toBeGreaterThan(0);

    for (const blocker of ledger.blockers) {
      expect(criterionIds.has(blocker.criterionId)).toBe(true);
      expect(blocker.trancheId).toBe(matrix.activeTrancheId);
      expect(blocker.issueId).toBe(matrix.activeIssueId);
      expect(blocker.status).toBe('open');
      expect(blocker.summary.length).toBeGreaterThan(0);
    }

    for (const criterion of matrix.criteria) {
      if (criterion.blockerId) {
        expect(blockerIds.has(criterion.blockerId)).toBe(true);
      }
    }
  });

  it('keeps the repo entrypoints and release procedure aligned to the ship-control surfaces', () => {
    const readme = readText('README.md');
    const currentState = readText('docs/product/current-state.md');
    const informationItemMap = readText('docs/information-item-map.md');
    const programDoc = readText('docs/product/execution-programs/PROGRAM-0001-next-product-layer.md');
    const releaseProcedure = readText('docs/release-procedure.md');
    const workbenchDoc = readText('docs/documentation-workbench.md');

    expect(readme).toContain('[SHIP-0001: Releasable VI History Suite](./docs/product/SHIP-0001-releasable-vi-history-suite.md)');
    expect(readme).toContain('[Release Readiness Matrix](./docs/product/release-readiness-matrix.json)');
    expect(readme).toContain('[Blocker Ledger](./docs/product/blocker-ledger.json)');
    expect(readme).toContain('[Wiki Authority Map](./docs/product/wiki-authority-map.md)');
    expect(readme).toContain('[Documentation Package Workbench](./docs/documentation-workbench.md)');
    expect(readme).toContain('[Release Procedure](./docs/release-procedure.md)');
    expect(readme).toContain('- `SHIP-0001`: releasable `v0.2.0` VSIX product');
    expect(readme).toContain('- current package baseline: `0.1.0`');
    expect(readme).toContain('- target release artifact: `vi-history-suite-0.2.0.vsix`');

    expect(currentState).toContain('[SHIP-0001: Releasable VI History Suite](./SHIP-0001-releasable-vi-history-suite.md)');
    expect(currentState).toContain('[release-readiness-matrix.json](./release-readiness-matrix.json)');
    expect(currentState).toContain('[blocker-ledger.json](./blocker-ledger.json)');
    expect(currentState).toContain('[wiki-authority-map.md](./wiki-authority-map.md)');
    expect(currentState).toContain('[Documentation Package Workbench](../documentation-workbench.md)');
    expect(currentState).toContain('- `TRANCHE-009`: Ship `vi-history-suite` as a releasable SemVer VSIX');
    expect(currentState).toContain('- current package baseline: `0.1.0`');
    expect(currentState).toContain('- target release artifact: `vi-history-suite-0.2.0.vsix`');

    expect(informationItemMap).toContain('| Ship target | `docs/product/SHIP-0001-releasable-vi-history-suite.md` |');
    expect(informationItemMap).toContain('| Release readiness matrix | `docs/product/release-readiness-matrix.json` |');
    expect(informationItemMap).toContain('| Blocker ledger | `docs/product/blocker-ledger.json` |');
    expect(informationItemMap).toContain('| Wiki authority map | `docs/product/wiki-authority-map.md` |');
    expect(informationItemMap).toContain('| Documentation package workbench | `docs/documentation-workbench.md` |');
    expect(informationItemMap).toContain('| Release procedure | `docs/release-procedure.md` |');

    expect(programDoc).toContain('[SHIP-0001: Releasable VI History Suite](../SHIP-0001-releasable-vi-history-suite.md)');
    expect(programDoc).toContain('ship-control surfaces');

    expect(releaseProcedure).toContain('[SHIP-0001](./product/SHIP-0001-releasable-vi-history-suite.md)');
    expect(releaseProcedure).toContain('[release readiness matrix](./product/release-readiness-matrix.json)');
    expect(releaseProcedure).toContain('vi-history-suite-0.2.0.vsix');
    expect(releaseProcedure).toContain('release-evidence/release-manifest.json');

    expect(workbenchDoc).toContain('registry.gitlab.com/svelderrainruiz/vi-history-suite/docs-authoring:main');
    expect(workbenchDoc).toContain('npm run docs:workbench:gate');
  });

  it('configures the GitLab release lane plus docs-package workbench publish lane', () => {
    const gitlabCi = readText('.gitlab-ci.yml');
    const readme = readText('README.md');
    const currentState = readText('docs/product/current-state.md');
    const releaseProcedure = readText('docs/release-procedure.md');

    expect(gitlabCi).toContain('docs_control_plane_check:');
    expect(gitlabCi).toContain('npm run docs:gate:core');
    expect(gitlabCi).toContain('publish_docs_authoring_image:');
    expect(gitlabCi).toContain('--dockerfile "${CI_PROJECT_DIR}/docker/docs-authoring/Dockerfile"');
    expect(gitlabCi).toContain('${CI_REGISTRY_IMAGE}/docs-authoring:main');
    expect(gitlabCi).toContain("path.join('docs-workbench-evidence', 'docs-workbench-manifest.json')");
    expect(gitlabCi).toContain('package_extension_preview:');
    expect(gitlabCi).toContain('stage: package');
    expect(gitlabCi).toContain('PACKAGE_VERSION=$(node -p "require(\'./package.json\').version")');
    expect(gitlabCi).toContain('preview-evidence/vi-history-suite-${PACKAGE_VERSION}.vsix');
    expect(gitlabCi).toContain("path.join('preview-evidence', 'preview-manifest.json')");
    expect(gitlabCi).toContain('release_extension:');
    expect(gitlabCi).toContain('if [ "v${PACKAGE_VERSION}" != "${CI_COMMIT_TAG}" ]; then');
    expect(gitlabCi).toContain('npm run package -- --out "release-evidence/vi-history-suite-${PACKAGE_VERSION}.vsix"');
    expect(gitlabCi).toContain("release-evidence', 'release-manifest.json'");
    expect(gitlabCi).toContain("release-evidence', `${vsixFileName}.sha256`");
    expect(gitlabCi).toContain("shipId: 'SHIP-0001'");
    expect(gitlabCi).toContain("- release-evidence/release-manifest.json");

    expect(readme).toContain('preview-evidence/vi-history-suite-<version>.vsix');
    expect(readme).toContain('registry.gitlab.com/svelderrainruiz/vi-history-suite/docs-authoring:main');
    expect(readme).toContain('future governed tagged release artifact');
    expect(currentState).toContain('docs-workbench image: `registry.gitlab.com/svelderrainruiz/vi-history-suite/docs-authoring:main`');
    expect(currentState).toContain('preview install surface: `preview-evidence/vi-history-suite-<version>.vsix`');
    expect(releaseProcedure).toContain('For pre-release install testing, use the `package_extension_preview` artifact');
    expect(releaseProcedure).toContain('The repo also publishes a separate docs-authoring workbench image');
    expect(releaseProcedure).toContain('Preview VSIX artifacts are available from `main`');
  });
});

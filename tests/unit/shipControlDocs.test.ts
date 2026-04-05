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
  lifecycleState?: string;
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
  lifecycleState?: string;
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
    expect(shipDoc).toContain('- Current package baseline: `0.2.0`');
    expect(shipDoc).toContain('- Target VSIX artifact: `vi-history-suite-0.2.0.vsix`');
    expect(shipDoc).toContain('- Target release manifest: `release-evidence/release-manifest.json`');
    expect(shipDoc).toContain('[release-readiness-matrix.json](./release-readiness-matrix.json)');
    expect(shipDoc).toContain('[blocker-ledger.json](./blocker-ledger.json)');
    expect(shipDoc).toContain('- `TRANCHE-009`');
  });

  it('keeps exactly one active tranche in the development queue and advances it after ship closure without rewriting the landed ship record', () => {
    const queue = readJson<QueueEntry[]>('docs/product/development-queue.json');
    const activeTranches = queue.filter((entry) => entry.status === 'active');

    expect(activeTranches).toHaveLength(1);
    expect(activeTranches[0]?.id).toBe('TRANCHE-010');
  });

  it('retains a machine-readable readiness matrix with unique criteria and consistent blocker wiring', () => {
    const matrix = readJson<ReadinessMatrix>('docs/product/release-readiness-matrix.json');
    const pkg = readJson<PackageManifest>('package.json');
    const ids = matrix.criteria.map((criterion) => criterion.id);

    expect(matrix.shipId).toBe('SHIP-0001');
    expect(matrix.lifecycleState).toBe('closed');
    expect(matrix.activeIssueId).toBe('ISSUE-0406');
    expect(matrix.activeTrancheId).toBe('TRANCHE-009');
    expect(matrix.currentPackageVersion).toBe('0.2.0');
    expect(matrix.currentPackageVersion).toBe(pkg.version);
    expect(matrix.releaseTarget).toBe('v0.2.0');
    expect(matrix.targetVsixArtifact).toBe('vi-history-suite-0.2.0.vsix');
    expect(matrix.targetReleaseManifest).toBe('release-evidence/release-manifest.json');
    expect(new Set(ids).size).toBe(ids.length);
    expect(matrix.criteria.map((criterion) => criterion.status)).toContain('done');

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
    expect(ledger.lifecycleState).toBe('closed');
    expect(ledger.releaseTarget).toBe('v0.2.0');
    expect(ledger.activeTrancheId).toBe(matrix.activeTrancheId);
    expect(ledger.activeIssueId).toBe(matrix.activeIssueId);
    expect(ledger.blockers.length).toBeGreaterThan(0);

    for (const blocker of ledger.blockers) {
      expect(criterionIds.has(blocker.criterionId)).toBe(true);
      expect(blocker.trancheId).toBe(matrix.activeTrancheId);
      expect(blocker.issueId).toBe(matrix.activeIssueId);
      expect(['open', 'closed', 'mitigated']).toContain(blocker.status);
      expect(blocker.summary.length).toBeGreaterThan(0);
    }

    for (const criterion of matrix.criteria) {
      if (criterion.blockerId) {
        expect(blockerIds.has(criterion.blockerId)).toBe(true);
      }
    }

    const openBlockers = ledger.blockers.filter((blocker) => blocker.status === 'open');
    for (const blocker of openBlockers) {
      const criterion = matrix.criteria.find((entry) => entry.id === blocker.criterionId);
      expect(criterion?.status).not.toBe('done');
    }
    if (openBlockers.length === 0) {
      expect(matrix.criteria.every((criterion) => criterion.status === 'done')).toBe(true);
    }
  });

  it('keeps the repo entrypoints and release procedure aligned to the ship-control surfaces', () => {
    const readme = readText('README.md');
    const currentState = readText('docs/product/current-state.md');
    const informationItemMap = readText('docs/information-item-map.md');
    const programDoc = readText('docs/product/execution-programs/PROGRAM-0001-next-product-layer.md');
    const programDoc2 = readText(
      'docs/product/execution-programs/PROGRAM-0002-public-facade-installer-and-windows-acceptance.md',
    );
    const releaseProcedure = readText('docs/release-procedure.md');
    const workbenchDoc = readText('docs/documentation-workbench.md');
    const coherenceLedger = readText('docs/product/documentation-coherence-ledger.md');
    const programRepoJump = readText('docs/product/program-repo-jump.md');
    const wikiSeedPlan = readText('docs/product/wiki-seed-plan.md');
    const wikiPublicationLedger = readText('docs/product/wiki-publication-ledger.md');
    const wikiPublicationLedgerJson = readText('docs/product/wiki-publication-ledger.json');
    const wikiAuthorityMap = readText('docs/product/wiki-authority-map.md');
    const architectureOverview = readText('docs/architecture/overview.md');
    const adr0012 = readText('docs/architecture/adr/ADR-0012-documentation-package-workbench-image.md');
    const adr0013 = readText('docs/architecture/adr/ADR-0013-authority-first-wiki-seeding.md');
    const adr0014 = readText('docs/architecture/adr/ADR-0014-cross-repo-navigation-control-plane.md');
    const adr0015 = readText('docs/architecture/adr/ADR-0015-version-matched-bundled-user-documentation.md');
    const adr0016 = readText('docs/architecture/adr/ADR-0016-gitlab-authority-and-github-linux-experiment-lane.md');
    const adr0019 = readText('docs/architecture/adr/ADR-0019-governed-wiki-workbench-system.md');

    expect(readme).toContain('[SHIP-0001: Releasable VI History Suite](./docs/product/SHIP-0001-releasable-vi-history-suite.md)');
    expect(readme).toContain('[Release Readiness Matrix](./docs/product/release-readiness-matrix.json)');
    expect(readme).toContain('[Blocker Ledger](./docs/product/blocker-ledger.json)');
    expect(readme).toContain('[Wiki Authority Map](./docs/product/wiki-authority-map.md)');
    expect(readme).toContain('[Documentation Coherence Ledger](./docs/product/documentation-coherence-ledger.md)');
    expect(readme).toContain('[Wiki Seed Plan](./docs/product/wiki-seed-plan.md)');
    expect(readme).toContain('[Wiki Publication Ledger](./docs/product/wiki-publication-ledger.md)');
    expect(readme).toContain('[Wiki Publication Ledger JSON](./docs/product/wiki-publication-ledger.json)');
    expect(readme).toContain('[Documentation Package Workbench](./docs/documentation-workbench.md)');
    expect(readme).toContain('[Program Repo Jump](./docs/product/program-repo-jump.md)');
    expect(readme).toContain('[PROGRAM-0002: Public Facade Release Kit And Host-Machine Acceptance](./docs/product/execution-programs/PROGRAM-0002-public-facade-installer-and-windows-acceptance.md)');
    expect(readme).toContain('[Release Procedure](./docs/release-procedure.md)');
    expect(readme).toContain('npm run design:gate:assert-complete');
    expect(readme).toContain('- `SHIP-0001`: releasable `v0.2.0` VSIX product');
    expect(readme).toContain('- landed ship tranche: `TRANCHE-009`');
    expect(readme).toContain('- current package baseline: `0.2.0`');
    expect(readme).toContain('- target release artifact: `vi-history-suite-0.2.0.vsix`');
    expect(readme).toContain('- `TRANCHE-010`: public facade release kit and host-machine acceptance');
    expect(readme).toContain('private GitHub experiment repo');

    expect(currentState).toContain('[SHIP-0001: Releasable VI History Suite](./SHIP-0001-releasable-vi-history-suite.md)');
    expect(currentState).toContain('[release-readiness-matrix.json](./release-readiness-matrix.json)');
    expect(currentState).toContain('[blocker-ledger.json](./blocker-ledger.json)');
    expect(currentState).toContain('[wiki-authority-map.md](./wiki-authority-map.md)');
    expect(currentState).toContain('[documentation-coherence-ledger.md](./documentation-coherence-ledger.md)');
    expect(currentState).toContain('[wiki-seed-plan.md](./wiki-seed-plan.md)');
    expect(currentState).toContain('[wiki-publication-ledger.json](./wiki-publication-ledger.json)');
    expect(currentState).toContain('[program-repo-jump.md](./program-repo-jump.md)');
    expect(currentState).toContain('[Documentation Package Workbench](../documentation-workbench.md)');
    expect(currentState).toContain('npm run design:gate:assert-complete');
    expect(currentState).toContain('- `SHIP-0001`: releasable `v0.2.0` VSIX product');
    expect(currentState).toContain('- landed ship tranche: `TRANCHE-009`');
    expect(currentState).toContain('- current package baseline: `0.2.0`');
    expect(currentState).toContain('- target release artifact: `vi-history-suite-0.2.0.vsix`');
    expect(currentState).toContain('- `TRANCHE-010`: Public facade release kit and host-machine acceptance');
    expect(currentState).toContain('[PROGRAM-0002: Public Facade Release Kit And Host-Machine Acceptance](./execution-programs/PROGRAM-0002-public-facade-installer-and-windows-acceptance.md)');
    expect(currentState).toContain('`vi-history-suite-source-experiments`');

    expect(informationItemMap).toContain('| Ship target | `docs/product/SHIP-0001-releasable-vi-history-suite.md` |');
    expect(informationItemMap).toContain('| Release readiness matrix | `docs/product/release-readiness-matrix.json` |');
    expect(informationItemMap).toContain('| Blocker ledger | `docs/product/blocker-ledger.json` |');
    expect(informationItemMap).toContain('| Wiki authority map | `docs/product/wiki-authority-map.md` |');
    expect(informationItemMap).toContain('| Documentation coherence ledger | `docs/product/documentation-coherence-ledger.md` |');
    expect(informationItemMap).toContain('| Wiki seed plan | `docs/product/wiki-seed-plan.md` |');
    expect(informationItemMap).toContain('| Wiki publication ledger | `docs/product/wiki-publication-ledger.md` |');
    expect(informationItemMap).toContain('| Machine-readable wiki publication ledger | `docs/product/wiki-publication-ledger.json` |');
    expect(informationItemMap).toContain('| Bundled user documentation pack | `resources/bundled-docs/manifest.json` |');
    expect(informationItemMap).toContain('| Documentation package workbench | `docs/documentation-workbench.md` |');
    expect(informationItemMap).toContain('| Program repo jump surface | `docs/product/program-repo-jump.md` |');
    expect(informationItemMap).toContain('`vi-history-suite-source-experiments`');
    expect(informationItemMap).toContain('| Release procedure | `docs/release-procedure.md` |');

    expect(programDoc).toContain('[SHIP-0001: Releasable VI History Suite](../SHIP-0001-releasable-vi-history-suite.md)');
    expect(programDoc).toContain('ship-control surfaces');
    expect(programDoc2).toContain('Active post-release program.');
    expect(programDoc2).toContain('retained immutable `v0.2.0` release');

    expect(releaseProcedure).toContain('[SHIP-0001](./product/SHIP-0001-releasable-vi-history-suite.md)');
    expect(releaseProcedure).toContain('[release readiness matrix](./product/release-readiness-matrix.json)');
    expect(releaseProcedure).toContain('vi-history-suite-0.2.0.vsix');
    expect(releaseProcedure).toContain('release-evidence/release-manifest.json');
    expect(releaseProcedure).toContain('docs/product/documentation-coherence-ledger.md');
    expect(releaseProcedure).toContain('docs/product/wiki-seed-plan.md');
    expect(releaseProcedure).toContain('docs/product/wiki-publication-ledger.md');
    expect(releaseProcedure).toContain('docs/product/wiki-publication-ledger.json');
    expect(releaseProcedure).toContain('resources/bundled-docs/manifest.json');
    expect(releaseProcedure).toContain('npm run design:gate:assert-complete');

    expect(workbenchDoc).toContain('registry.gitlab.com/svelderrainruiz/vi-history-suite/docs-authoring:main');
    expect(workbenchDoc).toContain('npm run docs:bundle');
    expect(workbenchDoc).toContain('npm run docs:workbench:gate');
    expect(workbenchDoc).toContain('npm run wiki:workbench:doctor');
    expect(workbenchDoc).toContain('npm run wiki:workbench:prepare');
    expect(workbenchDoc).toContain('npm run docs:workbench:wiki:prepare');
    expect(workbenchDoc).toContain('docs/product/documentation-coherence-ledger.md');
    expect(workbenchDoc).toContain('docs/product/wiki-seed-plan.md');
    expect(workbenchDoc).toContain('docs/product/wiki-publication-ledger.md');
    expect(workbenchDoc).toContain('docs/product/wiki-publication-ledger.json');
    expect(workbenchDoc).toContain('resources/bundled-docs/manifest.json');
    expect(workbenchDoc).toContain('docs/product/program-repo-jump.md');
    expect(workbenchDoc).toContain('.cache/wiki-workbench/latest-workbench.json');
    expect(workbenchDoc).toContain('.cache/wiki-workbench/publication-prep/');

    expect(coherenceLedger).toContain('# Documentation Coherence Ledger');
    expect(coherenceLedger).toContain('run-docs-gate.js --skip-links');
    expect(coherenceLedger).toContain('run_assurance.py /home/sveld/code/standards/vi-history-suite --profile release-gate');
    expect(coherenceLedger).toContain('DOC-001');
    expect(coherenceLedger).toContain('DOC-004');
    expect(coherenceLedger).toContain('DOC-005');
    expect(coherenceLedger).toContain('DOC-011');
    expect(coherenceLedger).toContain('docs/product/wiki-publication-ledger.md');
    expect(coherenceLedger).toContain('docs/product/program-repo-jump.md');
    expect(coherenceLedger).toContain('planned fourth experiment mirror');
    expect(coherenceLedger).toContain('DOC-012');
    expect(coherenceLedger).toContain('DOC-013');

    expect(wikiSeedPlan).toContain('# Wiki Seed Plan');
    expect(wikiSeedPlan).toContain('docs/product/documentation-coherence-ledger.md');
    expect(wikiSeedPlan).toContain('docs/product/wiki-publication-ledger.md');
    expect(wikiSeedPlan).toContain('npm run wiki:workbench:prepare');
    expect(wikiSeedPlan).toContain('src/');

    expect(wikiPublicationLedger).toContain('# Wiki Publication Ledger');
    expect(wikiPublicationLedger).toContain('| Overview | `home` | published | `2026-04-03` | `3aa0c49` |');
    expect(wikiPublicationLedgerJson).toContain('"id": "overview"');
    expect(wikiPublicationLedgerJson).toContain('"title": "Overview"');

    expect(wikiAuthorityMap).toContain('[documentation-coherence-ledger.md](./documentation-coherence-ledger.md)');
    expect(wikiAuthorityMap).toContain('[wiki-seed-plan.md](./wiki-seed-plan.md)');
    expect(wikiAuthorityMap).toContain('[wiki-publication-ledger.md](./wiki-publication-ledger.md)');
    expect(wikiAuthorityMap).toContain('npm run docs:workbench:wiki:prepare');
    expect(wikiAuthorityMap).toContain('docs/product/program-repo-jump.md');

    expect(architectureOverview).toContain('[ADR-0012](./adr/ADR-0012-documentation-package-workbench-image.md)');
    expect(architectureOverview).toContain('[ADR-0013](./adr/ADR-0013-authority-first-wiki-seeding.md)');
    expect(architectureOverview).toContain('[ADR-0014](./adr/ADR-0014-cross-repo-navigation-control-plane.md)');
    expect(architectureOverview).toContain('[ADR-0015](./adr/ADR-0015-version-matched-bundled-user-documentation.md)');
    expect(architectureOverview).toContain('[ADR-0016](./adr/ADR-0016-gitlab-authority-and-github-linux-experiment-lane.md)');
    expect(architectureOverview).toContain('[ADR-0019](./adr/ADR-0019-governed-wiki-workbench-system.md)');
    expect(programRepoJump).toContain('# Program Repo Jump');
    expect(programRepoJump).toContain('private GitHub experiment mirror');
    expect(programRepoJump).toContain('npm run wiki:workbench:doctor');
    expect(adr0012).toContain('# ADR-0012: Documentation-Package Workbench Image');
    expect(adr0013).toContain('# ADR-0013: Authority-First Wiki Seeding');
    expect(adr0014).toContain('# ADR-0014: Cross-Repo Navigation Control Plane');
    expect(adr0015).toContain('# ADR-0015: Version-Matched Bundled User Documentation');
    expect(adr0016).toContain('# ADR-0016: GitLab Authority And GitHub Linux Experiment Lane');
    expect(adr0019).toContain('# ADR-0019: Governed Wiki Workbench System');
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
    expect(readme).toContain('governed tagged release artifact');
    expect(currentState).toContain('docs-workbench image: `registry.gitlab.com/svelderrainruiz/vi-history-suite/docs-authoring:main`');
    expect(currentState).toContain('preview install surface: `preview-evidence/vi-history-suite-<version>.vsix`');
    expect(releaseProcedure).toContain('For pre-release install testing, use the `package_extension_preview` artifact');
    expect(releaseProcedure).toContain('The repo also publishes a separate docs-authoring workbench image');
    expect(releaseProcedure).toContain('Preview VSIX artifacts are available from `main`');
  });
});

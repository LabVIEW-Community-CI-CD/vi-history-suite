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

  it('keeps the ship-facing tranche active while allowing a separate driver-seat post-release tranche after ship closure', () => {
    const queue = readJson<QueueEntry[]>('docs/product/development-queue.json');
    const activeTranches = queue.filter((entry) => entry.status === 'active');

    expect(activeTranches).toHaveLength(2);
    expect(activeTranches.map((entry) => entry.id)).toEqual(
      expect.arrayContaining(['TRANCHE-012', 'TRANCHE-016'])
    );
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
    expect(pkg.version).toBe('1.3.15');
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
    const changelog = readText('CHANGELOG.md');
    const cmPlan = readText('docs/cm/cm-plan.md');
    const workbenchDoc = readText('docs/documentation-workbench.md');
    const bundledInstallPage = readText('resources/bundled-docs/pages/install-and-release.html');
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
    const adr0033 = readText(
      'docs/architecture/adr/ADR-0033-hosted-automation-governance-matrix-and-protection-semantics.md',
    );

    expect(readme).toContain('[SHIP-0001: Releasable VI History Suite](./docs/product/SHIP-0001-releasable-vi-history-suite.md)');
    expect(readme).toContain('[Release Readiness Matrix](./docs/product/release-readiness-matrix.json)');
    expect(readme).toContain('[Blocker Ledger](./docs/product/blocker-ledger.json)');
    expect(readme).toContain('[Wiki Authority Map](./docs/product/wiki-authority-map.md)');
    expect(readme).toContain('[Documentation Coherence Ledger](./docs/product/documentation-coherence-ledger.md)');
    expect(readme).toContain('[Wiki Seed Plan](./docs/product/wiki-seed-plan.md)');
    expect(readme).toContain('[Wiki Publication Ledger](./docs/product/wiki-publication-ledger.md)');
    expect(readme).toContain('[Wiki Publication Ledger JSON](./docs/product/wiki-publication-ledger.json)');
    expect(readme).toContain('[Documentation Package Workbench](./docs/documentation-workbench.md)');
    expect(readme).toContain('[Hosted CI Governance](./docs/product/hosted-ci-governance.md)');
    expect(readme).toContain('[Hosted CI Governance JSON](./docs/product/hosted-ci-governance.json)');
    expect(readme).toContain('[Program Repo Jump](./docs/product/program-repo-jump.md)');
    expect(readme).toContain('[Public GitHub Source Authority Map](./docs/product/public-github-source-authority-map.md)');
    expect(readme).toContain('[Public GitHub Source Publication Ledger](./docs/product/public-github-source-publication-ledger.md)');
    expect(readme).toContain('[Public GitHub Source Publication Ledger JSON](./docs/product/public-github-source-publication-ledger.json)');
    expect(readme).toContain('[PROGRAM-0002: Public Facade Release Kit And Host-Machine Acceptance](./docs/product/execution-programs/PROGRAM-0002-public-facade-installer-and-windows-acceptance.md)');
    expect(readme).toContain('[Release Procedure](./docs/release-procedure.md)');
    expect(readme).toContain('npm run design:gate:assert-complete');
    expect(readme).toContain('- `SHIP-0001`: releasable `v0.2.0` VSIX product');
    expect(readme).toContain('- landed ship tranche: `TRANCHE-009`');
    expect(readme).toContain('- retained exact-version releases: `v0.2.0`, `v1.0.0`, `v1.0.1`, `v1.0.2`, `v1.0.3`, `v1.0.4`, `v1.0.5`, `v1.0.6`, `v1.1.0`, `v1.2.0`, `v1.2.1`, `v1.2.2`, `v1.3.0`, `v1.3.1`, `v1.3.2`, `v1.3.3`, `v1.3.4`, `v1.3.5`, `v1.3.6`, `v1.3.7`, `v1.3.8`, `v1.3.9`');
    expect(readme).toContain('- burned exact release line: `v1.0.2`');
    expect(readme).toContain('- current exact released line: `v1.3.9`');
    expect(readme).toContain('- current fully published exact package line: `1.3.9`');
    expect(readme).toContain('- current authority package line on `main`: `1.3.14`');
    expect(readme).toContain('- current develop package line on `develop`: `1.3.15`');
    expect(readme).toContain('- active exact release candidate line on `develop`: `v1.3.15`');
    expect(readme).toContain('- active release-candidate branch: `release/1.3.15`');
    expect(readme).toContain('- active exact hotfix candidate line on `main`: none');
    expect(readme).toContain('- active hotfix branch: none');
    expect(readme).toContain('active feature-lane public GitHub release hardening branch on `develop`:');
    expect(readme).toContain('none');
    expect(readme).toContain('npm run public:exact:pretag:proof');
    expect(readme).toContain('public_exact_pretag_proof');
    expect(readme).toContain('npm run public:github:exact:transaction:verify');
    expect(readme).toContain('- retained Windows x64 private-release-prep slice: historical `release/1.3.1`');
    expect(readme).toContain('docs/product/private-release-windows-x64-v1.3.1.md');
    expect(readme).toContain('docs/product/private-release-windows-x64-v1.3.1.json');
    expect(readme).toContain('private-v1.3.1-windows-x64');
    expect(readme).toContain('.cache/private-release-publish/latest/private-release-publish.json');
    expect(readme).toContain('- separate public GitHub exact release publication: published; public tag');
    expect(readme).toContain('releases/tag/v1.3.9');
    expect(readme).toContain('- current public GitHub source publication: public `main` now publishes');
    expect(readme).toContain('`f1cb609` after public PR #69 completed the `v1.3.14` source handoff');
    expect(readme).toContain('public PR #68 remains retained');
    expect(readme).toContain('public PR #60');
    expect(readme).toContain('- VS Code Marketplace retained published version: `1.3.9`');
    expect(readme).toContain('- public GitHub default branch: `main`');
    expect(readme).toContain('- public Codespaces evaluation branch: `develop`');
    expect(readme).toContain('- integration branch: `develop`');
    expect(readme).toContain('- protected exact-release line: `main`');
    expect(readme).toContain('- release-candidate branch family: `release/*`');
    expect(readme).toContain('- hotfix branch family: `hotfix/*`');
    expect(readme).toContain('- next-line branch model: `GitFlow`');
    expect(readme).toContain('- hosted automation governance matrix: [docs/product/hosted-ci-governance.md]');
    expect(readme).toContain('- current changelog: [CHANGELOG.md](./CHANGELOG.md)');
    expect(readme).toContain('- `TRANCHE-016`: installed local LabVIEWCLI contract and explicit compare');
    expect(readme).toContain('workflow with bounded expert Docker');
    expect(readme).toContain('- `TRANCHE-014`: public Codespaces public-repo bootstrap');
    expect(readme).toContain('- `TRANCHE-015`: historical first-run Docker onboarding and fail-closed');
    expect(readme).toContain('- `TRANCHE-010`: public-source facade and public-product acceptance is a closed');
    expect(readme).toContain('npm run public:repo:clone');
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
    expect(currentState).toContain('[hosted-ci-governance.md](./hosted-ci-governance.md)');
    expect(currentState).toContain('[linux-assurance-runner-lane.md](./linux-assurance-runner-lane.md)');
    expect(currentState).toContain('container-owned `node_modules` volume plus `package-lock.json` refresh');
    expect(currentState).toContain('npm run design:gate:assert-complete');
    expect(currentState).toContain('- `SHIP-0001`: releasable `v0.2.0` VSIX product');
    expect(currentState).toContain('- landed ship tranche: `TRANCHE-009`');
    expect(currentState).toContain('- retained release artifact: `vi-history-suite-0.2.0.vsix`');
    expect(currentState).toContain('- burned exact release line: `v1.0.2`');
    expect(currentState).toContain('- current exact released line: `v1.3.9`');
    expect(currentState).toContain('- current fully published exact package line: `1.3.9`');
    expect(currentState).toContain('- current authority package line on `main`: `1.3.14`');
    expect(currentState).toContain('- current develop package line on `develop`: `1.3.15`');
    expect(currentState).toContain(
      '- active exact release candidate line on `develop`: `v1.3.15`'
    );
    expect(currentState).toContain('- active release-candidate branch: `release/1.3.15`');
    expect(currentState).toContain('- active exact hotfix candidate line on `main`: none');
    expect(currentState).toContain('- active hotfix branch: none');
    expect(currentState).toContain('active feature-lane public GitHub release hardening branch on `develop`:');
    expect(currentState).toContain('none');
    expect(currentState).toContain('npm run public:exact:pretag:proof');
    expect(currentState).toContain('public_exact_pretag_proof');
    expect(currentState).toContain('npm run public:github:exact:transaction:verify');
    expect(currentState).toContain('- retained Windows x64 private-release-prep slice: historical `release/1.3.1`');
    expect(currentState).toContain('[private-release-windows-x64-v1.3.1.md](./private-release-windows-x64-v1.3.1.md)');
    expect(currentState).toContain('[private-release-windows-x64-v1.3.1.json](./private-release-windows-x64-v1.3.1.json)');
    expect(currentState).toContain('private-v1.3.1-windows-x64');
    expect(currentState).toContain('.cache/private-release-publish/latest/private-release-publish.json');
    expect(currentState).toContain('- separate public GitHub exact release publication: published; public tag');
    expect(currentState).toContain('releases/tag/v1.3.9');
    expect(currentState).toContain('- current public GitHub source publication: public `main` now publishes');
    expect(currentState).toContain('`f1cb60900820ea17328b9eec595579768491e22a` after public PR #69');
    expect(currentState).toContain('public PR #68 remains retained');
    expect(currentState).toContain('public PR #60');
    expect(currentState).toContain('- VS Code Marketplace retained published version: `1.3.9`');
    expect(currentState).toContain('- public GitHub default branch: `main`');
    expect(currentState).toContain('- public Codespaces evaluation branch: `develop`');
    expect(currentState).toContain('- integration branch: `develop`');
    expect(currentState).toContain('- protected exact-release line: `main`');
    expect(currentState).toContain('- release-candidate branch family: `release/*`');
    expect(currentState).toContain('- hotfix branch family: `hotfix/*`');
    expect(currentState).toContain('- next-line branch model: `GitFlow`');
    expect(currentState).toContain('- hosted automation governance matrix: [hosted-ci-governance.md](./hosted-ci-governance.md)');
    expect(currentState).toContain('- current changelog: [CHANGELOG.md](../../CHANGELOG.md)');
    expect(currentState).toContain('`TRANCHE-016`');
    expect(currentState).toContain('`TRANCHE-014`');
    expect(currentState).toContain('`TRANCHE-015`');
    expect(currentState).toContain('- closed public-product closeout:');
    expect(currentState).toContain('`TRANCHE-010` / [ISSUE-0407 Public Source Facade And Public-Product Acceptance]');
    expect(currentState).toContain('[PROGRAM-0002: Public Source Facade And Public-Product Acceptance](./execution-programs/PROGRAM-0002-public-facade-installer-and-windows-acceptance.md)');
    expect(currentState).toContain('[runtime-provider-public-acceptance-gate.md](./runtime-provider-public-acceptance-gate.md)');
    expect(currentState).toContain('[runtime-provider-public-acceptance-gate.json](./runtime-provider-public-acceptance-gate.json)');
    expect(currentState).toContain('`vi-history-suite-source-experiments`');

    expect(informationItemMap).toContain('| Ship target | `docs/product/SHIP-0001-releasable-vi-history-suite.md` |');
    expect(informationItemMap).toContain('| Release readiness matrix | `docs/product/release-readiness-matrix.json` |');
    expect(informationItemMap).toContain('| Blocker ledger | `docs/product/blocker-ledger.json` |');
    expect(informationItemMap).toContain('| Wiki authority map | `docs/product/wiki-authority-map.md` |');
    expect(informationItemMap).toContain('| Documentation coherence ledger | `docs/product/documentation-coherence-ledger.md` |');
    expect(informationItemMap).toContain('| Wiki seed plan | `docs/product/wiki-seed-plan.md` |');
    expect(informationItemMap).toContain('| Wiki publication ledger | `docs/product/wiki-publication-ledger.md` |');
    expect(informationItemMap).toContain('| Machine-readable wiki publication ledger | `docs/product/wiki-publication-ledger.json` |');
    expect(informationItemMap).toContain('| Hosted CI governance | `docs/product/hosted-ci-governance.md` |');
    expect(informationItemMap).toContain('| Machine-readable hosted CI governance | `docs/product/hosted-ci-governance.json` |');
    expect(informationItemMap).toContain('| Linux assurance runner lane | `docs/product/linux-assurance-runner-lane.md` |');
    expect(informationItemMap).toContain('| Bundled user documentation pack | `resources/bundled-docs/manifest.json` |');
    expect(informationItemMap).toContain('| Documentation package workbench | `docs/documentation-workbench.md` |');
    expect(informationItemMap).toContain('| Program repo jump surface | `docs/product/program-repo-jump.md` |');
    expect(informationItemMap).toContain('| Public GitHub source authority map | `docs/product/public-github-source-authority-map.md` |');
    expect(informationItemMap).toContain('| Public GitHub source publication ledger | `docs/product/public-github-source-publication-ledger.md` |');
    expect(informationItemMap).toContain('| Machine-readable public GitHub source publication ledger | `docs/product/public-github-source-publication-ledger.json` |');
    expect(informationItemMap).toContain('| VS Code Marketplace publication ledger | `docs/product/vscode-marketplace-publication-ledger.md` |');
    expect(informationItemMap).toContain('| ISSUE-0412 promotion and publication handoff | `docs/product/issue-0412-promotion-and-publication-handoff.md` |');
    expect(informationItemMap).toContain('| Runtime-provider public-acceptance gate | `docs/product/runtime-provider-public-acceptance-gate.md` |');
    expect(informationItemMap).toContain('| Machine-readable runtime-provider public-acceptance gate | `docs/product/runtime-provider-public-acceptance-gate.json` |');
    expect(informationItemMap).toContain('| Machine-readable VS Code Marketplace publication ledger | `docs/product/vscode-marketplace-publication-ledger.json` |');
    expect(informationItemMap).toContain('`vi-history-suite-source-experiments`');
    expect(informationItemMap).toContain('`vi-history-suite.public`');
    expect(informationItemMap).toContain('`vi-history-suite.github.wiki`');
    expect(informationItemMap).toContain('| Release procedure | `docs/release-procedure.md` |');
    expect(informationItemMap).toContain('| Changelog | `CHANGELOG.md` |');
    expect(informationItemMap).toContain('| CM plan | `docs/cm/cm-plan.md` |');

    expect(programDoc).toContain('[SHIP-0001: Releasable VI History Suite](../SHIP-0001-releasable-vi-history-suite.md)');
    expect(programDoc).toContain('ship-control surfaces');
    expect(programDoc2).toContain('Closed on the Docker-only public-product acceptance gate.');
    expect(programDoc2).toContain('retained release `v0.2.0`');

    expect(releaseProcedure).toContain('[SHIP-0001](./product/SHIP-0001-releasable-vi-history-suite.md)');
    expect(releaseProcedure).toContain('[release readiness matrix](./product/release-readiness-matrix.json)');
    expect(releaseProcedure).toContain('vi-history-suite-0.2.0.vsix');
    expect(releaseProcedure).toContain('release-evidence/release-manifest.json');
    expect(releaseProcedure).toContain('current exact released line is `v1.3.9`');
    expect(releaseProcedure).toContain('burned exact released line is `v1.0.2`');
    expect(releaseProcedure).toContain('current authority package line on `main` is `1.3.14`');
    expect(releaseProcedure).toContain("current develop package line on `develop` is `1.3.15`");
    expect(releaseProcedure).toContain(
      'active exact release candidate line on `develop` is `v1.3.15`'
    );
    expect(releaseProcedure).toContain(
      'The active release-candidate branch is `release/1.3.15`.'
    );
    expect(releaseProcedure).toContain('The active exact hotfix candidate line on `main` is none.');
    expect(releaseProcedure).toContain('The active hotfix branch is none.');
    expect(releaseProcedure).toContain('The active feature-lane public GitHub release hardening branch on `develop`');
    expect(releaseProcedure).toContain('is none.');
    expect(releaseProcedure).toContain('npm run public:exact:pretag:proof');
    expect(releaseProcedure).toContain('public_exact_pretag_proof');
    expect(releaseProcedure).toContain('npm run public:github:exact:transaction:verify');
    expect(releaseProcedure).toContain('The retained Windows x64 private-release-prep slice is the historical');
    expect(releaseProcedure).toContain('docs/product/private-release-windows-x64-v1.3.1.md');
    expect(releaseProcedure).toContain('docs/product/private-release-windows-x64-v1.3.1.json');
    expect(releaseProcedure).toContain('The controlled `v1.3.1` Windows x64 private GitLab release is now published');
    expect(releaseProcedure).toContain('private-v1.3.1-windows-x64');
    expect(releaseProcedure).toContain('public GitHub default branch is `main`');
    expect(releaseProcedure).toContain('public Codespaces evaluation branch is `develop`');
    expect(releaseProcedure).toContain('integration branch is `develop`');
    expect(releaseProcedure).toContain('protected exact-release line is `main`');
    expect(releaseProcedure).toContain('release-candidate branch family is `release/*`');
    expect(releaseProcedure).toContain('next-line branch model is `GitFlow`');
    expect(releaseProcedure).toContain('required checks');
    expect(releaseProcedure).toContain('`main` shall match that exact release line');
    expect(releaseProcedure).toContain('advance `package.json`');
    expect(releaseProcedure).toContain('top `CHANGELOG.md` heading to the next SemVer line');
    expect(releaseProcedure).toContain('[CHANGELOG.md](../CHANGELOG.md)');
    expect(releaseProcedure).toContain('docs/product/documentation-coherence-ledger.md');
    expect(releaseProcedure).toContain('docs/product/wiki-seed-plan.md');
    expect(releaseProcedure).toContain('docs/product/wiki-publication-ledger.md');
    expect(releaseProcedure).toContain('docs/product/wiki-publication-ledger.json');
    expect(releaseProcedure).toContain('docs/product/public-github-source-authority-map.md');
    expect(releaseProcedure).toContain('docs/product/public-github-source-publication-ledger.md');
    expect(releaseProcedure).toContain('docs/product/public-github-source-publication-ledger.json');
    expect(releaseProcedure).toContain('docs/product/vscode-marketplace-publication-ledger.md');
    expect(releaseProcedure).toContain('docs/product/vscode-marketplace-publication-ledger.json');
    expect(releaseProcedure).toContain('docs/product/runtime-provider-public-acceptance-gate.{md,json}');
    expect(releaseProcedure).toContain('docs/product/hosted-ci-governance.md');
    expect(releaseProcedure).toContain('docs/product/hosted-ci-governance.json');
    expect(releaseProcedure).toContain('docs/product/linux-assurance-runner-lane.md');
    expect(releaseProcedure).toContain('npm run branch:governance:assert');
    expect(releaseProcedure).toContain('npm run public:source:promote');
    expect(releaseProcedure).toContain('resources/bundled-docs/manifest.json');
    expect(releaseProcedure).toContain('npm run design:gate:assert-complete');
    expect(releaseProcedure).toContain('npm run docs:bundle');
    expect(releaseProcedure).toContain('npm run package');
    expect(releaseProcedure).toContain(
      'Stale bundled installed-user docs are therefore unshippable through the'
    );
    expect(releaseProcedure).toContain('VS Code Marketplace item');
    expect(releaseProcedure).toContain('Marketplace: Manage');
    expect(bundledInstallPage).toContain('<h2>Install Surfaces</h2>');
    expect(bundledInstallPage).toContain(
      'VS Code Marketplace listing under <code>svelderrainruiz.vi-history-suite</code>'
    );
    expect(bundledInstallPage).toContain(
      '<code>code --install-extension svelderrainruiz.vi-history-suite</code>'
    );
    expect(bundledInstallPage).toContain('exact released VSIX from the matching GitHub release');
    expect(bundledInstallPage).toContain(
      'packaged bundled docs through <code>VI History: Open Documentation</code>'
    );
    expect(bundledInstallPage).toContain('Windows defaults to local <code>LabVIEWCLI</code> when the persisted provider is absent');
    expect(bundledInstallPage).toContain('review the explicit compare preflight section and choose <code>Compare</code>');
    expect(bundledInstallPage).toContain('<h2>Release Procedure Summary</h2>');
    expect(bundledInstallPage).toContain('open <code>VI History</code> on an eligible VI');
    expect(bundledInstallPage).not.toContain('Retained exact release: <code>v0.2.0</code>');
    expect(changelog).toContain('## [1.3.5] - 2026-04-21');
    expect(changelog).toContain('## [1.3.1] - 2026-04-20');
    expect(changelog).toContain('## [1.3.0] - 2026-04-14');
    expect(changelog).toContain('## [1.2.2] - 2026-04-07');
    expect(changelog).toContain('## [1.2.0] - 2026-04-07');
    expect(changelog).toContain('## [1.1.0] - 2026-04-07');
    expect(changelog).toContain('## [1.0.6] - 2026-04-07');
    expect(changelog).toContain('## [1.0.5] - 2026-04-07');
    expect(changelog).toContain('## [1.0.3] - 2026-04-07');
    expect(changelog).toContain('## [1.0.2] - 2026-04-07');
    expect(changelog).toContain('## [1.0.1] - 2026-04-07');
    expect(changelog).toContain('## [1.0.0] - 2026-04-07');
    expect(changelog).toContain('Retained exact-version releases now include `v0.2.0`, `v1.0.0`, `v1.0.1`,');
    expect(changelog).toContain('`v1.3.6`, `v1.3.7`, `v1.3.8`, and `v1.3.9`.');
    expect(changelog).toContain('Burned exact-version releases now include `v1.0.2`.');
    expect(changelog).toContain('## [0.2.0] - 2026-04-03');
    expect(cmPlan).toContain('# Configuration Management Plan');
    expect(cmPlan).toContain('- Scheme: `vX.Y.Z`');
    expect(cmPlan).toContain('- Public default branch: `main`');
    expect(cmPlan).toContain('- Integration branch: `develop`');
    expect(cmPlan).toContain('- Release-candidate branch family: `release/*`');
    expect(cmPlan).toContain('- Hotfix branch family: `hotfix/*`');
    expect(cmPlan).toContain('- Protected-branch rule: rely on required checks instead of operator memory');

    expect(workbenchDoc).toContain('registry.gitlab.com/svelderrainruiz/vi-history-suite/docs-authoring:main');
    expect(workbenchDoc).toContain('npm run docs:bundle');
    expect(workbenchDoc).toContain('npm run docs:ci');
    expect(workbenchDoc).toContain('npm run docs:ci:core');
    expect(workbenchDoc).toContain('npm run package');
    expect(workbenchDoc).toContain('npm run docs:workbench:gate');
    expect(workbenchDoc).toContain('npm run wiki:workbench:doctor');
    expect(workbenchDoc).toContain('npm run wiki:workbench:prepare');
    expect(workbenchDoc).toContain('npm run docs:workbench:wiki:prepare');
    expect(workbenchDoc).toContain('npm run docs:workbench:gitlab:wiki:prepare');
    expect(workbenchDoc).toContain('docs/product/documentation-coherence-ledger.md');
    expect(workbenchDoc).toContain('docs/product/wiki-seed-plan.md');
    expect(workbenchDoc).toContain('docs/product/wiki-publication-ledger.md');
    expect(workbenchDoc).toContain('docs/product/wiki-publication-ledger.json');
    expect(workbenchDoc).toContain('resources/bundled-docs/manifest.json');
    expect(workbenchDoc).toContain('docs/product/program-repo-jump.md');
    expect(workbenchDoc).toContain('.cache/wiki-workbench/latest-workbench.json');
    expect(workbenchDoc).toContain('.cache/docs-integration/latest/docs-integration-report.json');
    expect(workbenchDoc).toContain('.cache/wiki-workbench/publication-prep/');
    expect(workbenchDoc).toContain('wiki_workbench_prepare_published');
    expect(workbenchDoc).toContain('wiki-workbench-evidence/wiki-workbench-manifest.json');
    expect(workbenchDoc).toContain('docs-integration-evidence/docs-integration-report.json');

    expect(coherenceLedger).toContain('# Documentation Coherence Ledger');
    expect(coherenceLedger).toContain('run-docs-gate.js');
    expect(coherenceLedger).toContain('runDocsWorkbenchDocker.js gate');
    expect(coherenceLedger).toContain(
      '$env:USERPROFILE\\\\.codex\\\\skills\\\\repo-standards-review\\\\scripts\\\\run_assurance.py'
    );
    expect(coherenceLedger).toContain('DOC-001');
    expect(coherenceLedger).toContain('DOC-004');
    expect(coherenceLedger).toContain('DOC-005');
    expect(coherenceLedger).toContain('DOC-011');
    expect(coherenceLedger).toContain('docs/product/wiki-publication-ledger.md');
    expect(coherenceLedger).toContain('docs/product/program-repo-jump.md');
    expect(coherenceLedger).toContain('planned fourth experiment mirror');
    expect(coherenceLedger).toContain('DOC-012');
    expect(coherenceLedger).toContain('DOC-013');
    expect(coherenceLedger).toContain('DOC-015');
    expect(coherenceLedger).toContain('container-owned `node_modules` surface');

    expect(wikiSeedPlan).toContain('# Wiki Seed Plan');
    expect(wikiSeedPlan).toContain('docs/product/documentation-coherence-ledger.md');
    expect(wikiSeedPlan).toContain('docs/product/wiki-publication-ledger.md');
    expect(wikiSeedPlan).toContain('npm run wiki:workbench:prepare');
    expect(wikiSeedPlan).toContain('--page-id <published-page-id>');
    expect(wikiSeedPlan).toContain('refresh-existing-page');
    expect(wikiSeedPlan).toContain('src/');

    expect(wikiPublicationLedger).toContain('# Wiki Publication Ledger');
    expect(wikiPublicationLedger).toContain('| Overview | `home` | published |');
    expect(wikiPublicationLedger).toContain('| Debt Retirement Contract | `Debt-Retirement-Contract` | published |');
    expect(wikiPublicationLedger).toContain('| Debt Ledger | `Debt-Ledger` | published |');
    expect(wikiPublicationLedgerJson).toContain('"id": "overview"');
    expect(wikiPublicationLedgerJson).toContain('"title": "Overview"');
    expect(wikiPublicationLedgerJson).toContain('"id": "debt-retirement-contract"');
    expect(wikiPublicationLedgerJson).toContain('"id": "debt-ledger"');

    expect(wikiAuthorityMap).toContain('[documentation-coherence-ledger.md](./documentation-coherence-ledger.md)');
    expect(wikiAuthorityMap).toContain('[wiki-seed-plan.md](./wiki-seed-plan.md)');
    expect(wikiAuthorityMap).toContain('[wiki-publication-ledger.md](./wiki-publication-ledger.md)');
    expect(wikiAuthorityMap).toContain('keep `nextPage = null` closed');
    expect(wikiAuthorityMap).toContain('--page-id <published-page-id>');
    expect(wikiAuthorityMap).toContain('npm run docs:workbench:wiki:prepare');
    expect(wikiAuthorityMap).toContain('docs/product/program-repo-jump.md');

    expect(architectureOverview).toContain('[ADR-0012](./adr/ADR-0012-documentation-package-workbench-image.md)');
    expect(architectureOverview).toContain('[ADR-0013](./adr/ADR-0013-authority-first-wiki-seeding.md)');
    expect(architectureOverview).toContain('[ADR-0014](./adr/ADR-0014-cross-repo-navigation-control-plane.md)');
    expect(architectureOverview).toContain('[ADR-0015](./adr/ADR-0015-version-matched-bundled-user-documentation.md)');
    expect(architectureOverview).toContain('[ADR-0016](./adr/ADR-0016-gitlab-authority-and-github-linux-experiment-lane.md)');
    expect(architectureOverview).toContain('[ADR-0019](./adr/ADR-0019-governed-wiki-workbench-system.md)');
    expect(architectureOverview).toContain('[ADR-0033](./adr/ADR-0033-hosted-automation-governance-matrix-and-protection-semantics.md)');
    expect(programRepoJump).toContain('# Program Repo Jump');
    expect(programRepoJump).toContain('private GitHub experiment mirror');
    expect(programRepoJump).toContain('vi-history-suite.public');
    expect(programRepoJump).toContain('vi-history-suite.github.wiki');
    expect(programRepoJump).toContain('npm run wiki:workbench:doctor');
    expect(adr0012).toContain('# ADR-0012: Documentation-Package Workbench Image');
    expect(adr0012).toContain('resolve the repository root at runtime from `CI_PROJECT_DIR`,');
    expect(adr0012).toContain('container-owned `node_modules` surface');
    expect(adr0013).toContain('# ADR-0013: Authority-First Wiki Seeding');
    expect(adr0014).toContain('# ADR-0014: Cross-Repo Navigation Control Plane');
    expect(adr0015).toContain('# ADR-0015: Version-Matched Bundled User Documentation');
    expect(adr0016).toContain('# ADR-0016: GitLab Authority And GitHub Linux Experiment Lane');
    expect(adr0019).toContain('# ADR-0019: Governed Wiki Workbench System');
    expect(adr0033).toContain('# ADR-0033: Hosted Automation Governance Matrix And Protection Semantics');
  });

  it('configures the GitLab release lane plus docs-package workbench publish lane', () => {
    const gitlabCi = readText('.gitlab-ci.yml');
    const readme = readText('README.md');
    const currentState = readText('docs/product/current-state.md');
    const releaseProcedure = readText('docs/release-procedure.md');

    expect(gitlabCi).toContain('docs_continuous_integration:');
    expect(gitlabCi).toContain('docs_public_continuous_integration:');
    expect(gitlabCi).toContain('docs_internal_continuous_integration:');
    expect(gitlabCi).toContain('node scripts/run-docs-continuous-integration.js --skip-links --evidence-dir docs-integration-evidence');
    expect(gitlabCi).toContain('node scripts/run-docs-continuous-integration.js --surface public --skip-links --evidence-dir docs-integration-evidence/public');
    expect(gitlabCi).toContain('node scripts/run-docs-continuous-integration.js --surface internal --skip-links --evidence-dir docs-integration-evidence/internal');
    expect(gitlabCi).toContain('https://github.com/svelderrainruiz/vi-history-suite.wiki.git');
    expect(gitlabCi).toContain(
      'PUBLIC_GITHUB_WIKI_BRANCH="${VIHS_PUBLIC_GITHUB_WIKI_BRANCH:-${CI_MERGE_REQUEST_SOURCE_BRANCH_NAME:-${CI_COMMIT_BRANCH:-${CI_DEFAULT_BRANCH}}}}"'
    );
    expect(gitlabCi).toContain('git clone --branch "${PUBLIC_GITHUB_WIKI_BRANCH}" "https://github.com/svelderrainruiz/vi-history-suite.wiki.git" ../vi-history-suite.github.wiki || git clone "https://github.com/svelderrainruiz/vi-history-suite.wiki.git" ../vi-history-suite.github.wiki');
    expect(gitlabCi).toContain(
      'VIHS_PUBLIC_GITHUB_WIKI_REPO_ROOT="${CI_PROJECT_DIR}/../vi-history-suite.github.wiki"'
    );
    expect(gitlabCi).toContain('VIHS_LEDGER_PATH="${CI_PROJECT_DIR}/docs/product/public-github-wiki-publication-ledger.json"');
    expect(gitlabCi).toContain('docs-integration-evidence/');
    expect(gitlabCi).toContain('publish_docs_authoring_image:');
    expect(gitlabCi).toContain('wiki_workbench_prepare_published:');
    expect(gitlabCi).toContain('assurance_release_gate:');
    expect(gitlabCi).toContain('assurance_26514_authority:');
    expect(gitlabCi).toContain('assurance_requirements_quality:');
    expect(gitlabCi).toContain('assurance_external_user_information:');
    expect(gitlabCi).toContain('assurance_audit_packet:');
    expect(gitlabCi).toContain('registry.gitlab.com/svelderrainruiz/repo-standards-review/assurance-workbench:main');
    expect(gitlabCi).toContain('VIHS_ASSURANCE_EXECUTOR: container');
    expect(gitlabCi).toContain('docker pull "${VIHS_ASSURANCE_IMAGE}"');
    expect(gitlabCi).toContain('npm run assurance:release-gate -- --evidence-dir assurance-release-gate-evidence');
    expect(gitlabCi).toContain('npm run assurance:26514:authority -- --evidence-dir assurance-26514-authority-evidence');
    expect(gitlabCi).toContain('npm run assurance:requirements -- --evidence-dir assurance-requirements-quality-evidence');
    expect(gitlabCi).toContain('npm run assurance:user-info -- --evidence-dir assurance-external-user-information-evidence');
    expect(gitlabCi).toContain('--dockerfile "${CI_PROJECT_DIR}/docker/docs-authoring/Dockerfile"');
    expect(gitlabCi).toContain('${CI_REGISTRY_IMAGE}/docs-authoring:main');
    expect(gitlabCi).toContain('${CI_REGISTRY_IMAGE}/docs-authoring:sha-${CI_COMMIT_SHORT_SHA}');
    expect(gitlabCi).toContain("path.join('docs-workbench-evidence', 'docs-workbench-manifest.json')");
    expect(gitlabCi).toContain('wiki-workbench-evidence/');
    expect(gitlabCi).toContain('package_extension_preview:');
    expect(gitlabCi).toContain('stage: package');
    expect(gitlabCi).toContain(
      'export VIHS_INTERNAL_WIKI_REPO_ROOT="${CI_PROJECT_DIR}/../vi-history-suite.wiki"'
    );
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
    expect(readme).toContain('registry.gitlab.com/svelderrainruiz/repo-standards-review/assurance-workbench:main');
    expect(readme).toContain('Linux Assurance Runner Lane');
    expect(readme).toContain('governed tagged release artifact');
    expect(currentState).toContain('docs-workbench image: `registry.gitlab.com/svelderrainruiz/vi-history-suite/docs-authoring:main`');
    expect(currentState).toContain('assurance-workbench image: `registry.gitlab.com/svelderrainruiz/repo-standards-review/assurance-workbench:main`');
    expect(currentState).toContain('preview install surface: `preview-evidence/vi-history-suite-<version>.vsix`');
    expect(releaseProcedure).toContain('For pre-release install testing, use the `package_extension_preview` artifact');
    expect(releaseProcedure).toContain('The repo also publishes a separate docs-authoring workbench image');
    expect(releaseProcedure).toContain('The protected-branch release-gate CI lane uses the published external');
    expect(releaseProcedure).toContain('local authenticated self-hosted Linux assurance runner lane');
    expect(releaseProcedure).toContain('Preview VSIX artifacts are available from `main`');
  });
});

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

function parseSemver(version: string): [number, number, number] {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version.trim());
  if (!match) {
    throw new Error(`Unsupported semver: ${version}`);
  }
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function compareSemver(left: string, right: string): number {
  const leftParts = parseSemver(left);
  const rightParts = parseSemver(right);

  for (let index = 0; index < leftParts.length; index += 1) {
    const delta = leftParts[index] - rightParts[index];
    if (delta !== 0) {
      return delta;
    }
  }

  return 0;
}

type SustainmentRules = {
  releaseCadence: {
    versionLineContract: {
      retainedExactVersionReleases: string[];
      burnedExactVersionReleases?: string[];
      currentExactReleaseLine: string;
      currentMainPackageLine: string;
      currentDevelopPackageLine?: string;
      activeDevelopCandidateReleaseLine?: string | null;
      activeReleaseCandidateBranch?: string | null;
      activeHotfixCandidateReleaseLine?: string | null;
      activeHotfixBranch?: string | null;
      publicDefaultBranch?: string;
      publicCodespaceBranch: string;
      integrationBranch?: string;
      releaseBranch?: string;
      hotfixBranch?: string;
      exactReleaseLineBranch?: string;
    };
    strictSemverRule: string[];
  };
};

describe('strict semver discipline', () => {
  it('keeps the published main line aligned to the current exact release line', () => {
    const pkg = readJson<{ version: string }>('package.json');
    const readme = readText('README.md');
    const currentState = readText('docs/product/current-state.md');
    const releaseProcedure = readText('docs/release-procedure.md');
    const sustainmentRules = readJson<SustainmentRules>('docs/product/post-release-sustainment-rules.json');
    const changelog = readText('CHANGELOG.md');

    const versionLineContract = sustainmentRules.releaseCadence.versionLineContract;
    const exactReleaseLine = versionLineContract.currentExactReleaseLine.replace(/^v/, '');
    const activeCandidateReleaseLine =
      versionLineContract.activeHotfixCandidateReleaseLine?.replace(/^v/, '') ??
      versionLineContract.activeDevelopCandidateReleaseLine?.replace(/^v/, '') ?? exactReleaseLine;

    expect(versionLineContract.retainedExactVersionReleases).toEqual([
      'v0.2.0',
      'v1.0.0',
      'v1.0.1',
      'v1.0.2',
      'v1.0.3',
      'v1.0.4',
      'v1.0.5',
      'v1.0.6',
      'v1.1.0',
      'v1.2.0',
      'v1.2.1',
      'v1.2.2',
      'v1.3.0',
      'v1.3.1',
      'v1.3.2',
      'v1.3.3',
      'v1.3.4',
      'v1.3.5',
      'v1.3.6'
    ]);
    expect(versionLineContract.burnedExactVersionReleases).toEqual(['v1.0.2']);
    expect(versionLineContract.integrationBranch).toBe('develop');
    expect(versionLineContract.releaseBranch).toBe('release/*');
    expect(versionLineContract.hotfixBranch).toBe('hotfix/*');
    expect(versionLineContract.exactReleaseLineBranch).toBe('main');
    expect(pkg.version).toBe('1.3.6');
    expect(versionLineContract.currentMainPackageLine).toBe('1.3.6');
    expect(versionLineContract.currentDevelopPackageLine).toBe('1.3.6');
    expect(versionLineContract.activeDevelopCandidateReleaseLine).toBeNull();
    expect(versionLineContract.activeReleaseCandidateBranch).toBeNull();
    expect(versionLineContract.activeHotfixCandidateReleaseLine).toBeNull();
    expect(versionLineContract.activeHotfixBranch).toBeNull();
    expect((versionLineContract as any).activeFeatureBranch).toBe(
      'feature/public-github-release-transaction-hardening'
    );
    expect(versionLineContract.publicDefaultBranch).toBe('main');
    expect(versionLineContract.currentDevelopPackageLine).toBe(pkg.version);
    expect(versionLineContract.publicCodespaceBranch).toBe('develop');
    expect(compareSemver(versionLineContract.currentMainPackageLine, exactReleaseLine)).toBe(0);
    expect(compareSemver(pkg.version, activeCandidateReleaseLine)).toBe(0);
    expect(compareSemver(pkg.version, exactReleaseLine)).toBe(0);
    expect(readme).toContain('- burned exact release line: `v1.0.2`');
    expect(readme).toContain('- current exact released line: `v1.3.6`');
    expect(readme).toContain('- current published package line on `main`: `1.3.6`');
    expect(readme).toContain('- current develop package line on `develop`: `1.3.6`');
    expect(readme).toContain('- active exact release candidate line on `develop`: none');
    expect(readme).toContain('- active release-candidate branch: none');
    expect(readme).toContain('- active exact hotfix candidate line on `main`: none');
    expect(readme).toContain('- active hotfix branch: none');
    expect(readme).toContain('active feature-lane public GitHub release hardening branch on `develop`:');
    expect(readme).toContain('npm run public:exact:pretag:proof');
    expect(readme).toContain('public_exact_pretag_proof');
    expect(readme).toContain('npm run public:github:exact:transaction:assess');
    expect(readme).toContain('- active Windows x64 private-release-prep slice: historical `release/1.3.1`');
    expect(readme).toContain('docs/product/private-release-windows-x64-v1.3.1.md');
    expect(readme).toContain('- public GitHub default branch: `main`');
    expect(readme).toContain('- public Codespaces evaluation branch: `develop`');
    expect(readme).toContain('- integration branch: `develop`');
    expect(readme).toContain('- protected exact-release line: `main`');
    expect(readme).toContain('- release-candidate branch family: `release/*`');
    expect(readme).toContain('- separate public GitHub exact release publication: blocked; public `main` now publishes `bd81bfe`');
    expect(readme).toContain('- VS Code Marketplace retained published version: `1.3.0`');
    expect(currentState).toContain('- burned exact release line: `v1.0.2`');
    expect(currentState).toContain('- current exact released line: `v1.3.6`');
    expect(currentState).toContain('- current published package line on `main`: `1.3.6`');
    expect(currentState).toContain('- current develop package line on `develop`: `1.3.6`');
    expect(currentState).toContain('- active exact release candidate line on `develop`: none');
    expect(currentState).toContain('- active release-candidate branch: none');
    expect(currentState).toContain('- active exact hotfix candidate line on `main`: none');
    expect(currentState).toContain('- active hotfix branch: none');
    expect(currentState).toContain('active feature-lane public GitHub release hardening branch on `develop`:');
    expect(currentState).toContain('npm run public:exact:pretag:proof');
    expect(currentState).toContain('public_exact_pretag_proof');
    expect(currentState).toContain('npm run public:github:exact:transaction:assess');
    expect(currentState).toContain('- active Windows x64 private-release-prep slice: historical `release/1.3.1`');
    expect(currentState).toContain('private-release-windows-x64-v1.3.1.md');
    expect(currentState).toContain('- public GitHub default branch: `main`');
    expect(currentState).toContain('- public Codespaces evaluation branch: `develop`');
    expect(currentState).toContain('- integration branch: `develop`');
    expect(currentState).toContain('- protected exact-release line: `main`');
    expect(currentState).toContain('- release-candidate branch family: `release/*`');
    expect(currentState).toContain('- separate public GitHub exact release publication: blocked; public `main` now');
    expect(currentState).toContain('- VS Code Marketplace retained published version: `1.3.0`');
    expect(releaseProcedure).toContain('The current exact released line is `v1.3.6`.');
    expect(releaseProcedure).toContain('The burned exact released line is `v1.0.2`.');
    expect(releaseProcedure).toContain("The current published package line on `main` is `1.3.6`.");
    expect(releaseProcedure).toContain('The current develop package line on `develop` is `1.3.6`.');
    expect(releaseProcedure).toContain('The active exact release candidate line on `develop` is none.');
    expect(releaseProcedure).toContain('The active release-candidate branch is none.');
    expect(releaseProcedure).toContain('The active exact hotfix candidate line on `main` is none.');
    expect(releaseProcedure).toContain('The active hotfix branch is none.');
    expect(releaseProcedure).toContain('The active feature-lane public GitHub release hardening branch on `develop`');
    expect(releaseProcedure).toContain('npm run public:exact:pretag:proof');
    expect(releaseProcedure).toContain('public_exact_pretag_proof');
    expect(releaseProcedure).toContain('npm run public:github:exact:transaction:assess');
    expect(releaseProcedure).toContain('The active Windows x64 private-release-prep slice is the historical');
    expect(releaseProcedure).toContain('docs/product/private-release-windows-x64-v1.3.1.md');
    expect(releaseProcedure).toContain('The public GitHub default branch is `main`');
    expect(releaseProcedure).toContain('`main` shall match that exact release line');
    expect(releaseProcedure).toContain('When `develop` carries post-release work');
    expect(releaseProcedure).toContain('A SemVer bump is not complete');
    expect(releaseProcedure).toContain('Any later repo change intended for publication shall');
    expect(releaseProcedure).toContain('advance `package.json`');
    expect(releaseProcedure).toContain('top `CHANGELOG.md` heading to the next SemVer line');
    expect(releaseProcedure).toContain('npm run branch:governance:assert');
    expect(releaseProcedure).toContain('integration branch is `develop`');
    expect(releaseProcedure).toContain('protected exact-release line is `main`');
    expect(releaseProcedure).toContain('release-candidate branch family is `release/*`');
    expect(releaseProcedure).toContain('next-line branch model is `GitFlow`');
    expect(releaseProcedure).toContain('required checks');
    expect(sustainmentRules.releaseCadence.strictSemverRule).toContain(
      'when develop carries post-release work, the develop package line shall advance to the next exact release candidate before public-facing normalization continues'
    );
    expect(sustainmentRules.releaseCadence.strictSemverRule).toContain(
      'future sessions shall not treat an unreleased SemVer bump as complete until the matching public tag, public GitHub release, and VS Code Marketplace version are all published'
    );
    expect(sustainmentRules.releaseCadence.strictSemverRule).toContain(
      'future sessions shall keep exact tagging blocked until npm run public:exact:pretag:proof passes cleanly against the promoted public facade and GitLab public_exact_pretag_proof retains the same proof'
    );
    expect(sustainmentRules.releaseCadence.strictSemverRule).toContain(
      'future sessions shall assess any partially public exact GitHub transaction through npm run public:github:exact:transaction:assess before any further public GitHub release or VS Code Marketplace act'
    );
    expect(sustainmentRules.releaseCadence.strictSemverRule).toContain(
      'future sessions shall not open a later SemVer line while the current exact line still retains a blocked public GitHub or VS Code Marketplace transaction'
    );
    expect(sustainmentRules.releaseCadence.strictSemverRule).toContain(
      'future sessions shall repair the current exact line in place instead of burning a new version whenever public GitHub main, the exact tag, or a draft release already exist for that same exact line unless the retained transaction controller proves that repair is impossible'
    );
    expect(sustainmentRules.releaseCadence.strictSemverRule).toContain(
      'future sessions shall not treat an exact release as fully closed until the matching released main line has been back-merged into develop through the protected path and the resulting develop pipeline is green'
    );
    expect(sustainmentRules.releaseCadence.strictSemverRule).toContain(
      'future sessions shall keep exact tagging blocked until the post-publication expert-agent review gate closes with no findings against the exact published public candidate heads retained in the authority candidate package'
    );
    expect(sustainmentRules.releaseCadence.strictSemverRule).toContain(
      'future sessions shall not treat a burned exact release as the green release baseline for later publication'
    );
    expect(changelog).toContain('## [1.3.5] - 2026-04-21');
    expect(changelog).toContain('## [1.3.1] - 2026-04-20');
    expect(changelog).toContain('## [1.3.0] - 2026-04-14');
    expect(changelog).toContain('## [1.2.2] - 2026-04-07');
    expect(changelog).toContain('## [1.2.1] - 2026-04-07');
    expect(changelog).toContain('## [1.2.0] - 2026-04-07');
    expect(changelog).toContain('## [1.1.0] - 2026-04-07');
    expect(changelog).toContain('## [1.0.6] - 2026-04-07');
    expect(changelog).toContain('## [1.0.5] - 2026-04-07');
    expect(changelog).toContain('Burned exact-version releases now include `v1.0.2`.');
  });
});

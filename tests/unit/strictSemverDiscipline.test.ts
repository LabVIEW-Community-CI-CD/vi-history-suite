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
      publicCodespaceBranch: string;
      integrationBranch?: string;
      releaseBranch?: string;
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
      versionLineContract.activeDevelopCandidateReleaseLine?.replace(/^v/, '') ?? exactReleaseLine;

    expect(versionLineContract.retainedExactVersionReleases).toEqual([
      'v0.2.0',
      'v1.0.0',
      'v1.0.1',
      'v1.0.2',
      'v1.0.3',
      'v1.0.4'
    ]);
    expect(versionLineContract.burnedExactVersionReleases).toEqual(['v1.0.2']);
    expect(versionLineContract.integrationBranch).toBe('develop');
    expect(versionLineContract.releaseBranch).toBe('main');
    expect(pkg.version).toBe('1.0.5');
    expect(versionLineContract.currentMainPackageLine).toBe('1.0.4');
    expect(versionLineContract.currentDevelopPackageLine).toBe('1.0.5');
    expect(versionLineContract.activeDevelopCandidateReleaseLine).toBe('v1.0.5');
    expect(pkg.version).toBe(versionLineContract.currentDevelopPackageLine);
    expect(versionLineContract.publicCodespaceBranch).toBe('develop');
    expect(compareSemver(versionLineContract.currentMainPackageLine, exactReleaseLine)).toBe(0);
    expect(compareSemver(pkg.version, activeCandidateReleaseLine)).toBe(0);
    expect(compareSemver(pkg.version, exactReleaseLine)).toBeGreaterThan(0);
    expect(readme).toContain('- burned exact release line: `v1.0.2`');
    expect(readme).toContain('- current exact released line: `v1.0.4`');
    expect(readme).toContain('- current published package line on `main`: `1.0.4`');
    expect(readme).toContain('- current develop package line on `develop`: `1.0.5`');
    expect(readme).toContain('- active exact release candidate line on `develop`: `v1.0.5`');
    expect(readme).toContain('- public Codespaces evaluation branch: `develop`');
    expect(readme).toContain('- integration branch: `develop`');
    expect(readme).toContain('- release branch: `main`');
    expect(currentState).toContain('- burned exact release line: `v1.0.2`');
    expect(currentState).toContain('- current exact released line: `v1.0.4`');
    expect(currentState).toContain('- current published package line on `main`: `1.0.4`');
    expect(currentState).toContain('- current develop package line on `develop`: `1.0.5`');
    expect(currentState).toContain('- active exact release candidate line on `develop`: `v1.0.5`');
    expect(currentState).toContain('- public Codespaces evaluation branch: `develop`');
    expect(currentState).toContain('- integration branch: `develop`');
    expect(currentState).toContain('- release branch: `main`');
    expect(releaseProcedure).toContain('The current exact released line is `v1.0.4`.');
    expect(releaseProcedure).toContain('The burned exact released line is `v1.0.2`.');
    expect(releaseProcedure).toContain("The current published package line on `main` is `1.0.4`.");
    expect(releaseProcedure).toContain('The current develop package line on `develop` is `1.0.5`.');
    expect(releaseProcedure).toContain('The active exact release candidate line on `develop` is `v1.0.5`.');
    expect(releaseProcedure).toContain('`main` shall match that exact release line');
    expect(releaseProcedure).toContain('When `develop` carries post-release work');
    expect(releaseProcedure).toContain('A SemVer bump is not complete');
    expect(releaseProcedure).toContain('Any later repo change intended for publication shall');
    expect(releaseProcedure).toContain('advance `package.json`');
    expect(releaseProcedure).toContain('top `CHANGELOG.md` heading to the next SemVer line');
    expect(releaseProcedure).toContain('integration branch is `develop`');
    expect(releaseProcedure).toContain('release branch is `main`');
    expect(releaseProcedure).toContain('required checks');
    expect(sustainmentRules.releaseCadence.strictSemverRule).toContain(
      'when develop carries post-release work, the develop package line shall advance to the next exact release candidate before public-facing normalization continues'
    );
    expect(sustainmentRules.releaseCadence.strictSemverRule).toContain(
      'future sessions shall not treat an unreleased SemVer bump as complete until the matching public tag and public GitHub release are both published'
    );
    expect(sustainmentRules.releaseCadence.strictSemverRule).toContain(
      'future sessions shall not treat a burned exact release as the green release baseline for later publication'
    );
    expect(changelog).toContain('## [1.0.5] - 2026-04-07');
    expect(changelog).toContain('Burned exact-version releases now include `v1.0.2`.');
  });
});

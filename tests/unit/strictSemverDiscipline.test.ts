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
      currentExactReleaseLine: string;
      currentMainPackageLine: string;
      nextExactReleaseLine: string;
    };
    strictSemverRule: string[];
  };
};

describe('strict semver discipline', () => {
  it('keeps main ahead of the current exact release line after release publication', () => {
    const pkg = readJson<{ version: string }>('package.json');
    const readme = readText('README.md');
    const currentState = readText('docs/product/current-state.md');
    const releaseProcedure = readText('docs/release-procedure.md');
    const sustainmentRules = readJson<SustainmentRules>('docs/product/post-release-sustainment-rules.json');
    const changelog = readText('CHANGELOG.md');

    const versionLineContract = sustainmentRules.releaseCadence.versionLineContract;
    const exactReleaseLine = versionLineContract.currentExactReleaseLine.replace(/^v/, '');

    expect(versionLineContract.retainedExactVersionReleases).toEqual(['v0.2.0', 'v1.0.0']);
    expect(pkg.version).toBe('1.0.1');
    expect(pkg.version).toBe(versionLineContract.currentMainPackageLine);
    expect(`v${pkg.version}`).toBe(versionLineContract.nextExactReleaseLine);
    expect(compareSemver(pkg.version, exactReleaseLine)).toBeGreaterThan(0);
    expect(readme).toContain('- current exact released line: `v1.0.0`');
    expect(readme).toContain('- current package line on `main`: `1.0.1`');
    expect(readme).toContain('- next exact-version release line on `main`: `v1.0.1`');
    expect(currentState).toContain('- current exact released line: `v1.0.0`');
    expect(currentState).toContain('- current package line on `main`: `1.0.1`');
    expect(currentState).toContain('- next exact-version release line on `main`: `v1.0.1`');
    expect(releaseProcedure).toContain('The current exact released line is `v1.0.0`.');
    expect(releaseProcedure).toContain("The current package line on `main` is `1.0.1`.");
    expect(releaseProcedure).toContain("The next exact-version release line on `main` is `v1.0.1`.");
    expect(releaseProcedure).toContain('any later repo change on `main` shall');
    expect(releaseProcedure).toContain(
      'advance `package.json` and the top `CHANGELOG.md` heading to the next'
    );
    expect(sustainmentRules.releaseCadence.strictSemverRule).toContain(
      'future sessions shall treat that advanced line as the real changed main line, not as a generic baseline placeholder'
    );
    expect(changelog).toContain('## [1.0.1] - Unreleased');
    expect(changelog).toContain('the current package line on `main` is now `1.0.1`');
  });
});

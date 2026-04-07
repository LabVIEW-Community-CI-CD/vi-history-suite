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

describe('hosted ci governance docs', () => {
  it('retains one hosted automation matrix across GitLab, public GitHub, and experiment lanes', () => {
    const matrix = readJson<any>('docs/product/hosted-ci-governance.json');
    const matrixDoc = readText('docs/product/hosted-ci-governance.md');
    const adr = readText(
      'docs/architecture/adr/ADR-0033-hosted-automation-governance-matrix-and-protection-semantics.md'
    );
    const gitlabCi = readText('.gitlab-ci.yml');
    const cmPlan = readText('docs/cm/cm-plan.md');
    const readme = readText('README.md');
    const currentState = readText('docs/product/current-state.md');
    const releaseProcedure = readText('docs/release-procedure.md');
    const linuxBenchmarkWorkflow = readText('.github/workflows/linux-runtime-benchmark-experiment.yml');
    const windowsBenchmarkWorkflow = readText('.github/workflows/windows-runtime-benchmark-image.yml');

    expect(matrix.openingDecision).toEqual(
      expect.objectContaining({
        currentExactReleaseLine: 'v1.0.6',
        currentMainPackageLine: '1.0.6',
        currentDevelopPackageLine: '1.1.0',
        activeDevelopCandidateReleaseLine: 'v1.1.0',
        chosenBump: 'minor'
      })
    );
    expect(matrix.authorityGitLab.mergeGate).toBe('only_allow_merge_if_pipeline_succeeds');
    expect(matrix.authorityGitLab.namedRequiredChecks).toBe(false);
    expect(matrix.authorityGitLab.jobs.package_extension_preview.admittedRefs).toEqual(
      expect.arrayContaining(['develop', 'release/*', 'hotfix/*', 'main', 'vX.Y.Z-tags'])
    );
    expect(matrix.publicGitHub.requiredChecks).toEqual([
      'package-preview',
      'public-facade-linux-smoke'
    ]);
    expect(matrix.githubExperiment).toEqual(
      expect.objectContaining({
        classification: 'characterization-only',
        requiredForExactRelease: false
      })
    );

    expect(matrixDoc).toContain('current `develop` package line: `1.1.0`');
    expect(matrixDoc).toContain('chosen bump: `minor`');
    expect(matrixDoc).toContain('merge gate: `only_allow_merge_if_pipeline_succeeds=true`');
    expect(matrixDoc).toContain('classification: characterization-only experiment automation');
    expect(adr).toContain('GitLab authority uses protected branches plus');
    expect(adr).toContain('GitHub benchmark workflows remain governed characterization lanes');

    expect(gitlabCi).toContain(`- if: '$CI_COMMIT_BRANCH == "develop"'`);
    expect(gitlabCi).toContain(`- if: '$CI_COMMIT_BRANCH =~ /^release\\/.+$/'`);
    expect(gitlabCi).toContain(`- if: '$CI_COMMIT_BRANCH =~ /^hotfix\\/.+$/'`);
    expect(gitlabCi).not.toContain(`- if: '$CI_COMMIT_BRANCH'`);

    expect(cmPlan).toContain(
      '`develop` is the working integration branch and `main` is the exact release branch'
    );
    expect(readme).toContain('[Hosted CI Governance](./docs/product/hosted-ci-governance.md)');
    expect(readme).toContain(
      '- hosted automation governance matrix: [docs/product/hosted-ci-governance.md]'
    );
    expect(currentState).toContain('[hosted-ci-governance.md](./hosted-ci-governance.md)');
    expect(currentState).toContain(
      '- hosted automation governance matrix: [hosted-ci-governance.md](./hosted-ci-governance.md)'
    );
    expect(releaseProcedure).toContain('The hosted automation governance matrix is retained in:');

    expect(linuxBenchmarkWorkflow).toContain('name: Linux Runtime Benchmark Experiment');
    expect(linuxBenchmarkWorkflow).toContain('- experiment/**');
    expect(windowsBenchmarkWorkflow).toContain('name: Windows Runtime Benchmark Image');
    expect(windowsBenchmarkWorkflow).toContain('- experiment/**');
  });
});

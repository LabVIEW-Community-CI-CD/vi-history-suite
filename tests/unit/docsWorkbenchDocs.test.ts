import * as fs from 'node:fs';
import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '..', '..');

function readText(relativePath: string): string {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function readManifest(): { scripts?: Record<string, string> } {
  return JSON.parse(readText('package.json')) as { scripts?: Record<string, string> };
}

// eslint-disable-next-line @typescript-eslint/no-var-requires
const docsGate = require(path.join(repoRoot, 'scripts', 'run-docs-gate.js')) as {
  createDocsGateSteps: (options?: { skipLinks?: boolean }) => Array<{
    id: string;
    command: string;
    args: string[];
  }>;
  runDocsGate: (
    argv?: string[],
    deps?: {
      cwd?: string;
      stdout?: { write: (text: string) => void };
      spawnSync?: (
        command: string,
        args: string[],
        options: { cwd: string; stdio: string; shell: boolean }
      ) => { status?: number; error?: NodeJS.ErrnoException };
    }
  ) => string;
  parseDocsGateArgs: (argv: string[]) => { helpRequested: boolean; skipLinks: boolean };
  getDocsGateUsage: () => string;
};

describe('documentation-package workbench', () => {
  it('retains a deterministic docs gate plan with an optional link-check step', () => {
    expect(docsGate.parseDocsGateArgs([])).toEqual({
      helpRequested: false,
      skipLinks: false
    });
    expect(docsGate.parseDocsGateArgs(['--skip-links'])).toEqual({
      helpRequested: false,
      skipLinks: true
    });
    expect(() => docsGate.parseDocsGateArgs(['--weird'])).toThrow(/Unknown argument/);
    expect(docsGate.getDocsGateUsage()).toContain('--skip-links');

    expect(docsGate.createDocsGateSteps()).toEqual([
      {
        id: 'compile',
        title: 'Compile TypeScript surfaces',
        command: 'npm',
        args: ['run', 'compile']
      },
      {
        id: 'docs-tests',
        title: 'Run documentation-package alignment tests',
        command: 'npx',
        args: [
          'vitest',
          'run',
          'tests/unit/bundledDocumentation.test.ts',
          'tests/unit/postReleaseControlPlaneDocs.test.ts',
          'tests/unit/debtLedgerDocs.test.ts',
          'tests/unit/executionPolicyDocs.test.ts',
          'tests/unit/requirementsDocs.test.ts',
          'tests/unit/packageManifest.test.ts',
          'tests/unit/shipControlDocs.test.ts',
          'tests/unit/docsWorkbenchDocs.test.ts',
          'tests/unit/wikiCoverageDocs.test.ts',
          'tests/unit/runWikiWorkbenchCli.test.ts'
        ]
      },
      {
        id: 'links',
        title: 'Check README and docs links',
        command: 'lychee',
        args: ['--verbose', '--no-progress', '--include-fragments', 'README.md', 'docs/**/*.md']
      }
    ]);

    expect(docsGate.createDocsGateSteps({ skipLinks: true }).map((step) => step.id)).toEqual([
      'compile',
      'docs-tests'
    ]);
  });

  it('defaults the docs gate working directory to the repo root when invoked elsewhere', () => {
    const spawned: string[] = [];

    const result = docsGate.runDocsGate(['--skip-links'], {
      stdout: {
        write: () => {}
      },
      spawnSync: (command, args, options) => {
        spawned.push(`${command} ${args.join(' ')}`);
        expect(options.cwd).toBe(repoRoot);
        expect(options.stdio).toBe('inherit');
        expect(options.shell).toBe(false);
        return { status: 0 };
      }
    });

    expect(result).toBe('pass');
    expect(spawned).toEqual([
      'npm run compile',
      'npx vitest run tests/unit/bundledDocumentation.test.ts tests/unit/postReleaseControlPlaneDocs.test.ts tests/unit/debtLedgerDocs.test.ts tests/unit/executionPolicyDocs.test.ts tests/unit/requirementsDocs.test.ts tests/unit/packageManifest.test.ts tests/unit/shipControlDocs.test.ts tests/unit/docsWorkbenchDocs.test.ts tests/unit/wikiCoverageDocs.test.ts tests/unit/runWikiWorkbenchCli.test.ts'
    ]);
  });

  it('keeps the Dockerfile, package scripts, docs, and GitLab publish lane aligned', () => {
    const manifest = readManifest();
    const dockerfile = readText('docker/docs-authoring/Dockerfile');
    const entrypoint = readText('docker/docs-authoring/entrypoint.sh');
    const dockerHelper = readText('scripts/runDocsWorkbenchDocker.js');
    const workbenchDoc = readText('docs/documentation-workbench.md');
    const programRepoJump = readText('docs/product/program-repo-jump.md');
    const programRepoJumpMap = readText('docs/product/program-repo-jump-map.json');
    const wikiPublicationLedger = readText('docs/product/wiki-publication-ledger.md');
    const wikiPublicationLedgerJson = readText('docs/product/wiki-publication-ledger.json');
    const gitlabCi = readText('.gitlab-ci.yml');

    expect(manifest.scripts?.['docs:bundle']).toBe('node scripts/syncBundledDocs.js');
    expect(manifest.scripts?.['docs:gate']).toBe('node scripts/run-docs-gate.js');
    expect(manifest.scripts?.['docs:gate:core']).toBe(
      'node scripts/run-docs-gate.js --skip-links'
    );
    expect(manifest.scripts?.['docs:workbench:build']).toBe(
      'node scripts/runDocsWorkbenchDocker.js build'
    );
    expect(manifest.scripts?.['docs:workbench:gate']).toBe(
      'node scripts/runDocsWorkbenchDocker.js gate'
    );
    expect(manifest.scripts?.['docs:workbench:shell']).toBe(
      'node scripts/runDocsWorkbenchDocker.js shell'
    );
    expect(manifest.scripts?.['docs:workbench:gitlab:pull']).toBe(
      'node scripts/runDocsWorkbenchDocker.js pull --image-source published'
    );
    expect(manifest.scripts?.['docs:workbench:gitlab:gate']).toBe(
      'node scripts/runDocsWorkbenchDocker.js gate --image-source published --pull'
    );
    expect(manifest.scripts?.['docs:workbench:gitlab:shell']).toBe(
      'node scripts/runDocsWorkbenchDocker.js shell --image-source published --pull'
    );
    expect(manifest.scripts?.['wiki:workbench:doctor']).toContain('runWikiWorkbench.js doctor');
    expect(manifest.scripts?.['wiki:workbench:plan']).toContain('runWikiWorkbench.js plan-pages');
    expect(manifest.scripts?.['wiki:workbench:prepare']).toContain(
      'runWikiWorkbench.js prepare-publication'
    );
    expect(manifest.scripts?.['wiki:workbench:sync-bundled-docs']).toContain(
      'runWikiWorkbench.js sync-bundled-docs'
    );
    expect(manifest.scripts?.['docs:workbench:wiki:doctor']).toBe(
      'node scripts/runDocsWorkbenchDocker.js wiki-doctor'
    );
    expect(manifest.scripts?.['docs:workbench:wiki:prepare']).toBe(
      'node scripts/runDocsWorkbenchDocker.js wiki-prepare'
    );
    expect(manifest.scripts?.['docs:workbench:gitlab:wiki:doctor']).toBe(
      'node scripts/runDocsWorkbenchDocker.js wiki-doctor --image-source published --pull'
    );
    expect(manifest.scripts?.['docs:workbench:gitlab:wiki:plan']).toBe(
      'node scripts/runDocsWorkbenchDocker.js wiki-plan --image-source published --pull'
    );
    expect(manifest.scripts?.['docs:workbench:gitlab:wiki:prepare']).toBe(
      'node scripts/runDocsWorkbenchDocker.js wiki-prepare --image-source published --pull'
    );
    expect(manifest.scripts?.['docs:workbench:gitlab:wiki:sync-bundled-docs']).toBe(
      'node scripts/runDocsWorkbenchDocker.js wiki-sync-bundled-docs --image-source published --pull'
    );
    expect(manifest.scripts?.['program:repos']).toContain('runProgramRepoJump.js');

    expect(dockerfile).toContain('FROM node:24-bookworm');
    expect(dockerfile).toContain('lychee-x86_64-unknown-linux-gnu.tar.gz');
    expect(dockerfile).toContain('CMD ["npm", "run", "docs:gate"]');
    expect(entrypoint).toContain('if [[ ! -d node_modules ]]; then');
    expect(entrypoint).toContain('npm ci');
    expect(dockerHelper).toContain("const localDocsImage = 'vi-history-suite-docs-authoring:local'");
    expect(dockerHelper).toContain("const publishedDocsImage =");
    expect(dockerHelper).toContain('VIHS_DOCS_WORKBENCH_IMAGE');
    expect(dockerHelper).toContain("command: 'docker.exe'");
    expect(dockerHelper).toContain("'--context', 'desktop-linux'");
    expect(dockerHelper).toContain("path.join(repoRoot, 'docker', 'docs-authoring', 'Dockerfile')");

    expect(workbenchDoc).toContain('npm run docs:workbench:build');
    expect(workbenchDoc).toContain('npm run docs:workbench:gate');
    expect(workbenchDoc).toContain('npm run docs:workbench:shell');
    expect(workbenchDoc).toContain('npm run wiki:workbench:doctor');
    expect(workbenchDoc).toContain('npm run wiki:workbench:plan');
    expect(workbenchDoc).toContain('npm run wiki:workbench:prepare');
    expect(workbenchDoc).toContain('npm run wiki:workbench:sync-bundled-docs');
    expect(workbenchDoc).toContain('npm run docs:workbench:wiki:doctor');
    expect(workbenchDoc).toContain('npm run docs:workbench:wiki:prepare');
    expect(workbenchDoc).toContain('npm run docs:workbench:gitlab:wiki:prepare');
    expect(workbenchDoc).toContain('npm run docs:bundle');
    expect(workbenchDoc).toContain('.cache/wiki-workbench/latest-workbench.json');
    expect(workbenchDoc).toContain('.cache/wiki-workbench/publication-prep/');
    expect(workbenchDoc).toContain('wiki-workbench-evidence/wiki-workbench-manifest.json');
    expect(workbenchDoc).toContain('wiki-workbench-evidence/iteration-report.md');
    expect(workbenchDoc).toContain('registry.gitlab.com/svelderrainruiz/vi-history-suite/docs-authoring:main');
    expect(workbenchDoc).toContain('wiki_workbench_prepare_published');
    expect(workbenchDoc).toContain('VIHS_WIKI_REPO_ROOT');
    expect(workbenchDoc).toContain('docs_control_plane_check');
    expect(workbenchDoc).toContain('${CI_PROJECT_PATH}.wiki.git');
    expect(workbenchDoc).toContain('docs-workbench-evidence/docs-workbench-manifest.json');
    expect(workbenchDoc).toContain('docs/product/wiki-publication-ledger.md');
    expect(workbenchDoc).toContain('docs/product/wiki-publication-ledger.json');
    expect(workbenchDoc).toContain('docs/product/wiki-coverage-matrix.md');
    expect(workbenchDoc).toContain('docs/product/wiki-coverage-matrix.json');
    expect(workbenchDoc).toContain('docs/product/debt-retirement-contract.md');
    expect(workbenchDoc).toContain('docs/product/debt-taxonomy.md');
    expect(workbenchDoc).toContain('docs/product/debt-ledger.md');
    expect(workbenchDoc).toContain('docs/product/debt-ledger.json');
    expect(workbenchDoc).toContain('resources/bundled-docs/manifest.json');
    expect(workbenchDoc).toContain('npm run program:repos');
    expect(workbenchDoc).toContain('scripts/repo_jump.py /home/sveld/code/standards/vi-history-suite');

    expect(programRepoJump).toContain('# Program Repo Jump');
    expect(programRepoJump).toContain('docs/product/program-repo-jump-map.json');
    expect(programRepoJump).toContain('npm run program:repos');
    expect(programRepoJump).toContain('npm run wiki:workbench:doctor');
    expect(programRepoJump).toContain(
      'scripts/repo_jump.py /home/sveld/code/standards/vi-history-suite --format text'
    );
    expect(programRepoJumpMap).toContain('"id": "vi-history-suite"');
    expect(programRepoJumpMap).toContain('"id": "vi-history-suite-source-experiments"');
    expect(programRepoJumpMap).toContain('"id": "vi-history-suite.wiki"');
    expect(programRepoJumpMap).toContain('"id": "repo-standards-review"');
    expect(programRepoJumpMap).toContain('"kind": "codex-skill"');

    expect(wikiPublicationLedger).toContain('# Wiki Publication Ledger');
    expect(wikiPublicationLedger).toContain('| Overview | `home` | published |');
    expect(wikiPublicationLedger).toContain('docs/product/SHIP-0001-releasable-vi-history-suite.md');
    expect(wikiPublicationLedger).toContain('docs/product/current-state.md');
    expect(wikiPublicationLedger).toContain('docs/product/release-readiness-matrix.json');
    expect(wikiPublicationLedger).toContain('| Debt Retirement Contract | `Debt-Retirement-Contract` | published |');
    expect(wikiPublicationLedger).toContain('| Debt Ledger | `Debt-Ledger` | published |');
    expect(wikiPublicationLedgerJson).toContain('"id": "overview"');
    expect(wikiPublicationLedgerJson).toContain('"wikiFileName": "home.md"');
    expect(wikiPublicationLedgerJson).toContain('"id": "debt-retirement-contract"');
    expect(wikiPublicationLedgerJson).toContain('"id": "debt-ledger"');
    expect(wikiPublicationLedgerJson).toContain('"nextPage"');

    expect(gitlabCi).toContain('docs_control_plane_check:');
    expect(gitlabCi).toContain('${CI_PROJECT_PATH}.wiki.git');
    expect(gitlabCi).toContain('VIHS_WIKI_REPO_ROOT="${CI_PROJECT_DIR}/../vi-history-suite.wiki"');
    expect(gitlabCi).toContain('npm run docs:gate:core');
    expect(gitlabCi).toContain('test_extension:');
    expect(gitlabCi).toContain('release_extension:');
    expect(gitlabCi).toContain('npm run test');
    expect(gitlabCi).toContain('publish_docs_authoring_image:');
    expect(gitlabCi).toContain('wiki_workbench_prepare_published:');
    expect(gitlabCi).toContain('/kaniko/executor');
    expect(gitlabCi).toContain("path.join('docs-workbench-evidence', 'docs-workbench-manifest.json')");
    expect(gitlabCi).toContain('${CI_REGISTRY_IMAGE}/docs-authoring:main');
    expect(gitlabCi).toContain('${CI_REGISTRY_IMAGE}/docs-authoring:sha-${CI_COMMIT_SHORT_SHA}');
    expect(gitlabCi).toContain('wiki-workbench-evidence/wiki-workbench-manifest.json');
    expect(gitlabCi).toContain('iteration-report.md');
  });
});

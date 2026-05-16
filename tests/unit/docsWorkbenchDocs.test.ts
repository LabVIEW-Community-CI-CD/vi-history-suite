import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '..', '..');
const admittedWslDistro =
  process.env.VIHS_DOCS_WSL_DISTRO ?? process.env.VIHS_LINUX_ASSURANCE_DISTRO ?? 'Ubuntu-24.04';

function readText(relativePath: string): string {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function readManifest(): { scripts?: Record<string, string> } {
  return JSON.parse(readText('package.json')) as { scripts?: Record<string, string> };
}

function removeTreeWithRetry(targetPath: string) {
  let lastError: unknown;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      fs.rmSync(targetPath, { recursive: true, force: true });
      return;
    } catch (error) {
      lastError = error;
      if (
        !(error instanceof Error) ||
        !('code' in error) ||
        (error as NodeJS.ErrnoException).code !== 'EPERM'
      ) {
        throw error;
      }
    }
  }

  if (process.platform === 'win32') {
    const cleanup = spawnSync('cmd.exe', ['/d', '/s', '/c', `rmdir /s /q "${targetPath}"`], {
      encoding: 'utf8'
    });

    if (cleanup.status === 0 || !fs.existsSync(targetPath)) {
      return;
    }
  }

  throw lastError;
}

function toWslPath(hostPath: string): string {
  const normalizedHostPath =
    process.platform === 'win32' ? hostPath.replace(/\\/g, '/') : hostPath;
  const result =
    process.platform === 'win32'
      ? spawnSync('wsl.exe', ['-d', admittedWslDistro, 'wslpath', '-a', '-u', normalizedHostPath], {
          encoding: 'utf8'
        })
      : spawnSync('wslpath', ['-a', '-u', normalizedHostPath], {
          encoding: 'utf8'
        });

  if (result.status !== 0) {
    throw new Error(result.stderr || `Failed to convert path to WSL form: ${hostPath}`);
  }

  return result.stdout.trim();
}

// eslint-disable-next-line @typescript-eslint/no-var-requires
const docsGate = require(path.join(repoRoot, 'scripts', 'run-docs-gate.js')) as {
  createDocsGateSteps: (options?: { skipLinks?: boolean }) => Array<{
    id: string;
    command: string;
    args: string[];
  }>;
  resolveNodeToolArgs: (command: string, args: string[], platform?: string) => string[];
  resolveNodeToolCommand: (command: string, platform?: string) => string;
  runDocsGate: (
    argv?: string[],
    deps?: {
      cwd?: string;
      platform?: string;
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

    expect(docsGate.createDocsGateSteps({ skipLinks: false, platform: 'linux' } as {
      skipLinks?: boolean;
      platform?: string;
    })).toEqual([
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
          'tests/unit/alignmentControlPlaneDocs.test.ts',
          'tests/unit/postReleaseControlPlaneDocs.test.ts',
          'tests/unit/publicSurfaceBoundaryDocs.test.ts',
          'tests/unit/publicForkOwnerProcedureDocs.test.ts',
          'tests/unit/debtLedgerDocs.test.ts',
          'tests/unit/executionPolicyDocs.test.ts',
          'tests/unit/releaseRuntimeDriftGate.test.ts',
          'tests/unit/governedProofDocs.test.ts',
          'tests/unit/firstTimeOverviewVideoPlan.test.ts',
          'tests/unit/postPublicationInstalledUserAcceptanceCampaign.test.ts',
          'tests/unit/informationForUsersAudienceDocs.test.ts',
          'tests/unit/informationForUsersQualityDocs.test.ts',
          'tests/unit/informationForUsersSupportDocs.test.ts',
          'tests/unit/installVihsExtensionScript.test.ts',
          'tests/unit/requirementsDocs.test.ts',
          'tests/unit/packageManifest.test.ts',
          'tests/unit/shipControlDocs.test.ts',
          'tests/unit/docsWorkbenchDocs.test.ts',
          'tests/unit/docsContinuousIntegration.test.ts',
          'tests/unit/syncBundledDocsScript.test.ts',
          'tests/unit/wikiCoverageDocs.test.ts',
          'tests/unit/runWikiWorkbenchCli.test.ts'
        ]
      },
      {
        id: 'bundle-check',
        title: 'Check bundled documentation drift',
        command: 'node',
        args: ['scripts/syncBundledDocs.js', '--check']
      },
      {
        id: 'links',
        title: 'Check README and docs links',
        command: 'lychee',
        args: [
          '--verbose',
          '--no-progress',
          '--include-fragments',
          '--exclude',
          '^https://gitlab\\.com/svelderrainruiz/vi-history-suite/-/work_items/.*$',
          'README.md',
          'docs/**/*.md'
        ]
      }
    ]);

    expect(docsGate.createDocsGateSteps({ skipLinks: true, platform: 'linux' } as {
      skipLinks?: boolean;
      platform?: string;
    }).map((step) => step.id)).toEqual([
      'compile',
      'docs-tests',
      'bundle-check'
    ]);

    expect(docsGate.resolveNodeToolCommand('npm', 'win32')).toBe('cmd.exe');
    expect(docsGate.resolveNodeToolCommand('npx', 'win32')).toBe('cmd.exe');
    expect(docsGate.resolveNodeToolArgs('npm', ['run', 'compile'], 'win32')).toEqual([
      '/d',
      '/s',
      '/c',
      'npm run compile'
    ]);
    expect(docsGate.resolveNodeToolArgs('npx', ['vitest', 'run'], 'win32')).toEqual([
      '/d',
      '/s',
      '/c',
      'npx vitest run'
    ]);
    expect(docsGate.createDocsGateSteps({ skipLinks: true, platform: 'win32' } as {
      skipLinks?: boolean;
      platform?: string;
    })).toEqual([
      {
        id: 'compile',
        title: 'Compile TypeScript surfaces',
        command: 'cmd.exe',
        args: ['/d', '/s', '/c', 'npm run compile']
      },
      {
        id: 'docs-tests',
        title: 'Run documentation-package alignment tests',
        command: 'cmd.exe',
        args: [
          '/d',
          '/s',
          '/c',
          'npx vitest run tests/unit/bundledDocumentation.test.ts tests/unit/alignmentControlPlaneDocs.test.ts tests/unit/postReleaseControlPlaneDocs.test.ts tests/unit/publicSurfaceBoundaryDocs.test.ts tests/unit/publicForkOwnerProcedureDocs.test.ts tests/unit/debtLedgerDocs.test.ts tests/unit/executionPolicyDocs.test.ts tests/unit/releaseRuntimeDriftGate.test.ts tests/unit/governedProofDocs.test.ts tests/unit/firstTimeOverviewVideoPlan.test.ts tests/unit/postPublicationInstalledUserAcceptanceCampaign.test.ts tests/unit/informationForUsersAudienceDocs.test.ts tests/unit/informationForUsersQualityDocs.test.ts tests/unit/informationForUsersSupportDocs.test.ts tests/unit/installVihsExtensionScript.test.ts tests/unit/requirementsDocs.test.ts tests/unit/packageManifest.test.ts tests/unit/shipControlDocs.test.ts tests/unit/docsWorkbenchDocs.test.ts tests/unit/docsContinuousIntegration.test.ts tests/unit/syncBundledDocsScript.test.ts tests/unit/wikiCoverageDocs.test.ts tests/unit/runWikiWorkbenchCli.test.ts'
        ]
      },
      {
        id: 'bundle-check',
        title: 'Check bundled documentation drift',
        command: 'node',
        args: ['scripts/syncBundledDocs.js', '--check']
      }
    ]);
  });

  it('defaults the docs gate working directory to the repo root when invoked elsewhere', () => {
    const spawned: string[] = [];

    const result = docsGate.runDocsGate(['--skip-links'], {
      platform: 'linux',
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
      'npx vitest run tests/unit/bundledDocumentation.test.ts tests/unit/alignmentControlPlaneDocs.test.ts tests/unit/postReleaseControlPlaneDocs.test.ts tests/unit/publicSurfaceBoundaryDocs.test.ts tests/unit/publicForkOwnerProcedureDocs.test.ts tests/unit/debtLedgerDocs.test.ts tests/unit/executionPolicyDocs.test.ts tests/unit/releaseRuntimeDriftGate.test.ts tests/unit/governedProofDocs.test.ts tests/unit/firstTimeOverviewVideoPlan.test.ts tests/unit/postPublicationInstalledUserAcceptanceCampaign.test.ts tests/unit/informationForUsersAudienceDocs.test.ts tests/unit/informationForUsersQualityDocs.test.ts tests/unit/informationForUsersSupportDocs.test.ts tests/unit/installVihsExtensionScript.test.ts tests/unit/requirementsDocs.test.ts tests/unit/packageManifest.test.ts tests/unit/shipControlDocs.test.ts tests/unit/docsWorkbenchDocs.test.ts tests/unit/docsContinuousIntegration.test.ts tests/unit/syncBundledDocsScript.test.ts tests/unit/wikiCoverageDocs.test.ts tests/unit/runWikiWorkbenchCli.test.ts',
      'node scripts/syncBundledDocs.js --check'
    ]);
  });

  it('lets the docs-authoring entrypoint resolve the repo root from CI_PROJECT_DIR', () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vihs-docs-entrypoint-'));
    const workspaceRoot = path.join(tempRoot, 'ci-project');
    const entrypointPath = path.join(repoRoot, 'docker', 'docs-authoring', 'entrypoint.sh');

    fs.mkdirSync(path.join(workspaceRoot, 'node_modules'), { recursive: true });
    fs.writeFileSync(path.join(workspaceRoot, 'package.json'), '{}\n', 'utf8');

    const result =
      process.platform === 'win32'
        ? spawnSync(
            'wsl.exe',
            [
              '-d',
              admittedWslDistro,
              'bash',
              '-lc',
              `CI_PROJECT_DIR='${toWslPath(workspaceRoot)}' '${toWslPath(entrypointPath)}' bash -lc pwd`
            ],
            {
              cwd: tempRoot,
              env: {
                ...process.env
              },
              encoding: 'utf8'
            }
          )
        : spawnSync('bash', [entrypointPath, 'bash', '-lc', 'pwd'], {
            cwd: tempRoot,
            env: {
              ...process.env,
              CI_PROJECT_DIR: workspaceRoot
            },
            encoding: 'utf8'
          });

    try {
      expect(result.status).toBe(0);
      expect(result.stdout.trim()).toBe(
        process.platform === 'win32' ? toWslPath(workspaceRoot) : workspaceRoot
      );
    } finally {
      removeTreeWithRetry(tempRoot);
    }
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
    expect(manifest.scripts?.['docs:ci']).toBe(
      'node scripts/run-docs-continuous-integration.js'
    );
    expect(manifest.scripts?.['docs:ci:core']).toBe(
      'node scripts/run-docs-continuous-integration.js --skip-links'
    );
    expect(manifest.scripts?.['docs:ci:public']).toBe(
      'node scripts/run-docs-continuous-integration.js --surface public'
    );
    expect(manifest.scripts?.['docs:ci:public:core']).toBe(
      'node scripts/run-docs-continuous-integration.js --surface public --skip-links'
    );
    expect(manifest.scripts?.['docs:ci:internal']).toBe(
      'node scripts/run-docs-continuous-integration.js --surface internal'
    );
    expect(manifest.scripts?.['docs:ci:internal:core']).toBe(
      'node scripts/run-docs-continuous-integration.js --surface internal --skip-links'
    );
    expect(manifest.scripts?.['linux:docker:provider:lane']).toBe(
      'npm run compile && node scripts/runLinuxDockerProviderLane.js'
    );
    expect(manifest.scripts?.['public:smoke:linux']).toBe(
      'npm run compile && node scripts/runPublicLinuxInstalledUserSmoke.js'
    );
    expect(manifest.scripts?.['public:source:promote']).toBe(
      'node scripts/promotePublicGithubSource.js'
    );
    expect(manifest.scripts?.['public:source:check']).toBe(
      'node scripts/promotePublicGithubSource.js --check'
    );
    expect(manifest.scripts?.['package']).toBe(
      'npm run compile && npm run docs:bundle && npm run package:audit && node scripts/runPinnedVsce.js package'
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
    expect(dockerfile).toContain('lychee-v0.24.1');
    expect(dockerfile).toContain('lychee-x86_64-unknown-linux-musl.tar.gz');
    expect(dockerfile).not.toContain('releases/latest');
    expect(dockerfile).toContain('CMD ["npm", "run", "docs:gate"]');
    expect(entrypoint).toContain('node_modules/.vihs-docs-workbench-package-lock.sha256');
    expect(entrypoint).toContain('sha256sum package-lock.json');
    expect(entrypoint).toContain('npm ci');
    expect(entrypoint).toContain('CI_PROJECT_DIR');
    expect(entrypoint).toContain('VIHS_DOCS_WORKSPACE');
    expect(dockerHelper).toContain("const localDocsImage = 'vi-history-suite-docs-authoring:local'");
    expect(dockerHelper).toContain("const publishedDocsImage =");
    expect(dockerHelper).toContain('VIHS_DOCS_WORKBENCH_IMAGE');
    expect(dockerHelper).toContain("command: 'docker.exe'");
    expect(dockerHelper).toContain("'--context', 'desktop-linux'");
    expect(dockerHelper).toContain("path.join(repoRoot, 'docker', 'docs-authoring', 'Dockerfile')");
    expect(dockerHelper).toContain('/node_modules');

    expect(workbenchDoc).toContain('npm run docs:workbench:build');
    expect(workbenchDoc).toContain('npm run docs:workbench:gate');
    expect(workbenchDoc).toContain('npm run docs:workbench:shell');
    expect(workbenchDoc).toContain('npm run docs:ci');
    expect(workbenchDoc).toContain('npm run docs:ci:core');
    expect(workbenchDoc).toContain('npm run docs:ci:public');
    expect(workbenchDoc).toContain('npm run docs:ci:public:core');
    expect(workbenchDoc).toContain('npm run docs:ci:internal');
    expect(workbenchDoc).toContain('npm run docs:ci:internal:core');
    expect(workbenchDoc).toContain('npm run public:source:promote');
    expect(workbenchDoc).toContain('npm run public:source:check');
    expect(workbenchDoc).toContain('npm run wiki:workbench:doctor');
    expect(workbenchDoc).toContain('npm run wiki:workbench:plan');
    expect(workbenchDoc).toContain('npm run wiki:workbench:prepare');
    expect(workbenchDoc).toContain('npm run wiki:workbench:sync-bundled-docs');
    expect(workbenchDoc).toContain('npm run docs:workbench:wiki:doctor');
    expect(workbenchDoc).toContain('npm run docs:workbench:wiki:prepare');
    expect(workbenchDoc).toContain('npm run docs:workbench:gitlab:wiki:prepare');
    expect(workbenchDoc).toContain('npm run docs:bundle');
    expect(workbenchDoc).toContain('npm run package');
    expect(workbenchDoc).toContain('.cache/wiki-workbench/latest-workbench.json');
    expect(workbenchDoc).toContain('.cache/wiki-workbench/publication-prep/');
    expect(workbenchDoc).toContain('wiki-workbench-evidence/wiki-workbench-manifest.json');
    expect(workbenchDoc).toContain('wiki-workbench-evidence/iteration-report.md');
    expect(workbenchDoc).toContain('registry.gitlab.com/svelderrainruiz/vi-history-suite/docs-authoring:main');
    expect(workbenchDoc).toContain('wiki_workbench_prepare_published');
    expect(workbenchDoc).toContain('VIHS_INTERNAL_WIKI_REPO_ROOT');
    expect(workbenchDoc).toContain('VIHS_PUBLIC_GITHUB_WIKI_REPO_ROOT');
    expect(workbenchDoc).toContain('CI_PROJECT_DIR');
    expect(workbenchDoc).toContain('container-owned `node_modules`');
    expect(workbenchDoc).toContain('docs_continuous_integration');
    expect(workbenchDoc).toContain('docs_public_continuous_integration');
    expect(workbenchDoc).toContain('docs_internal_continuous_integration');
    expect(workbenchDoc).toContain('host-default local `LabVIEWCLI` in the bundled installed-user guide');
    expect(workbenchDoc).toContain('explicit provider bundle validation through `vihs --validate`');
    expect(workbenchDoc).toContain('bounded expert Docker selection instead of default Docker-only guidance');
    expect(workbenchDoc).toContain('provider and progress visibility in the bundled installed-user guide');
    expect(workbenchDoc).not.toContain('Docker-first Windows `auto` behavior when Docker Desktop is installed');
    expect(workbenchDoc).not.toContain('no silent provider fallback');
    expect(workbenchDoc).toContain('${CI_PROJECT_PATH}.wiki.git');
    expect(workbenchDoc).toContain('no-op completion receipt');
    expect(workbenchDoc).toContain('nextPage = null');
    expect(workbenchDoc).toContain('--page-id <published-page-id>');
    expect(workbenchDoc).toContain('refresh-existing-page');
    expect(workbenchDoc).toContain(
      'stale bundled installed-user docs are therefore unshippable through the'
    );
    expect(workbenchDoc).toContain('docs-workbench-evidence/docs-workbench-manifest.json');
    expect(workbenchDoc).toContain('docs-integration-evidence/docs-integration-report.json');
    expect(workbenchDoc).toContain('docs-integration-evidence/docs-integration-report.md');
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
    expect(programRepoJumpMap).toContain('"id": "vi-history-suite.public"');
    expect(programRepoJumpMap).toContain('"id": "vi-history-suite.wiki"');
    expect(programRepoJumpMap).toContain('"id": "vi-history-suite.github.wiki"');
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

    expect(gitlabCi).toContain('docs_continuous_integration:');
    expect(gitlabCi).toContain('docs_public_continuous_integration:');
    expect(gitlabCi).toContain('docs_internal_continuous_integration:');
    expect(gitlabCi).toContain('${CI_PROJECT_PATH}.wiki.git');
    expect(gitlabCi).toContain('https://github.com/svelderrainruiz/vi-history-suite.wiki.git');
    expect(gitlabCi).toContain(
      'PUBLIC_GITHUB_WIKI_BRANCH="${VIHS_PUBLIC_GITHUB_WIKI_BRANCH:-${CI_MERGE_REQUEST_SOURCE_BRANCH_NAME:-${CI_COMMIT_BRANCH:-${CI_DEFAULT_BRANCH}}}}"'
    );
    expect(gitlabCi).toContain('git clone --branch "${PUBLIC_GITHUB_WIKI_BRANCH}" "https://github.com/svelderrainruiz/vi-history-suite.wiki.git" ../vi-history-suite.github.wiki || git clone "https://github.com/svelderrainruiz/vi-history-suite.wiki.git" ../vi-history-suite.github.wiki');
    expect(gitlabCi).toContain(
      'VIHS_INTERNAL_WIKI_REPO_ROOT="${CI_PROJECT_DIR}/../vi-history-suite.wiki"'
    );
    expect(gitlabCi).toContain(
      'VIHS_PUBLIC_GITHUB_WIKI_REPO_ROOT="${CI_PROJECT_DIR}/../vi-history-suite.github.wiki"'
    );
    expect(gitlabCi).toContain('VIHS_LEDGER_PATH="${CI_PROJECT_DIR}/docs/product/public-github-wiki-publication-ledger.json"');
    expect(gitlabCi).toContain('node scripts/run-docs-continuous-integration.js --skip-links --evidence-dir docs-integration-evidence');
    expect(gitlabCi).toContain('node scripts/run-docs-continuous-integration.js --surface public --skip-links --evidence-dir docs-integration-evidence/public');
    expect(gitlabCi).toContain('node scripts/run-docs-continuous-integration.js --surface internal --skip-links --evidence-dir docs-integration-evidence/internal');
    expect(gitlabCi).toContain('docs-integration-evidence/');
    expect(gitlabCi).toContain('test_extension:');
    expect(gitlabCi).toContain('package_extension_preview:');
    expect(gitlabCi).toContain('preview-evidence/${PACKAGE_NAME}-${PACKAGE_VERSION}.vsix');
    expect(gitlabCi).toContain('release_extension:');
    expect(gitlabCi).toContain('npm run test');
    expect(gitlabCi).toContain('publish_docs_authoring_image:');
    expect(gitlabCi).toContain('wiki_workbench_prepare_published:');
    expect(gitlabCi).toContain('node out/cli/runWikiWorkbench.js doctor --format json');
    expect(gitlabCi).toContain('node out/cli/runWikiWorkbench.js plan-pages --format json');
    expect(gitlabCi).toContain('node out/cli/runWikiWorkbench.js prepare-publication --format json');
    expect(gitlabCi).toContain('/kaniko/executor');
    expect(gitlabCi).toContain("path.join('docs-workbench-evidence', 'docs-workbench-manifest.json')");
    expect(gitlabCi).toContain('${CI_REGISTRY_IMAGE}/docs-authoring:main');
    expect(gitlabCi).toContain('${CI_REGISTRY_IMAGE}/docs-authoring:sha-${CI_COMMIT_SHORT_SHA}');
    expect(gitlabCi).toContain('wiki-workbench-evidence/wiki-workbench-manifest.json');
    expect(gitlabCi).toContain('iteration-report.md');
    expect(gitlabCi).toContain('if [ -d .cache/wiki-workbench/staging ]');
    expect(gitlabCi).toContain('Completion state: ${prepare.completionState ||');
    expect(gitlabCi).toContain('Prepare note: ${prepare.message ||');
    expect(workbenchDoc).toContain('package_extension_preview');
    expect(workbenchDoc).toContain('preview `npm run package` path');
    expect(gitlabCi).toContain(
      'lycheeverse/lychee:latest-alpine@sha256:1b2f74f0b6816dc3ee4e5f457d11f1b2ed6c1cf8ebcbaa18cbfe057d5e2ccb00'
    );
    expect(gitlabCi).not.toMatch(/name:\s+lycheeverse\/lychee:latest(?:\r?\n|$)/);
  });
});

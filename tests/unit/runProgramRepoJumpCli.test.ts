import * as fs from 'node:fs/promises';
import * as fsSync from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  formatProgramRepoJumpSummary,
  getProgramRepoJumpUsage,
  parseProgramRepoJumpArgs,
  readProgramRepoJumpMap,
  resolveCodexSkillPathCandidates,
  resolveProgramRepoDescriptors
} from '../../src/tooling/programRepoJump';
import {
  maybeRunProgramRepoJumpCliAsMain,
  runProgramRepoJumpCli,
  runProgramRepoJumpCliMain
} from '../../src/cli/runProgramRepoJump';

describe('runProgramRepoJumpCli', () => {
  it('parses stable args and usage', () => {
    expect(parseProgramRepoJumpArgs([])).toEqual({
      format: 'text',
      repoId: undefined,
      helpRequested: false
    });
    expect(parseProgramRepoJumpArgs(['--format', 'json', '--repo', 'repo-standards-review'])).toEqual(
      {
        format: 'json',
        repoId: 'repo-standards-review',
        helpRequested: false
      }
    );
    expect(() => parseProgramRepoJumpArgs(['--format'])).toThrow(/Missing value/);
    expect(() => parseProgramRepoJumpArgs(['--format', 'yaml'])).toThrow(
      /Unsupported --format value/
    );
    expect(() => parseProgramRepoJumpArgs(['--repo'])).toThrow(/Missing value/);
    expect(() => parseProgramRepoJumpArgs(['--weird'])).toThrow(/Unknown argument/);
    expect(getProgramRepoJumpUsage()).toContain('--repo <repo-id>');
  });

  it('resolves current, sibling, and codex-skill path strategies deterministically', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'vihs-program-jump-'));
    const repoRoot = path.join(tempRoot, 'vi-history-suite');
    const wikiRoot = path.join(tempRoot, 'vi-history-suite.wiki');
    const codexHome = path.join(tempRoot, 'codex-home');
    const skillRoot = path.join(codexHome, 'skills', 'repo-standards-review');
    const mapPath = path.join(repoRoot, 'docs', 'product', 'program-repo-jump-map.json');

    await fs.mkdir(path.dirname(mapPath), { recursive: true });
    await fs.mkdir(wikiRoot, { recursive: true });
    await fs.mkdir(skillRoot, { recursive: true });
    await fs.writeFile(
      mapPath,
      JSON.stringify(
        {
          programId: 'comparevi',
          version: 1,
          repos: [
            {
              id: 'vi-history-suite',
              displayName: 'VI History Suite',
              role: 'product-authority',
              expectedRemote: 'https://example.invalid/vi-history-suite.git',
              localPath: { kind: 'current-repo' },
              primaryEntrypoints: ['docs/product/current-state.md']
            },
            {
              id: 'vi-history-suite.wiki',
              displayName: 'VI History Suite Wiki',
              role: 'derived-reader-surface',
              expectedRemote: 'https://example.invalid/vi-history-suite.wiki.git',
              localPath: { kind: 'sibling', relativePath: '../vi-history-suite.wiki' },
              primaryEntrypoints: ['home.md']
            },
            {
              id: 'repo-standards-review',
              displayName: 'repo-standards-review',
              role: 'assurance-skill',
              expectedRemote: 'https://example.invalid/repo-standards-review.git',
              localPath: { kind: 'codex-skill', skillName: 'repo-standards-review' },
              primaryEntrypoints: ['SKILL.md']
            }
          ]
        },
        null,
        2
      ),
      'utf8'
    );

    const map = readProgramRepoJumpMap(repoRoot);
    const resolved = resolveProgramRepoDescriptors(map, repoRoot, undefined, { CODEX_HOME: codexHome });

    expect(resolved.map((repo) => repo.localPathResolved)).toEqual([repoRoot, wikiRoot, skillRoot]);
    expect(resolved.map((repo) => repo.localPathExists)).toEqual([true, true, true]);
    expect(formatProgramRepoJumpSummary(map, resolved)).toContain(`jump: cd "${skillRoot}"`);
  });

  it('prefers CODEX_HOME skill paths and falls back to homedir candidates', () => {
    expect(
      resolveCodexSkillPathCandidates(
        'repo-standards-review',
        { CODEX_HOME: '/tmp/codex-home' },
        { homedir: () => '/tmp/home' }
      )
    ).toContain('/tmp/codex-home/skills/repo-standards-review');

    expect(
      resolveCodexSkillPathCandidates('repo-standards-review', {}, { homedir: () => '/tmp/home' })[0]
    ).toBe('/tmp/home/.codex/skills/repo-standards-review');
  });

  it('renders text or json output and supports help plus main-module execution', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'vihs-program-jump-cli-'));
    const repoRoot = path.join(tempRoot, 'vi-history-suite');
    const mapPath = path.join(repoRoot, 'docs', 'product', 'program-repo-jump-map.json');

    await fs.mkdir(path.dirname(mapPath), { recursive: true });
    await fs.writeFile(
      mapPath,
      JSON.stringify(
        {
          programId: 'comparevi',
          version: 1,
          repos: [
            {
              id: 'vi-history-suite',
              displayName: 'VI History Suite',
              role: 'product-authority',
              expectedRemote: 'https://example.invalid/vi-history-suite.git',
              localPath: { kind: 'current-repo' },
              primaryEntrypoints: ['README.md']
            }
          ]
        },
        null,
        2
      ),
      'utf8'
    );

    const textWrites: string[] = [];
    expect(
      runProgramRepoJumpCli([], {
        repoRoot,
        stdout: { write(text: string) { textWrites.push(text); } }
      })
    ).toBe('text');
    expect(textWrites.join('')).toContain('Program repo jump surface: comparevi');

    const jsonWrites: string[] = [];
    expect(
      runProgramRepoJumpCli(['--format', 'json'], {
        repoRoot,
        stdout: { write(text: string) { jsonWrites.push(text); } }
      })
    ).toBe('json');
    expect(JSON.parse(jsonWrites.join('')).repos[0].id).toBe('vi-history-suite');

    const helpWrites: string[] = [];
    expect(
      runProgramRepoJumpCli(['--help'], {
        stdout: { write(text: string) { helpWrites.push(text); } }
      })
    ).toBe('help');
    expect(helpWrites.join('')).toContain('Usage: runProgramRepoJump');

    const stderrWrites: string[] = [];
    expect(
      runProgramRepoJumpCliMain(
        ['--repo', 'missing-repo'],
        { repoRoot },
        { write(text: string) { stderrWrites.push(text); return true; } }
      )
    ).toBe(1);
    expect(stderrWrites.join('')).toContain('Unknown repo id');

    const processLike: { exitCode?: number } = {};
    const sharedModule = {} as NodeModule;
    expect(
      maybeRunProgramRepoJumpCliAsMain(
        [],
        sharedModule,
        sharedModule,
        { repoRoot, stdout: { write() {} } },
        processLike
      )
    ).toBe(true);
    expect(processLike.exitCode).toBe(0);
  });

  it('keeps the actual governed map aligned with the existing GitHub experiment mirror', () => {
    const repoRoot = path.resolve(__dirname, '..', '..');
    const map = readProgramRepoJumpMap(repoRoot);
    const experimentRepo = map.repos.find((repo) => repo.id === 'vi-history-suite-source-experiments');

    expect(experimentRepo).toEqual({
      id: 'vi-history-suite-source-experiments',
      displayName: 'VI History Suite Source Experiments',
      role: 'experiment-mirror',
      expectedRemote: 'https://github.com/svelderrainruiz/vi-history-suite-source-experiments.git',
      localPath: {
        kind: 'sibling',
        relativePath: '../vi-history-suite-source-experiments'
      },
      primaryEntrypoints: [
        'README.md',
        '.github/workflows/linux-runtime-benchmark-experiment.yml',
        'docker/github-linux-dashboard-benchmark/Dockerfile',
        'docker/github-linux-dashboard-benchmark/run-benchmark.sh'
      ]
    });

    const resolved = resolveProgramRepoDescriptors(map, repoRoot, experimentRepo?.id, process.env, {
      existsSync: fsSync.existsSync
    });

    expect(resolved).toHaveLength(1);
    expect(resolved[0].localPathResolved).toBe(
      path.resolve(repoRoot, '../vi-history-suite-source-experiments')
    );
  });
});

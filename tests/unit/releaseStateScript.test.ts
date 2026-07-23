import { describe, it, expect, vi } from 'vitest';

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

// VHS-REQ-670: the release-state read-model derives durable release stages from
// ground truth and reports a two-key publish-authority posture in one
// schema-versioned packet. All git/gh/vsce boundaries are injected so the
// aggregator is deterministic here with no network, checkout, or publisher.
const rs = require('../../scripts/buildReleaseState.js') as {
  SCHEMA_ID: string;
  STAGE_ORDER: string[];
  deriveStages: (version: string, signals?: Record<string, unknown>) => any[];
  furthestStage: (stages: any[]) => string | undefined;
  stageGaps: (stages: any[]) => string[];
  deriveReleaseAuthority: (signals?: Record<string, unknown>) => any;
  buildReleaseState: (inputs?: Record<string, unknown>, meta?: Record<string, unknown>) => any;
  collectReleaseState: (cwd: string, options?: Record<string, unknown>, deps?: Record<string, unknown>) => any;
  RELEASE_STATE_JSON_SCHEMA: Record<string, unknown>;
  renderSchema: (options?: Record<string, unknown>) => string;
  renderMarkdown: (state: unknown, provenance?: unknown) => string;
  parseArgs: (argv: string[]) => Record<string, unknown>;
  main: (argv?: string[], deps?: Record<string, unknown>) => number;
};

const VERSION = '1.34.2';

// A fully-reached signal bundle for VERSION (agent-published, backsynced).
function fullSignals(overrides: Record<string, unknown> = {}) {
  return {
    changelogHasUnreleased: true,
    tagExists: true,
    tagTreeVersion: VERSION,
    tagReachableFromMain: true,
    marketplaceVersion: VERSION,
    developTipVersion: VERSION,
    manualApprovalEnforced: true,
    dispatcherActionsWrite: true,
    publishTokenPresent: true,
    ...overrides
  };
}

describe('deriveStages (VHS-REQ-670)', () => {
  it('marks every stage reached for a fully-published, backsynced release (VHS-REQ-670.1)', () => {
    const stages = rs.deriveStages(VERSION, fullSignals());
    expect(stages.map((s) => s.id)).toEqual(rs.STAGE_ORDER);
    expect(stages.every((s) => s.reached === true)).toBe(true);
    expect(rs.furthestStage(stages)).toBe('backsynced');
    expect(rs.stageGaps(stages)).toEqual([]);
  });

  it('leaves published null when the marketplace version cannot be queried (VHS-REQ-670.1)', () => {
    const stages = rs.deriveStages(VERSION, fullSignals({ marketplaceVersion: null, developTipVersion: null }));
    const published = stages.find((s) => s.id === 'published');
    expect(published.reached).toBeNull();
    // furthest is on-main (published/backsynced unverified, not reached)
    expect(rs.furthestStage(stages)).toBe('on-main');
  });

  it('tagged is false when the tag tree version does not match the target', () => {
    const stages = rs.deriveStages(VERSION, fullSignals({ tagTreeVersion: '1.0.0', tagReachableFromMain: false, marketplaceVersion: null, developTipVersion: '1.0.0' }));
    expect(stages.find((s) => s.id === 'tagged').reached).toBe(false);
  });

  it('tagged is null (unverified) when tag existence cannot be determined', () => {
    const stages = rs.deriveStages(VERSION, fullSignals({ tagExists: null, tagTreeVersion: null }));
    expect(stages.find((s) => s.id === 'tagged').reached).toBeNull();
  });

  it('develop-ready is false without an [Unreleased] CHANGELOG section', () => {
    const stages = rs.deriveStages(VERSION, fullSignals({ changelogHasUnreleased: false }));
    expect(stages.find((s) => s.id === 'develop-ready').reached).toBe(false);
  });
});

describe('stageGaps (VHS-REQ-670)', () => {
  it('flags a definitively unreached stage sitting before the furthest reached one (VHS-REQ-670.2)', () => {
    // published reached but on-main NOT reached -> gap at on-main.
    const stages = rs.deriveStages(
      VERSION,
      fullSignals({ tagReachableFromMain: false, marketplaceVersion: VERSION })
    );
    expect(rs.furthestStage(stages)).toBe('backsynced');
    expect(rs.stageGaps(stages)).toContain('on-main');
  });

  it('does not treat an unverified (null) later stage as a gap (VHS-REQ-670.2)', () => {
    const stages = rs.deriveStages(VERSION, fullSignals({ marketplaceVersion: null, developTipVersion: null }));
    expect(rs.stageGaps(stages)).toEqual([]);
  });
});

describe('deriveReleaseAuthority gated single-principal posture (VHS-REQ-670)', () => {
  it('complete when the manual-approval gate is enforced and a publish token is present (VHS-REQ-670.3)', () => {
    const a = rs.deriveReleaseAuthority({ manualApprovalEnforced: true, publishTokenPresent: true });
    expect(a.model).toBe('gated-single-principal');
    expect(a.complete).toBe(true);
  });

  it('incomplete when the approval gate is enforced but no publish token', () => {
    const a = rs.deriveReleaseAuthority({ manualApprovalEnforced: true, publishTokenPresent: false });
    expect(a.complete).toBe(false);
  });

  it('degrades to null (unverified) when the approval gate cannot be read (VHS-REQ-670.3)', () => {
    const a = rs.deriveReleaseAuthority({ manualApprovalEnforced: null, publishTokenPresent: true });
    expect(a.complete).toBeNull();
  });
});

describe('buildReleaseState rollup (VHS-REQ-670)', () => {
  it('is ready when authority is complete and there are no stage gaps', () => {
    const stages = rs.deriveStages(VERSION, fullSignals());
    const authority = rs.deriveReleaseAuthority(fullSignals());
    const state = rs.buildReleaseState({ stages, authority }, { version: VERSION, commit: 'abc', generatedAt: 'T' });
    expect(state.status).toBe('ready');
    expect(state.$schema).toBe(rs.SCHEMA_ID);
  });

  it('is attention when authority is definitively incomplete', () => {
    const stages = rs.deriveStages(VERSION, fullSignals());
    const authority = rs.deriveReleaseAuthority({ manualApprovalEnforced: true, publishTokenPresent: false });
    const state = rs.buildReleaseState({ stages, authority }, { version: VERSION, commit: 'abc', generatedAt: 'T' });
    expect(state.status).toBe('attention');
  });

  it('is attention when a stage gap exists even with complete authority', () => {
    const stages = rs.deriveStages(VERSION, fullSignals({ tagReachableFromMain: false, marketplaceVersion: VERSION }));
    const authority = rs.deriveReleaseAuthority(fullSignals());
    const state = rs.buildReleaseState({ stages, authority }, { version: VERSION, commit: 'abc', generatedAt: 'T' });
    expect(state.status).toBe('attention');
    expect(state.stageGaps).toContain('on-main');
  });
});

describe('collectReleaseState + CLI (VHS-REQ-670)', () => {
  function collectDeps(signals: Record<string, unknown>) {
    return {
      getPackageVersion: () => VERSION,
      getGitCommit: () => 'deadbeef',
      gatherSignals: () => signals,
      now: () => 0
    };
  }

  it('collects a ready packet from injected signals (VHS-REQ-670.4)', () => {
    const state = rs.collectReleaseState('/repo', {}, collectDeps(fullSignals()));
    expect(state.status).toBe('ready');
    expect(state.version).toBe(VERSION);
    expect(state.stage).toBe('backsynced');
  });

  it('--strict exits nonzero when the packet status is attention (VHS-REQ-670.2)', () => {
    const chunks: string[] = [];
    const code = rs.main(['--strict', '--json'], {
      ...collectDeps(fullSignals({ manualApprovalEnforced: true, publishTokenPresent: false })),
      cwd: '/repo',
      stdout: { write: (s: string) => chunks.push(s) }
    });
    expect(code).toBe(1);
    const packet = JSON.parse(chunks.join(''));
    expect(packet.status).toBe('attention');
  });

  it('--strict exits zero for a ready packet', () => {
    const code = rs.main(['--strict'], {
      ...collectDeps(fullSignals()),
      cwd: '/repo',
      stdout: { write: () => undefined }
    });
    expect(code).toBe(0);
  });

  it('--schema emits valid JSON Schema without running aggregation (VHS-REQ-670.5)', () => {
    const chunks: string[] = [];
    let gathered = false;
    const code = rs.main(['--schema'], {
      cwd: '/repo',
      gatherSignals: () => {
        gathered = true;
        return fullSignals();
      },
      stdout: { write: (s: string) => chunks.push(s) }
    });
    expect(code).toBe(0);
    expect(gathered).toBe(false);
    const schema = JSON.parse(chunks.join(''));
    expect(schema.$id).toBe(rs.SCHEMA_ID);
    expect(schema.required).toContain('authority');
  });
});

describe('collectReleaseState default boundary readers (VHS-REQ-670.4, VHS-REQ-670.6)', () => {
  const PKG = JSON.stringify({ version: VERSION, publisher: 'svelderrainruiz', name: 'vi-history-suite' });
  const ENV_JSON = JSON.stringify({
    protection_rules: [{ type: 'required_reviewers', reviewers: [{ type: 'User' }] }]
  });
  const VSCE_JSON = JSON.stringify({ versions: [{ version: VERSION }] });

  function lowLevelDeps(overrides: Record<string, unknown> = {}) {
    return {
      readFile: (p: string) => (String(p).endsWith('CHANGELOG.md') ? '## [Unreleased]\n' : PKG),
      runGit: (args: string[]) => {
        const a = args.join(' ');
        if (a.includes('rev-parse HEAD')) return 'deadbeefcommit\n';
        if (a.includes('rev-parse --verify')) return ''; // tag exists (no throw)
        if (a.startsWith('show') && a.includes(`v${VERSION}:package.json`)) return PKG; // tag tree
        if (a.startsWith('merge-base')) return ''; // reachable from main (no throw)
        if (a.startsWith('show') && a.includes('origin/develop:package.json')) return PKG; // develop tip
        return '';
      },
      runGh: () => ENV_JSON,
      pinnedVsceModule: {
        buildPinnedVsceInvocation: (args: string[]) => ({ command: 'vsce', args })
      },
      runVsce: () => VSCE_JSON,
      env: { GITHUB_REPOSITORY: 'owner/repo', VSCE_PAT: 'token' },
      now: () => 0,
      ...overrides
    };
  }

  it('derives a fully-reached ready packet from injected low-level git/gh/vsce readers', () => {
    const state = rs.collectReleaseState('/repo', {}, lowLevelDeps());
    expect(state.version).toBe(VERSION);
    expect(state.commit).toBe('deadbeefcommit');
    expect(state.stage).toBe('backsynced');
    expect(state.status).toBe('ready');
    expect(state.authority.manualApprovalEnforced).toBe(true);
    expect(state.authority.publishTokenPresent).toBe(true);
    expect(state.authority.complete).toBe(true);
  });

  it('marks the tag stages not reached when git rev-parse for the tag throws', () => {
    const state = rs.collectReleaseState(
      '/repo',
      {},
      lowLevelDeps({
        runGit: (args: string[]) => {
          const a = args.join(' ');
          if (a.includes('rev-parse HEAD')) return 'commit1\n';
          if (a.includes('rev-parse --verify')) throw new Error('no such tag'); // tagExists false
          if (a.startsWith('show') && a.includes('origin/develop:package.json')) return PKG;
          return '';
        }
      })
    );
    expect(state.stages.find((s) => s.id === 'tagged').reached).toBe(false);
    // tagExists false -> reachability is unverified (null), not a definitive gap.
    expect(state.stages.find((s) => s.id === 'on-main').reached).toBeNull();
  });

  it('marks on-main not reached when the tag is not an ancestor of main', () => {
    const state = rs.collectReleaseState(
      '/repo',
      {},
      lowLevelDeps({
        runGit: (args: string[]) => {
          const a = args.join(' ');
          if (a.includes('rev-parse HEAD')) return 'c\n';
          if (a.includes('rev-parse --verify')) return ''; // tag exists
          if (a.startsWith('show') && a.includes(`v${VERSION}:package.json`)) return PKG;
          if (a.startsWith('merge-base')) throw new Error('not an ancestor'); // reachable false
          if (a.startsWith('show') && a.includes('origin/develop:package.json')) return PKG;
          return '';
        }
      })
    );
    expect(state.stages.find((s) => s.id === 'on-main').reached).toBe(false);
  });

  it('degrades authority and published to unverified when repo slug and extension id are absent', () => {
    const state = rs.collectReleaseState(
      '/repo',
      {},
      lowLevelDeps({
        // package.json without publisher/name -> no resolvable extension id.
        readFile: (p: string) =>
          String(p).endsWith('CHANGELOG.md') ? '## [Unreleased]\n' : JSON.stringify({ version: VERSION }),
        env: {} // no GITHUB_REPOSITORY, no VSCE_PAT
      })
    );
    expect(state.authority.manualApprovalEnforced).toBeNull();
    expect(state.authority.complete).toBeNull();
    expect(state.authority.publishTokenPresent).toBe(false);
    expect(state.stages.find((s) => s.id === 'published').reached).toBeNull();
  });

  it('captures dispatcher actions-write when a reader is injected', () => {
    const state = rs.collectReleaseState('/repo', {}, lowLevelDeps({ queryDispatcherActionsWrite: () => true }));
    expect(state.authority.dispatcherActionsWrite).toBe(true);
  });

  it('degrades a signal getter that returns undefined to null (unverified) via safe()', () => {
    // queryMarketplaceVersion returning undefined exercises safe()'s
    // `value === undefined ? null : value` null arm.
    const state = rs.collectReleaseState('/repo', {}, lowLevelDeps({ queryMarketplaceVersion: () => undefined }));
    expect(state.stages.find((s) => s.id === 'published').reached).toBeNull();
  });
});

describe('release-state rendering (VHS-REQ-670.5)', () => {
  function renderDeps(signals: Record<string, unknown>, extra: Record<string, unknown> = {}) {
    return {
      getPackageVersion: () => VERSION,
      getGitCommit: () => 'deadbeef',
      gatherSignals: () => signals,
      now: () => 0,
      cwd: '/repo',
      ...extra
    };
  }

  it('renders a text summary with provenance and stage gaps', () => {
    const chunks: string[] = [];
    const code = rs.main(['--include-provenance'], {
      ...renderDeps(fullSignals({ tagReachableFromMain: false, marketplaceVersion: VERSION })),
      stdout: { write: (s: string) => chunks.push(s) }
    });
    const out = chunks.join('');
    expect(code).toBe(0);
    expect(out).toContain('[release-state] Stage gaps: on-main');
    expect(out).toContain('[release-state] provenance generatedAt: 0');
    expect(out).toContain('[release-state] provenance argv:');
  });

  it('names incomplete and unverified authority in the text summary', () => {
    const incomplete: string[] = [];
    rs.main([], {
      ...renderDeps(fullSignals({ manualApprovalEnforced: true, publishTokenPresent: false })),
      stdout: { write: (s: string) => incomplete.push(s) }
    });
    expect(incomplete.join('')).toContain('[release-state] Authority: INCOMPLETE');

    const unverified: string[] = [];
    rs.main([], {
      ...renderDeps(fullSignals({ manualApprovalEnforced: null })),
      stdout: { write: (s: string) => unverified.push(s) }
    });
    expect(unverified.join('')).toContain('[release-state] Authority: unverified');
  });

  it('renders markdown without a provenance section', () => {
    const chunks: string[] = [];
    const code = rs.main(['--markdown'], {
      ...renderDeps(fullSignals()),
      stdout: { write: (s: string) => chunks.push(s) }
    });
    const out = chunks.join('');
    expect(code).toBe(0);
    expect(out).toContain('# Release State');
    expect(out).toContain('| Stage | Reached | Evidence |');
    expect(out).toContain('## Authority');
    expect(out).not.toContain('## Provenance');
  });

  it('renders markdown with a provenance section', () => {
    const chunks: string[] = [];
    const code = rs.main(['--markdown', '--include-provenance'], {
      ...renderDeps(fullSignals()),
      stdout: { write: (s: string) => chunks.push(s) }
    });
    const out = chunks.join('');
    expect(code).toBe(0);
    expect(out).toContain('# Release State');
    expect(out).toContain('## Provenance');
    expect(out).toContain('- Argv:');
  });

  it('renders unverified stages (reachedLabel null) via the default process.stdout stream', () => {
    // A null (unverified) published stage exercises reachedLabel's
    // `reached === null` arm; omitting deps.stdout exercises the
    // `deps.stdout ?? process.stdout` default stream in main.
    const captured: string[] = [];
    const stdoutSpy = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation((chunk: unknown) => {
        captured.push(String(chunk));
        return true;
      });
    try {
      const code = rs.main([], renderDeps(fullSignals({ marketplaceVersion: null, developTipVersion: null })));
      expect(code).toBe(0);
      expect(captured.join('')).toContain('published: unverified');
    } finally {
      stdoutSpy.mockRestore();
    }
  });

  it('renders a <none> furthest stage and no gaps for an all-unreached state', () => {
    // Empty signals leave every stage unreached, so furthestStage() is undefined:
    // exercises renderSummary's `state.stage ?? '<none>'` arm and stageGaps'
    // `if (!furthest) return []` early-return arm.
    const chunks: string[] = [];
    const code = rs.main([], {
      ...renderDeps({}),
      stdout: { write: (s: string) => chunks.push(s) }
    });
    expect(code).toBe(0);
    expect(chunks.join('')).toContain('Furthest stage: <none>');
    expect(chunks.join('')).not.toContain('Stage gaps:');
  });

  it('returns 1 and writes to stderr when the arguments cannot be parsed', () => {
    const errs: string[] = [];
    const code = rs.main(['--totally-unknown-flag'], {
      stderr: { write: (s: string) => errs.push(s) },
      stdout: { write: () => undefined }
    });
    expect(code).toBe(1);
    expect(errs.join('')).toContain('Unknown argument');
  });
});

describe('release-state low-level default readers, called directly (VHS-REQ-670.4, VHS-REQ-670.6)', () => {
  const api = rs as unknown as {
    getPackageVersion: (cwd: string, deps?: Record<string, unknown>) => string;
    defaultQueryEnvironmentReviewerConfigured: (deps?: Record<string, unknown>) => boolean | null;
    defaultQueryMarketplaceVersion: (cwd: string, deps?: Record<string, unknown>) => string | null;
  };

  it('getPackageVersion reads a real package.json with the default fs reader, else 0.0.0', () => {
    // No deps.readFile: exercises the default `(p) => fs.readFileSync(p, 'utf8')`
    // reader over a real temp directory.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vihs-rs-'));
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'vihs-rs-empty-'));
    try {
      fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ version: '3.2.1' }));
      expect(api.getPackageVersion(dir)).toBe('3.2.1');
      // A directory without package.json degrades to 0.0.0 via the catch.
      expect(api.getPackageVersion(empty)).toBe('0.0.0');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
      fs.rmSync(empty, { recursive: true, force: true });
    }
  });

  it('defaultQueryEnvironmentReviewerConfigured reflects the required-reviewers protection rule', () => {
    // No repo slug (default env, no GITHUB_REPOSITORY) -> unverified null.
    expect(api.defaultQueryEnvironmentReviewerConfigured({ env: {} })).toBeNull();
    // Repo present with a required_reviewers rule carrying a reviewer -> true.
    expect(
      api.defaultQueryEnvironmentReviewerConfigured({
        env: { GITHUB_REPOSITORY: 'owner/repo' },
        runGh: () =>
          JSON.stringify({ protection_rules: [{ type: 'required_reviewers', reviewers: [{ type: 'User' }] }] })
      })
    ).toBe(true);
    // Repo present but no required_reviewers rule -> false.
    expect(
      api.defaultQueryEnvironmentReviewerConfigured({
        env: { GITHUB_REPOSITORY: 'owner/repo' },
        runGh: () => JSON.stringify({ protection_rules: [{ type: 'wait_timer' }] })
      })
    ).toBe(false);
  });

  it('defaultQueryMarketplaceVersion resolves the latest published version or null', () => {
    // publisher+name derive the extension id; latest version is returned.
    expect(
      api.defaultQueryMarketplaceVersion('/repo', {
        readFile: () => JSON.stringify({ publisher: 'pub', name: 'ext' }),
        env: {},
        pinnedVsceModule: { buildPinnedVsceInvocation: (args: string[]) => ({ command: 'vsce', args }) },
        runVsce: () => JSON.stringify({ versions: [{ version: '2.0.0' }, { version: '1.9.0' }] })
      })
    ).toBe('2.0.0');
    // Explicit EXTENSION_ID env wins; an empty versions list yields null.
    expect(
      api.defaultQueryMarketplaceVersion('/repo', {
        readFile: () => JSON.stringify({}),
        env: { EXTENSION_ID: 'pub.ext' },
        pinnedVsceModule: { buildPinnedVsceInvocation: (args: string[]) => ({ command: 'vsce', args }) },
        runVsce: () => JSON.stringify({ versions: [] })
      })
    ).toBeNull();
    // No publisher/name and no EXTENSION_ID -> null without invoking vsce.
    expect(
      api.defaultQueryMarketplaceVersion('/repo', {
        readFile: () => JSON.stringify({ name: 'ext' }),
        env: {}
      })
    ).toBeNull();
  });
});

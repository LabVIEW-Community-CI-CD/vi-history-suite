import { describe, it, expect } from 'vitest';

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

import * as fs from 'node:fs';
import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '..', '..');
const artifactPath =
  'docs/product/work-item-0011-docs-implementation-alignment-control-plane-2026-05-16';

interface AlignmentControlPlane {
  schema: string;
  evidenceSnapshot?: {
    releaseGate?: {
      command?: string;
      gates?: Record<string, string>;
      dodConfidence?: string;
    };
  };
  initialActionMergeReadback?: {
    sourceWorkItem?: number;
    items?: Array<{
      iid: number;
      state: string;
      mergeRequestIid: number;
      mergeCommitSha: string;
      closedAt: string;
    }>;
  };
  actionCloseouts?: Array<{
    iid: number;
    status?: string;
    gitlabState?: string;
    closedAt?: string;
    decision?: string;
    mergeRequest?: {
      iid: number;
      sourceBranch: string;
      targetBranch: string;
      headCommitSha: string;
      mergeCommitSha: string;
      mergedAt: string;
      url: string;
    };
    proof?: Array<{
      command: string;
      gates?: Record<string, string>;
      dodConfidence?: string;
    }>;
    guardrails?: Array<{ path: string; purpose: string }>;
    grepEvidence?: {
      before?: string[];
      after?: string[];
    };
  }>;
  triageProcess?: {
    authority26514?: {
      preferredCommand?: string;
      evidenceDir?: string;
      requiredForLabels?: string[];
      requiredWorkItemSections?: string[];
      disallowedSoleAuthoritySources?: string[];
      rawRepoWideScanPolicy?: string;
    };
    workItemTemplate?: {
      requiredSections?: Array<{ heading: string; rule: string }>;
    };
  };
}

function readText(relativePath: string): string {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function readJson<T>(relativePath: string): T {
  return JSON.parse(readText(relativePath)) as T;
}

describe('alignment control-plane process docs', () => {
  it('requires staged 26514 authority evidence for user-information work-item triage', () => {
    const markdown = readText(`${artifactPath}.md`);
    const controlPlane = readJson<AlignmentControlPlane>(`${artifactPath}.json`);
    const authority26514 = controlPlane.triageProcess?.authority26514;
    const workItemTemplate = controlPlane.triageProcess?.workItemTemplate;

    expect(controlPlane.schema).toBe('vi-history-suite/alignment-control-plane-work-items@v1');
    expect(markdown).toContain('## Alignment Triage Template');
    expect(markdown).toContain('`npm run assurance:26514:authority -- --evidence-dir /tmp/vihs-assurance-26514`');
    expect(markdown).toContain('`VIHS_ASSURANCE_SKILL_ROOT=/home/sergio/repos/gl/repo-standards-review`');
    expect(markdown).toContain('Raw repo-wide 26514 scans are exploratory only');
    expect(markdown).toContain('Never cite `.cache/` as the sole user-information authority source');

    expect(authority26514).toMatchObject({
      preferredCommand: 'npm run assurance:26514:authority -- --evidence-dir /tmp/vihs-assurance-26514',
      evidenceDir: '/tmp/vihs-assurance-26514',
      rawRepoWideScanPolicy: 'exploratory-only'
    });
    expect(authority26514?.requiredForLabels).toEqual(
      expect.arrayContaining(['lane::user-information', 'standards-review'])
    );
    expect(authority26514?.requiredWorkItemSections).toEqual(
      expect.arrayContaining(['26514 Authority Evidence', 'Non-Authority Evidence Boundary'])
    );
    expect(authority26514?.disallowedSoleAuthoritySources).toEqual(
      expect.arrayContaining(['.cache/', 'docs-workbench-evidence/', 'wiki-workbench-evidence/'])
    );
    expect(workItemTemplate?.requiredSections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          heading: '26514 Authority Evidence',
          rule: expect.stringContaining('staged `assurance:26514:authority`')
        }),
        expect.objectContaining({
          heading: 'Non-Authority Evidence Boundary',
          rule: expect.stringContaining('`.cache/`')
        })
      ])
    );
  });

  it('records merged and closed readback for the first alignment action batch', () => {
    const markdown = readText(`${artifactPath}.md`);
    const controlPlane = readJson<AlignmentControlPlane>(`${artifactPath}.json`);
    const expected = new Map([
      [
        17,
        {
          mr: 241,
          sourceBranch: 'codex/docs-alignment-17',
          head: '0b70bf75e52364ba8bf221d353750dbfa5352b7e',
          merge: '31add781bd04cc832d9fb55aa821a69305a91a37',
          mergedAt: '2026-05-16T08:23:15.579Z',
          closedAt: '2026-05-16T08:32:27.592Z'
        }
      ],
      [
        18,
        {
          mr: 247,
          sourceBranch: 'codex/18-normalize-host-default-runtime-contract',
          head: 'c50c5cd7952ec3987a5992eff199c07004c14c7e',
          merge: '6323cd29b2256c259a6b99cdcb37b01ffd81b30d',
          mergedAt: '2026-05-16T19:02:55.975Z',
          closedAt: '2026-05-16T19:03:21.673Z'
        }
      ],
      [
        19,
        {
          mr: 248,
          sourceBranch: 'codex/19-resolve-progress-surface-state',
          head: '4a11f6f1f4638e376431b13f37fb06721ebb853c',
          merge: '037d58ce902c6f93f0147f2ac0c57ea9e506cfea',
          mergedAt: '2026-05-16T19:29:52.771Z',
          closedAt: '2026-05-16T19:30:12.853Z'
        }
      ],
      [
        20,
        {
          mr: 239,
          sourceBranch: 'codex/docs-alignment-20-21',
          head: 'fbc3e5e578252af7a837f1503a75853259187ef3',
          merge: '4436f4ec7bc98d06ccc5da5b60f9294c7c94c68c',
          mergedAt: '2026-05-16T06:57:39.679Z',
          closedAt: '2026-05-16T07:15:21.670Z'
        }
      ],
      [
        21,
        {
          mr: 239,
          sourceBranch: 'codex/docs-alignment-20-21',
          head: 'fbc3e5e578252af7a837f1503a75853259187ef3',
          merge: '4436f4ec7bc98d06ccc5da5b60f9294c7c94c68c',
          mergedAt: '2026-05-16T06:57:39.679Z',
          closedAt: '2026-05-16T07:15:21.716Z'
        }
      ],
      [
        22,
        {
          mr: 249,
          sourceBranch: 'codex/22-installed-user-observation-cadence',
          head: 'ef0473fae66170c165cb9b990845cbe0251b530f',
          merge: 'e4128c5570dc1263019f41ed2e6fff1a087ccaaa',
          mergedAt: '2026-05-16T19:52:08.536Z',
          closedAt: '2026-05-16T19:52:21.387Z'
        }
      ],
      [
        23,
        {
          mr: 240,
          sourceBranch: 'codex/docs-alignment-23',
          head: '92c52c124fe9472a4c5490a50f19d2002e2c1d71',
          merge: '415408d48d682b9e064301860b8e2f3018c21a8c',
          mergedAt: '2026-05-16T07:32:11.858Z',
          closedAt: '2026-05-16T07:40:31.689Z'
        }
      ]
    ]);

    expect(markdown).toContain('## Initial Action Merge Readback');
    expect(markdown).toContain('Recorded by `#26`');
    expect(markdown).toContain('Status: merged into `develop` and closed.');
    expect(markdown).not.toContain('Status: implemented locally, pending push/merge.');
    expect(markdown).not.toContain('Status: committed locally, pending push/merge.');
    expect(controlPlane.evidenceSnapshot?.releaseGate).toMatchObject({
      command:
        'VIHS_ASSURANCE_SKILL_ROOT=/home/sergio/repos/gl/repo-standards-review npm run assurance:release-gate -- --evidence-dir /tmp/vihs-assurance-release-26',
      gates: expect.objectContaining({ dod: 'PASS' }),
      dodConfidence: 'Med'
    });
    expect(controlPlane.initialActionMergeReadback?.sourceWorkItem).toBe(26);
    expect(controlPlane.initialActionMergeReadback?.items).toHaveLength(expected.size);

    for (const [iid, facts] of expected) {
      const closeout = controlPlane.actionCloseouts?.find((candidate) => candidate.iid === iid);
      const readback = controlPlane.initialActionMergeReadback?.items?.find(
        (candidate) => candidate.iid === iid
      );

      expect(markdown).toContain(`| \`#${iid}\` | closed | \`!${facts.mr}\``);
      expect(markdown).toContain(`Merge request: \`!${facts.mr}\``);
      expect(markdown).toContain(`Merge commit: \`${facts.merge}\``);
      expect(markdown).toContain(`Closed at: \`${facts.closedAt}\``);
      expect(readback).toMatchObject({
        iid,
        state: 'closed',
        mergeRequestIid: facts.mr,
        mergeCommitSha: facts.merge,
        closedAt: facts.closedAt
      });
      expect(closeout).toMatchObject({
        iid,
        status: 'merged-and-closed',
        gitlabState: 'closed',
        closedAt: facts.closedAt,
        mergeRequest: {
          iid: facts.mr,
          sourceBranch: facts.sourceBranch,
          targetBranch: 'develop',
          headCommitSha: facts.head,
          mergeCommitSha: facts.merge,
          mergedAt: facts.mergedAt
        }
      });
    }
  });

  it('records the release-gate DoD evidence decision for work item 23', () => {
    const markdown = readText(`${artifactPath}.md`);
    const controlPlane = readJson<AlignmentControlPlane>(`${artifactPath}.json`);
    const closeout23 = controlPlane.actionCloseouts?.find((closeout) => closeout.iid === 23);

    expect(markdown).toContain('### `#23` Decide release-gate DoD evidence or explicit DoD N/A rationale');
    expect(markdown).toContain('Decision: add a repo-owned DoD evidence signal');
    expect(markdown).toContain('`DoD Gate / dod`');
    expect(markdown).toContain('`dod | PASS | Med | -`');

    expect(closeout23).toMatchObject({
      iid: 23,
      decision: 'add-dod-evidence-signal'
    });
    expect(closeout23?.guardrails).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: 'docs/product/SHIP-0001-releasable-vi-history-suite.md'
        }),
        expect.objectContaining({
          path: 'docs/product/release-readiness-matrix.json'
        }),
        expect.objectContaining({
          path: 'tests/unit/shipControlDocs.test.ts'
        })
      ])
    );
    expect(closeout23?.proof).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          gates: expect.objectContaining({ dod: 'N/A' })
        }),
        expect.objectContaining({
          gates: expect.objectContaining({ dod: 'PASS' }),
          dodConfidence: 'Med'
        })
      ])
    );
  });

  it('records the retained ship history versus current release truth decision for work item 17', () => {
    const markdown = readText(`${artifactPath}.md`);
    const controlPlane = readJson<AlignmentControlPlane>(`${artifactPath}.json`);
    const closeout17 = controlPlane.actionCloseouts?.find((closeout) => closeout.iid === 17);

    expect(markdown).toContain(
      '### `#17` Align current release truth across retained v0.2.0 and live v1.3.16 surfaces'
    );
    expect(markdown).toContain('Decision: separate retained historical ship-control evidence');
    expect(markdown).toContain('`currentInstalledUserRelease=false`');

    expect(closeout17).toMatchObject({
      iid: 17,
      decision: 'separate-retained-ship-history-from-current-release-truth'
    });
    expect(closeout17?.guardrails).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'README.md' }),
        expect.objectContaining({
          path: 'docs/product/SHIP-0001-releasable-vi-history-suite.md'
        }),
        expect.objectContaining({ path: 'docs/product/current-state.md' }),
        expect.objectContaining({ path: 'docs/product/release-publication-state.json' }),
        expect.objectContaining({ path: 'tests/unit/shipControlDocs.test.ts' }),
        expect.objectContaining({ path: 'tests/unit/releasePublicationState.test.ts' })
      ])
    );
  });

  it('records the runtime-contract Docker-only versus host-default closeout for work item 18', () => {
    const markdown = readText(`${artifactPath}.md`);
    const controlPlane = readJson<AlignmentControlPlane>(`${artifactPath}.json`);
    const closeout18 = controlPlane.actionCloseouts?.find((closeout) => closeout.iid === 18);

    expect(markdown).toContain(
      '### `#18` Normalize host-default LabVIEWCLI versus historical Docker-only contract'
    );
    expect(markdown).toContain('Decision: make host-default local `LabVIEWCLI`');
    expect(markdown).toContain('Before grep evidence');
    expect(markdown).toContain('After grep evidence');
    expect(markdown).toContain('host-default local `LabVIEWCLI`');
    expect(markdown).toContain('Docker-only wording only as historical baseline');

    expect(closeout18).toMatchObject({
      iid: 18,
      decision: 'make-host-default-labviewcli-current-and-docker-only-historical'
    });
    expect(closeout18?.grepEvidence?.before).toEqual(
      expect.arrayContaining([
        expect.stringContaining('current released Docker-only'),
        expect.stringContaining('Docker-required hard stops')
      ])
    );
    expect(closeout18?.grepEvidence?.after).toEqual(
      expect.arrayContaining([
        expect.stringContaining('host-default local LabVIEWCLI'),
        expect.stringContaining('bounded expert Docker')
      ])
    );
    expect(closeout18?.guardrails).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'docs/requirements/srs.md' }),
        expect.objectContaining({ path: 'docs/requirements/rtm.csv' }),
        expect.objectContaining({ path: 'docs/testing/test-plan.md' }),
        expect.objectContaining({ path: 'docs/product/extension-execution-policy.md' }),
        expect.objectContaining({ path: 'tests/unit/executionPolicyDocs.test.ts' }),
        expect.objectContaining({ path: 'tests/unit/requirementsDocs.test.ts' })
      ])
    );
    expect(closeout18?.proof).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          command: expect.stringContaining('tests/unit/executionPolicyDocs.test.ts'),
          status: 'passed'
        })
      ])
    );
  });

  it('records the progress-surface research-state closeout for work item 19', () => {
    const markdown = readText(`${artifactPath}.md`);
    const controlPlane = readJson<AlignmentControlPlane>(`${artifactPath}.json`);
    const closeout19 = controlPlane.actionCloseouts?.find((closeout) => closeout.iid === 19);

    expect(markdown).toContain('### `#19` Resolve the lone partial research/progress-surface state');
    expect(markdown).toContain('Decision: close `TRANCHE-004`');
    expect(markdown).toContain('`progress-surface-uplift`');
    expect(markdown).toContain('implemented-and-active');
    expect(markdown).toContain('notification/status-bar/');
    expect(markdown).toContain('webview progress');

    expect(closeout19).toMatchObject({
      iid: 19,
      decision: 'close-progress-surface-partial-as-implemented-and-superseded'
    });
    expect(closeout19?.grepEvidence?.before).toEqual(
      expect.arrayContaining([
        expect.stringContaining('research-implementation-index.json carried progress-surface-uplift as partial'),
        expect.stringContaining('development-queue.json kept TRANCHE-004 queued')
      ])
    );
    expect(closeout19?.grepEvidence?.after).toEqual(
      expect.arrayContaining([
        expect.stringContaining('progress-surface-uplift as implemented-and-active'),
        expect.stringContaining('TRANCHE-004 as done')
      ])
    );
    expect(closeout19?.guardrails).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'docs/research/authoritative/research-implementation-index.json' }),
        expect.objectContaining({ path: 'docs/research/authoritative/research-alignment.md' }),
        expect.objectContaining({ path: 'docs/product/development-queue.json' }),
        expect.objectContaining({ path: 'docs/product/current-state.md' }),
        expect.objectContaining({ path: 'tests/unit/requirementsDocs.test.ts' }),
        expect.objectContaining({ path: 'tests/unit/alignmentControlPlaneDocs.test.ts' })
      ])
    );
    expect(closeout19?.proof).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          command: expect.stringContaining('tests/unit/requirementsDocs.test.ts'),
          status: 'passed'
        })
      ])
    );
  });

  it('records the installed-user observation cadence closeout for work item 22', () => {
    const markdown = readText(`${artifactPath}.md`);
    const controlPlane = readJson<AlignmentControlPlane>(`${artifactPath}.json`);
    const closeout22 = controlPlane.actionCloseouts?.find((closeout) => closeout.iid === 22);

    expect(markdown).toContain(
      '### `#22` Turn post-publication installed-user acceptance into a recurring observation cadence'
    );
    expect(markdown).toContain('Decision: add a recurring installed-user observation cadence');
    expect(markdown).toContain('event-driven-with-monthly-review-while-public-intake-open');
    expect(markdown).toContain('`2026-06-14`');
    expect(markdown).toContain('issue `#98`');
    expect(markdown).toContain('`ISSUE-0415`');

    expect(closeout22).toMatchObject({
      iid: 22,
      decision: 'add-recurring-installed-user-observation-cadence'
    });
    expect(closeout22?.grepEvidence?.before).toEqual(
      expect.arrayContaining([
        expect.stringContaining('one-time campaign packet but had no recurring observation schedule'),
        expect.stringContaining('public intake issue #98 was open with zero comments')
      ])
    );
    expect(closeout22?.grepEvidence?.after).toEqual(
      expect.arrayContaining([
        expect.stringContaining('event-driven-with-monthly-review-while-public-intake-open'),
        expect.stringContaining('cycle outputs separate observed facts')
      ])
    );
    expect(closeout22?.guardrails).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: 'docs/product/post-publication-installed-user-observation-cadence-2026-05-16.md'
        }),
        expect.objectContaining({
          path: 'docs/product/post-publication-installed-user-observation-cadence-2026-05-16.json'
        }),
        expect.objectContaining({ path: 'docs/product/release-publication-state.json' }),
        expect.objectContaining({ path: 'docs/product/post-release-sustainment-rules.json' }),
        expect.objectContaining({ path: 'docs/requirements/srs.md' }),
        expect.objectContaining({ path: 'docs/requirements/rtm.csv' }),
        expect.objectContaining({ path: 'docs/testing/test-plan.md' }),
        expect.objectContaining({
          path: 'tests/unit/postPublicationInstalledUserAcceptanceCampaign.test.ts'
        }),
        expect.objectContaining({ path: 'tests/unit/postReleaseSustainmentRulesDocs.test.ts' })
      ])
    );
    expect(closeout22?.proof).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          command: expect.stringContaining('tests/unit/postPublicationInstalledUserAcceptanceCampaign.test.ts'),
          status: 'passed'
        }),
        expect.objectContaining({
          command: expect.stringContaining('requirements_quality_check.py'),
          status: 'passed',
          ok: true
        })
      ])
    );
  });

  it('records portfolio operating cycle 2 as the next governed alignment loop', () => {
    const markdown = readText(`${artifactPath}.md`);
    const cycleMarkdown = readText('docs/product/portfolio-operating-cycle-2-2026-05-17.md');
    const cycle = readJson<any>('docs/product/portfolio-operating-cycle-2-2026-05-17.json');
    const currentState = readText('docs/product/current-state.md');
    const informationItemMap = readText('docs/information-item-map.md');

    expect(markdown).toContain('## Portfolio Operating Cycle 2');
    expect(markdown).toContain('Recorded by `#31`');
    expect(markdown).toContain('supersede stale MR `!220`');
    expect(markdown).toContain('MIT `vi-history` remains idle');

    expect(cycleMarkdown).toContain('Portfolio Operating Cycle 2 - 2026-05-17');
    expect(cycleMarkdown).toContain('GitLab work item:');
    expect(cycleMarkdown).toContain('https://gitlab.com/svelderrainruiz/vi-history-suite/-/work_items/31');
    expect(cycleMarkdown).toContain('host proof is not a substitute for Windows Docker Desktop proof');
    expect(cycleMarkdown).toContain('There is no active MIT implementation IAU after this cycle');
    expect(cycleMarkdown).toContain('failed closed');
    expect(cycleMarkdown).toContain('new Windows proof');
    expect(cycleMarkdown).toContain('claim.');

    expect(cycle).toMatchObject({
      schema: 'vi-history-suite/portfolio-operating-cycle@v1',
      cycleId: 'portfolio-operating-cycle-2-2026-05-17',
      workItem: { iid: 31 },
      parentControlPlane: { iid: 11 },
      sourceTriage: {
        staleMergeRequest: {
          iid: 220,
          decision: 'supersede-with-fresh-develop-branch'
        },
        refreshBranch: {
          name: 'codex/portfolio-operating-cycle-2',
          baseBranch: 'develop'
        }
      },
      proofBoundaries: {
        windowsInstalledUserHost: 'admitted-host-only',
        windowsDockerDesktopWindowsContainer: 'blocked-not-admitted'
      },
      localAssertionCheck: {
        status: 'failed-closed-on-this-linux-worktree',
        claimEffect: 'no new Windows proof claim is created by this cycle'
      },
      implementationAdmission: {
        activeMitImplementationIau: null,
        blockedUntilPreflightPass: true
      }
    });
    expect(cycle.standingLanes).toEqual(expect.arrayContaining([12, 13, 14, 15, 16]));
    expect(cycle.operatingLoop).toEqual(
      expect.arrayContaining([
        'govern-in-gitlab',
        'admit-through-bridge',
        'implement-only-admitted-iau-in-mit',
        'compare-independent-authorities-as-oracle'
      ])
    );
    expect(cycle.mutationBoundary.notAuthorized).toEqual(
      expect.arrayContaining([
        'MIT implementation',
        'Marketplace publication',
        'Windows Docker Desktop proof claim'
      ])
    );

    expect(currentState).toContain('portfolio-operating-cycle-2-2026-05-17.md');
    expect(currentState).toContain('govern in GitLab, admit through the bridge');
    expect(informationItemMap).toContain('Portfolio operating cycle 2');
  });
});

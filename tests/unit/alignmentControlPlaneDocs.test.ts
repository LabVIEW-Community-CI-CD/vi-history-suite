import * as fs from 'node:fs';
import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '..', '..');
const artifactPath =
  'docs/product/work-item-0011-docs-implementation-alignment-control-plane-2026-05-16';

interface AlignmentControlPlane {
  schema: string;
  actionCloseouts?: Array<{
    iid: number;
    decision?: string;
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
});

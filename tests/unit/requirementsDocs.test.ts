import * as fs from 'node:fs';
import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '..', '..');

function readRepoText(...segments: string[]): string {
  return fs
    .readFileSync(path.join(repoRoot, ...segments), 'utf8')
    .replace(/\r\n/g, '\n');
}

function parseCsv(text: string): Array<Record<string, string>> {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = '';
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];

    if (character === '"') {
      const nextCharacter = text[index + 1];
      if (inQuotes && nextCharacter === '"') {
        currentCell += '"';
        index += 1;
        continue;
      }

      inQuotes = !inQuotes;
      continue;
    }

    if (!inQuotes && character === ',') {
      currentRow.push(currentCell);
      currentCell = '';
      continue;
    }

    if (!inQuotes && (character === '\n' || character === '\r')) {
      if (character === '\r' && text[index + 1] === '\n') {
        index += 1;
      }

      currentRow.push(currentCell);
      currentCell = '';

      if (currentRow.some((cell) => cell.length > 0)) {
        rows.push(currentRow);
      }

      currentRow = [];
      continue;
    }

    currentCell += character;
  }

  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell);
    rows.push(currentRow);
  }

  const [header, ...body] = rows;
  return body.map((row) => {
    const record: Record<string, string> = {};
    header.forEach((key, index) => {
      record[key] = row[index] ?? '';
    });
    return record;
  });
}

function extractSrsBlocks(text: string): Array<{
  id: string;
  title: string;
  block: string;
}> {
  const headingPattern = /^### (VHS-REQ-\d+): (.+)$/gm;
  const headings = [...text.matchAll(headingPattern)];

  return headings.map((match, index) => {
    const nextHeading = headings[index + 1];
    return {
      id: match[1],
      title: match[2],
      block: text.slice(match.index, nextHeading?.index ?? text.length)
    };
  });
}

function splitReferences(value: string): string[] {
  return value
    .split(';')
    .map((reference) => reference.trim())
    .filter((reference) => reference.length > 0);
}

function isNonPathReference(reference: string): boolean {
  return reference.startsWith('manual:') || reference.startsWith('external:');
}

function assertRepoPathExists(reference: string): void {
  if (isNonPathReference(reference)) {
    return;
  }

  const cleanReference = reference.replace(/`/g, '').split('#')[0].trim();
  expect(cleanReference.length, `empty reference from '${reference}'`).toBeGreaterThan(0);
  expect(
    fs.existsSync(path.join(repoRoot, cleanReference)),
    `missing RTM reference '${reference}'`
  ).toBe(true);
}

function requirementId(sequence: number): string {
  return `VHS-REQ-${sequence.toString().padStart(3, '0')}`;
}

function systemRequirementId(sequence: number): string {
  return `VHS-SYS-REQ-${sequence.toString().padStart(3, '0')}`;
}

describe('requirements documentation coherence', () => {
  it('restores the active requirements package', () => {
    for (const relativePath of [
      ['docs', 'requirements', 'README.md'],
      ['docs', 'requirements', 'syrs.md'],
      ['docs', 'requirements', 'srs.md'],
      ['docs', 'requirements', 'rtm.csv'],
      ['docs', 'requirements', 'id-index.csv']
    ]) {
      expect(fs.existsSync(path.join(repoRoot, ...relativePath))).toBe(true);
    }
  });

  it('keeps active SRS requirements and RTM rows on the same ID set', () => {
    const srsIds = new Set(
      extractSrsBlocks(readRepoText('docs', 'requirements', 'srs.md')).map((block) => block.id)
    );
    const rtmIds = new Set(
      parseCsv(readRepoText('docs', 'requirements', 'rtm.csv')).map((row) => row.ReqID)
    );

    expect([...srsIds].sort()).toEqual([...rtmIds].sort());
  });

  it('keeps active SRS requirement blocks agent-targetable', () => {
    const requiredFields = [
      'Status',
      'Parent',
      'Area',
      'Statement',
      'Acceptance Criteria',
      'Agent Work Scope',
      'Implementation References',
      'Verification References',
      'Change Guidance'
    ];

    const blocks = extractSrsBlocks(readRepoText('docs', 'requirements', 'srs.md'));
    expect(blocks.length).toBeGreaterThan(20);

    for (const { id, block } of blocks) {
      for (const field of requiredFields) {
        expect(block, `${id} missing ${field}`).toContain(`- ${field}:`);
      }
    }
  });

  it('keeps RTM implementation and verification references resolvable', () => {
    const rows = parseCsv(readRepoText('docs', 'requirements', 'rtm.csv'));

    for (const row of rows) {
      expect(row.Status, `${row.ReqID} status`).toBe('Active');
      expect(row.ParentID, `${row.ReqID} parent`).toMatch(/^VHS-SYS-REQ-\d{3}$/);

      for (const reference of [
        ...splitReferences(row.ImplementationRefs),
        ...splitReferences(row.VerificationRefs)
      ]) {
        assertRepoPathExists(reference);
      }
    }
  });

  it('keeps historical IDs discoverable through the ID index', () => {
    const indexRows = parseCsv(readRepoText('docs', 'requirements', 'id-index.csv'));
    const indexById = new Map(indexRows.map((row) => [row.ID, row]));
    const activeRtmIds = parseCsv(readRepoText('docs', 'requirements', 'rtm.csv')).map(
      (row) => row.ReqID
    );

    for (let sequence = 1; sequence <= 595; sequence += 1) {
      expect(indexById.has(requirementId(sequence)), `missing historical ${sequence}`).toBe(true);
    }

    for (let sequence = 1; sequence <= 10; sequence += 1) {
      expect(
        indexById.has(systemRequirementId(sequence)),
        `missing historical system ${sequence}`
      ).toBe(true);
    }

    for (const id of activeRtmIds) {
      expect(indexById.get(id)?.Status, `${id} index status`).toBe('Active');
      expect(indexById.get(id)?.CurrentAnchor, `${id} anchor`).toMatch(/^srs\.md#/);
    }
  });

  it('does not reintroduce retired authority or release-control claims into active requirements', () => {
    const activeRequirementsText = [
      readRepoText('docs', 'requirements', 'syrs.md'),
      readRepoText('docs', 'requirements', 'srs.md'),
      readRepoText('docs', 'requirements', 'rtm.csv')
    ].join('\n');

    for (const retiredPattern of [
      /\bGitLab\b/i,
      /\bGitFlow\b/i,
      /private release/i,
      /governed proof/i,
      /public-github-source/i,
      /PolyForm/i,
      /rtm-release-gate/i
    ]) {
      expect(activeRequirementsText).not.toMatch(retiredPattern);
    }
  });

  it('keeps the core implementation areas represented as agent targets', () => {
    const rows = parseCsv(readRepoText('docs', 'requirements', 'rtm.csv'));
    const areas = new Set(rows.map((row) => row.Area));
    const titles = rows.map((row) => row.Title).join('\n');

    for (const area of [
      'Detection',
      'Git History Eligibility',
      'Workspace Safety',
      'Menu Gating',
      'History Panel',
      'Comparison Reports',
      'Runtime Discovery',
      'Package Identity',
      'CI And Developer Environment',
      'Requirements'
    ]) {
      expect(areas.has(area), `missing area ${area}`).toBe(true);
    }

    expect(titles).toContain('Trusted Windows/LabVIEW Maintainer Workflow');
    expect(titles).toContain('Optional Vagrant Helper');
    expect(titles).toContain('Devcontainer Source Evaluation');
  });

  it('keeps dependency maintenance automation targetable', () => {
    const srs = readRepoText('docs', 'requirements', 'srs.md');
    const rtmRows = parseCsv(readRepoText('docs', 'requirements', 'rtm.csv'));
    const idIndexRows = parseCsv(readRepoText('docs', 'requirements', 'id-index.csv'));
    const requirementRow = rtmRows.find((row) => row.ReqID === 'VHS-REQ-602');
    const indexRow = idIndexRows.find((row) => row.ID === 'VHS-REQ-602');

    expect(srs).toContain('### VHS-REQ-602: Dependency Maintenance Automation');
    expect(srs).toContain('Major dependency updates are not grouped');
    expect(requirementRow?.ParentID).toBe('VHS-SYS-REQ-012');
    expect(requirementRow?.ImplementationRefs).toContain('.github/dependabot.yml');
    expect(requirementRow?.ImplementationRefs).toContain(
      'scripts/auditPackagedRuntimeSurface.js'
    );
    expect(requirementRow?.VerificationRefs).toContain(
      'tests/unit/securityMaintenanceWorkflows.test.ts'
    );
    expect(requirementRow?.VerificationRefs).toContain(
      'tests/unit/packageRuntimeSurfaceAudit.test.ts'
    );
    expect(indexRow?.CurrentAnchor).toBe(
      'srs.md#vhs-req-602-dependency-maintenance-automation'
    );
  });

  it('keeps trusted maintainer evidence contract traceable for VHS-REQ-598', () => {
    const srs = readRepoText('docs', 'requirements', 'srs.md');
    const rtmRows = parseCsv(readRepoText('docs', 'requirements', 'rtm.csv'));
    const requirementRow = rtmRows.find((row) => row.ReqID === 'VHS-REQ-598');

    expect(srs).toContain('### VHS-REQ-598: Trusted Windows/LabVIEW Maintainer Workflow');
    expect(srs).toContain('release/vX.Y.Z');
    expect(srs).toContain(
      'The environment evidence summary includes ref, SHA, runner context, Node/npm'
    );
    expect(srs).toContain('The trusted-ref decision is visible in workflow output or artifact text.');
    expect(requirementRow?.ImplementationRefs).toContain('.github/workflows/windows-labview-maintainer.yml');
    expect(requirementRow?.ImplementationRefs).toContain('docs/maintainer-operations.md');
    expect(requirementRow?.VerificationRefs).toContain(
      'tests/unit/windowsLabviewMaintainerWorkflow.test.ts'
    );
    expect(requirementRow?.VerificationRefs).toContain('tests/unit/requirementsDocs.test.ts');
    expect(requirementRow?.Notes).toContain('trusted-ref decision');
    expect(requirementRow?.Notes).toContain(
      'runner-evidence/windows-labview-maintainer-summary.txt'
    );
  });

  it('keeps diagnostic test VSIX distribution traceable for VHS-REQ-608', () => {
    const syrs = readRepoText('docs', 'requirements', 'syrs.md');
    const srs = readRepoText('docs', 'requirements', 'srs.md');
    const rtmRows = parseCsv(readRepoText('docs', 'requirements', 'rtm.csv'));
    const idIndexRows = parseCsv(readRepoText('docs', 'requirements', 'id-index.csv'));
    const requirementRow = rtmRows.find((row) => row.ReqID === 'VHS-REQ-608');
    const indexRow = idIndexRows.find((row) => row.ID === 'VHS-REQ-608');

    expect(syrs).toContain('diagnostic test VSIX distribution');
    expect(syrs).toContain('.github/workflows/package-test-vsix.yml');
    expect(srs).toContain('### VHS-REQ-608: Diagnostic Test VSIX Distribution');
    expect(srs).toContain('trusted ref for reporter retesting');
    expect(srs).toContain('release/vX.Y.Z');
    expect(srs).toContain('short-lived Actions artifact');
    expect(srs).toContain('test-vsix-latest');
    expect(srs).toContain('does not use Marketplace publishing tokens');
    expect(requirementRow?.ParentID).toBe('VHS-SYS-REQ-013');
    expect(requirementRow?.ImplementationRefs).toContain(
      '.github/workflows/package-test-vsix.yml'
    );
    expect(requirementRow?.ImplementationRefs).toContain('docs/maintainer-operations.md');
    expect(requirementRow?.ImplementationRefs).toContain('docs/testing/test-plan.md');
    expect(requirementRow?.VerificationRefs).toContain(
      'tests/unit/packageTestVsixWorkflow.test.ts'
    );
    expect(requirementRow?.VerificationRefs).toContain('manual:diagnostic-test-vsix-dispatch');
    expect(requirementRow?.Notes).toContain('trusted-ref-only');
    expect(requirementRow?.Notes).toContain('test-vsix-latest');
    expect(indexRow?.CurrentAnchor).toBe(
      'srs.md#vhs-req-608-diagnostic-test-vsix-distribution'
    );
  });

  it('keeps governed branch promotion and Marketplace release automation traceable', () => {
    const syrs = readRepoText('docs', 'requirements', 'syrs.md');
    const srs = readRepoText('docs', 'requirements', 'srs.md');
    const rtmRows = parseCsv(readRepoText('docs', 'requirements', 'rtm.csv'));
    const idIndexRows = parseCsv(readRepoText('docs', 'requirements', 'id-index.csv'));
    const requirementRow = rtmRows.find((row) => row.ReqID === 'VHS-REQ-609');
    const indexRow = idIndexRows.find((row) => row.ID === 'VHS-REQ-609');
    const systemIndexRow = idIndexRows.find((row) => row.ID === 'VHS-SYS-REQ-016');

    expect(syrs).toContain('### VHS-SYS-REQ-016: Governed Release Branch Promotion');
    expect(syrs).toContain('develop');
    expect(syrs).toContain('release/vX.Y.Z');
    expect(syrs).toContain('hotfix/vX.Y.Z');
    expect(syrs).toContain('Marketplace publication is tag-only');

    expect(srs).toContain(
      '### VHS-REQ-609: Governed Branch Promotion And Marketplace Release Automation'
    );
    expect(srs).toContain('marketplace-release');
    expect(srs).toContain('dependabot/*');
    expect(srs).toContain('reachable from `origin/main`');
    expect(srs).toContain('pinned VSCE wrapper');

    expect(requirementRow?.ParentID).toBe('VHS-SYS-REQ-016');
    expect(requirementRow?.ImplementationRefs).toContain('.github/workflows/ci.yml');
    expect(requirementRow?.ImplementationRefs).toContain(
      '.github/workflows/marketplace-release.yml'
    );
    expect(requirementRow?.ImplementationRefs).toContain('.github/dependabot.yml');
    expect(requirementRow?.ImplementationRefs).toContain('docs/maintainer-operations.md');
    expect(requirementRow?.VerificationRefs).toContain(
      'tests/unit/branchGovernanceWorkflow.test.ts'
    );
    expect(requirementRow?.VerificationRefs).toContain(
      'tests/unit/marketplaceReleaseWorkflow.test.ts'
    );
    expect(requirementRow?.VerificationRefs).toContain(
      'manual:marketplace-release-environment-setup'
    );
    expect(requirementRow?.Notes).toContain('exact-tag-only');
    expect(indexRow?.CurrentAnchor).toBe(
      'srs.md#vhs-req-609-governed-branch-promotion-and-marketplace-release-automation'
    );
    expect(systemIndexRow?.CurrentAnchor).toBe(
      'syrs.md#vhs-sys-req-016-governed-release-branch-promotion'
    );
  });

  it('keeps dashboard aggregate review traceable for VHS-REQ-610', () => {
    const srs = readRepoText('docs', 'requirements', 'srs.md');
    const rtmRows = parseCsv(readRepoText('docs', 'requirements', 'rtm.csv'));
    const idIndexRows = parseCsv(readRepoText('docs', 'requirements', 'id-index.csv'));
    const requirementRow = rtmRows.find((row) => row.ReqID === 'VHS-REQ-610');
    const indexRow = idIndexRows.find((row) => row.ID === 'VHS-REQ-610');

    expect(srs).toContain('### VHS-REQ-610: Dashboard Aggregate Review');
    expect(srs).toContain('dashboard aggregate review');
    expect(srs).toContain('multiple commit pairs');
    expect(srs).toContain('ETA estimation');
    expect(srs).toContain('Evidence seeding imports retained evidence');
    expect(requirementRow?.ParentID).toBe('VHS-SYS-REQ-008');
    expect(requirementRow?.ImplementationRefs).toContain(
      'src/dashboard/multiReportDashboard.ts'
    );
    expect(requirementRow?.ImplementationRefs).toContain(
      'src/dashboard/multiReportDashboardAction.ts'
    );
    expect(requirementRow?.ImplementationRefs).toContain(
      'src/dashboard/niComparisonReportParser.ts'
    );
    expect(requirementRow?.ImplementationRefs).toContain(
      'src/dashboard/comparisonReportArchive.ts'
    );
    expect(requirementRow?.ImplementationRefs).toContain(
      'src/dashboard/dashboardEtaAccuracy.ts'
    );
    expect(requirementRow?.ImplementationRefs).toContain(
      'src/dashboard/dashboardLatestRun.ts'
    );
    expect(requirementRow?.ImplementationRefs).toContain(
      'src/dashboard/retainedDashboardEvidence.ts'
    );
    expect(requirementRow?.VerificationRefs).toContain(
      'tests/unit/dashboardEtaAccuracy.test.ts'
    );
    expect(requirementRow?.VerificationRefs).toContain(
      'tests/unit/niComparisonReportParser.test.ts'
    );
    expect(indexRow?.CurrentAnchor).toBe(
      'srs.md#vhs-req-610-dashboard-aggregate-review'
    );
  });

  it('keeps onboarding feedback traceable to source evaluation and Marketplace metadata', () => {
    const srs = readRepoText('docs', 'requirements', 'srs.md');
    const rtmRows = parseCsv(readRepoText('docs', 'requirements', 'rtm.csv'));
    const sourceEvaluationRow = rtmRows.find((row) => row.ReqID === 'VHS-REQ-596');
    const marketplaceRow = rtmRows.find((row) => row.ReqID === 'VHS-REQ-600');

    expect(srs).toContain('First-time source-evaluation feedback asks for the path used');
    expect(srs).toContain('First-time Marketplace feedback captures stale');
    expect(sourceEvaluationRow?.ImplementationRefs).toContain('FIRST-RUN.md');
    expect(sourceEvaluationRow?.ImplementationRefs).toContain('docs/development.md');
    expect(sourceEvaluationRow?.ImplementationRefs).toContain(
      '.github/ISSUE_TEMPLATE/first_time_onboarding_feedback.yml'
    );
    expect(sourceEvaluationRow?.VerificationRefs).toContain(
      'tests/unit/publicDevcontainerSurface.test.ts'
    );
    expect(marketplaceRow?.ImplementationRefs).toContain('FIRST-RUN.md');
    expect(marketplaceRow?.ImplementationRefs).toContain(
      '.github/ISSUE_TEMPLATE/first_time_onboarding_feedback.yml'
    );
    expect(marketplaceRow?.VerificationRefs).toContain(
      'tests/unit/publicDocSourceLinks.test.ts'
    );
  });

  it('keeps the requirement-targeted issue template aligned with the agent contract', () => {
    const template = readRepoText('.github', 'ISSUE_TEMPLATE', 'requirement_target.yml');
    const requirementsReadme = readRepoText('docs', 'requirements', 'README.md');
    const issueWaveGuidance = readRepoText(
      'docs',
      'requirements',
      'copilot-web-issue-generation-prompt.md'
    );
    const srs = readRepoText('docs', 'requirements', 'srs.md');
    const rtmRows = parseCsv(readRepoText('docs', 'requirements', 'rtm.csv'));
    const requirementRow = rtmRows.find((row) => row.ReqID === 'VHS-REQ-601');

    expect(template).toContain('name: Requirement Target');
    expect(template).toContain('copilot-target');
    expect(template).toContain('id: requirement_id');
    expect(template).toContain('label: Target Requirement ID');
    expect(template).toContain('id: problem_statement');
    expect(template).toContain('id: files_to_inspect');
    expect(template).toContain('id: acceptance_criteria');
    expect(template).toContain('id: required_tests');
    expect(template).toContain('id: validation_commands');
    expect(template).toContain('id: out_of_scope');
    expect(template).toContain('Update implementation, tests, SRS, and RTM');
    expect(requirementsReadme).toContain('Requirement Target');
    expect(requirementsReadme).toContain('validation commands');
    expect(requirementsReadme).toContain('Copilot Web issue-generation guidance');
    expect(issueWaveGuidance).toContain('Requirements-First, RTM-First Flow');
    expect(issueWaveGuidance).toContain('Requirement-Gap Wave Flow');
    expect(issueWaveGuidance).toContain('Local Evidence And Validation');
    expect(issueWaveGuidance).toContain('Fail Closed If Missing');
    expect(issueWaveGuidance).toContain('repo-standards-review');
    expect(issueWaveGuidance).toContain('C:\\Users\\sveld\\.codex\\skills\\repo-standards-review\\SKILL.md');
    expect(issueWaveGuidance).toContain('preflight_local_dependencies.py --json');
    expect(issueWaveGuidance).toContain('--requirements-spec-scope system --json');
    expect(issueWaveGuidance).toContain('target `VHS-REQ-601`');
    expect(issueWaveGuidance).toContain('current requirement');
    expect(issueWaveGuidance).toContain('gaps');
    expect(issueWaveGuidance).toContain('proposed new IDs');
    expect(issueWaveGuidance).toContain('maintainer-local checks');
    expect(issueWaveGuidance).toContain('Do not make a Copilot Web issue fail solely');
    expect(issueWaveGuidance).toContain('Missing required label on the template (`copilot-target`).');
    expect(issueWaveGuidance).toContain('Missing required issue-template fields');
    expect(issueWaveGuidance).toContain('Duplicate requirement-targeted issues');
    expect(issueWaveGuidance).toContain('Requirement-gap waves that do not name source evidence');
    expect(issueWaveGuidance).toContain('Unresolved placeholders');
    expect(issueWaveGuidance).toContain('Untestable acceptance criteria');
    expect(issueWaveGuidance).toContain('No release/version/publish tasks');
    expect(issueWaveGuidance).toContain('No credentials, tokens, secrets, or admin-setting changes');
    expect(srs).toContain('GitHub issue templates support requirement-targeted agent work.');
    expect(srs).toContain('A committed requirement-wave guide defines requirement-first, RTM-first');
    expect(srs).toContain('requirement-gap lane for bounded field');
    expect(srs).toContain('repo-local commands required for');
    expect(requirementRow?.ImplementationRefs).toContain(
      '.github/ISSUE_TEMPLATE/requirement_target.yml'
    );
    expect(requirementRow?.ImplementationRefs).toContain(
      'docs/requirements/copilot-web-issue-generation-prompt.md'
    );
  });

  it('keeps large-repository indexing requirement wave traceable', () => {
    const syrs = readRepoText('docs', 'requirements', 'syrs.md');
    const srs = readRepoText('docs', 'requirements', 'srs.md');
    const rtmRows = parseCsv(readRepoText('docs', 'requirements', 'rtm.csv'));
    const idIndexRows = parseCsv(readRepoText('docs', 'requirements', 'id-index.csv'));
    const rowsById = new Map(rtmRows.map((row) => [row.ReqID, row]));
    const indexById = new Map(idIndexRows.map((row) => [row.ID, row]));

    for (const id of ['VHS-REQ-603', 'VHS-REQ-604', 'VHS-REQ-605', 'VHS-REQ-606', 'VHS-REQ-607']) {
      expect(rowsById.get(id)?.Status, `${id} RTM status`).toBe('Active');
      expect(indexById.get(id)?.Status, `${id} index status`).toBe('Active');
      expect(indexById.get(id)?.CurrentAnchor, `${id} anchor`).toMatch(/^srs\.md#/);
    }
    expect(indexById.get('VHS-SYS-REQ-015')?.Status).toBe('Active');
    expect(indexById.get('VHS-SYS-REQ-015')?.CurrentAnchor).toBe(
      'syrs.md#vhs-sys-req-015-large-repository-branch-switch-responsiveness'
    );

    expect(syrs).toContain('### VHS-SYS-REQ-015: Large Repository Branch-Switch Responsiveness');
    expect(syrs).toContain('file-level Git object eligibility evidence');
    expect(syrs).toContain('not the cache identity for unchanged clean file blobs');

    expect(srs).toContain('### VHS-REQ-603: Large-Repository Indexing Operating Model');
    expect(srs).toContain('without wall-clock performance');
    expect(srs).toContain('tracked, reused, evaluated, removed, skipped');
    expect(srs).toContain('unchanged clean');
    expect(srs).toContain('LabVIEWCLI or comparison-runtime validation failures are treated as separate');

    expect(srs).toContain('### VHS-REQ-604: Persistent Git-Object Eligibility Cache');
    expect(srs).toContain('VS Code extension storage');
    expect(srs).toContain('not through files written into the workspace or repository');
    expect(srs).toContain('tracked Git blob object ID');
    expect(srs).toContain('recorded history proof');
    expect(srs).toContain('Stale, missing, incompatible, or corrupt cache data fails closed');

    expect(srs).toContain('### VHS-REQ-605: Incremental Refresh And Invalidation Lifecycle');
    expect(srs).toContain('Branch or HEAD changes');
    expect(srs).toContain('Clean tracked files with matching repository identity');
    expect(srs).toContain('dirty, staged, unmerged');
    expect(srs).toContain('counted as');
    expect(srs).toContain('Cancellation preserves the last valid eligibility snapshot');

    expect(srs).toContain('### VHS-REQ-606: Indexing Diagnostics And Evidence');
    expect(srs).toContain('User-visible status distinguishes cold scan');
    expect(srs).toContain('removed, skipped, failed');
    expect(srs).toContain('Diagnostics identify the refresh reason');
    expect(srs).toContain('VHS-REQ-155');

    expect(srs).toContain('### VHS-REQ-607: Field Intake Separation For Indexing Reports');
    expect(srs).toContain('collect indexing evidence separately from');
    expect(srs).toContain('runtime validation output so maintainers can route');
    expect(srs).toContain('Indexing reports can be submitted without requiring LabVIEWCLI');

    expect(rowsById.get('VHS-REQ-603')?.VerificationRefs).toContain(
      'manual:large-repo-indexing-evidence-review'
    );
    for (const id of ['VHS-REQ-603', 'VHS-REQ-604', 'VHS-REQ-605', 'VHS-REQ-606']) {
      expect(rowsById.get(id)?.ParentID, `${id} parent`).toBe('VHS-SYS-REQ-015');
    }
    expect(rowsById.get('VHS-REQ-604')?.ImplementationRefs).toContain('src/extension.ts');
    expect(rowsById.get('VHS-REQ-604')?.ImplementationRefs).toContain('src/git/gitCli.ts');
    expect(rowsById.get('VHS-REQ-607')?.ImplementationRefs).toContain(
      '.github/ISSUE_TEMPLATE/bug_report.yml'
    );
  });

  it('keeps indexing intake separated from runtime validation output', () => {
    const bugTemplate = readRepoText('.github', 'ISSUE_TEMPLATE', 'bug_report.yml');
    const onboardingTemplate = readRepoText(
      '.github',
      'ISSUE_TEMPLATE',
      'first_time_onboarding_feedback.yml'
    );

    for (const template of [bugTemplate, onboardingTemplate]) {
      expect(template).toContain('id: affected_surface');
      expect(template).toContain('VI history indexing or cache');
      expect(template).toContain('Compare/runtime validation');
      expect(template).toContain('id: indexing_evidence');
      expect(template).toContain('repository scale');
      expect(template).toContain('restart behavior');
      expect(template).toContain('branch-switch behavior');
      expect(template).toContain('any indexing diagnostics');
      expect(template).toContain('id: runtime_validation_output');
      expect(template).toContain('separately from indexing evidence');
      expect(template).toContain('Do not include secrets');
      expect(template).toContain('Leave blank for indexing-only');
    }
  });

  it('keeps traceability steward inventory traceable for VHS-REQ-601', () => {
    const readme = readRepoText('docs', 'requirements', 'README.md');
    const rtmRows = parseCsv(readRepoText('docs', 'requirements', 'rtm.csv'));
    const inventoryRows = parseCsv(readRepoText('docs', 'requirements', 'traceability-inventory.csv'));
    const inventoryByPath = new Map(inventoryRows.map((row) => [row.Path, row]));
    const requirementRow = rtmRows.find((row) => row.ReqID === 'VHS-REQ-601');

    expect(readme).toContain('traceability-inventory.csv');
    expect(readme).toContain('traceability:audit');
    expect(readme).toContain('Classification Categories');
    expect(readme).toContain('mapped');
    expect(readme).toContain('supporting');
    expect(readme).toContain('dev-only');
    expect(readme).toContain('release-ci');
    expect(readme).toContain('asset-doc');
    expect(readme).toContain('gap');
    expect(readme).toContain('Agent Response');
    expect(requirementRow?.ImplementationRefs).toContain(
      'docs/requirements/traceability-inventory.csv'
    );
    expect(requirementRow?.ImplementationRefs).toContain(
      'scripts/auditTraceabilitySteward.js'
    );
    expect(requirementRow?.VerificationRefs).toContain(
      'tests/unit/traceabilityAuditScript.test.ts'
    );

    const bundledDocumentationGapPaths = [
      'src/docs/bundledDocumentation.ts',
      'src/docs/bundledDocumentationAction.ts'
    ];
    for (const filePath of bundledDocumentationGapPaths) {
      const row = inventoryByPath.get(filePath);
      expect(row?.Classification).toBe('gap');
      expect(row?.Notes).toContain('requirement coverage gap');
    }

    const bundledDocumentationAssetPaths = [
      'resources/bundled-docs/manifest.json',
      'resources/bundled-docs/pages/overview.html',
      'resources/bundled-docs/pages/user-workflow.html',
      'resources/bundled-docs/pages/install-and-release.html',
      'resources/bundled-docs/pages/comparison-reports-and-dashboard-review.html'
    ];
    for (const filePath of bundledDocumentationAssetPaths) {
      const row = inventoryByPath.get(filePath);
      expect(row?.Classification).toBe('asset-doc');
      expect(row?.RtmCoverage).toBe('No');
    }

    const bundledDocumentationTests = [
      'tests/unit/bundledDocumentation.test.ts',
      'tests/unit/bundledDocumentationAction.test.ts'
    ];
    for (const filePath of bundledDocumentationTests) {
      const row = inventoryByPath.get(filePath);
      expect(row?.Classification).toBe('supporting');
      expect(row?.Notes).toContain('Unit verification coverage');
    }

    for (const filePath of [
      '.github/ISSUE_TEMPLATE/config.yml',
      '.github/ISSUE_TEMPLATE/feature_request.yml'
    ]) {
      const row = inventoryByPath.get(filePath);
      expect(row?.Classification).toBe('asset-doc');
      expect(row?.RtmCoverage).toBe('No');
    }

    // VHS-REQ-601: Review/scenario/support-policy files classified as supporting
    const reviewScenarioSupportingPaths = [
      'src/review/humanReviewSubmission.ts',
      'src/review/humanReviewSubmissionAction.ts',
      'src/scenarios/decisionRecord.ts',
      'src/scenarios/reviewDecisionRecordAction.ts',
      'src/scenarios/reviewScenarioRegistry.ts',
      'src/support/repositorySupportPolicy.ts'
    ];
    for (const filePath of reviewScenarioSupportingPaths) {
      const row = inventoryByPath.get(filePath);
      expect(row?.Classification, `${filePath} classification`).toBe('supporting');
      expect(row?.RtmCoverage, `${filePath} RTM coverage`).toBe('No');
      expect(row?.Notes, `${filePath} notes`).toContain('VHS-REQ-610');
    }

    // Git API wrapper and tests classified as supporting
    const gitApiSupportingPaths = [
      'src/git/gitApi.ts',
      'tests/unit/gitApi.test.ts'
    ];
    for (const filePath of gitApiSupportingPaths) {
      const row = inventoryByPath.get(filePath);
      expect(row?.Classification, `${filePath} classification`).toBe('supporting');
      expect(row?.RtmCoverage, `${filePath} RTM coverage`).toBe('No');
      expect(row?.Notes, `${filePath} notes`).toContain('VHS-REQ-061');
    }
  });
});

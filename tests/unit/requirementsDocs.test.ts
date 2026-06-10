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

function toPosixPath(value: string): string {
  return value.replace(/\\/g, '/');
}

function extractFrontmatter(text: string): string {
  const match = text.match(/^---\n([\s\S]*?)\n---\n/);
  return match?.[1] ?? '';
}

function extractFrontmatterScalar(text: string, key: string): string | undefined {
  const frontmatter = extractFrontmatter(text);
  const match = frontmatter.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'));
  if (!match) {
    return undefined;
  }

  return match[1].trim().replace(/^['"]|['"]$/g, '');
}

function extractFrontmatterArray(text: string, key: string): string[] {
  const frontmatter = extractFrontmatter(text);
  const match = frontmatter.match(new RegExp(`^${key}:\\s*\\[(.+)\\]$`, 'm'));
  if (!match) {
    return [];
  }

  return match[1]
    .split(',')
    .map((value) => value.trim().replace(/^['"]|['"]$/g, ''))
    .filter((value) => value.length > 0);
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
      /gitlab\.com\/svelderrainruiz\/vi-history-suite/i,
      /GitLab authority/i,
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

  it('keeps lightweight hosted CI traceability and docs link gating documented', () => {
    const syrs = readRepoText('docs', 'requirements', 'syrs.md');
    const srs = readRepoText('docs', 'requirements', 'srs.md');
    const testPlan = readRepoText('docs', 'testing', 'test-plan.md');
    const workflowTest = readRepoText('tests', 'unit', 'branchGovernanceWorkflow.test.ts');
    const vitestConfig = readRepoText('vitest.config.ts');
    const packageJson = JSON.parse(readRepoText('package.json')) as {
      scripts: Record<string, string>;
    };
    const rtmRows = parseCsv(readRepoText('docs', 'requirements', 'rtm.csv'));
    const inventoryRows = parseCsv(readRepoText('docs', 'requirements', 'traceability-inventory.csv'));
    const requirementRow = rtmRows.find((row) => row.ReqID === 'VHS-REQ-597');
    const vitestInventoryRow = inventoryRows.find((row) => row.Path === 'vitest.config.ts');
    const docsLinksInventoryRow = inventoryRows.find(
      (row) => row.Path === 'scripts/checkDocsLinks.js'
    );
    const docsLinksTestInventoryRow = inventoryRows.find(
      (row) => row.Path === 'tests/unit/docsLinkCheckScript.test.ts'
    );
    const ciWorkflowInventoryRow = inventoryRows.find(
      (row) => row.Path === '.github/workflows/ci.yml'
    );

    expect(syrs).toContain('`npm run traceability:audit`');
    expect(syrs).toContain('`npm run docs:links`');
    expect(syrs).toContain('lychee-named documentation link-check step');
    expect(syrs).toContain('machine-readable coverage evidence');
    expect(syrs).toContain('coverage artifact and baseline threshold policy');
    expect(srs).toContain('### VHS-REQ-597: Lightweight Hosted CI');
    expect(srs).toContain('typecheck, traceability audit, documentation link check');
    expect(srs).toContain('The workflow runs `npm run traceability:audit`.');
    expect(srs).toContain('The workflow runs `npm run docs:links`');
    expect(srs).toContain('Docs Link Check /');
    expect(srs).toContain('The workflow runs `npm run dod:gate` through the `DoD Gate /');
    expect(srs).toContain('coverage/cobertura-coverage.xml');
    expect(srs).toContain('coverage/coverage-summary.json');
    expect(srs).toContain('baseline global coverage thresholds declared in');
    expect(srs).toContain('71% statements, 60% branches, 78% functions');
    expect(syrs).toContain('post-wave hosted floors are 71% statements');
    expect(testPlan).toContain('npm run traceability:audit');
    expect(testPlan).toContain('npm run docs:links');
    expect(testPlan).toContain('npm run dod:gate');
    expect(testPlan).toContain(
      'implementation, test, workflow, and documentation surfaces remain classified'
    );
    expect(testPlan).toContain('customization-audit-report.json');
    expect(testPlan).toContain('Customization Audit Report / custom-audit');
    expect(testPlan).toContain('traceability-audit-report.txt');
    expect(testPlan).toContain('dod-gate-report.txt');
    expect(testPlan).toContain('Governance Gate Reports / governance-gates');
    expect(testPlan).toContain('AGENTS sync drift');
    expect(testPlan).toContain('command-reference drift');
    expect(testPlan).toContain('Docs Link Check / lychee');
    expect(testPlan).toContain('committed Markdown and bundled documentation');
    expect(testPlan).toContain('PR Coverage Gate / coverage');
    expect(testPlan).toContain('coverage/cobertura-coverage.xml');
    expect(testPlan).toContain('coverage/coverage-summary.json');
    expect(testPlan).toContain('71% statements');
    expect(testPlan).toContain('60% branches');
    expect(testPlan).toContain('78% functions');
    expect(testPlan).toContain('71% lines');
    expect(testPlan).toContain('74.0% statements, 62.72% branches');
    expect(testPlan).toContain('Coverage Traceability Map');
    expect(testPlan).toContain('npm run coverage:map');
    expect(testPlan).toContain('| VHS-REQ-016 | TEST-016 | src/commands/openViHistoryCommand.ts');
    expect(testPlan).toContain('| VHS-REQ-017 | TEST-017 | src/services/viHistoryModel.ts');
    expect(testPlan).toContain('| VHS-REQ-039 | TEST-039 | src/commands/openViHistoryCommand.ts');
    expect(testPlan).toContain('| VHS-REQ-133 | TEST-133 | src/ui/historyPanel.ts');
    expect(testPlan).toContain('| VHS-REQ-147 | TEST-147 | src/reporting/comparisonReportRuntimeExecution.ts');
    expect(testPlan).toContain('| VHS-REQ-148 | TEST-148 | src/reporting/comparisonReportRuntimeExecution.ts');
    expect(testPlan).toContain('| VHS-REQ-155 | TEST-155 | src/reporting/comparisonRuntimeLocator.ts');
    expect(testPlan).toContain('| VHS-REQ-635 | TEST-635 | src/commands/openViHistoryCommand.ts');
    expect(testPlan).toContain('avoids repository-wide VI indexing as a prerequisite');
    expect(testPlan).toContain('| VHS-REQ-610 | TEST-610 | src/dashboard/comparisonReportArchive.ts');
    expect(testPlan).toContain('src/dashboard/multiReportDashboard.ts; src/dashboard/multiReportDashboardAction.ts');
    expect(testPlan).toContain('tests/unit/multiReportDashboard.test.ts; tests/unit/multiReportDashboardAction.test.ts');
    expect(testPlan).toContain('tests/unit/retainedDashboardEvidence.test.ts');
    expect(testPlan).toContain('review submission boundaries, decision records, scenario contracts');
    expect(testPlan).toContain('| VHS-REQ-611 | TEST-611 | src/docs/bundledDocumentation.ts');
    expect(testPlan).toContain('| VHS-REQ-612 | TEST-612 | src/tooling/localRuntimeSettingsCli.ts');
    expect(testPlan).toContain('tests/unit/localRuntimeSettingsCli.test.ts');
    expect(testPlan).toContain('argument parsing, launcher materialization');
    expect(testPlan).toContain('missing global-storage handling');
    expect(testPlan).toContain('| VHS-REQ-613 | TEST-613 | scripts/mapCoverageToTraceability.js');
    expect(testPlan).toContain('| VHS-REQ-614 | TEST-614 | tests/unit/vscodeTestHarness.ts');
    expect(testPlan).toContain(
      '| VHS-REQ-615 | TEST-615 | package.json; .github/workflows/ci.yml; .github/workflows/marketplace-release.yml'
    );
    expect(workflowTest).toContain('keeps the traceability audit in the required hosted gate');
    expect(workflowTest).toContain('keeps the customization audit in the required hosted gate');
    expect(workflowTest).toContain(
      'uploads machine-readable customization audit evidence in the hosted gate'
    );
    expect(workflowTest).toContain('uploads traceability and DoD gate reports for governance triage');
    expect(workflowTest).toContain('keeps the docs link-check lychee gate');
    expect(workflowTest).toContain('retains machine-readable coverage evidence');
    expect(workflowTest).toContain('keeps the hosted DoD gate in the required CI workflow');
    expect(packageJson.scripts['customization:audit']).toBe(
      'node scripts/auditCustomizationGovernance.js'
    );
    expect(packageJson.scripts['docs:links']).toBe('node scripts/checkDocsLinks.js');
    expect(vitestConfig).toContain('statements: 71');
    expect(vitestConfig).toContain('branches: 60');
    expect(vitestConfig).toContain('functions: 78');
    expect(vitestConfig).toContain('lines: 71');
    expect(vitestConfig).toContain('scripts/mapCoverageToTraceability.js');
    expect(requirementRow?.ImplementationRefs).toContain('.github/workflows/ci.yml');
    expect(requirementRow?.ImplementationRefs).toContain('docs/testing/test-plan.md');
    expect(requirementRow?.ImplementationRefs).toContain('scripts/checkDocsLinks.js');
    expect(requirementRow?.ImplementationRefs).toContain('vitest.config.ts');
    expect(requirementRow?.Notes).toContain('DoD Gate / dod');
    expect(requirementRow?.VerificationRefs).toContain(
      'tests/unit/branchGovernanceWorkflow.test.ts'
    );
    expect(requirementRow?.VerificationRefs).toContain('tests/unit/docsLinkCheckScript.test.ts');
    expect(requirementRow?.VerificationRefs).toContain('tests/unit/requirementsDocs.test.ts');
    expect(vitestInventoryRow?.Classification).toBe('mapped');
    expect(vitestInventoryRow?.RtmCoverage).toBe('Yes');
    expect(vitestInventoryRow?.Notes).toContain('VHS-REQ-597');
    expect(vitestInventoryRow?.Notes).toContain('VHS-REQ-613');
    expect(docsLinksInventoryRow?.Classification).toBe('mapped');
    expect(docsLinksInventoryRow?.RtmCoverage).toBe('Yes');
    expect(docsLinksInventoryRow?.Notes).toContain('VHS-REQ-597');
    expect(docsLinksTestInventoryRow?.Classification).toBe('mapped');
    expect(docsLinksTestInventoryRow?.RtmCoverage).toBe('Yes');
    expect(docsLinksTestInventoryRow?.Notes).toContain('VHS-REQ-597');
    expect(ciWorkflowInventoryRow?.Classification).toBe('release-ci');
    expect(ciWorkflowInventoryRow?.RtmCoverage).toBe('Yes');
    expect(ciWorkflowInventoryRow?.Notes).toContain('VHS-REQ-597');
    expect(ciWorkflowInventoryRow?.Notes).toContain('VHS-REQ-615');
  });

  it('keeps coverage intelligence traceable for VHS-REQ-613', () => {
    const syrs = readRepoText('docs', 'requirements', 'syrs.md');
    const srs = readRepoText('docs', 'requirements', 'srs.md');
    const testPlan = readRepoText('docs', 'testing', 'test-plan.md');
    const packageJson = JSON.parse(readRepoText('package.json')) as {
      scripts: Record<string, string>;
    };
    const rtmRows = parseCsv(readRepoText('docs', 'requirements', 'rtm.csv'));
    const idIndexRows = parseCsv(readRepoText('docs', 'requirements', 'id-index.csv'));
    const inventoryRows = parseCsv(readRepoText('docs', 'requirements', 'traceability-inventory.csv'));
    const requirementRow = rtmRows.find((row) => row.ReqID === 'VHS-REQ-613');
    const softwareIndexRow = idIndexRows.find((row) => row.ID === 'VHS-REQ-613');
    const systemIndexRow = idIndexRows.find((row) => row.ID === 'VHS-SYS-REQ-017');
    const coverageScriptRow = inventoryRows.find(
      (row) => row.Path === 'scripts/mapCoverageToTraceability.js'
    );
    const coverageTestRow = inventoryRows.find(
      (row) => row.Path === 'tests/unit/coverageMapScript.test.ts'
    );

    expect(syrs).toContain('### VHS-SYS-REQ-017: Coverage-Led Assurance Operating Model');
    expect(syrs).toContain('low-coverage requirement-mapped files');
    expect(srs).toContain('### VHS-REQ-613: Coverage Intelligence And Test-Risk Mapping');
    expect(srs).toContain('`npm run coverage:map` reads `coverage/coverage-summary.json`');
    expect(srs).toContain('requirement-mapped files below 50% coverage');
    expect(testPlan).toContain('Coverage Traceability Map');
    expect(testPlan).toContain('zero-coverage supporting files tied to active');
    expect(testPlan).toContain('requirements so coverage-led assurance work starts');
    expect(packageJson.scripts['coverage:map']).toBe('node scripts/mapCoverageToTraceability.js');
    expect(requirementRow?.ParentID).toBe('VHS-SYS-REQ-017');
    expect(requirementRow?.ImplementationRefs).toContain('scripts/mapCoverageToTraceability.js');
    expect(requirementRow?.ImplementationRefs).toContain('vitest.config.ts');
    expect(requirementRow?.VerificationRefs).toContain('tests/unit/coverageMapScript.test.ts');
    expect(requirementRow?.VerificationRefs).toContain('tests/unit/requirementsDocs.test.ts');
    expect(softwareIndexRow?.CurrentAnchor).toBe(
      'srs.md#vhs-req-613-coverage-intelligence-and-test-risk-mapping'
    );
    expect(systemIndexRow?.CurrentAnchor).toBe(
      'syrs.md#vhs-sys-req-017-coverage-led-assurance-operating-model'
    );
    expect(coverageScriptRow?.Classification).toBe('mapped');
    expect(coverageScriptRow?.RtmCoverage).toBe('Yes');
    expect(coverageScriptRow?.Notes).toContain('VHS-REQ-613');
    expect(coverageTestRow?.Classification).toBe('mapped');
    expect(coverageTestRow?.RtmCoverage).toBe('Yes');
    expect(coverageTestRow?.Notes).toContain('VHS-REQ-613');
  });

  it('keeps VS Code test harness architecture traceable for VHS-REQ-614', () => {
    const srs = readRepoText('docs', 'requirements', 'srs.md');
    const testPlan = readRepoText('docs', 'testing', 'test-plan.md');
    const rtmRows = parseCsv(readRepoText('docs', 'requirements', 'rtm.csv'));
    const idIndexRows = parseCsv(readRepoText('docs', 'requirements', 'id-index.csv'));
    const inventoryRows = parseCsv(readRepoText('docs', 'requirements', 'traceability-inventory.csv'));
    const requirementRow = rtmRows.find((row) => row.ReqID === 'VHS-REQ-614');
    const indexRow = idIndexRows.find((row) => row.ID === 'VHS-REQ-614');
    const harnessRow = inventoryRows.find((row) => row.Path === 'tests/unit/vscodeTestHarness.ts');
    const harnessTestRow = inventoryRows.find(
      (row) => row.Path === 'tests/unit/vscodeTestHarness.test.ts'
    );

    expect(srs).toContain(
      '### VHS-REQ-614: Test Harness Architecture For VS Code Orchestration'
    );
    expect(srs).toContain('commands, webviews, workspace storage, filesystem, clipboard');
    expect(srs).toContain('Runtime behavior, command IDs, persisted formats');
    expect(testPlan).toContain('| VHS-REQ-614 | TEST-614 | tests/unit/vscodeTestHarness.ts');
    expect(requirementRow?.ParentID).toBe('VHS-SYS-REQ-017');
    expect(requirementRow?.ImplementationRefs).toContain('tests/unit/vscodeTestHarness.ts');
    expect(requirementRow?.VerificationRefs).toContain('tests/unit/vscodeTestHarness.test.ts');
    expect(requirementRow?.VerificationRefs).toContain('tests/unit/requirementsDocs.test.ts');
    expect(indexRow?.CurrentAnchor).toBe(
      'srs.md#vhs-req-614-test-harness-architecture-for-vs-code-orchestration'
    );
    expect(harnessRow?.Classification).toBe('mapped');
    expect(harnessRow?.RtmCoverage).toBe('Yes');
    expect(harnessRow?.Notes).toContain('VHS-REQ-614');
    expect(harnessTestRow?.Classification).toBe('mapped');
    expect(harnessTestRow?.RtmCoverage).toBe('Yes');
    expect(harnessTestRow?.Notes).toContain('VHS-REQ-614');
  });

  it('keeps Definition-of-Done operating requirement traceable for VHS-REQ-615', () => {
    const readme = readRepoText('docs', 'requirements', 'README.md');
    const maintainerOperations = readRepoText('docs', 'maintainer-operations.md');
    const srs = readRepoText('docs', 'requirements', 'srs.md');
    const testPlan = readRepoText('docs', 'testing', 'test-plan.md');
    const troubleshooting = readRepoText('TROUBLESHOOTING.md');
    const packageJson = JSON.parse(readRepoText('package.json')) as {
      scripts: Record<string, string>;
    };
    const rtmRows = parseCsv(readRepoText('docs', 'requirements', 'rtm.csv'));
    const idIndexRows = parseCsv(readRepoText('docs', 'requirements', 'id-index.csv'));
    const inventoryRows = parseCsv(readRepoText('docs', 'requirements', 'traceability-inventory.csv'));
    const requirementRow = rtmRows.find((row) => row.ReqID === 'VHS-REQ-615');
    const indexRow = idIndexRows.find((row) => row.ID === 'VHS-REQ-615');
    const ciWorkflowRow = inventoryRows.find((row) => row.Path === '.github/workflows/ci.yml');
    const marketplaceWorkflowRow = inventoryRows.find(
      (row) => row.Path === '.github/workflows/marketplace-release.yml'
    );
    const checkerRow = inventoryRows.find((row) => row.Path === 'scripts/checkDefinitionOfDone.js');
    const customizationAuditRow = inventoryRows.find(
      (row) => row.Path === 'scripts/auditCustomizationGovernance.js'
    );
    const closeoutRow = inventoryRows.find((row) => row.Path === 'scripts/generateCloseoutEvidence.js');
    const marketplaceListingRow = inventoryRows.find(
      (row) => row.Path === 'scripts/verifyMarketplaceListing.js'
    );
    const maintainerOpsRow = inventoryRows.find((row) => row.Path === 'docs/maintainer-operations.md');
    const checkerTestRow = inventoryRows.find(
      (row) => row.Path === 'tests/unit/definitionOfDoneGate.test.ts'
    );
    const customizationAuditTestRow = inventoryRows.find(
      (row) => row.Path === 'tests/unit/customizationGovernanceAuditScript.test.ts'
    );

    expect(srs).toContain('### VHS-REQ-615: Definition-of-Done Operating Requirement');
    expect(srs).toContain('issue quality, PR evidence, hosted CI, local validation');
    expect(srs).toContain('standards provenance, closeout evidence, and traceability drift prevention');
    expect(srs).toContain('requirement/RTM update expectations');
    expect(srs).toContain('lightweight contract that includes linked issue, target');
    expect(srs).toContain('traceability/RTM impact, out-of-scope');
    expect(srs).toContain('closeout readiness');
    expect(srs).toContain('optional bounded');
    expect(srs).toContain('Copilot prompt');
    expect(srs).toContain('Release-readiness evidence remains decision-complete');
    expect(srs).toContain('docs link check');
    expect(srs).toContain('Marketplace listing evidence');
    expect(srs).toContain('The repo-native `npm run dod:gate` command verifies the DoD contract');
    expect(srs).toContain('Hosted CI includes `DoD Gate / dod` running `npm run dod:gate`');
    expect(srs).toContain('`scripts/generateCloseoutEvidence.js`');
    expect(srs).toContain('`.github/workflows/ci.yml`');
    expect(testPlan).toContain(
      '| VHS-REQ-615 | TEST-615 | package.json; .github/workflows/ci.yml; .github/workflows/marketplace-release.yml'
    );
    expect(testPlan).toContain('scripts/checkDefinitionOfDone.js; scripts/auditCustomizationGovernance.js');
    expect(testPlan).toContain('scripts/verifyMarketplaceListing.js; .github/pull_request_template.md');
    expect(testPlan).toContain('docs/maintainer-operations.md; docs/requirements/srs.md');
    expect(testPlan).toContain('.github/pull_request_template.md; docs/maintainer-operations.md');
    expect(testPlan).toContain('docs/requirements/traceability-inventory.csv');
    expect(testPlan).toContain('lightweight evidence surface');
    expect(testPlan).toContain('target requirement');
    expect(testPlan).toContain('validation commands');
    expect(testPlan).toContain('traceability/RTM impact');
    expect(testPlan).toContain('out-of-scope statement');
    expect(testPlan).toContain('closeout readiness');
    expect(testPlan).toContain('closeout-summary.json');
    expect(testPlan).toContain('bounded timeout windows and');
    expect(testPlan).toContain('one transient-network retry');
    expect(testPlan).toContain('non-retryable');
    expect(testPlan).toContain('hosted `DoD Gate / dod` enforcement in `.github/workflows/ci.yml`');
    expect(testPlan).toContain('release-evidence/release-evidence-contract.json');
    expect(maintainerOperations).toContain('## Non-Interactive Closeout Authentication');
    expect(maintainerOperations).toContain('GIT_ASKPASS');
    expect(maintainerOperations).toContain('docker login registry.gitlab.com');
    expect(maintainerOperations).toContain('credential-helper');
    expect(troubleshooting).toContain('## Closeout Evidence Registry Access Fails');
    expect(troubleshooting).toContain('error getting credentials');
    expect(troubleshooting).toContain('manifest unknown');
    expect(readme).toContain('New software requirements start at `VHS-REQ-623`.');
    expect(packageJson.scripts['dod:gate']).toBe('node scripts/checkDefinitionOfDone.js');
    expect(requirementRow?.ParentID).toBe('VHS-SYS-REQ-012');
    expect(requirementRow?.ImplementationRefs).toContain('package.json');
    expect(requirementRow?.ImplementationRefs).toContain('.github/workflows/ci.yml');
    expect(requirementRow?.ImplementationRefs).toContain('.github/workflows/marketplace-release.yml');
    expect(requirementRow?.ImplementationRefs).toContain('scripts/checkDefinitionOfDone.js');
    expect(requirementRow?.ImplementationRefs).toContain('scripts/auditCustomizationGovernance.js');
    expect(requirementRow?.ImplementationRefs).toContain('scripts/generateCloseoutEvidence.js');
    expect(requirementRow?.ImplementationRefs).toContain('scripts/verifyMarketplaceListing.js');
    expect(requirementRow?.ImplementationRefs).toContain('.github/pull_request_template.md');
    expect(requirementRow?.ImplementationRefs).toContain('docs/maintainer-operations.md');
    expect(requirementRow?.ImplementationRefs).toContain('docs/requirements/srs.md');
    expect(requirementRow?.ImplementationRefs).toContain('docs/requirements/id-index.csv');
    expect(requirementRow?.ImplementationRefs).toContain('docs/testing/test-plan.md');
    expect(requirementRow?.ImplementationRefs).toContain('docs/requirements/traceability-inventory.csv');
    expect(requirementRow?.VerificationRefs).toContain('tests/unit/definitionOfDoneGate.test.ts');
    expect(requirementRow?.VerificationRefs).toContain(
      'tests/unit/customizationGovernanceAuditScript.test.ts'
    );
    expect(requirementRow?.VerificationRefs).toContain('tests/unit/requirementsDocs.test.ts');
    expect(requirementRow?.VerificationRefs).toContain('tests/unit/traceabilityAuditScript.test.ts');
    expect(requirementRow?.VerificationRefs).toContain(
      'manual:definition-of-done-release-readiness-review'
    );
    expect(indexRow?.CurrentAnchor).toBe(
      'srs.md#vhs-req-615-definition-of-done-operating-requirement'
    );
    expect(checkerRow?.Classification).toBe('mapped');
    expect(checkerRow?.RtmCoverage).toBe('Yes');
    expect(checkerRow?.Notes).toContain('VHS-REQ-615');
    expect(customizationAuditRow?.Classification).toBe('mapped');
    expect(customizationAuditRow?.RtmCoverage).toBe('Yes');
    expect(customizationAuditRow?.Notes).toContain('VHS-REQ-615');
    expect(ciWorkflowRow?.Classification).toBe('release-ci');
    expect(ciWorkflowRow?.RtmCoverage).toBe('Yes');
    expect(ciWorkflowRow?.Notes).toContain('VHS-REQ-615');
    expect(marketplaceWorkflowRow?.Classification).toBe('release-ci');
    expect(marketplaceWorkflowRow?.RtmCoverage).toBe('Yes');
    expect(marketplaceWorkflowRow?.Notes).toContain('VHS-REQ-615');
    expect(closeoutRow?.Classification).toBe('mapped');
    expect(closeoutRow?.RtmCoverage).toBe('Yes');
    expect(closeoutRow?.Notes).toContain('VHS-REQ-615');
    expect(marketplaceListingRow?.Classification).toBe('mapped');
    expect(marketplaceListingRow?.RtmCoverage).toBe('Yes');
    expect(marketplaceListingRow?.Notes).toContain('VHS-REQ-615');
    expect(maintainerOpsRow?.Classification).toBe('asset-doc');
    expect(maintainerOpsRow?.RtmCoverage).toBe('Yes');
    expect(maintainerOpsRow?.Notes).toContain('VHS-REQ-615');
    const prTemplateRow = inventoryRows.find((row) => row.Path === '.github/pull_request_template.md');
    expect(prTemplateRow?.Classification).toBe('mapped');
    expect(prTemplateRow?.RtmCoverage).toBe('Yes');
    expect(prTemplateRow?.Notes).toContain('VHS-REQ-615');
    expect(checkerTestRow?.Classification).toBe('mapped');
    expect(checkerTestRow?.RtmCoverage).toBe('Yes');
    expect(checkerTestRow?.Notes).toContain('VHS-REQ-615');
    expect(customizationAuditTestRow?.Classification).toBe('mapped');
    expect(customizationAuditTestRow?.RtmCoverage).toBe('Yes');
    expect(customizationAuditTestRow?.Notes).toContain('VHS-REQ-615');
  });

  it('keeps command and history flow coverage mapped to existing requirements', () => {
    const rtmRows = parseCsv(readRepoText('docs', 'requirements', 'rtm.csv'));
    const inventoryRows = parseCsv(readRepoText('docs', 'requirements', 'traceability-inventory.csv'));
    const openCommandRow = inventoryRows.find(
      (row) => row.Path === 'tests/unit/openViHistoryCommand.test.ts'
    );
    const modelTestRow = inventoryRows.find(
      (row) => row.Path === 'tests/unit/viHistoryModel.test.ts'
    );

    for (const id of ['VHS-REQ-012', 'VHS-REQ-016', 'VHS-REQ-039', 'VHS-REQ-635']) {
      const row = rtmRows.find((entry) => entry.ReqID === id);
      expect(row?.ImplementationRefs, `${id} implementation`).toContain(
        'src/commands/openViHistoryCommand.ts'
      );
      expect(row?.VerificationRefs, `${id} verification`).toContain(
        'tests/unit/openViHistoryCommand.test.ts'
      );
    }

    for (const id of ['VHS-REQ-006', 'VHS-REQ-008', 'VHS-REQ-017']) {
      const row = rtmRows.find((entry) => entry.ReqID === id);
      expect(row?.ImplementationRefs, `${id} implementation`).toContain(
        'src/services/viHistoryModel.ts'
      );
      expect(row?.VerificationRefs, `${id} verification`).toContain(
        'tests/unit/viHistoryModel.test.ts'
      );
    }

    expect(openCommandRow?.Classification).toBe('mapped');
    expect(openCommandRow?.RtmCoverage).toBe('Yes');
    expect(modelTestRow?.Classification).toBe('mapped');
    expect(modelTestRow?.RtmCoverage).toBe('Yes');
    expect(modelTestRow?.Notes).toContain('VHS-REQ-006');
    expect(modelTestRow?.Notes).toContain('VHS-REQ-008');
    expect(modelTestRow?.Notes).toContain('VHS-REQ-017');
  });

  it('keeps comparison orchestration coverage mapped to active comparison requirements', () => {
    const testPlan = readRepoText('docs', 'testing', 'test-plan.md');
    const rtmRows = parseCsv(readRepoText('docs', 'requirements', 'rtm.csv'));
    const inventoryRows = parseCsv(readRepoText('docs', 'requirements', 'traceability-inventory.csv'));
    const actionTestRow = inventoryRows.find(
      (row) => row.Path === 'tests/unit/comparisonReportAction.test.ts'
    );

    for (const id of ['VHS-REQ-133', 'VHS-REQ-148', 'VHS-REQ-155']) {
      const row = rtmRows.find((entry) => entry.ReqID === id);
      expect(row?.ImplementationRefs, `${id} implementation`).toContain(
        'src/reporting/comparisonReportAction.ts'
      );
      expect(row?.VerificationRefs, `${id} verification`).toContain(
        'tests/unit/comparisonReportAction.test.ts'
      );
    }

    const stagedInputRow = rtmRows.find((entry) => entry.ReqID === 'VHS-REQ-147');
    expect(stagedInputRow?.VerificationRefs).toContain(
      'tests/unit/comparisonReportRuntimeExecution.test.ts'
    );
    expect(testPlan).toContain('TEST-133');
    expect(testPlan).toContain('TEST-147');
    expect(testPlan).toContain('TEST-148');
    expect(testPlan).toContain('TEST-155');
    expect(testPlan).toContain('stale output rejection');
    expect(testPlan).toContain('user-facing blocked-runtime summaries');
    expect(actionTestRow?.Classification).toBe('mapped');
    expect(actionTestRow?.RtmCoverage).toBe('Yes');
    expect(actionTestRow?.Notes).toContain('VHS-REQ-133');
    expect(actionTestRow?.Notes).toContain('VHS-REQ-148');
    expect(actionTestRow?.Notes).toContain('VHS-REQ-155');
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
    expect(srs).toContain('unique immutable diagnostic prerelease');
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
    expect(requirementRow?.Notes).toContain('unique immutable diagnostic prerelease');
    expect(indexRow?.CurrentAnchor).toBe(
      'srs.md#vhs-req-608-diagnostic-test-vsix-distribution'
    );
  });

  it('keeps governed branch promotion and Marketplace release automation traceable', () => {
    const syrs = readRepoText('docs', 'requirements', 'syrs.md');
    const srs = readRepoText('docs', 'requirements', 'srs.md');
    const rtmRows = parseCsv(readRepoText('docs', 'requirements', 'rtm.csv'));
    const idIndexRows = parseCsv(readRepoText('docs', 'requirements', 'id-index.csv'));
    const inventoryRows = parseCsv(readRepoText('docs', 'requirements', 'traceability-inventory.csv'));
    const inventoryByPath = new Map(inventoryRows.map((row) => [row.Path, row]));
    const requirementRow = rtmRows.find((row) => row.ReqID === 'VHS-REQ-609');
    const indexRow = idIndexRows.find((row) => row.ID === 'VHS-REQ-609');
    const systemIndexRow = idIndexRows.find((row) => row.ID === 'VHS-SYS-REQ-016');

    expect(syrs).toContain('### VHS-SYS-REQ-016: Governed Release Branch Promotion');
    expect(syrs).toContain('develop');
    expect(syrs).toContain('release/vX.Y.Z');
    expect(syrs).toContain('hotfix/vX.Y.Z');
    expect(syrs).toContain('Marketplace publication is tag-only');
    expect(syrs).toContain('Marketplace live-listing verification distinguishes bounded propagation lag');

    expect(srs).toContain(
      '### VHS-REQ-609: Governed Branch Promotion And Marketplace Release Automation'
    );
    expect(srs).toContain('marketplace-release');
    expect(srs).not.toContain('dependabot/*');
    expect(srs).toContain('reachable from `origin/main`');
    expect(srs).toContain('pinned VSCE wrapper');
    expect(srs).toContain('Marketplace listing verification retries bounded propagation lag');
    expect(srs).toContain('retained artifacts');
    expect(srs).toContain('traceability audit, docs link check, tests');

    expect(requirementRow?.ParentID).toBe('VHS-SYS-REQ-016');
    expect(requirementRow?.ImplementationRefs).toContain('.github/workflows/ci.yml');
    expect(requirementRow?.ImplementationRefs).toContain(
      '.github/workflows/marketplace-release.yml'
    );
    expect(requirementRow?.ImplementationRefs).toContain('.github/dependabot.yml');
    expect(requirementRow?.ImplementationRefs).toContain('docs/maintainer-operations.md');
    expect(requirementRow?.ImplementationRefs).toContain('scripts/verifyMarketplaceListing.js');
    expect(requirementRow?.VerificationRefs).toContain(
      'tests/unit/branchGovernanceWorkflow.test.ts'
    );
    expect(requirementRow?.VerificationRefs).toContain(
      'tests/unit/marketplaceReleaseWorkflow.test.ts'
    );
    expect(requirementRow?.VerificationRefs).toContain(
      'tests/unit/marketplaceListingVerification.test.ts'
    );
    expect(requirementRow?.VerificationRefs).toContain(
      'manual:marketplace-release-environment-setup'
    );
    expect(requirementRow?.Notes).toContain('exact-tag-only');
    expect(requirementRow?.Notes).toContain('retained evidence naming required validation surfaces');
    expect(indexRow?.CurrentAnchor).toBe(
      'srs.md#vhs-req-609-governed-branch-promotion-and-marketplace-release-automation'
    );
    expect(systemIndexRow?.CurrentAnchor).toBe(
      'syrs.md#vhs-sys-req-016-governed-release-branch-promotion'
    );
    for (const filePath of [
      'scripts/verifyMarketplaceListing.js',
      'tests/unit/marketplaceListingVerification.test.ts'
    ]) {
      const row = inventoryByPath.get(filePath);
      expect(row?.Classification, `${filePath} classification`).toBe('mapped');
      expect(row?.RtmCoverage, `${filePath} RTM coverage`).toBe('Yes');
    }
    expect(
      inventoryByPath.get('.github/workflows/marketplace-release.yml')?.Notes
    ).toContain('VHS-REQ-609');
    expect(inventoryByPath.get('scripts/verifyMarketplaceListing.js')?.Notes).toContain(
      'bounded attempt evidence'
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
    expect(requirementRow?.VerificationRefs).toContain(
      'tests/unit/comparisonReportArchive.test.ts'
    );
    expect(requirementRow?.VerificationRefs).toContain(
      'tests/unit/dashboardLatestRun.test.ts'
    );
    expect(requirementRow?.VerificationRefs).toContain(
      'tests/unit/multiReportDashboard.test.ts'
    );
    expect(requirementRow?.VerificationRefs).toContain(
      'tests/unit/multiReportDashboardAction.test.ts'
    );
    expect(requirementRow?.VerificationRefs).toContain(
      'tests/unit/retainedDashboardEvidence.test.ts'
    );
    expect(requirementRow?.VerificationRefs).toContain(
      'tests/unit/humanReviewSubmission.test.ts'
    );
    expect(requirementRow?.VerificationRefs).toContain(
      'tests/unit/reviewDecisionRecord.test.ts'
    );
    expect(requirementRow?.VerificationRefs).toContain(
      'tests/unit/reviewScenarioSupportPolicy.test.ts'
    );
    expect(indexRow?.CurrentAnchor).toBe(
      'srs.md#vhs-req-610-dashboard-aggregate-review'
    );
  });

  it('keeps installed bundled documentation traceable for VHS-REQ-611', () => {
    const srs = readRepoText('docs', 'requirements', 'srs.md');
    const rtmRows = parseCsv(readRepoText('docs', 'requirements', 'rtm.csv'));
    const idIndexRows = parseCsv(readRepoText('docs', 'requirements', 'id-index.csv'));
    const packageManifestTest = readRepoText('tests', 'unit', 'packageManifest.test.ts');
    const extensionHostTest = readRepoText('tests', 'integration', 'suite', 'extensionHost.test.ts');
    const requirementRow = rtmRows.find((row) => row.ReqID === 'VHS-REQ-611');
    const indexRow = idIndexRows.find((row) => row.ID === 'VHS-REQ-611');

    expect(srs).toContain('### VHS-REQ-611: Installed Bundled Documentation Surface');
    expect(srs).toContain('labviewViHistory.openDocumentation');
    expect(srs).toContain('resources/bundled-docs');
    expect(requirementRow?.ParentID).toBe('VHS-SYS-REQ-001');
    expect(requirementRow?.ImplementationRefs).toContain('src/docs/bundledDocumentation.ts');
    expect(requirementRow?.ImplementationRefs).toContain('src/docs/bundledDocumentationAction.ts');
    expect(requirementRow?.ImplementationRefs).toContain('resources/bundled-docs/manifest.json');
    expect(requirementRow?.ImplementationRefs).toContain(
      'resources/bundled-docs/pages/comparison-reports-and-dashboard-review.html'
    );
    expect(requirementRow?.ImplementationRefs).toContain('package.json');
    expect(requirementRow?.ImplementationRefs).toContain('src/extension.ts');
    expect(requirementRow?.VerificationRefs).toContain('tests/unit/bundledDocumentation.test.ts');
    expect(requirementRow?.VerificationRefs).toContain(
      'tests/unit/bundledDocumentationAction.test.ts'
    );
    expect(requirementRow?.VerificationRefs).toContain('tests/unit/packageManifest.test.ts');
    expect(requirementRow?.VerificationRefs).toContain(
      'tests/unit/extensionActivationLazySideEffects.test.ts'
    );
    expect(requirementRow?.VerificationRefs).toContain('tests/integration/suite/extensionHost.test.ts');
    expect(packageManifestTest).toContain('onCommand:labviewViHistory.openDocumentation');
    expect(extensionHostTest).toContain("command: 'openDocumentation'");
    expect(extensionHostTest).toContain('getLastOpenedDocumentationPanel');
    expect(indexRow?.CurrentAnchor).toBe(
      'srs.md#vhs-req-611-installed-bundled-documentation-surface'
    );
  });

  it('keeps installed runtime settings CLI preparation traceable for VHS-REQ-612', () => {
    const srs = readRepoText('docs', 'requirements', 'srs.md');
    const rtmRows = parseCsv(readRepoText('docs', 'requirements', 'rtm.csv'));
    const idIndexRows = parseCsv(readRepoText('docs', 'requirements', 'id-index.csv'));
    const packageManifestTest = readRepoText('tests', 'unit', 'packageManifest.test.ts');
    const extensionActivationTest = readRepoText(
      'tests',
      'unit',
      'extensionActivationLazySideEffects.test.ts'
    );
    const extensionHostTest = readRepoText('tests', 'integration', 'suite', 'extensionHost.test.ts');
    const requirementRow = rtmRows.find((row) => row.ReqID === 'VHS-REQ-612');
    const indexRow = idIndexRows.find((row) => row.ID === 'VHS-REQ-612');

    expect(srs).toContain('### VHS-REQ-612: Installed Runtime Settings CLI Preparation');
    expect(srs).toContain('labviewViHistory.prepareLocalRuntimeSettingsCli');
    expect(srs).toContain('missing-global-storage-uri');
    expect(requirementRow?.ParentID).toBe('VHS-SYS-REQ-004');
    expect(requirementRow?.ImplementationRefs).toContain('package.json');
    expect(requirementRow?.ImplementationRefs).toContain('src/extension.ts');
    expect(requirementRow?.ImplementationRefs).toContain('src/tooling/localRuntimeSettingsCli.ts');
    expect(requirementRow?.VerificationRefs).toContain('tests/unit/localRuntimeSettingsCli.test.ts');
    expect(requirementRow?.VerificationRefs).toContain('tests/unit/packageManifest.test.ts');
    expect(requirementRow?.VerificationRefs).toContain(
      'tests/unit/extensionActivationLazySideEffects.test.ts'
    );
    expect(requirementRow?.VerificationRefs).toContain('tests/integration/suite/extensionHost.test.ts');
    expect(packageManifestTest).toContain('onCommand:labviewViHistory.prepareLocalRuntimeSettingsCli');
    expect(extensionActivationTest).toContain(
      "commandHandlers.get('labviewViHistory.prepareLocalRuntimeSettingsCli')"
    );
    expect(extensionHostTest).toContain('prepared-local-runtime-settings-cli');
    expect(indexRow?.CurrentAnchor).toBe(
      'srs.md#vhs-req-612-installed-runtime-settings-cli-preparation'
    );
  });

  it('keeps onboarding feedback traceable to source evaluation and Marketplace metadata', () => {
    const srs = readRepoText('docs', 'requirements', 'srs.md');
    const firstRun = readRepoText('FIRST-RUN.md');
    const installGuide = readRepoText('INSTALL.md');
    const onboardingSkill = readRepoText('.github', 'skills', 'onboarding', 'SKILL.md');
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
    expect(firstRun).toContain('npm run customization:audit');
    expect(installGuide).toContain('npm run customization:audit');
    expect(onboardingSkill).toContain('## Customization Drift Check');
    expect(onboardingSkill).toContain('Include `npm run customization:audit` in PR validation commands');
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
    expect(template).toContain('id: requirement_updates');
    expect(template).toContain('id: copilot_prompt');
    expect(template).toContain('Issues must be decision-complete before implementation starts');
    expect(template).toContain('Update implementation, tests, SRS, and RTM');
    expect(requirementsReadme).toContain('Requirement Target');
    expect(requirementsReadme).toContain('validation commands');
    expect(requirementsReadme).toContain('issue itself is decision-complete');
    expect(requirementsReadme).toContain('optional bounded');
    expect(requirementsReadme).toContain('`copilot_prompt` field');
    expect(requirementsReadme).toContain('Copilot Web issue-generation guidance');
    expect(issueWaveGuidance).toContain('Requirements-First, RTM-First Flow');
    expect(issueWaveGuidance).toContain('Requirement-Gap Wave Flow');
    expect(issueWaveGuidance).toContain('Decision-Complete Issue Payload');
    expect(issueWaveGuidance).toContain('optional `copilot_prompt`');
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
    expect(srs).toContain('decision-complete');
    expect(srs).toContain('requirement-target issue payload');
    expect(srs).toContain('requirement-gap lane for bounded field');
    expect(srs).toContain('repo-local commands required for');
    expect(requirementRow?.ImplementationRefs).toContain(
      '.github/ISSUE_TEMPLATE/requirement_target.yml'
    );
    expect(requirementRow?.ImplementationRefs).toContain(
      'docs/requirements/copilot-web-issue-generation-prompt.md'
    );
  });

  it('keeps agent customization contract surfaces synchronized', () => {
    const agentsGuide = readRepoText('AGENTS.md');
    const prTemplate = readRepoText('.github', 'pull_request_template.md');
    const testPlan = readRepoText('docs', 'testing', 'test-plan.md');
    const gateScript = readRepoText(
      '.github',
      'skills',
      'testing-automation',
      'scripts',
      'run-pr-gates.sh'
    );
    const workflowGovernor = readRepoText(
      '.github',
      'agents',
      'workflow-governor.agent.md'
    );
    const prHandoffPrompt = readRepoText(
      '.github',
      'prompts',
      'pr-handoff-evidence.prompt.md'
    );
    const requirementTargetPrompt = readRepoText(
      '.github',
      'prompts',
      'requirement-target-execution.prompt.md'
    );
    const onboardingSkill = readRepoText('.github', 'skills', 'onboarding', 'SKILL.md');

    for (const guideReference of [
      '.github/skills/testing-automation/SKILL.md',
      '.github/skills/onboarding/SKILL.md',
      '.github/skills/agent-effectiveness-loop/SKILL.md',
      '.github/skills/requirements-traceability/SKILL.md',
      '.github/skills/pr-handoff-evidence/SKILL.md',
      '.github/prompts/pr-handoff-evidence.prompt.md',
      '.github/prompts/requirement-target-execution.prompt.md',
      '.github/agents/workflow-governor.agent.md',
      '.github/instructions/reporting-orchestration.instructions.md',
      '.github/instructions/unit-tests.instructions.md',
      '.github/instructions/requirements-and-test-docs.instructions.md',
      '.github/instructions/scripts-validation.instructions.md'
    ]) {
      expect(agentsGuide).toContain(guideReference);
    }

    expect(workflowGovernor).toContain('feature branch rooted on develop');
    expect(workflowGovernor).toContain(
      '.github/skills/requirements-traceability/SKILL.md'
    );
    expect(workflowGovernor).toContain('.github/skills/testing-automation/SKILL.md');
    expect(workflowGovernor).toContain('.github/skills/pr-handoff-evidence/SKILL.md');

    expect(prHandoffPrompt).toContain('Requirement Target Execution');
    expect(prHandoffPrompt).toContain('./requirement-target-execution.prompt.md');
    expect(prHandoffPrompt).toContain('include `npm run customization:audit` in Validation commands');
    expect(requirementTargetPrompt).toContain('PR Handoff Evidence');
    expect(requirementTargetPrompt).toContain('./pr-handoff-evidence.prompt.md');
    expect(requirementTargetPrompt).toContain(
      'npm run customization:audit (required when customization surfaces changed)'
    );
    expect(onboardingSkill).toContain('## Customization Drift Check');
    expect(onboardingSkill).toContain('.github/prompts/pr-handoff-evidence.prompt.md');

    for (const requiredLabel of [
      'Linked issue (required):',
      'Target requirement (required):',
      'Validation commands (required):',
      'Traceability / RTM impact (required):',
      'Out-of-scope (required):',
      'Closeout readiness (required):'
    ]) {
      expect(prTemplate).toContain(requiredLabel);
    }

    expect(testPlan).toContain('## PR Evidence Contract');
    expect(testPlan).toContain('linked issue');
    expect(testPlan).toContain('target requirement');
    expect(testPlan).toContain('validation commands');
    expect(testPlan).toContain('traceability/RTM impact');
    expect(testPlan).toContain('out-of-scope');
    expect(testPlan).toContain('closeout readiness');

    const requiredGateOrder = [
      'npm run check',
      'npm run customization:audit',
      'npm run traceability:audit',
      'npm run docs:links',
      'npm test',
      'npm run package',
      'npm run dod:gate'
    ];
    let previousIndex = -1;
    for (const command of requiredGateOrder) {
      const index = gateScript.indexOf(command);
      expect(index, `missing gate command ${command}`).toBeGreaterThanOrEqual(0);
      expect(index, `gate order drifted at ${command}`).toBeGreaterThan(previousIndex);
      previousIndex = index;
    }
  });

  it('keeps workspace customization files structurally aligned', () => {
    const agentsGuide = readRepoText('AGENTS.md');

    const skillsDir = path.join(repoRoot, '.github', 'skills');
    const skillFolders = fs
      .readdirSync(skillsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
    expect(skillFolders.length).toBeGreaterThan(0);

    for (const folder of skillFolders) {
      const relativeSkillPath = toPosixPath(path.join('.github', 'skills', folder, 'SKILL.md'));
      const skillPath = path.join(repoRoot, relativeSkillPath);
      expect(fs.existsSync(skillPath), `missing ${relativeSkillPath}`).toBe(true);

      const skillText = fs.readFileSync(skillPath, 'utf8').replace(/\r\n/g, '\n');
      expect(extractFrontmatterScalar(skillText, 'name')).toBe(folder);
      expect(extractFrontmatterScalar(skillText, 'description')).toBeTruthy();
      expect(agentsGuide).toContain(relativeSkillPath);
    }

    const promptsDir = path.join(repoRoot, '.github', 'prompts');
    const promptFiles = fs
      .readdirSync(promptsDir)
      .filter((fileName) => fileName.endsWith('.prompt.md'))
      .sort();
    expect(promptFiles.length).toBeGreaterThan(0);

    for (const fileName of promptFiles) {
      const relativePromptPath = `.github/prompts/${fileName}`;
      const promptText = readRepoText('.github', 'prompts', fileName);
      expect(extractFrontmatterScalar(promptText, 'description')).toBeTruthy();
      expect(extractFrontmatterScalar(promptText, 'agent')).toBe('agent');
      expect(agentsGuide).toContain(relativePromptPath);
    }

    const instructionsDir = path.join(repoRoot, '.github', 'instructions');
    const instructionFiles = fs
      .readdirSync(instructionsDir)
      .filter((fileName) => fileName.endsWith('.instructions.md'))
      .sort();
    expect(instructionFiles.length).toBeGreaterThan(0);

    for (const fileName of instructionFiles) {
      const relativeInstructionPath = `.github/instructions/${fileName}`;
      const instructionText = readRepoText('.github', 'instructions', fileName);
      expect(extractFrontmatterScalar(instructionText, 'description')).toBeTruthy();
      expect(extractFrontmatter(instructionText)).toContain('applyTo:');
      expect(agentsGuide).toContain(relativeInstructionPath);
    }

    const workflowGovernor = readRepoText('.github', 'agents', 'workflow-governor.agent.md');
    expect(extractFrontmatterScalar(workflowGovernor, 'name')).toBe('Workflow Governor');
    expect(extractFrontmatterScalar(workflowGovernor, 'description')).toContain('Use when');
    expect(agentsGuide).toContain('.github/agents/workflow-governor.agent.md');
  });

  it('keeps customization frontmatter quality and safety defaults aligned', () => {
    const agentsGuide = readRepoText('AGENTS.md');

    expect(agentsGuide).toContain('### Customization Entry Path');
    expect(agentsGuide).toContain('### First-Step Decision Matrix');
    expect(agentsGuide).toContain('Use skills for repeatable multi-step workflows');
    expect(agentsGuide).toContain('Use prompts for one-shot output generation');
    expect(agentsGuide).toContain('Use file instructions for file-type or folder-specific edit guardrails');
    expect(agentsGuide).toContain('Use the workflow-governor custom agent');
    expect(agentsGuide).toContain('Customization-surface edits');
    expect(agentsGuide).toContain('include it in PR evidence validation commands');
    expect(agentsGuide).toContain('### Troubleshooting Route');
    expect(agentsGuide).toContain('Gate and CI failures');

    const skillsDir = path.join(repoRoot, '.github', 'skills');
    const skillFolders = fs
      .readdirSync(skillsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();

    for (const folder of skillFolders) {
      const skillText = readRepoText('.github', 'skills', folder, 'SKILL.md');
      const description = extractFrontmatterScalar(skillText, 'description') ?? '';
      expect(description.length, `${folder} description`).toBeGreaterThan(0);
      expect(description, `${folder} description should include usage trigger`).toContain('Use');
      expect(extractFrontmatterScalar(skillText, 'argument-hint'), `${folder} argument-hint`).toBeTruthy();
    }

    const promptsDir = path.join(repoRoot, '.github', 'prompts');
    const promptFiles = fs
      .readdirSync(promptsDir)
      .filter((fileName) => fileName.endsWith('.prompt.md'))
      .sort();

    for (const fileName of promptFiles) {
      const promptText = readRepoText('.github', 'prompts', fileName);
      expect(extractFrontmatterScalar(promptText, 'description'), `${fileName} description`).toBeTruthy();
      expect(extractFrontmatterScalar(promptText, 'argument-hint'), `${fileName} argument-hint`).toBeTruthy();
      expect(extractFrontmatterScalar(promptText, 'agent'), `${fileName} agent`).toBe('agent');
    }

    const instructionsDir = path.join(repoRoot, '.github', 'instructions');
    const instructionFiles = fs
      .readdirSync(instructionsDir)
      .filter((fileName) => fileName.endsWith('.instructions.md'))
      .sort();

    for (const fileName of instructionFiles) {
      const instructionText = readRepoText('.github', 'instructions', fileName);
      const frontmatter = extractFrontmatter(instructionText);
      const description = extractFrontmatterScalar(instructionText, 'description') ?? '';
      expect(description.length, `${fileName} description`).toBeGreaterThan(0);
      expect(description, `${fileName} description should include usage trigger`).toContain('Use when');
      expect(frontmatter, `${fileName} applyTo`).toContain('applyTo:');
      expect(frontmatter).not.toContain('applyTo: "**"');
      expect(frontmatter).not.toContain("applyTo: '**'");
    }

    const workflowGovernor = readRepoText('.github', 'agents', 'workflow-governor.agent.md');
    const workflowTools = extractFrontmatterArray(workflowGovernor, 'tools');
    expect(workflowTools).toEqual(['read', 'search', 'edit', 'execute', 'todo']);
    expect(extractFrontmatterScalar(workflowGovernor, 'user-invocable')).toBe('true');
  });

  it('keeps selected-file eligibility requirement wave traceable', () => {
    const syrs = readRepoText('docs', 'requirements', 'syrs.md');
    const srs = readRepoText('docs', 'requirements', 'srs.md');
    const rtmRows = parseCsv(readRepoText('docs', 'requirements', 'rtm.csv'));
    const idIndexRows = parseCsv(readRepoText('docs', 'requirements', 'id-index.csv'));
    const rowsById = new Map(rtmRows.map((row) => [row.ReqID, row]));
    const indexById = new Map(idIndexRows.map((row) => [row.ID, row]));

    for (const id of ['VHS-REQ-603', 'VHS-REQ-604', 'VHS-REQ-605', 'VHS-REQ-606']) {
      expect(rowsById.has(id), `${id} removed from active RTM`).toBe(false);
      expect(indexById.get(id)?.Status, `${id} index status`).toBe('Superseded');
      expect(indexById.get(id)?.ReplacementID, `${id} replacement`).toBe('VHS-REQ-635');
    }
    expect(indexById.get('VHS-SYS-REQ-015')?.Status).toBe('Superseded');
    expect(indexById.get('VHS-SYS-REQ-015')?.ReplacementID).toBe('VHS-SYS-REQ-018');
    expect(indexById.get('VHS-SYS-REQ-018')?.Status).toBe('Active');
    expect(indexById.get('VHS-SYS-REQ-018')?.CurrentAnchor).toBe(
      'syrs.md#vhs-sys-req-018-selected-vi-on-demand-history-eligibility'
    );

    expect(syrs).toContain('### VHS-SYS-REQ-018: Selected VI On-Demand History Eligibility');
    expect(syrs).toContain('without requiring repository-wide VI enumeration');
    expect(syrs).toContain('Repositories with thousands of VIs do not need a full tracked-VI scan');

    expect(srs).toContain('### VHS-REQ-635: Selected-File On-Demand Eligibility');
    expect(srs).toContain('shall not wait for or require a repository-wide');
    expect(srs).toContain('Opening history for one selected file does not enumerate every tracked VI');
    expect(srs).toContain('Manifest menu visibility remains a hint');
    expect(srs).toContain('Comparison-runtime validation remains separate from selected-file');
    expect(rowsById.get('VHS-REQ-635')?.ParentID).toBe('VHS-SYS-REQ-018');
    expect(rowsById.get('VHS-REQ-635')?.ImplementationRefs).toContain(
      'src/commands/openViHistoryCommand.ts'
    );
    expect(rowsById.get('VHS-REQ-635')?.ImplementationRefs).toContain(
      'src/services/viHistoryModel.ts'
    );
    expect(rowsById.get('VHS-REQ-635')?.ImplementationRefs).toContain('src/git/gitCli.ts');
    expect(rowsById.get('VHS-REQ-635')?.VerificationRefs).toContain(
      'tests/unit/openViHistoryCommand.test.ts'
    );

    expect(srs).toContain('### VHS-REQ-607: Field Intake Separation For Eligibility Reports');
    expect(srs).toContain('collect selected-file eligibility and Git');
    expect(srs).toContain('runtime validation output so maintainers can');
    expect(srs).toContain('Eligibility or Git history reports can be submitted without requiring');
    expect(rowsById.get('VHS-REQ-607')?.ImplementationRefs).toContain(
      '.github/ISSUE_TEMPLATE/bug_report.yml'
    );
  });

  it('keeps selected-file eligibility intake separated from runtime validation output', () => {
    const bugTemplate = readRepoText('.github', 'ISSUE_TEMPLATE', 'bug_report.yml');
    const onboardingTemplate = readRepoText(
      '.github',
      'ISSUE_TEMPLATE',
      'first_time_onboarding_feedback.yml'
    );

    for (const template of [bugTemplate, onboardingTemplate]) {
      expect(template).toContain('id: affected_surface');
      expect(template).toContain('VI history eligibility or Git history display');
      expect(template).toContain('Compare/runtime validation');
      expect(template).toContain('id: eligibility_evidence');
      expect(template).toContain('Eligibility / Git History Evidence');
      expect(template).toContain('Selected file path or extension');
      expect(template).toContain('Is the file tracked in Git');
      expect(template).toContain('Commit count or history facts shown');
      expect(template).toContain('Ineligibility message or Git/history error');
      expect(template).toContain('id: runtime_validation_output');
      expect(template).toContain('separately from eligibility evidence');
      expect(template).toContain('Do not include secrets');
      expect(template).toContain('Leave blank for eligibility-only');
    }
  });

  it('keeps architecture evidence package traceable for standards review', () => {
    const overview = readRepoText('docs', 'architecture', 'overview.md');
    const adr = readRepoText(
      'docs',
      'architecture',
      'adr',
      'ADR-0001-github-first-release-and-traceability-governance.md'
    );
    const inventoryRows = parseCsv(readRepoText('docs', 'requirements', 'traceability-inventory.csv'));
    const inventoryByPath = new Map(inventoryRows.map((row) => [row.Path, row]));
    const rtmRows = parseCsv(readRepoText('docs', 'requirements', 'rtm.csv'));
    const rtmText = rtmRows
      .map((row) => `${row.ImplementationRefs};${row.VerificationRefs}`)
      .join(';');

    for (const section of [
      '## Stakeholders And Concerns',
      '## Context View',
      '## Container View',
      '## Component View',
      '## Deployment View',
      '## View Correspondences',
      '## Retained Decision Rationale'
    ]) {
      expect(overview).toContain(section);
    }

    for (const stakeholder of [
      'Extension user',
      'Maintainer / release steward',
      'Traceability steward',
      'Support / debugging user',
      'Contributor'
    ]) {
      expect(overview).toContain(stakeholder);
    }

    expect(overview).toContain('ADR-0001: GitHub-First Release And Traceability Governance');
    expect(overview).toContain('VHS-SYS-REQ-001');
    expect(overview).toContain('VHS-REQ-609');
    expect(overview).toContain('VHS-REQ-612');

    for (const field of [
      '- Status: Active',
      '## Context',
      '## Decision',
      '## Rationale',
      '## Consequences'
    ]) {
      expect(adr).toContain(field);
    }

    for (const filePath of [
      'docs/architecture/overview.md',
      'docs/architecture/adr/ADR-0001-github-first-release-and-traceability-governance.md'
    ]) {
      const row = inventoryByPath.get(filePath);
      expect(row?.Classification, `${filePath} classification`).toBe('asset-doc');
      expect(row?.RtmCoverage, `${filePath} RTM coverage`).toBe('No');
      expect(rtmText, `${filePath} should remain outside software RTM refs`).not.toContain(
        filePath
      );
    }
  });

  it('keeps traceability steward inventory traceable for VHS-REQ-601', () => {
    const readme = readRepoText('docs', 'requirements', 'README.md');
    const srs = readRepoText('docs', 'requirements', 'srs.md');
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
    expect(readme).toContain('New software requirements start at `VHS-REQ-623`.');
    expect(readme).toContain('New system requirements start at `VHS-SYS-REQ-018`.');
    expect(readme).not.toContain('New software requirements start at `VHS-REQ-622`.');
    expect(readme).not.toContain('New software requirements start at `VHS-REQ-616`.');
    expect(readme).not.toContain('New software requirements start at `VHS-REQ-615`.');
    expect(readme).not.toContain('New software requirements start at `VHS-REQ-614`.');
    expect(readme).not.toContain('New software requirements start at `VHS-REQ-613`.');
    expect(readme).not.toContain('New software requirements start at `VHS-REQ-612`.');
    expect(readme).toContain('Traceability Closeout Runbook');
    expect(readme).toContain('npm run closeout:evidence');
    expect(readme).toContain('closeout-summary.json');
    expect(readme).toContain('machine-readable gate, standards, provenance');
    expect(readme).toContain('bounded timeouts and one');
    expect(readme).toContain('transient-network retry');
    expect(readme).toContain('fail-closed and are not retried');
    expect(readme).toContain('Standards evidence and standards');
    expect(readme).toContain('toolchain provenance');
    expect(readme).toContain('published GitLab registry image');
    expect(readme).toContain('repo-standards-review-assurance-workbench:local');
    expect(readme).toContain(
      'registry.gitlab.com/svelderrainruiz/repo-standards-review/assurance-workbench:main'
    );
    expect(readme).toContain('docker login registry.gitlab.com');
    expect(readme).toContain('GIT_TERMINAL_PROMPT=0');
    expect(readme).toContain('GIT_ASKPASS=/absolute/path/to/askpass-helper.sh');
    expect(readme).toContain('error getting credentials');
    expect(readme).toContain('credsStore');
    expect(readme).toContain('manifest unknown');
    expect(readme).toContain('Definition-of-Done gate as explicit');
    expect(readme).toContain('DoD Gate / dod');
    expect(readme).toContain('.github/workflows/ci.yml');
    expect(readme).toContain('requirements_quality_check.py <repo-root> --requirements-spec-scope system --json');
    expect(readme).toContain('blocking traceability and Definition-of-Done');
    expect(readme).toContain('Treat non-PASS DoD evidence as active closeout evidence');
    expect(readme).not.toContain('dedicated CI issue adds it');
    expect(srs).toContain('closeout evidence command generates GitHub-ready umbrella issue summaries');
    expect(srs).toContain('host Python and Docker assurance-workbench');
    expect(srs).toContain('published GitLab registry');
    expect(srs).toContain('toolchain provenance');
    expect(srs).toContain('private GitHub mirror');
    expect(srs).toContain('Definition-of-Done evidence as active closeout');
    expect(requirementRow?.Notes).toContain('standards toolchain provenance checks');
    expect(requirementRow?.Notes).toContain('published Docker workbench runner');
    expect(requirementRow?.ImplementationRefs).toContain('scripts/generateCloseoutEvidence.js');
    expect(requirementRow?.ImplementationRefs).toContain(
      'docs/requirements/traceability-inventory.csv'
    );
    expect(requirementRow?.ImplementationRefs).toContain(
      'scripts/auditTraceabilitySteward.js'
    );
    expect(requirementRow?.VerificationRefs).toContain(
      'tests/unit/traceabilityAuditScript.test.ts'
    );
    expect(requirementRow?.VerificationRefs).toContain(
      'tests/unit/closeoutEvidenceScript.test.ts'
    );
    for (const filePath of [
      'scripts/generateCloseoutEvidence.js',
      'tests/unit/closeoutEvidenceScript.test.ts'
    ]) {
      const row = inventoryByPath.get(filePath);
      expect(row?.Classification, `${filePath} classification`).toBe('mapped');
      expect(row?.RtmCoverage, `${filePath} RTM coverage`).toBe('Yes');
      expect(row?.Notes).toContain('provenance');
    }

    const bundledDocumentationImplementationPaths = [
      'src/docs/bundledDocumentation.ts',
      'src/docs/bundledDocumentationAction.ts'
    ];
    for (const filePath of bundledDocumentationImplementationPaths) {
      const row = inventoryByPath.get(filePath);
      expect(row?.Classification).toBe('mapped');
      expect(row?.RtmCoverage).toBe('Yes');
      expect(row?.Notes).toContain('VHS-REQ-611');
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
      expect(row?.Classification).toBe('mapped');
      expect(row?.RtmCoverage).toBe('Yes');
      expect(row?.Notes).toContain('VHS-REQ-611');
    }

    const bundledDocumentationTests = [
      'tests/unit/bundledDocumentation.test.ts',
      'tests/unit/bundledDocumentationAction.test.ts'
    ];
    for (const filePath of bundledDocumentationTests) {
      const row = inventoryByPath.get(filePath);
      expect(row?.Classification).toBe('mapped');
      expect(row?.RtmCoverage).toBe('Yes');
      expect(row?.Notes).toContain('VHS-REQ-611');
    }

    const localRuntimeSettingsCliRow = inventoryByPath.get('src/tooling/localRuntimeSettingsCli.ts');
    expect(localRuntimeSettingsCliRow?.Classification).toBe('mapped');
    expect(localRuntimeSettingsCliRow?.RtmCoverage).toBe('Yes');
    expect(localRuntimeSettingsCliRow?.Notes).toContain('VHS-REQ-612');
    const localRuntimeSettingsCliTestRow = inventoryByPath.get(
      'tests/unit/localRuntimeSettingsCli.test.ts'
    );
    expect(localRuntimeSettingsCliTestRow?.Classification).toBe('mapped');
    expect(localRuntimeSettingsCliTestRow?.RtmCoverage).toBe('Yes');
    expect(localRuntimeSettingsCliTestRow?.Notes).toContain('VHS-REQ-612');

    for (const filePath of [
      'src/tooling/runtimeSettingsLiveSessionProbe.ts',
      'src/tooling/runtimeSettingsLiveSessionProbePacket.ts',
      'src/tooling/runtimeSettingsLiveSessionSafeRestore.ts'
    ]) {
      const row = inventoryByPath.get(filePath);
      expect(row?.Classification).toBe('dev-only');
      expect(row?.RtmCoverage).toBe('No');
      expect(row?.Notes).toContain('not contributed in package.json');
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
    function expectSupportingClassification(
      row: Record<string, string> | undefined,
      filePath: string,
      reqId: string
    ): void {
      expect(row?.Classification, `${filePath} classification`).toBe('supporting');
      expect(row?.RtmCoverage, `${filePath} RTM coverage`).toBe('No');
      expect(row?.Notes, `${filePath} notes`).toContain(reqId);
    }

    function expectMappedClassification(
      row: Record<string, string> | undefined,
      filePath: string
    ): void {
      expect(row?.Classification, `${filePath} classification`).toBe('mapped');
      expect(row?.RtmCoverage, `${filePath} RTM coverage`).toBe('Yes');
      expect(row?.Notes, `${filePath} notes`).toContain('mapped through RTM');
    }

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
      expectSupportingClassification(row, filePath, 'VHS-REQ-610');
    }

    for (const filePath of [
      'tests/unit/multiReportDashboard.test.ts',
      'tests/unit/multiReportDashboardAction.test.ts',
      'tests/unit/retainedDashboardEvidence.test.ts',
      'tests/unit/humanReviewSubmission.test.ts',
      'tests/unit/reviewDecisionRecord.test.ts',
      'tests/unit/reviewScenarioSupportPolicy.test.ts'
    ]) {
      const row = inventoryByPath.get(filePath);
      expect(row?.Classification, `${filePath} classification`).toBe('mapped');
      expect(row?.RtmCoverage, `${filePath} RTM coverage`).toBe('Yes');
      expect(row?.Notes, `${filePath} notes`).toContain('VHS-REQ-610');
    }

    // Git API wrapper and tests are directly mapped through RTM
    const gitApiMappedPaths = [
      'src/git/gitApi.ts',
      'tests/unit/gitApi.test.ts'
    ];
    for (const filePath of gitApiMappedPaths) {
      const row = inventoryByPath.get(filePath);
      expectMappedClassification(row, filePath);
    }

    // Comparison report plans are directly mapped through RTM.
    for (const filePath of [
      'src/reporting/comparisonReportPlan.ts',
      'src/reporting/comparisonReportExecutionPlan.ts'
    ]) {
      const row = inventoryByPath.get(filePath);
      expectMappedClassification(row, filePath);
    }

    // Broader tracked-file documentation candidates are intentionally inventoried as asset docs.
    for (const filePath of [
      'docs/architecture/overview.md',
      'docs/simplification/github-cutover-runbook.md',
      'docs/simplification/github-first-simplification-analysis.md'
    ]) {
      const row = inventoryByPath.get(filePath);
      expect(row?.Classification, `${filePath} classification`).toBe('asset-doc');
      expect(row?.RtmCoverage, `${filePath} RTM coverage`).toBe('No');
    }
  });
});

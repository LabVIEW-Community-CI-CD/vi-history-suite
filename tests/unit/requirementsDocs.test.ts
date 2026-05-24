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

  it('keeps the requirement-targeted issue template aligned with the agent contract', () => {
    const template = readRepoText('.github', 'ISSUE_TEMPLATE', 'requirement_target.yml');
    const requirementsReadme = readRepoText('docs', 'requirements', 'README.md');
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
    expect(srs).toContain('GitHub issue templates support requirement-targeted agent work.');
    expect(requirementRow?.ImplementationRefs).toContain(
      '.github/ISSUE_TEMPLATE/requirement_target.yml'
    );
  });
});

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

const { auditAdrIndex, auditSyrsCoverage, buildGovernanceState } = require('../../scripts/checkAdrIndex.js') as {
  auditAdrIndex: (repoRoot: string) => { ok: boolean; violations: string[] };
  auditSyrsCoverage: (repoRoot: string) => { ok: boolean; violations: string[] };
  buildGovernanceState: (repoRoot: string) => { consistent: boolean; violationCount: number; violations: string[] };
};

const tempRoots: string[] = [];

function makeAdrRepo(
  files: Record<string, string>,
  options: { index?: string | null; template?: boolean } = {}
): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vihs-adr-'));
  tempRoots.push(root);
  const adrDir = path.join(root, 'docs', 'architecture', 'adr');
  fs.mkdirSync(adrDir, { recursive: true });
  for (const [name, body] of Object.entries(files)) {
    fs.writeFileSync(path.join(adrDir, name), body);
  }
  if (options.template !== false) {
    fs.writeFileSync(path.join(adrDir, 'ADR-template.md'), '# ADR-NNNN: Title\n');
  }
  if (options.index !== null) {
    fs.writeFileSync(path.join(adrDir, 'README.md'), options.index ?? '');
  }
  return root;
}

function validAdr(num: string, title: string): string {
  return [
    `# ADR-${num}: ${title}`,
    '',
    '- Status: Accepted',
    '- Date: 2026-07-19',
    '',
    '## Context',
    'Records the decision behind VHS-REQ-001.',
    '## Decision',
    'y',
    '## Consequences',
    '- z',
    ''
  ].join('\n');
}

afterEach(() => {
  while (tempRoots.length > 0) {
    const dir = tempRoots.pop();
    if (dir) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe('auditAdrIndex', () => {
  it('passes a consistent, sequential, fully-indexed ADR set', () => {
    const root = makeAdrRepo(
      {
        'ADR-0001-first.md': validAdr('0001', 'First'),
        'ADR-0002-second.md': validAdr('0002', 'Second')
      },
      { index: 'Index\nADR-0001-first.md\nADR-0002-second.md\n' }
    );
    expect(auditAdrIndex(root)).toEqual({ ok: true, violations: [] });
  });

  it('fails when the index is missing', () => {
    const root = makeAdrRepo({ 'ADR-0001-first.md': validAdr('0001', 'First') }, { index: null });
    const result = auditAdrIndex(root);
    expect(result.ok).toBe(false);
    expect(result.violations.some((v) => v.includes('Missing ADR index'))).toBe(true);
  });

  it('fails when the template is missing', () => {
    const root = makeAdrRepo(
      { 'ADR-0001-first.md': validAdr('0001', 'First') },
      { index: 'ADR-0001-first.md\n', template: false }
    );
    const result = auditAdrIndex(root);
    expect(result.violations.some((v) => v.includes('Missing ADR template'))).toBe(true);
  });

  it('fails when an ADR file is not listed in the index', () => {
    const root = makeAdrRepo(
      {
        'ADR-0001-first.md': validAdr('0001', 'First'),
        'ADR-0002-second.md': validAdr('0002', 'Second')
      },
      { index: 'ADR-0001-first.md\n' }
    );
    const result = auditAdrIndex(root);
    expect(result.violations.some((v) => v.includes('not listed') && v.includes('ADR-0002'))).toBe(true);
  });

  it('fails when the index references a non-existent ADR', () => {
    const root = makeAdrRepo(
      { 'ADR-0001-first.md': validAdr('0001', 'First') },
      { index: 'ADR-0001-first.md\nADR-0002-ghost.md ADR-0002\n' }
    );
    const result = auditAdrIndex(root);
    expect(result.violations.some((v) => v.includes('no such ADR file'))).toBe(true);
  });

  it('fails on a numbering gap', () => {
    const root = makeAdrRepo(
      {
        'ADR-0001-first.md': validAdr('0001', 'First'),
        'ADR-0003-third.md': validAdr('0003', 'Third')
      },
      { index: 'ADR-0001-first.md\nADR-0003-third.md\n' }
    );
    const result = auditAdrIndex(root);
    expect(result.violations.some((v) => v.includes('not sequential'))).toBe(true);
  });

  it('fails on an unknown header status value', () => {
    const body = validAdr('0001', 'First').replace('- Status: Accepted', '- Status: Acceptd');
    const root = makeAdrRepo({ 'ADR-0001-first.md': body }, { index: 'ADR-0001-first.md\n' });
    const result = auditAdrIndex(root);
    expect(result.ok).toBe(false);
    expect(result.violations.some((v) => v.includes('unknown status') && v.includes('Acceptd'))).toBe(true);
  });

  it('accepts a large ADR whose header status is valid despite embedded status lines', () => {
    const body = validAdr('0001', 'First') + '\n\n> Embedded sub-decision.\n- Status: Whatever\n';
    const root = makeAdrRepo({ 'ADR-0001-first.md': body }, { index: 'ADR-0001-first.md\n' });
    expect(auditAdrIndex(root).ok).toBe(true);
  });

  it('fails when a required field or section is missing', () => {
    const root = makeAdrRepo(
      { 'ADR-0001-first.md': '# ADR-0001: First\n\n- Date: 2026-07-19\n\n## Context\nx\n## Decision\ny\n' },
      { index: 'ADR-0001-first.md\n' }
    );
    const result = auditAdrIndex(root);
    expect(result.violations.some((v) => v.includes('- Status:'))).toBe(true);
    expect(result.violations.some((v) => v.includes('## Consequences'))).toBe(true);
  });

  it('fails when there are no ADRs at all', () => {
    const root = makeAdrRepo({}, { index: 'Index\n' });
    const result = auditAdrIndex(root);
    expect(result.violations.some((v) => v.includes('No ADR files found'))).toBe(true);
  });

  it('fails when an ADR does not cite an SRS requirement', () => {
    const noSrs = [
      '# ADR-0001: First',
      '',
      '- Status: Accepted',
      '- Date: 2026-07-19',
      '',
      '## Context',
      'Anchored to VHS-SYS-REQ-016 only, with no software requirement.',
      '## Decision',
      'y',
      '## Consequences',
      '- z',
      ''
    ].join('\n');
    const root = makeAdrRepo({ 'ADR-0001-first.md': noSrs }, { index: 'ADR-0001-first.md\n' });
    const result = auditAdrIndex(root);
    expect(result.ok).toBe(false);
    expect(result.violations.some((v) => v.includes('does not cite an SRS requirement'))).toBe(true);
  });
});

describe('auditAdrIndex supersession linkage', () => {
  it('fails when a Superseded ADR does not link forward to a successor', () => {
    const superseded = validAdr('0001', 'First').replace('- Status: Accepted', '- Status: Superseded');
    const root = makeAdrRepo(
      {
        'ADR-0001-first.md': superseded,
        'ADR-0002-second.md': validAdr('0002', 'Second')
      },
      { index: 'ADR-0001-first.md\nADR-0002-second.md\n' }
    );
    const result = auditAdrIndex(root);
    expect(result.ok).toBe(false);
    expect(result.violations.some((v) => v.includes('does not link forward'))).toBe(true);
  });

  it('passes when a Superseded ADR links forward to an existing successor', () => {
    const superseded =
      validAdr('0001', 'First').replace('- Status: Accepted', '- Status: Superseded') +
      '\nSuperseded by [ADR-0002](./ADR-0002-second.md).\n';
    const root = makeAdrRepo(
      {
        'ADR-0001-first.md': superseded,
        'ADR-0002-second.md': validAdr('0002', 'Second')
      },
      { index: 'ADR-0001-first.md\nADR-0002-second.md\n' }
    );
    expect(auditAdrIndex(root)).toEqual({ ok: true, violations: [] });
  });

  it('fails when a Superseded ADR names a non-existent successor', () => {
    const superseded =
      validAdr('0001', 'First').replace('- Status: Accepted', '- Status: Superseded') +
      '\nSuperseded by ADR-0009.\n';
    const root = makeAdrRepo({ 'ADR-0001-first.md': superseded }, { index: 'ADR-0001-first.md\n' });
    const result = auditAdrIndex(root);
    expect(result.ok).toBe(false);
    expect(result.violations.some((v) => v.includes('ADR-0009') && v.includes('no such ADR file exists'))).toBe(true);
  });

  it('fails when a Superseded ADR names itself as its successor', () => {
    const superseded =
      validAdr('0001', 'First').replace('- Status: Accepted', '- Status: Superseded') +
      '\nSuperseded by ADR-0001.\n';
    const root = makeAdrRepo({ 'ADR-0001-first.md': superseded }, { index: 'ADR-0001-first.md\n' });
    const result = auditAdrIndex(root);
    expect(result.ok).toBe(false);
    expect(result.violations.some((v) => v.includes('names itself'))).toBe(true);
  });

  it('applies the same linkage rule to a Deprecated ADR', () => {
    const deprecated = validAdr('0001', 'First').replace('- Status: Accepted', '- Status: Deprecated');
    const root = makeAdrRepo(
      {
        'ADR-0001-first.md': deprecated,
        'ADR-0002-second.md': validAdr('0002', 'Second')
      },
      { index: 'ADR-0001-first.md\nADR-0002-second.md\n' }
    );
    const result = auditAdrIndex(root);
    expect(result.ok).toBe(false);
    expect(result.violations.some((v) => v.includes('does not link forward'))).toBe(true);
  });
});

describe('auditAdrIndex index-agreement', () => {
  function tableIndex(rows: Array<{ file: string; title: string; status: string }>): string {
    return [
      '## Index',
      '| ADR | Title | Status |',
      '| --- | --- | --- |',
      ...rows.map((r) => `| [${(/^(ADR-\d{4})/.exec(r.file) ?? [])[1]}](./${r.file}) | ${r.title} | ${r.status} |`),
      ''
    ].join('\n');
  }

  it('passes when the index title and status match the ADR file', () => {
    const root = makeAdrRepo(
      { 'ADR-0001-first.md': validAdr('0001', 'First') },
      { index: tableIndex([{ file: 'ADR-0001-first.md', title: 'First', status: 'Accepted' }]) }
    );
    expect(auditAdrIndex(root)).toEqual({ ok: true, violations: [] });
  });

  it('fails when the index status disagrees with the header status', () => {
    const root = makeAdrRepo(
      { 'ADR-0001-first.md': validAdr('0001', 'First') },
      { index: tableIndex([{ file: 'ADR-0001-first.md', title: 'First', status: 'Active' }]) }
    );
    const result = auditAdrIndex(root);
    expect(result.ok).toBe(false);
    expect(result.violations.some((v) => v.includes('index status') && v.includes('does not match'))).toBe(true);
  });

  it('fails when the index title disagrees with the heading title', () => {
    const root = makeAdrRepo(
      { 'ADR-0001-first.md': validAdr('0001', 'First') },
      { index: tableIndex([{ file: 'ADR-0001-first.md', title: 'Different', status: 'Accepted' }]) }
    );
    const result = auditAdrIndex(root);
    expect(result.ok).toBe(false);
    expect(result.violations.some((v) => v.includes('index title') && v.includes('does not match'))).toBe(true);
  });
});

describe('auditSyrsCoverage', () => {
  function makeRepoWithRtm(adrBodies: Record<string, string>, rtm: string): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vihs-adr-syrs-'));
    tempRoots.push(root);
    const adrDir = path.join(root, 'docs', 'architecture', 'adr');
    fs.mkdirSync(adrDir, { recursive: true });
    for (const [name, body] of Object.entries(adrBodies)) {
      fs.writeFileSync(path.join(adrDir, name), body);
    }
    const reqDir = path.join(root, 'docs', 'requirements');
    fs.mkdirSync(reqDir, { recursive: true });
    fs.writeFileSync(path.join(reqDir, 'rtm.csv'), rtm);
    return root;
  }

  const rtm = [
    'ReqID,ParentID,Status,Area',
    'VHS-REQ-100,VHS-SYS-REQ-001,Active,Core',
    'VHS-REQ-200,VHS-SYS-REQ-004,Active,Runtime',
    'VHS-REQ-300,VHS-SYS-REQ-099,Retired,Legacy'
  ].join('\n');

  it('passes when every SYRS that parents an Active SRS is cited by an ADR', () => {
    const root = makeRepoWithRtm(
      { 'ADR-0001-a.md': validAdr('0001', 'A') + '\nVHS-SYS-REQ-001 VHS-SYS-REQ-004\n' },
      rtm
    );
    expect(auditSyrsCoverage(root)).toEqual({ ok: true, violations: [] });
  });

  it('fails naming the SYRS that parents an Active SRS but is not cited by any ADR', () => {
    const root = makeRepoWithRtm(
      { 'ADR-0001-a.md': validAdr('0001', 'A') + '\nVHS-SYS-REQ-001\n' },
      rtm
    );
    const result = auditSyrsCoverage(root);
    expect(result.ok).toBe(false);
    expect(result.violations.some((v) => v.includes('VHS-SYS-REQ-004'))).toBe(true);
    // A SYRS with no Active SRS child (only a Retired row) is never demanded.
    expect(result.violations.some((v) => v.includes('VHS-SYS-REQ-099'))).toBe(false);
  });
});

describe('auditSyrsCoverage reverse citation validation', () => {
  function makeRepo(adrBody: string, rtm: string, syrs: string | null): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vihs-adr-syrs-rev-'));
    tempRoots.push(root);
    const adrDir = path.join(root, 'docs', 'architecture', 'adr');
    fs.mkdirSync(adrDir, { recursive: true });
    fs.writeFileSync(path.join(adrDir, 'ADR-0001-a.md'), adrBody);
    const reqDir = path.join(root, 'docs', 'requirements');
    fs.mkdirSync(reqDir, { recursive: true });
    fs.writeFileSync(path.join(reqDir, 'rtm.csv'), rtm);
    if (syrs !== null) {
      fs.writeFileSync(path.join(reqDir, 'syrs.md'), syrs);
    }
    return root;
  }

  const rtm = ['ReqID,ParentID,Status,Area', 'VHS-REQ-100,VHS-SYS-REQ-001,Active,Core'].join('\n');
  const syrs = ['### VHS-SYS-REQ-001', 'A declared system requirement.'].join('\n');

  it('passes when every ADR-cited SYRS is declared in syrs.md', () => {
    const root = makeRepo(validAdr('0001', 'A') + '\nVHS-SYS-REQ-001\n', rtm, syrs);
    expect(auditSyrsCoverage(root)).toEqual({ ok: true, violations: [] });
  });

  it('fails when an ADR cites a SYRS that does not exist in syrs.md', () => {
    const root = makeRepo(validAdr('0001', 'A') + '\nVHS-SYS-REQ-001 VHS-SYS-REQ-099\n', rtm, syrs);
    const result = auditSyrsCoverage(root);
    expect(result.ok).toBe(false);
    expect(
      result.violations.some((v) => v.includes('VHS-SYS-REQ-099') && v.includes('does not exist in syrs.md'))
    ).toBe(true);
  });

  it('skips the reverse check when syrs.md is absent', () => {
    const root = makeRepo(validAdr('0001', 'A') + '\nVHS-SYS-REQ-001 VHS-SYS-REQ-099\n', rtm, null);
    const result = auditSyrsCoverage(root);
    expect(result.violations.some((v) => v.includes('does not exist in syrs.md'))).toBe(false);
  });
});

describe('auditAdrIndex reverse citation validation', () => {
  function makeRepoWithRtm(adrBody: string, rtm: string): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vihs-adr-rev-'));
    tempRoots.push(root);
    const adrDir = path.join(root, 'docs', 'architecture', 'adr');
    fs.mkdirSync(adrDir, { recursive: true });
    fs.writeFileSync(path.join(adrDir, 'ADR-0001-a.md'), adrBody);
    fs.writeFileSync(path.join(adrDir, 'ADR-template.md'), '# ADR-NNNN: T\n');
    fs.writeFileSync(path.join(adrDir, 'README.md'), 'ADR-0001-a.md\n');
    const reqDir = path.join(root, 'docs', 'requirements');
    fs.mkdirSync(reqDir, { recursive: true });
    fs.writeFileSync(path.join(reqDir, 'rtm.csv'), rtm);
    return root;
  }

  const rtm = [
    'ReqID,ParentID,Status,Area',
    'VHS-REQ-100,VHS-SYS-REQ-001,Active,Core',
    'VHS-REQ-300,VHS-SYS-REQ-001,Retired,Legacy'
  ].join('\n');

  it('fails when an ADR cites a requirement id that does not exist in rtm.csv', () => {
    const body = validAdr('0001', 'A').replace('VHS-REQ-001', 'VHS-REQ-100') + '\nVHS-REQ-999\n';
    const result = auditAdrIndex(makeRepoWithRtm(body, rtm));
    expect(result.ok).toBe(false);
    expect(result.violations.some((v) => v.includes('VHS-REQ-999') && v.includes('does not exist'))).toBe(true);
  });

  it('fails when an ADR cites a requirement that is not Active', () => {
    const body = validAdr('0001', 'A').replace('VHS-REQ-001', 'VHS-REQ-100') + '\nVHS-REQ-300\n';
    const result = auditAdrIndex(makeRepoWithRtm(body, rtm));
    expect(result.ok).toBe(false);
    expect(result.violations.some((v) => v.includes('VHS-REQ-300') && v.includes('is not Active'))).toBe(true);
  });
});

describe('the real repository ADR set', () => {
  it('passes adr:check and the dedicated SYRS-coverage check', () => {
    const repoRoot = path.resolve(__dirname, '..', '..');
    expect(auditAdrIndex(repoRoot)).toEqual({ ok: true, violations: [] });
    expect(auditSyrsCoverage(repoRoot)).toEqual({ ok: true, violations: [] });
  });
});

describe('buildGovernanceState (VHS-REQ-692 ADR/governance domain source)', () => {
  it('reports the real repository as consistent with zero violations', () => {
    const repoRoot = path.resolve(__dirname, '..', '..');
    expect(buildGovernanceState(repoRoot)).toEqual({ consistent: true, violationCount: 0, violations: [] });
  });

  it('reports inconsistent with a violation count when the ADR set is broken', () => {
    const broken = makeAdrRepo({ 'ADR-0001-first.md': validAdr('0001', 'First') }, { index: null });
    const state = buildGovernanceState(broken);
    expect(state.consistent).toBe(false);
    expect(state.violationCount).toBeGreaterThan(0);
    expect(state.violationCount).toBe(state.violations.length);
  });
});

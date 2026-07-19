import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

const { auditAdrIndex } = require('../../scripts/checkAdrIndex.js') as {
  auditAdrIndex: (repoRoot: string) => { ok: boolean; violations: string[] };
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
    'Anchored to VHS-SYS-REQ-001.',
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

  it('fails when an ADR does not cite a SYRS requirement', () => {
    const noSyrs = [
      '# ADR-0001: First',
      '',
      '- Status: Accepted',
      '- Date: 2026-07-19',
      '',
      '## Context',
      'Realized in VHS-REQ-609 only.',
      '## Decision',
      'y',
      '## Consequences',
      '- z',
      ''
    ].join('\n');
    const root = makeAdrRepo({ 'ADR-0001-first.md': noSyrs }, { index: 'ADR-0001-first.md\n' });
    const result = auditAdrIndex(root);
    expect(result.ok).toBe(false);
    expect(result.violations.some((v) => v.includes('does not cite a SYRS requirement'))).toBe(true);
  });
});

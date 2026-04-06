import * as fs from 'node:fs';
import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '..', '..');

type DebtLedger = {
  generatedFor: string;
  contractStatus: string;
  lastReviewedDate: string;
  statuses: string[];
  debtClasses: string[];
  severities: string[];
  contaminationRiskLevels: string[];
  items: DebtItem[];
};

type DebtItem = {
  id: string;
  title: string;
  debtClass: string;
  status: string;
  severity: string;
  contaminationRisk: string;
  summary: string;
  owner: {
    trancheId: string;
    issueId: string;
    programId: string;
    programPath: string;
    issuePath: string;
  };
  authoritativeSources: string[];
  repoEvidence: string[];
  discoveredContext: string;
  nextGate: string | null;
  exitCriteria: string;
  retirementCommit: string | null;
  acceptedExceptionRationale: string | null;
};

function readText(relativePath: string): string {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function readJson<T>(relativePath: string): T {
  return JSON.parse(readText(relativePath)) as T;
}

describe('debt-retirement contract', () => {
  it('keeps the debt package visible in the authority control plane', () => {
    const readme = readText('README.md');
    const currentState = readText('docs/product/current-state.md');
    const informationItemMap = readText('docs/information-item-map.md');
    const workbench = readText('docs/documentation-workbench.md');
    const authorityMap = readText('docs/product/wiki-authority-map.md');
    const contract = readText('docs/product/debt-retirement-contract.md');
    const taxonomy = readText('docs/product/debt-taxonomy.md');
    const ledger = readText('docs/product/debt-ledger.md');
    const adr = readText(
      'docs/architecture/adr/ADR-0023-governed-debt-retirement-contract.md'
    );

    expect(readme).toContain('docs/product/debt-retirement-contract.md');
    expect(readme).toContain('docs/product/debt-ledger.json');
    expect(currentState).toContain('docs/product/debt-retirement-contract.md');
    expect(currentState).toContain('docs/product/debt-ledger.json');
    expect(informationItemMap).toContain('docs/product/debt-retirement-contract.md');
    expect(informationItemMap).toContain('docs/product/debt-ledger.json');
    expect(workbench).toContain('docs/product/debt-retirement-contract.md');
    expect(workbench).toContain('docs/product/debt-ledger.json');
    expect(authorityMap).toContain('docs/product/debt-retirement-contract.md');
    expect(authorityMap).toContain('docs/product/debt-ledger.json');
    expect(contract).toContain('no silent debt');
    expect(contract).toContain('accepted bounded exception');
    expect(contract).toContain('docs/product/debt-ledger.json');
    expect(taxonomy).toContain('| `technical` |');
    expect(taxonomy).toContain('| `accepted-exception` |');
    expect(ledger).toContain('DEBT-0001');
    expect(adr).toContain('# ADR-0023: Governed Debt Retirement Contract');
    expect(adr).toContain('No silent debt');
  });

  it('keeps the machine-readable debt ledger well formed and owner-bound', () => {
    const ledger = readJson<DebtLedger>('docs/product/debt-ledger.json');

    expect(ledger.generatedFor).toBe('vi-history-suite');
    expect(ledger.contractStatus).toBe('active');
    expect(ledger.lastReviewedDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(ledger.statuses).toEqual(['open', 'retired', 'accepted-exception']);
    expect(ledger.debtClasses).toEqual([
      'technical',
      'documentation',
      'control-plane',
      'evidence',
      'runtime',
      'benchmark',
      'release'
    ]);
    expect(ledger.severities).toEqual(['low', 'medium', 'high']);
    expect(ledger.contaminationRiskLevels).toEqual(['low', 'medium', 'high']);
    expect(ledger.items.length).toBeGreaterThanOrEqual(4);
    expect(new Set(ledger.items.map((item) => item.id)).size).toBe(ledger.items.length);
    expect(ledger.items.some((item) => item.status === 'retired')).toBe(true);

    for (const item of ledger.items) {
      expect(item.id).toMatch(/^DEBT-\d{4}$/);
      expect(item.title.length).toBeGreaterThan(0);
      expect(ledger.debtClasses).toContain(item.debtClass);
      expect(ledger.statuses).toContain(item.status);
      expect(ledger.severities).toContain(item.severity);
      expect(ledger.contaminationRiskLevels).toContain(item.contaminationRisk);
      expect(item.summary.length).toBeGreaterThan(0);
      expect(item.owner.trancheId).toMatch(/^TRANCHE-\d{3}$/);
      expect(item.owner.issueId).toMatch(/^ISSUE-\d{4}$/);
      expect(item.owner.programId).toMatch(/^PROGRAM-\d{4}$/);
      expect(fs.existsSync(path.join(repoRoot, item.owner.programPath))).toBe(true);
      expect(fs.existsSync(path.join(repoRoot, item.owner.issuePath))).toBe(true);
      expect(item.authoritativeSources.length).toBeGreaterThan(0);
      expect(item.repoEvidence.length).toBeGreaterThan(0);
      expect(item.discoveredContext.length).toBeGreaterThan(0);
      expect(item.exitCriteria.length).toBeGreaterThan(0);

      for (const sourcePath of item.authoritativeSources) {
        expect(fs.existsSync(path.join(repoRoot, sourcePath))).toBe(true);
      }

      for (const evidencePath of item.repoEvidence) {
        expect(fs.existsSync(path.join(repoRoot, evidencePath))).toBe(true);
      }

      if (item.status === 'retired') {
        expect(item.nextGate).toBeNull();
        if (item.retirementCommit !== null) {
          expect(item.retirementCommit).toMatch(/^[0-9a-f]{7,40}$/);
        }
        expect(item.acceptedExceptionRationale).toBeNull();
      }

      if (item.status === 'open') {
        expect(item.nextGate).toBeTruthy();
        expect(item.retirementCommit).toBeNull();
        expect(item.acceptedExceptionRationale).toBeNull();
      }

      if (item.status === 'accepted-exception') {
        expect(item.acceptedExceptionRationale).toBeTruthy();
      }
    }
  });
});

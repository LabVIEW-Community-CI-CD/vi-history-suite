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
    const maintainerControlPlane = readText('docs/product/maintainer-control-plane-index.md');
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

    expect(readme).toContain('Maintainer Control Plane Index');
    expect(maintainerControlPlane).toContain('docs/product/debt-retirement-contract.md');
    expect(maintainerControlPlane).toContain('docs/product/debt-ledger.json');
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
    expect(contract).toContain('accepted bounded exception for the Windows pair-129 benchmark ceiling');
    expect(contract).toContain('accepted bounded exception for the Linux pair-135 full-window benchmark');
    expect(contract).toContain('retired extension execution-mode and Docker-acquisition UX debt');
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

  it('keeps DEBT-0006 historical instead of current Docker-only runtime truth', () => {
    const ledger = readJson<DebtLedger>('docs/product/debt-ledger.json');
    const ledgerMarkdown = readText('docs/product/debt-ledger.md');
    const contract = readText('docs/product/debt-retirement-contract.md');
    const item = ledger.items.find((candidate) => candidate.id === 'DEBT-0006');

    expect(item).toMatchObject({
      id: 'DEBT-0006',
      status: 'retired',
      owner: expect.objectContaining({
        trancheId: 'TRANCHE-013',
        issueId: 'ISSUE-0410',
        programId: 'PROGRAM-0005'
      })
    });
    expect(item?.title).toContain('Historical Docker-only');
    expect(item?.summary).toContain('historical baseline evidence');
    expect(item?.summary).toContain('not the current installed-user runtime destination');
    expect(item?.summary).toContain('host-default local `LabVIEWCLI`');
    expect(item?.summary).toContain('TRANCHE-016');
    expect(item?.summary).toContain('ISSUE-0412');
    expect(item?.summary).toContain('ADR-0038');
    expect(item?.exitCriteria).toContain('historical Docker-only transparency closeout');
    expect(item?.exitCriteria).toContain('host-default local `LabVIEWCLI`');
    expect(item?.exitCriteria).toContain('reintroduces current-sounding Docker-only');
    expect(item?.authoritativeSources).toEqual(
      expect.arrayContaining([
        'docs/product/issues/ISSUE-0412-installed-local-labviewcli-selection-and-explicit-compare.md',
        'docs/architecture/adr/ADR-0038-host-default-local-labviewcli-bounded-expert-docker-and-explicit-compare-preflight.md'
      ])
    );

    expect(item?.summary).not.toContain('current Docker daemon engine on Windows');
    expect(item?.exitCriteria).not.toContain('same Docker-only contract');
    expect(ledgerMarkdown).toContain('superseded by `TRANCHE-016` / `ISSUE-0412` / `ADR-0038`');
    expect(ledgerMarkdown).toContain('It is not current');
    expect(ledgerMarkdown).toContain('installed-user runtime direction.');
    expect(contract).toContain('retained as historical evidence after');
    expect(contract).toContain('host-default local `LabVIEWCLI` plus bounded expert Docker');
  });
});

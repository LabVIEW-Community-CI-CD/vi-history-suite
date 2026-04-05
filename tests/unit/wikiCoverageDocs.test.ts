import * as fs from 'node:fs';
import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '..', '..');
const wikiRoot = path.resolve(repoRoot, '..', 'vi-history-suite.wiki');

type CoverageMatrix = {
  acceptedAggregationRules: Array<{ id: string }>;
  coverage: Array<{
    sourcePath: string;
    itemType: string;
    aggregationRuleId?: string;
    representationStatus: string;
    publicationStatus: string;
    wikiFiles: string[];
  }>;
};

type WikiPublicationLedger = {
  pages: Array<{
    id: string;
    status: string;
    wikiFileName: string;
  }>;
  nextPage?: unknown;
};

function readText(relativePath: string): string {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function readJson<T>(relativePath: string): T {
  return JSON.parse(readText(relativePath)) as T;
}

function listAdrPaths(): string[] {
  return fs
    .readdirSync(path.join(repoRoot, 'docs', 'architecture', 'adr'))
    .filter((fileName) => fileName.endsWith('.md'))
    .sort()
    .map((fileName) => path.posix.join('docs', 'architecture', 'adr', fileName));
}

function listPublishedWikiFiles(): string[] {
  return fs
    .readdirSync(wikiRoot)
    .filter((fileName) => fileName.endsWith('.md') && fileName !== '_sidebar.md')
    .sort();
}

const expectedCoreSourcePaths = [
  'README.md',
  'docs/release-procedure.md',
  'docs/cm/cm-plan.md',
  'docs/information-item-map.md',
  'docs/product/SHIP-0001-releasable-vi-history-suite.md',
  'docs/product/release-readiness-matrix.json',
  'docs/product/blocker-ledger.json',
  'docs/product/development-queue.json',
  'docs/product/current-state.md',
  'docs/product/debt-retirement-contract.md',
  'docs/product/debt-taxonomy.md',
  'docs/product/debt-ledger.md',
  'docs/product/debt-ledger.json',
  'docs/product/canonical-exact-pair-diagnosis.md',
  'docs/product/documentation-coherence-ledger.md',
  'docs/product/wiki-authority-map.md',
  'docs/product/wiki-seed-plan.md',
  'docs/product/wiki-publication-ledger.md',
  'docs/product/wiki-publication-ledger.json',
  'docs/product/program-repo-jump.md',
  'docs/product/program-repo-jump-map.json',
  'docs/product/review-scenarios.md',
  'docs/product/decision-record-template.md',
  'docs/requirements/srs.md',
  'docs/requirements/rtm.csv',
  'docs/testing/test-plan.md',
  'docs/architecture/overview.md',
  'docs/documentation-workbench.md',
  'docs/research/authoritative/research-alignment.md',
  'docs/research/authoritative/research-implementation-index.json'
];

describe('wiki coverage invariant', () => {
  it('covers every in-scope standards surface and every ADR with complete published representation', () => {
    const matrix = readJson<CoverageMatrix>('docs/product/wiki-coverage-matrix.json');
    const expectedSourcePaths = [...expectedCoreSourcePaths, ...listAdrPaths()].sort();
    const actualSourcePaths = matrix.coverage.map((entry) => entry.sourcePath).sort();

    expect(matrix.acceptedAggregationRules.map((rule) => rule.id)).toContain('adr-set-aggregate');
    expect(actualSourcePaths).toEqual(expectedSourcePaths);
    expect(new Set(actualSourcePaths).size).toBe(actualSourcePaths.length);

    for (const entry of matrix.coverage) {
      expect(entry.representationStatus).toBe('complete');
      expect(entry.publicationStatus).toBe('published');
      expect(entry.wikiFiles.length).toBeGreaterThan(0);

      for (const wikiFile of entry.wikiFiles) {
        expect(fs.existsSync(path.join(wikiRoot, wikiFile))).toBe(true);
      }
    }

    const adrEntries = matrix.coverage.filter((entry) =>
      entry.sourcePath.startsWith('docs/architecture/adr/')
    );
    expect(adrEntries.map((entry) => entry.sourcePath).sort()).toEqual(listAdrPaths());

    for (const entry of adrEntries) {
      expect(entry.itemType).toBe('adr');
      expect(entry.aggregationRuleId).toBe('adr-set-aggregate');
    }
  });

  it('keeps the coverage matrix, publication ledger, and live wiki repo aligned', () => {
    const matrix = readJson<CoverageMatrix>('docs/product/wiki-coverage-matrix.json');
    const ledger = readJson<WikiPublicationLedger>('docs/product/wiki-publication-ledger.json');
    const publishedLedgerFiles = ledger.pages
      .filter((page) => page.status === 'published')
      .map((page) => page.wikiFileName)
      .sort();
    const matrixWikiFiles = [...new Set(matrix.coverage.flatMap((entry) => entry.wikiFiles))].sort();
    const liveWikiFiles = listPublishedWikiFiles();

    expect(publishedLedgerFiles).toEqual(liveWikiFiles);
    expect(matrixWikiFiles).toEqual(liveWikiFiles);
    expect(ledger.nextPage ?? null).toBeNull();
  });

  it('documents the zero-gap completion rule in the authority control plane', () => {
    const readme = readText('README.md');
    const currentState = readText('docs/product/current-state.md');
    const workbench = readText('docs/documentation-workbench.md');
    const authorityMap = readText('docs/product/wiki-authority-map.md');
    const seedPlan = readText('docs/product/wiki-seed-plan.md');
    const publicationLedger = readText('docs/product/wiki-publication-ledger.md');
    const informationItemMap = readText('docs/information-item-map.md');
    const adr = readText('docs/architecture/adr/ADR-0019-governed-wiki-workbench-system.md');

    expect(readme).toContain('docs/product/wiki-coverage-matrix.json');
    expect(currentState).toContain('docs/product/wiki-coverage-matrix.json');
    expect(workbench).toContain('docs/product/wiki-coverage-matrix.json');
    expect(authorityMap).toContain('Hard Completion Contract');
    expect(seedPlan).toContain('zero-gap completion invariant');
    expect(publicationLedger).toContain('zero-gap completion invariant');
    expect(informationItemMap).toContain('Wiki coverage matrix');
    expect(adr).toContain('coverage matrix');
  });
});

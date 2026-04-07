import * as fs from 'node:fs';
import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '..', '..');

function readText(relativePath: string): string {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

describe('public facade boundary docs', () => {
  it('keeps the GitHub public facade, public wiki, and internal GitLab control plane split explicit', () => {
    const adr = readText(
      'docs/architecture/adr/ADR-0027-public-github-facade-and-user-wiki-vs-internal-gitlab-control-plane.md'
    );
    const currentState = readText('docs/product/current-state.md');
    const queue = readText('docs/product/development-queue.json');
    const releaseProcedure = readText('docs/release-procedure.md');
    const internalMap = readText('docs/product/wiki-authority-map.md');
    const publicMap = readText('docs/product/public-github-wiki-authority-map.md');
    const publicSourceMap = readText('docs/product/public-github-source-authority-map.md');
    const internalLedger = readText('docs/product/wiki-publication-ledger.md');
    const internalLedgerJson = readText('docs/product/wiki-publication-ledger.json');
    const publicLedger = readText('docs/product/public-github-wiki-publication-ledger.md');
    const publicLedgerJson = readText('docs/product/public-github-wiki-publication-ledger.json');
    const publicSourceLedger = readText('docs/product/public-github-source-publication-ledger.md');
    const publicSourceLedgerJson = readText(
      'docs/product/public-github-source-publication-ledger.json'
    );
    const program = readText(
      'docs/product/execution-programs/PROGRAM-0002-public-facade-installer-and-windows-acceptance.md'
    );

    expect(adr).toContain('one-way publication rules');
    expect(adr).toContain('separate evidence trails');
    expect(currentState).toContain('public GitHub source publication is tracked separately');
    expect(currentState).toContain('npm run public:source:promote');
    expect(currentState).toContain('public GitHub wiki publication is tracked separately');
    expect(currentState).toContain('published public GitHub wiki pages now include `Home`, `User-Workflow`, `Install-And-Release`, `Comparison-Reports-And-Dashboard-Review`, and `Current-State`');
    expect(currentState).toContain('docs:ci:public');
    expect(currentState).toContain('docs:ci:internal');
    expect(currentState).toContain('public-facade Linux smoke lane');
    expect(queue).toContain('public-user and internal-authority docs surfaces');
    expect(releaseProcedure).toContain('docs:ci:public');
    expect(releaseProcedure).toContain('docs:ci:internal');
    expect(releaseProcedure).toContain('public-facade Linux smoke');
    expect(releaseProcedure).toContain('public-github-source-authority-map.md');
    expect(releaseProcedure).toContain('public:source:promote');
    expect(internalMap).toContain('internal GitLab maintainer wiki');
    expect(internalMap).toContain('public GitHub user wiki');
    expect(publicMap).toContain('public GitHub user wiki only');
    expect(publicMap).toContain('shall not use these as primary truth sources');
    expect(publicMap).toContain('docs/requirements/srs.md');
    expect(publicSourceMap).toContain('public GitHub source repo only');
    expect(publicSourceMap).toContain('curated product surface');
    expect(publicSourceMap).toContain('docs/requirements/srs.md');
    expect(internalLedger).toContain('internal GitLab maintainer wiki');
    expect(internalLedgerJson).toContain('"publicationSurface": "internal-gitlab-wiki"');
    expect(publicLedger).toContain('public GitHub user wiki');
    expect(publicLedger).toContain('Current published public GitHub wiki HEAD: `a7e30cd`');
    expect(publicLedger).toContain('a7e30cd');
    expect(publicLedger).toContain('User Workflow');
    expect(publicLedger).toContain('Install And Release');
    expect(publicLedger).toContain('Comparison Reports And Dashboard Review');
    expect(publicLedger).toContain('Current State');
    expect(publicLedgerJson).toContain('"publicationSurface": "public-github-user-wiki"');
    expect(publicLedgerJson).toContain('"publishedHeadCommit": "a7e30cd"');
    expect(publicLedgerJson).toContain('"wikiFileName": "Home.md"');
    expect(publicLedgerJson).toContain('"wikiFileName": "User-Workflow.md"');
    expect(publicLedgerJson).toContain('"wikiFileName": "Install-And-Release.md"');
    expect(publicLedgerJson).toContain('"wikiFileName": "Comparison-Reports-And-Dashboard-Review.md"');
    expect(publicLedgerJson).toContain('"wikiFileName": "Current-State.md"');
    expect(publicLedgerJson).toContain('"nextPage": null');
    expect(publicSourceLedger).toContain('Public source product repo baseline');
    expect(publicSourceLedger).toContain('published');
    expect(publicSourceLedger).toContain('Current published public GitHub source HEAD: `d787f2d`');
    expect(publicSourceLedger).toContain('d787f2d');
    expect(publicSourceLedgerJson).toContain('"publicationSurface": "public-github-source-repo"');
    expect(publicSourceLedgerJson).toContain('"publishedHeadCommit": "d787f2d"');
    expect(publicSourceLedgerJson).toContain('"status": "published"');
    expect(publicSourceLedgerJson).toContain('"repoCommit": "d787f2d"');
    expect(program).toContain('workflow_dispatch');
    expect(program).toContain('npm run public:smoke:linux');
    expect(program).toContain('docs:ci:public');
    expect(program).toContain('Linux-engine cold-pull');
  });
});

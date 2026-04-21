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
    expect(currentState).toContain(
      'published public GitHub wiki pages now include `Home`, `User-Workflow`, `Install-And-Release`, `Fork-Codespace-Quickstart`, `Clone-Public-Repo-In-Codespace`, `Review-Public-LabVIEW-VI-Changes`, `Refresh-Codespace-Repositories`, `Comparison-Reports-And-Dashboard-Review`, and `Current-State`'
    );
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
    expect(publicMap).toContain('Exact public release wiki pages and bundled installed-user docs shall keep');
    expect(publicMap).toContain('No later public candidate wiki head is open yet');
    expect(publicMap).toContain('candidate surfaces shall stay explicit');
    expect(publicMap).toContain('docs/requirements/srs.md');
    expect(publicSourceMap).toContain('public GitHub source repo only');
    expect(publicSourceMap).toContain('curated product surface');
    expect(publicSourceMap).toContain('Exact public `main` shall keep the exact released `v1.3.0` host-default');
    expect(publicSourceMap).toContain('No later public candidate line is open yet');
    expect(publicSourceMap).toContain('any later candidate lane shall stay');
    expect(publicSourceMap).toContain('docs/requirements/srs.md');
    expect(internalLedger).toContain('internal GitLab maintainer wiki');
    expect(internalLedgerJson).toContain('"publicationSurface": "internal-gitlab-wiki"');
    expect(publicLedger).toContain('public GitHub user wiki');
    expect(publicLedger).toContain('Current published public GitHub wiki HEAD: `53b5348`');
    expect(publicLedger).toContain('53b5348');
    expect(publicLedger).toContain('527a8b4');
    expect(publicLedger).toContain('User Workflow');
    expect(publicLedger).toContain('Install And Release');
    expect(publicLedger).toContain('Fork Codespace Quickstart');
    expect(publicLedger).toContain('Clone Public Repo In Codespace');
    expect(publicLedger).toContain('Review Public LabVIEW VI Changes');
    expect(publicLedger).toContain('Manual Actor Framework Clone');
    expect(publicLedger).toContain('Comparison Reports And Dashboard Review');
    expect(publicLedger).toContain('Refresh Codespace Repositories');
    expect(publicLedger).toContain('Current State');
    expect(publicLedgerJson).toContain('"publicationSurface": "public-github-user-wiki"');
    expect(publicLedgerJson).toContain('"publishedHeadCommit": "53b5348"');
    expect(publicLedgerJson).toContain('"wikiFileName": "Home.md"');
    expect(publicLedgerJson).toContain('"wikiFileName": "User-Workflow.md"');
    expect(publicLedgerJson).toContain('"wikiFileName": "Install-And-Release.md"');
    expect(publicLedgerJson).toContain('"wikiFileName": "Fork-Codespace-Quickstart.md"');
    expect(publicLedgerJson).toContain('"wikiFileName": "Clone-Public-Repo-In-Codespace.md"');
    expect(publicLedgerJson).toContain('"wikiFileName": "Review-Public-LabVIEW-VI-Changes.md"');
    expect(publicLedgerJson).toContain('"wikiFileName": "Manual-Actor-Framework-Clone.md"');
    expect(publicLedgerJson).toContain('"wikiFileName": "Comparison-Reports-And-Dashboard-Review.md"');
    expect(publicLedgerJson).toContain('"wikiFileName": "Refresh-Codespace-Repositories.md"');
    expect(publicLedgerJson).toContain('"wikiFileName": "Current-State.md"');
    expect(publicLedgerJson).toContain('"nextPage": null');
    expect(publicSourceLedger).toContain('Public source product repo baseline');
    expect(publicSourceLedger).toContain('published');
    expect(publicSourceLedger).toContain('Current published public GitHub source HEAD: `0ea58af`');
    expect(publicSourceLedger).toContain('86b19a2');
    expect(publicSourceLedger).toContain('722c1f7');
    expect(publicSourceLedger).toContain('b1de8c5');
    expect(publicSourceLedger).toContain('1c369f7');
    expect(publicSourceLedger).toContain('c71af69');
    expect(publicSourceLedger).toContain('0f19f4b');
    expect(publicSourceLedger).toContain('0ea58af');
    expect(publicSourceLedger).toContain('Public source v1.1.0 exact release');
    expect(publicSourceLedger).toContain('Public source v1.2.0 exact release');
    expect(publicSourceLedger).toContain('Public source v1.2.0 candidate moved-VI and bundled-doc refresh');
    expect(publicSourceLedger).toContain(
      'Public source v1.2.1 Marketplace installed-user entry refresh'
    );
    expect(publicSourceLedger).toContain('Public source v1.2.2 exact release');
    expect(publicSourceLedger).toContain('Public source v1.3.0 runtime-provider public develop candidate');
    expect(publicSourceLedger).toContain('Public source v1.3.0 publication-control refresh');
    expect(publicSourceLedger).toContain('Public source v1.3.0 public-wiki review fold publication');
    expect(publicSourceLedger).toContain('Public source v1.3.0 bundled-doc wording follow-up');
    expect(publicSourceLedger).toContain('Public source v1.3.0 exact release');
    expect(publicSourceLedger).toContain(
      'Public source v1.2.2 Docker-first-run and closeout-governance refresh'
    );
    expect(publicSourceLedger).toContain(
      'Public source v1.2.2 bundled installed-user docs refresh'
    );
    expect(publicSourceLedgerJson).toContain('"publicationSurface": "public-github-source-repo"');
    expect(publicSourceLedgerJson).toContain('"publishedHeadCommit": "0ea58af"');
    expect(publicSourceLedgerJson).toContain('"status": "published"');
    expect(publicSourceLedgerJson).toContain('"repoCommit": "daef8bd"');
    expect(publicSourceLedgerJson).toContain('"repoCommit": "c9806c3"');
    expect(publicSourceLedgerJson).toContain('"repoCommit": "ac56456"');
    expect(publicSourceLedgerJson).toContain('"repoCommit": "c7cd6a0"');
    expect(publicSourceLedgerJson).toContain('"repoCommit": "96af6a3"');
    expect(publicSourceLedgerJson).toContain('"repoCommit": "2547344"');
    expect(publicSourceLedgerJson).toContain('"repoCommit": "894cd5f"');
    expect(publicSourceLedgerJson).toContain('"repoCommit": "96944d7"');
    expect(publicSourceLedgerJson).toContain('"repoCommit": "12391e1"');
    expect(publicSourceLedgerJson).toContain('"repoCommit": "86b19a2"');
    expect(publicSourceLedgerJson).toContain('"repoCommit": "722c1f7"');
    expect(publicSourceLedgerJson).toContain('"repoCommit": "b1de8c5"');
    expect(publicSourceLedgerJson).toContain('"repoCommit": "1c369f7"');
    expect(publicSourceLedgerJson).toContain('"repoCommit": "c71af69"');
    expect(publicSourceLedgerJson).toContain('"repoCommit": "0f19f4b"');
    expect(publicSourceLedgerJson).toContain('"repoCommit": "0ea58af"');
    expect(program).toContain('workflow_dispatch');
    expect(program).toContain('npm run public:smoke:linux');
    expect(program).toContain('docs:ci:public');
    expect(program).toContain('Linux-engine cold-pull');
  });
});

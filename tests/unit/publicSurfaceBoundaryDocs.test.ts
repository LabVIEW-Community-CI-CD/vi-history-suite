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
    const internalLedger = readText('docs/product/wiki-publication-ledger.md');
    const internalLedgerJson = readText('docs/product/wiki-publication-ledger.json');
    const publicLedger = readText('docs/product/public-github-wiki-publication-ledger.md');
    const publicLedgerJson = readText('docs/product/public-github-wiki-publication-ledger.json');
    const program = readText(
      'docs/product/execution-programs/PROGRAM-0002-public-facade-installer-and-windows-acceptance.md'
    );

    expect(adr).toContain('one-way publication rules');
    expect(adr).toContain('separate evidence trails');
    expect(currentState).toContain('public GitHub wiki publication is tracked separately');
    expect(currentState).toContain('published public GitHub wiki pages now include `Home`, `User-Workflow`, `Install-And-Release`, and `Current-State`');
    expect(currentState).toContain('docs:ci:public');
    expect(currentState).toContain('docs:ci:internal');
    expect(currentState).toContain('public-facade Linux smoke lane');
    expect(queue).toContain('public-user and internal-authority docs surfaces');
    expect(releaseProcedure).toContain('docs:ci:public');
    expect(releaseProcedure).toContain('docs:ci:internal');
    expect(releaseProcedure).toContain('public-facade Linux smoke');
    expect(internalMap).toContain('internal GitLab maintainer wiki');
    expect(internalMap).toContain('public GitHub user wiki');
    expect(publicMap).toContain('public GitHub user wiki only');
    expect(publicMap).toContain('shall not use these as primary truth sources');
    expect(publicMap).toContain('docs/requirements/srs.md');
    expect(internalLedger).toContain('internal GitLab maintainer wiki');
    expect(internalLedgerJson).toContain('"publicationSurface": "internal-gitlab-wiki"');
    expect(publicLedger).toContain('public GitHub user wiki');
    expect(publicLedger).toContain('17ac8ac');
    expect(publicLedger).toContain('User Workflow');
    expect(publicLedger).toContain('Install And Release');
    expect(publicLedger).toContain('Current State');
    expect(publicLedgerJson).toContain('"publicationSurface": "public-github-user-wiki"');
    expect(publicLedgerJson).toContain('"wikiFileName": "Home.md"');
    expect(publicLedgerJson).toContain('"wikiFileName": "User-Workflow.md"');
    expect(publicLedgerJson).toContain('"wikiFileName": "Install-And-Release.md"');
    expect(publicLedgerJson).toContain('"wikiFileName": "Current-State.md"');
    expect(publicLedgerJson).toContain('"nextPage": null');
    expect(program).toContain('workflow_dispatch');
    expect(program).toContain('npm run public:smoke:linux');
    expect(program).toContain('docs:ci:public');
    expect(program).toContain('Linux-engine cold-pull');
  });
});

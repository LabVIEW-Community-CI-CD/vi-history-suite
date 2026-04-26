import * as fs from 'node:fs';
import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '..', '..');

function readText(relativePath: string): string {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

describe('public facade boundary docs', () => {
  it('keeps the public source publication boundary explicit after the exact v1.3.9 GitHub release', () => {
    const currentState = readText('docs/product/current-state.md');
    const releaseProcedure = readText('docs/release-procedure.md');
    const publicSourceMap = readText('docs/product/public-github-source-authority-map.md');
    const publicSourceLedger = readText('docs/product/public-github-source-publication-ledger.md');
    const publicSourceLedgerJson = readText(
      'docs/product/public-github-source-publication-ledger.json'
    );

    expect(currentState).toContain('public GitHub source publication is tracked separately');
    expect(currentState).toContain('npm run public:source:promote');
    expect(releaseProcedure).toContain('public-github-source-authority-map.md');
    expect(releaseProcedure).toContain('public:source:promote');
    expect(publicSourceMap).toContain('public GitHub source repo only');
    expect(publicSourceMap).toContain(
      'Exact public `main` now publishes the exact released `v1.3.9` source line'
    );
    expect(publicSourceMap).toContain('the separate GitHub release record for `v1.3.9` is now');
    expect(publicSourceMap).toContain('VS Code Marketplace now serves `1.3.9`');
    expect(publicSourceMap).toContain('Marketplace community-validation intake templates and labels');
    expect(publicSourceMap).toContain('protected-branch PR');
    expect(publicSourceMap).toContain('b56fde1');
    expect(publicSourceMap).toContain('ce6dbd0');
    expect(publicSourceMap).toContain('public PR #60');
    expect(publicSourceLedger).toContain('Current published public GitHub source HEAD: `ce6dbd0`');
    expect(publicSourceLedger).toContain('Public source v1.3.9 exact source publication');
    expect(publicSourceLedger).toContain('Public source v1.3.10 community-validation intake publication');
    expect(publicSourceLedger).toContain('Public source v1.3.11 canonical Docker fixture docs promotion');
    expect(publicSourceLedger).toContain('fb0ef2b');
    expect(publicSourceLedger).toContain('b56fde1');
    expect(publicSourceLedger).toContain('ce6dbd0');
    expect(publicSourceLedger).toContain('Marketplace mutation: not performed');
    expect(publicSourceLedgerJson).toContain('"publicationSurface": "public-github-source-repo"');
    expect(publicSourceLedgerJson).toContain('"publishedHeadCommit": "ce6dbd0"');
    expect(publicSourceLedgerJson).toContain('"id": "public-source-v1-3-9-exact-source-publication"');
    expect(publicSourceLedgerJson).toContain(
      '"id": "public-source-v1-3-10-community-validation-intake-publication"'
    );
    expect(publicSourceLedgerJson).toContain(
      '"id": "public-source-v1-3-11-canonical-docker-fixture-docs-promotion"'
    );
    expect(publicSourceLedgerJson).toContain('"repoCommit": "fb0ef2b"');
    expect(publicSourceLedgerJson).toContain('"repoCommit": "b56fde1"');
    expect(publicSourceLedgerJson).toContain('"repoCommit": "ce6dbd0"');
    expect(publicSourceLedgerJson).toContain(
      '"repoCommitSha": "ce6dbd0b1b5783f7015b9d0589f3803636564789"'
    );
    expect(publicSourceLedgerJson).toContain('"status": "published"');
  });
});

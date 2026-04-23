import * as fs from 'node:fs';
import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '..', '..');

function readText(relativePath: string): string {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

describe('public facade boundary docs', () => {
  it('keeps the public source publication boundary explicit after the exact v1.3.7 GitHub release', () => {
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
    expect(publicSourceMap).toContain('Exact public `main` now publishes the exact released `v1.3.7` source line');
    expect(publicSourceMap).toContain('GitHub release record for `v1.3.7` is now');
    expect(publicSourceMap).toContain('VS Code Marketplace still remains on `1.3.0`');
    expect(publicSourceLedger).toContain('Current published public GitHub source HEAD: `704e629`');
    expect(publicSourceLedger).toContain('Public source v1.3.7 exact source publication');
    expect(publicSourceLedger).toContain('704e629');
    expect(publicSourceLedger).toContain('ab293d5');
    expect(publicSourceLedgerJson).toContain('"publicationSurface": "public-github-source-repo"');
    expect(publicSourceLedgerJson).toContain('"publishedHeadCommit": "704e629"');
    expect(publicSourceLedgerJson).toContain('"id": "public-source-v1-3-7-exact-source-publication"');
    expect(publicSourceLedgerJson).toContain('"repoCommit": "704e629"');
    expect(publicSourceLedgerJson).toContain('"status": "published"');
  });
});

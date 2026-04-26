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
    expect(publicSourceMap).toContain('public facade promotion and publication');
    expect(publicSourceLedger).toContain('Current published public GitHub source HEAD: `fb0ef2b`');
    expect(publicSourceLedger).toContain('Public source v1.3.9 exact source publication');
    expect(publicSourceLedger).toContain('fb0ef2b');
    expect(publicSourceLedgerJson).toContain('"publicationSurface": "public-github-source-repo"');
    expect(publicSourceLedgerJson).toContain('"publishedHeadCommit": "fb0ef2b"');
    expect(publicSourceLedgerJson).toContain('"id": "public-source-v1-3-9-exact-source-publication"');
    expect(publicSourceLedgerJson).toContain('"repoCommit": "fb0ef2b"');
    expect(publicSourceLedgerJson).toContain('"status": "published"');
  });
});

import * as fs from 'node:fs';
import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '..', '..');

function readText(relativePath: string): string {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

describe('public facade boundary docs', () => {
  it('keeps the public source publication boundary explicit after the v1.3.16 adoption closeout', () => {
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
      'Exact public `v1.3.16` remains retained at public tag `v1.3.16`'
    );
    expect(publicSourceMap).toContain('current public `main` now publishes the post-release');
    expect(releaseProcedure).toContain('VS Code Marketplace now serves `1.3.16`');
    expect(publicSourceMap).toContain('Marketplace community-validation intake templates and labels');
    expect(publicSourceMap).toContain('protected-branch PR');
    expect(publicSourceMap).toContain('b56fde1');
    expect(publicSourceMap).toContain('fe4b1589');
    expect(publicSourceMap).toContain('public PR #90');
    expect(publicSourceMap).toContain('90b6e600');
    expect(publicSourceMap).toContain('public PR #89');
    expect(publicSourceMap).toContain('f679023');
    expect(publicSourceMap).toContain('public PR #88');
    expect(publicSourceMap).toContain('f6ca389269dac140dc416d76bb4c2ac142664567');
    expect(publicSourceMap).toContain('f1cb609');
    expect(publicSourceMap).toContain('public PR #69');
    expect(publicSourceMap).toContain('b6cea29ac68e542a1c792ba18d1cef8cb7ded3ae');
    expect(publicSourceMap).toContain('220111e');
    expect(publicSourceMap).toContain('public PR #68');
    expect(publicSourceMap).toContain('ce6dbd0');
    expect(publicSourceMap).toContain('public PR #60');
    expect(publicSourceLedger).toContain('Current published public GitHub source HEAD: `fe4b1589`');
    expect(publicSourceLedger).toContain('Public source v1.3.9 exact source publication');
    expect(publicSourceLedger).toContain('Public source v1.3.10 community-validation intake publication');
    expect(publicSourceLedger).toContain('Public source v1.3.11 canonical Docker fixture docs promotion');
    expect(publicSourceLedger).toContain('Public source v1.3.13 Windows Docker Desktop intake promotion');
    expect(publicSourceLedger).toContain('Public source v1.3.14 exact source and tag handoff');
    expect(publicSourceLedger).toContain('Public source v1.3.15 exact source, release, and Marketplace closeout');
    expect(publicSourceLedger).toContain('Public source v1.3.16 exact source, release, and Marketplace closeout');
    expect(publicSourceLedger).toContain('Public source post-v1.3.16 installed-user support matrix adoption');
    expect(publicSourceLedger).toContain('Public source v1.3.16 intake surface normalization');
    expect(publicSourceLedger).toContain('fb0ef2b');
    expect(publicSourceLedger).toContain('b56fde1');
    expect(publicSourceLedger).toContain('ce6dbd0');
    expect(publicSourceLedger).toContain('220111e');
    expect(publicSourceLedger).toContain('f1cb609');
    expect(publicSourceLedger).toContain('427ab27');
    expect(publicSourceLedger).toContain('f679023');
    expect(publicSourceLedger).toContain('90b6e600');
    expect(publicSourceLedger).toContain('fe4b1589');
    expect(publicSourceLedger).toContain('b6cea29ac68e542a1c792ba18d1cef8cb7ded3ae');
    expect(publicSourceLedger).toContain('not performed for that historical line');
    expect(publicSourceLedgerJson).toContain('"publicationSurface": "public-github-source-repo"');
    expect(publicSourceLedgerJson).toContain('"publishedHeadCommit": "fe4b1589"');
    expect(publicSourceLedgerJson).toContain('"id": "public-source-v1-3-9-exact-source-publication"');
    expect(publicSourceLedgerJson).toContain(
      '"id": "public-source-v1-3-10-community-validation-intake-publication"'
    );
    expect(publicSourceLedgerJson).toContain(
      '"id": "public-source-v1-3-11-canonical-docker-fixture-docs-promotion"'
    );
    expect(publicSourceLedgerJson).toContain(
      '"id": "public-source-v1-3-13-windows-docker-desktop-intake-promotion"'
    );
    expect(publicSourceLedgerJson).toContain(
      '"id": "public-source-v1-3-14-exact-source-and-tag-handoff"'
    );
    expect(publicSourceLedgerJson).toContain(
      '"id": "public-source-v1-3-15-exact-source-release-and-marketplace-closeout"'
    );
    expect(publicSourceLedgerJson).toContain(
      '"id": "public-source-v1-3-16-exact-source-release-and-marketplace-closeout"'
    );
    expect(publicSourceLedgerJson).toContain(
      '"id": "public-source-post-v1-3-16-installed-user-support-matrix-adoption"'
    );
    expect(publicSourceLedgerJson).toContain(
      '"id": "public-source-v1-3-16-intake-surface-normalization"'
    );
    expect(publicSourceLedgerJson).toContain('"repoCommit": "fb0ef2b"');
    expect(publicSourceLedgerJson).toContain('"repoCommit": "b56fde1"');
    expect(publicSourceLedgerJson).toContain('"repoCommit": "ce6dbd0"');
    expect(publicSourceLedgerJson).toContain('"repoCommit": "220111e"');
    expect(publicSourceLedgerJson).toContain('"repoCommit": "f1cb609"');
    expect(publicSourceLedgerJson).toContain('"repoCommit": "427ab27"');
    expect(publicSourceLedgerJson).toContain('"repoCommit": "f679023"');
    expect(publicSourceLedgerJson).toContain('"repoCommit": "90b6e600"');
    expect(publicSourceLedgerJson).toContain('"repoCommit": "fe4b1589"');
    expect(publicSourceLedgerJson).toContain(
      '"repoCommitSha": "ce6dbd0b1b5783f7015b9d0589f3803636564789"'
    );
    expect(publicSourceLedgerJson).toContain(
      '"repoCommitSha": "220111eae3ac214e99f2233e2bfe6b320edf383d"'
    );
    expect(publicSourceLedgerJson).toContain(
      '"repoCommitSha": "f1cb60900820ea17328b9eec595579768491e22a"'
    );
    expect(publicSourceLedgerJson).toContain(
      '"repoCommitSha": "427ab27245f6f66d186e07865f1fc0a00795611a"'
    );
    expect(publicSourceLedgerJson).toContain(
      '"repoCommitSha": "f679023ed760963779d9331a9395128ad01c7e54"'
    );
    expect(publicSourceLedgerJson).toContain(
      '"repoCommitSha": "90b6e600ea025aeb238832cf91fe15ff2b0c7db8"'
    );
    expect(publicSourceLedgerJson).toContain(
      '"repoCommitSha": "fe4b15894d8417e6f1e0d234cb19bd945ef716c3"'
    );
    expect(publicSourceLedgerJson).toContain(
      '"tagObjectSha": "b6cea29ac68e542a1c792ba18d1cef8cb7ded3ae"'
    );
    expect(publicSourceLedgerJson).toContain(
      '"tagObjectSha": "f6ca389269dac140dc416d76bb4c2ac142664567"'
    );
    expect(publicSourceLedgerJson).toContain(
      '"publicGithubReleasePublication": "not-performed"'
    );
    expect(publicSourceLedgerJson).toContain('"status": "published"');
  });
});

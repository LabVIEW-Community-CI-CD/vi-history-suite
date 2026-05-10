import * as fs from 'node:fs';
import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '..', '..');

function readText(relativePath: string): string {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

describe('public facade boundary docs', () => {
  it('keeps the public source publication boundary explicit after the v1.3.15 closeout', () => {
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
      'Exact public `main` now publishes the exact released `v1.3.15` source line'
    );
    expect(publicSourceMap).toContain('the separate GitHub release record for `v1.3.15` is now');
    expect(publicSourceMap).toContain('VS Code Marketplace now serves `1.3.15`');
    expect(publicSourceMap).toContain('Marketplace community-validation intake templates and labels');
    expect(publicSourceMap).toContain('protected-branch PR');
    expect(publicSourceMap).toContain('b56fde1');
    expect(publicSourceMap).toContain('427ab27');
    expect(publicSourceMap).toContain('public PR #83');
    expect(publicSourceMap).toContain('28ea4253813e6f322cbcc25cdce865cdeac219a6');
    expect(publicSourceMap).toContain('f1cb609');
    expect(publicSourceMap).toContain('public PR #69');
    expect(publicSourceMap).toContain('b6cea29ac68e542a1c792ba18d1cef8cb7ded3ae');
    expect(publicSourceMap).toContain('220111e');
    expect(publicSourceMap).toContain('public PR #68');
    expect(publicSourceMap).toContain('ce6dbd0');
    expect(publicSourceMap).toContain('public PR #60');
    expect(publicSourceLedger).toContain('Current published public GitHub source HEAD: `427ab27`');
    expect(publicSourceLedger).toContain('Public source v1.3.9 exact source publication');
    expect(publicSourceLedger).toContain('Public source v1.3.10 community-validation intake publication');
    expect(publicSourceLedger).toContain('Public source v1.3.11 canonical Docker fixture docs promotion');
    expect(publicSourceLedger).toContain('Public source v1.3.13 Windows Docker Desktop intake promotion');
    expect(publicSourceLedger).toContain('Public source v1.3.14 exact source and tag handoff');
    expect(publicSourceLedger).toContain('Public source v1.3.15 exact source, release, and Marketplace closeout');
    expect(publicSourceLedger).toContain('fb0ef2b');
    expect(publicSourceLedger).toContain('b56fde1');
    expect(publicSourceLedger).toContain('ce6dbd0');
    expect(publicSourceLedger).toContain('220111e');
    expect(publicSourceLedger).toContain('f1cb609');
    expect(publicSourceLedger).toContain('427ab27');
    expect(publicSourceLedger).toContain('b6cea29ac68e542a1c792ba18d1cef8cb7ded3ae');
    expect(publicSourceLedger).toContain('not performed for that historical line');
    expect(publicSourceLedgerJson).toContain('"publicationSurface": "public-github-source-repo"');
    expect(publicSourceLedgerJson).toContain('"publishedHeadCommit": "427ab27"');
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
    expect(publicSourceLedgerJson).toContain('"repoCommit": "fb0ef2b"');
    expect(publicSourceLedgerJson).toContain('"repoCommit": "b56fde1"');
    expect(publicSourceLedgerJson).toContain('"repoCommit": "ce6dbd0"');
    expect(publicSourceLedgerJson).toContain('"repoCommit": "220111e"');
    expect(publicSourceLedgerJson).toContain('"repoCommit": "f1cb609"');
    expect(publicSourceLedgerJson).toContain('"repoCommit": "427ab27"');
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
      '"tagObjectSha": "b6cea29ac68e542a1c792ba18d1cef8cb7ded3ae"'
    );
    expect(publicSourceLedgerJson).toContain(
      '"tagObjectSha": "28ea4253813e6f322cbcc25cdce865cdeac219a6"'
    );
    expect(publicSourceLedgerJson).toContain(
      '"publicGithubReleasePublication": "not-performed"'
    );
    expect(publicSourceLedgerJson).toContain('"status": "published"');
  });
});

import * as fs from 'node:fs';
import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '..', '..');

function readRepoText(...segments: string[]): string {
  return fs
    .readFileSync(path.join(repoRoot, ...segments), 'utf8')
    .replace(/\r\n/g, '\n');
}

const orgRepoUrl = 'https://github.com/LabVIEW-Community-CI-CD/vi-history-suite';
const orgIssueUrl = `${orgRepoUrl}/issues`;
const marketplaceIdentity = 'svelderrainruiz.vi-history-suite';

describe('public docs source and support link confidence', () => {
  it('identifies the organization repository as the active public source home in README', () => {
    const readme = readRepoText('README.md');

    expect(readme).toContain(orgRepoUrl);
    expect(readme).toContain(marketplaceIdentity);
  });

  it('identifies the organization repository in INSTALL without old personal repo as active source', () => {
    const install = readRepoText('INSTALL.md');

    expect(install).toContain(marketplaceIdentity);
    expect(install).toContain('LabVIEW Community CI/CD GitHub organization');
    expect(install).not.toMatch(
      /github\.com\/svelderrainruiz\/vi-history-suite(?!\.git\b)/i
    );
  });

  it('points support issues to the organization repository in SUPPORT', () => {
    const support = readRepoText('SUPPORT.md');

    expect(support).toContain(orgIssueUrl);
    expect(support).not.toMatch(
      /github\.com\/svelderrainruiz\/vi-history-suite(?!\.git\b)/i
    );
  });

  it('references GitHub private vulnerability reporting without old personal repo in SECURITY', () => {
    const security = readRepoText('SECURITY.md');

    expect(security).toContain('GitHub private vulnerability');
    expect(security).not.toMatch(
      /github\.com\/svelderrainruiz\/vi-history-suite(?!\.git\b)/i
    );
  });

  it('documents external Marketplace verification in maintainer operations', () => {
    const maintainerOps = readRepoText('docs', 'maintainer-operations.md');

    expect(maintainerOps).toContain(marketplaceIdentity);
    expect(maintainerOps).toContain(orgRepoUrl);
    expect(maintainerOps).toContain('Marketplace extension identity remains');
  });

  it('does not present old personal repo as active source or issue tracker in public docs', () => {
    const publicDocs = [
      readRepoText('README.md'),
      readRepoText('INSTALL.md'),
      readRepoText('SUPPORT.md'),
      readRepoText('SECURITY.md')
    ].join('\n');

    // Old personal repo should not appear as active source links
    // The regex looks for personal repo URLs that are NOT followed by .git
    // (since the historical git clone URL with .git suffix may appear in migration context)
    expect(publicDocs).not.toMatch(
      /https:\/\/github\.com\/svelderrainruiz\/vi-history-suite(?!\.git)/
    );

    // Should not refer to old personal repo issues
    expect(publicDocs).not.toMatch(
      /github\.com\/svelderrainruiz\/vi-history-suite\/issues/
    );
  });
});

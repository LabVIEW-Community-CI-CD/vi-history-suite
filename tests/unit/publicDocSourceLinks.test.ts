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
const orgRepoGitUrl = `${orgRepoUrl}.git`;
const orgIssueUrl = `${orgRepoUrl}/issues`;
const onboardingIssueUrl = `${orgIssueUrl}/12`;
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
    expect(support).toContain(onboardingIssueUrl);
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
    expect(maintainerOps).toContain(orgRepoGitUrl);
    expect(maintainerOps).toContain(orgIssueUrl);
    expect(maintainerOps).toContain('Marketplace extension identity remains');
  });

  it('provides a post-publish reconciliation checklist for Marketplace verification', () => {
    const maintainerOps = readRepoText('docs', 'maintainer-operations.md');

    // Checklist section exists
    expect(maintainerOps).toContain('## Post-Publish Reconciliation Checklist');
    expect(maintainerOps).toContain('verification-only');
    expect(maintainerOps).toContain('does not require Marketplace credentials');

    // Checklist items cover all required verification points
    expect(maintainerOps).toContain('**Extension Identity**');
    expect(maintainerOps).toContain('**Published Version**');
    expect(maintainerOps).toContain('**Source URL**');
    expect(maintainerOps).toContain('**Support URL**');
    expect(maintainerOps).toContain('**Repository URL**');
    expect(maintainerOps).toContain('**Installed Bundled Docs**');

    // Checklist preserves Marketplace identity while pointing to org repo
    expect(maintainerOps).toContain(marketplaceIdentity);
    expect(maintainerOps).toContain(orgRepoUrl);
    expect(maintainerOps).toContain(orgIssueUrl);

    // Verification commands are provided
    expect(maintainerOps).toContain('### Verification Commands');
    expect(maintainerOps).toContain('vsce show');
    expect(maintainerOps).toContain('no credentials required');

    // Stale link reporting is documented
    expect(maintainerOps).toContain('### Reporting Stale Links');
    expect(maintainerOps).toContain(onboardingIssueUrl);
  });

  it('keeps first-time onboarding feedback structured around Marketplace and source evaluation', () => {
    const feedbackTemplate = readRepoText(
      '.github',
      'ISSUE_TEMPLATE',
      'first_time_onboarding_feedback.yml'
    );
    const firstRun = readRepoText('FIRST-RUN.md');
    const publicDocs = [
      readRepoText('README.md'),
      readRepoText('INSTALL.md'),
      firstRun,
      readRepoText('SUPPORT.md')
    ].join('\n');

    expect(publicDocs).toContain(onboardingIssueUrl);
    expect(publicDocs).toContain('Marketplace');
    expect(publicDocs).toContain('source-evaluation');
    expect(feedbackTemplate).toContain('name: First-Time Onboarding Feedback');
    expect(feedbackTemplate).toContain('Marketplace install');
    expect(feedbackTemplate).toContain('Codespaces source evaluation');
    expect(feedbackTemplate).toContain('Dev Containers in VS Code');
    expect(feedbackTemplate).toContain('id: extension_version');
    expect(feedbackTemplate).toContain('id: vscode_version');
    expect(feedbackTemplate).toContain('id: relevant_output');
    expect(feedbackTemplate).toContain('Do not include secrets');
  });

  it('does not present old personal repo as active source or issue tracker in public docs', () => {
    const publicDocs = [
      readRepoText('README.md'),
      readRepoText('INSTALL.md'),
      readRepoText('FIRST-RUN.md'),
      readRepoText('SUPPORT.md'),
      readRepoText('SECURITY.md')
    ].join('\n');

    // Old personal repo should not appear as active source links
    // The regex looks for personal repo URLs that are NOT followed by .git
    // (since the historical git clone URL with .git suffix may appear in migration context)
    expect(publicDocs).not.toMatch(
      /github\.com\/svelderrainruiz\/vi-history-suite(?!\.git\b)/i
    );

    // Should not refer to old personal repo issues
    expect(publicDocs).not.toMatch(
      /github\.com\/svelderrainruiz\/vi-history-suite\/issues/
    );
  });
});

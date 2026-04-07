import * as fs from 'node:fs';
import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '..', '..');
const publicWikiRoot = path.resolve(repoRoot, '..', 'vi-history-suite.github.wiki');

function readAuthorityText(relativePath: string): string {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function readPublicWikiText(fileName: string): string {
  return fs.readFileSync(path.join(publicWikiRoot, fileName), 'utf8');
}

function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

describe('public fork-owner procedure docs', () => {
  it('keeps the first-use and refresh Codespaces procedures atomic and LabVIEW-first', () => {
    expect(fs.existsSync(publicWikiRoot)).toBe(true);

    const quickstart = readPublicWikiText('Fork-Codespace-Quickstart.md');
    const referenceManual = readPublicWikiText('Review-Public-LabVIEW-VI-Changes.md');
    const genericRedirect = readPublicWikiText('Clone-Public-Repo-In-Codespace.md');
    const refresh = readPublicWikiText('Refresh-Codespace-Repositories.md');
    const manual = readPublicWikiText('Manual-Actor-Framework-Clone.md');
    const install = readAuthorityText('public-github-source/INSTALL.md');
    const readme = readAuthorityText('public-github-source/README.md');
    const quickstartCollapsed = collapseWhitespace(quickstart);
    const referenceCollapsed = collapseWhitespace(referenceManual);
    const genericRedirectCollapsed = collapseWhitespace(genericRedirect);
    const refreshCollapsed = collapseWhitespace(refresh);
    const manualCollapsed = collapseWhitespace(manual);
    const installCollapsed = collapseWhitespace(install);
    const readmeCollapsed = collapseWhitespace(readme);

    expect(quickstartCollapsed).toContain('Use this only for the first successful run from your own fork.');
    expect(quickstartCollapsed).toContain('brand-new fork');
    expect(quickstartCollapsed).toContain('brand-new Codespace');
    expect(quickstartCollapsed).toContain('Copy the main branch only');
    expect(quickstartCollapsed).toContain('Codespace repository configuration');
    expect(quickstartCollapsed).toContain('New with options');
    expect(quickstartCollapsed).toContain('branch: `develop`');
    expect(quickstartCollapsed).toContain('machine type: `16-core`');
    expect(quickstartCollapsed).toContain('Setting up remote connection: Building codespace');
    expect(quickstartCollapsed).toContain(
      'Your application running on port 6010 is available. See all forwarded ports'
    );
    expect(quickstartCollapsed).toContain(
      'GitHub Codespaces is forwarding the extension development host'
    );
    expect(quickstartCollapsed).toContain('three stacked horizontal lines');
    expect(quickstartCollapsed).toContain('/workspaces/labview-icon-editor');
    expect(quickstartCollapsed).toContain('resource/plugins/lv_icon.vi');
    expect(quickstartCollapsed).toContain('VI History panel');
    expect(quickstartCollapsed).toContain('delete that fork and create it again');
    expect(quickstartCollapsed).not.toContain('Vitest not found');
    expect(quickstartCollapsed).not.toContain(
      'If you already ran it before and want the latest upstream develop'
    );
    expect(quickstartCollapsed).not.toContain('governed procedure');

    expect(referenceCollapsed).toContain('Use this reference manual when you want to review the changes of a LabVIEW VI between two commits');
    expect(referenceCollapsed).toContain('brand-new fork');
    expect(referenceCollapsed).toContain('brand-new Codespace');
    expect(referenceCollapsed).toContain('Copy the main branch only');
    expect(referenceCollapsed).toContain('delete that fork and create it again');
    expect(referenceCollapsed).toContain('Codespace repository configuration');
    expect(referenceCollapsed).toContain('New with options');
    expect(referenceCollapsed).toContain('branch: `develop`');
    expect(referenceCollapsed).toContain('machine type: `16-core`');
    expect(referenceCollapsed).toContain('Setting up remote connection: Building codespace');
    expect(referenceCollapsed).toContain('npm run public:repo:clone');
    expect(referenceCollapsed).toContain('https://github.com/<owner>/<repo>.git');
    expect(referenceCollapsed).toContain('`Esc`');
    expect(referenceCollapsed).toContain('npm run public:fixture:icon-editor');
    expect(referenceCollapsed).toContain('Hampel Software Engineering');
    expect(referenceCollapsed).toContain('https://gitlab.com/hampel-soft/open-source/hse-logger.git');
    expect(referenceCollapsed).toContain('https://github.com/crossrulz/SerialPortNuggets.git');
    expect(referenceCollapsed).toContain('remote default branch automatically');
    expect(referenceCollapsed).toContain('three stacked horizontal lines');
    expect(referenceCollapsed).toContain(
      'Your application running on port 6010 is available. See all forwarded ports'
    );
    expect(referenceCollapsed).toContain(
      'GitHub Codespaces is forwarding the extension development host'
    );
    expect(referenceCollapsed).toContain('/workspaces/hse-logger');
    expect(referenceCollapsed).toContain('/workspaces/SerialPortNuggets');
    expect(referenceCollapsed).toContain('Examples/Logging with Helper-VIs.vi');
    expect(referenceCollapsed).toContain('ASCII/Terminals/ASCII Command-Response.vi');
    expect(referenceCollapsed).toContain('`VI History` panel');
    expect(referenceCollapsed).not.toContain('Vitest not found');
    expect(referenceCollapsed).not.toContain('governed procedure');

    expect(genericRedirectCollapsed).toContain('compatibility redirect');
    expect(genericRedirectCollapsed).toContain('Review Public LabVIEW VI Changes');

    expect(refreshCollapsed).toContain(
      'Use this only after you already completed one of the first-time Codespace procedures.'
    );
    expect(refreshCollapsed).toContain('/workspaces/vi-history-suite');
    expect(refreshCollapsed).toContain('Refresh The Helper-Backed Icon Editor Clone');
    expect(refreshCollapsed).toContain('Refresh A Generic Public Repo Clone');
    expect(refreshCollapsed).toContain('npm run public:repo:clone -- --repo-url');
    expect(refreshCollapsed).toContain('Review-Public-LabVIEW-VI-Changes');
    expect(refreshCollapsed).not.toContain('Refresh The Manual Actor Framework Clone');

    expect(manualCollapsed).toContain('no longer maintained as a separate public procedure');
    expect(manualCollapsed).toContain('Review-Public-LabVIEW-VI-Changes');
    expect(manualCollapsed).not.toContain('git clone --branch develop https://github.com/ni/actor-framework.git /workspaces/actor-framework');
    expect(manualCollapsed).not.toContain('Vitest not found');

    expect(installCollapsed).toContain('Refresh-Codespace-Repositories');
    expect(installCollapsed).toContain('Review-Public-LabVIEW-VI-Changes');
    expect(installCollapsed).toContain('npm run public:repo:clone');
    expect(installCollapsed).toContain('brand new fork');
    expect(installCollapsed).toContain('brand new Codespace');
    expect(installCollapsed).toContain('reviewing the changes of a LabVIEW VI between two commits');
    expect(installCollapsed).not.toContain('Vitest not found');
    expect(readmeCollapsed).toContain('Review-Public-LabVIEW-VI-Changes');
    expect(readmeCollapsed).toContain('npm run public:repo:clone');
    expect(readmeCollapsed).toContain('brand new fork');
    expect(readmeCollapsed).toContain('brand new Codespace');
    expect(readmeCollapsed).toContain('Refresh-Codespace-Repositories');
    expect(readmeCollapsed).toContain('Hampel Software Engineering');
    expect(readmeCollapsed).not.toContain('Manual-Actor-Framework-Clone');
  });
});

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
    const refresh = readPublicWikiText('Refresh-Codespace-Repositories.md');
    const manual = readPublicWikiText('Manual-Actor-Framework-Clone.md');
    const install = readAuthorityText('public-github-source/INSTALL.md');
    const readme = readAuthorityText('public-github-source/README.md');
    const quickstartCollapsed = collapseWhitespace(quickstart);
    const refreshCollapsed = collapseWhitespace(refresh);
    const manualCollapsed = collapseWhitespace(manual);
    const installCollapsed = collapseWhitespace(install);
    const readmeCollapsed = collapseWhitespace(readme);

    expect(quickstartCollapsed).toContain('Use this only for the first successful run from your own fork.');
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
    expect(quickstartCollapsed).not.toContain('Vitest not found');
    expect(quickstartCollapsed).not.toContain(
      'If you already ran it before and want the latest upstream develop'
    );

    expect(refreshCollapsed).toContain(
      'Use this only after you already completed one of the first-time Codespace procedures.'
    );
    expect(refreshCollapsed).toContain('/workspaces/vi-history-suite');
    expect(refreshCollapsed).toContain('Refresh The Helper-Backed Icon Editor Clone');
    expect(refreshCollapsed).toContain('Refresh The Manual Actor Framework Clone');

    expect(manualCollapsed).toContain(
      'Use this only for the first successful manual-clone run from your own fork.'
    );
    expect(manualCollapsed).toContain('Copy the main branch only');
    expect(manualCollapsed).toContain('Codespace repository configuration');
    expect(manualCollapsed).toContain('New with options');
    expect(manualCollapsed).toContain(
      'git clone --branch develop https://github.com/ni/actor-framework.git /workspaces/actor-framework'
    );
    expect(manualCollapsed).toContain('ni/labview-icon-editor');
    expect(manualCollapsed).toContain('helper-backed icon-editor path');
    expect(manualCollapsed).toContain('three stacked horizontal lines');
    expect(manualCollapsed).toContain('VI History panel');
    expect(manualCollapsed).not.toContain('Vitest not found');

    expect(installCollapsed).toContain('Refresh-Codespace-Repositories');
    expect(installCollapsed).toContain('that the page is first-time-only, with refresh steps kept separate');
    expect(installCollapsed).not.toContain('Vitest not found');
    expect(readmeCollapsed).toContain('Refresh-Codespace-Repositories');
  });
});

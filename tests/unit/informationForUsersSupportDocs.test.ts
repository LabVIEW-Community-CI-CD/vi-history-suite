import * as fs from 'node:fs';
import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '..', '..');

function readText(relativePath: string): string {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

describe('information-for-users support docs', () => {
  it('retains the seeded support surfaces and their control-plane truth', () => {
    const informationItemMap = readText('docs/information-item-map.md');
    const plan = readText('docs/information-for-users/plan.md');
    const glossary = readText('docs/information-for-users/glossary.md');
    const faq = readText('docs/information-for-users/faq.md');
    const commandReference = readText('docs/information-for-users/command-reference.md');
    const readme = readText('README.md');
    const install = readText('INSTALL.md');

    expect(informationItemMap).toContain(
      '| Information-for-users plan | `docs/information-for-users/plan.md` |'
    );
    expect(informationItemMap).toContain(
      '| Information-for-users glossary | `docs/information-for-users/glossary.md` |'
    );
    expect(informationItemMap).toContain(
      '| Information-for-users FAQ | `docs/information-for-users/faq.md` |'
    );
    expect(informationItemMap).toContain(
      '| Information-for-users command reference | `docs/information-for-users/command-reference.md` |'
    );

    expect(plan).toContain('published `repo-standards-review` assurance-workbench `:main`');
    expect(plan).toContain('latest tagged release `v0.2.18`');
    expect(plan).toContain('repo-native docs workbench');
    expect(plan).toContain(
      'exact released installed baseline explicit as `v1.2.2` Docker-only and x64-only'
    );
    expect(plan).toContain(
      'host-default Windows local `LabVIEWCLI` plus one bounded expert Docker provider'
    );

    expect(glossary).toContain('| compare preflight |');
    expect(glossary).toContain('| provider request |');
    expect(glossary).toContain('| released compliance workbench |');

    expect(faq).toContain('The current exact released line, `v1.2.2`, still uses the');
    expect(faq).toContain('Docker-only and x64-only installed path.');
    expect(faq).toContain('review Compare or runtime validation again after the update');
    expect(faq).toContain('reload or restart the window only if that already-running session still shows');
    expect(faq).toContain('supported Windows PowerShell sessions');
    expect(faq).toContain('install-vihs-extension.ps1');
    expect(faq).toContain('type');
    expect(faq).toContain('`vihs`');
    expect(faq).toContain('Where does the generated runtime-settings CLI live');
    expect(faq).toContain('How do I check what the runtime-settings CLI actually persisted');
    expect(faq).toContain('Workspace settings are not a supported target');
    expect(faq).toContain('prepare command is admitted in untrusted workspaces');
    expect(faq).toContain('user-scope PATH');
    expect(faq).toContain('runtimeValidationOutcome');
    expect(faq).toContain('Is Windows installed-user behavior proven?');
    expect(faq).toContain('Windows host LabVIEW 2026');
    expect(faq).toContain('Docker Desktop in Windows-container mode');
    expect(faq).toContain('public issue #65');
    expect(faq).toContain('docker info --format "{{.OSType}} {{.OperatingSystem}}"');
    expect(faq).toContain('WSL is retained historical context only');
    expect(faq).toContain('Windows host LabVIEW 2026');
    expect(faq).toContain('npm run proof:runtime-settings-live-session');
    expect(faq).toContain('.cache/runtime-settings-live-session-proof/latest/');

    expect(readme).toContain('Install The Extension');
    expect(readme).toContain('code --install-extension svelderrainruiz.vi-history-suite');
    expect(readme).toContain('vihs --validate');
    expect(readme).toContain('Compare A VI');
    expect(readme).toContain('Report A Problem Or Request Support');
    expect(readme).toContain('issues/new/choose');
    expect(readme).toContain('LabVIEW Version Support Request');
    expect(readme).toContain('Evaluate From Source');
    expect(readme).toContain('Contribute');
    expect(readme).toContain('Authority And Release Control');

    expect(install).toContain('Install The Extension');
    expect(install).toContain('code --install-extension svelderrainruiz.vi-history-suite');
    expect(install).toContain('Source Evaluation And Codespaces');
    expect(install).toContain('vihs --validate');
    expect(install).toContain('Use this lane only when you want to inspect the source repo');
    expect(install).toContain('docker info --format');

    expect(commandReference).toContain('npm run docs:workbench:gate');
    expect(commandReference).toContain('install-vihs-extension.ps1');
    expect(commandReference).toContain('code --install-extension svelderrainruiz.vi-history-suite --force');
    expect(commandReference).toContain('VI History: Prepare Local Runtime Settings CLI');
    expect(commandReference).toContain('extension-global storage root');
    expect(commandReference).toContain('compatibility-launcher path');
    expect(commandReference).toContain('default user `settings.json` path');
    expect(commandReference).toContain('explicit `--settings-file` override');
    expect(commandReference).toContain('admitted in untrusted workspaces');
    expect(commandReference).toContain('persists governed user-scope PATH');
    expect(commandReference).toContain('vihs --provider <host|docker>');
    expect(commandReference).toContain('vihs --validate');
    expect(commandReference).toContain('host/windows/2026/x86');
    expect(commandReference).toContain('Enter` keep the current value');
    expect(commandReference).toContain('Docker is the bounded expert path');
    expect(commandReference).toContain('selectable Docker years or bitnesses may');
    expect(commandReference).toContain('before trusting Compare');
    expect(commandReference).toContain('or other runtime-provider surfaces');
    expect(commandReference).toContain('runtimeBlockedReason');
    expect(commandReference).toContain('npm run proof:runtime-settings-live-session');
    expect(commandReference).toContain('runtime-settings-live-session-proof.json');
    expect(commandReference).toContain('.cache/runtime-settings-live-session-proof/latest/');
    expect(commandReference).toContain('current public validation route');
    expect(commandReference).toContain('Windows host LabVIEW 2026 x86 is admitted');
    expect(commandReference).toContain('Docker images are 64-bit only');
    expect(commandReference).toContain('Docker Desktop Windows-container behavior');
    expect(commandReference).toContain('public issue #65');
    expect(commandReference).toContain('runtimeProvider=windows-container');
    expect(commandReference).toContain('generatedReportExists=true');
    expect(commandReference).not.toContain('`npm run public:smoke:linux`');
    expect(commandReference).toContain(
      'The active governed preview route is Linux/Docker, Linux host LabVIEW, and'
    );
    expect(commandReference).toContain('npm run assurance:release-gate');
    expect(commandReference).toContain('npm run assurance:26514:authority');
    expect(commandReference).toContain('npm run assurance:user-info');
    expect(readme).toContain('code --install-extension svelderrainruiz.vi-history-suite');
    expect(readme).toContain('vihs --validate');
  });
});

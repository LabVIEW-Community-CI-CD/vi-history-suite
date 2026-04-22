import * as fs from 'node:fs';
import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '..', '..');

function readText(relativePath: string): string {
  return fs
    .readFileSync(path.join(repoRoot, relativePath), 'utf8')
    .replace(/\r\n/g, '\n');
}

describe('private release assurance contradiction guards', () => {
  it('keeps the assurance baseline split explicit as rolling `:main` versus latest tagged `v0.2.18`', () => {
    const readme = readText('README.md');
    const currentState = readText('docs/product/current-state.md');
    const releaseProcedure = readText('docs/release-procedure.md');
    const faq = readText('docs/information-for-users/faq.md');

    expect(readme).toContain('assurance-workbench:main');
    expect(currentState).toContain('latest tagged release remains `v0.2.18`');
    expect(releaseProcedure).toContain('assurance-workbench:main');
    expect(faq).toContain('`v0.2.18`');
  });

  it('keeps the exact released installed-user contract separate from the private Windows prep surface', () => {
    const readme = readText('README.md');
    const currentState = readText('docs/product/current-state.md');
    const releaseProcedure = readText('docs/release-procedure.md');

    expect(readme).toContain('Windows defaults to local `LabVIEWCLI`');
    expect(readme).toContain('if Docker is selected, install or start Docker Desktop or Docker');
    expect(currentState).toContain('current exact released line: `v1.3.2`');
    expect(currentState).toContain('active exact release candidate line on `develop`: none');
    expect(currentState).toContain('active exact hotfix candidate line on `main`: `v1.3.3`');
    expect(releaseProcedure).toContain(
      'The active Windows x64 private-release-prep slice is the historical'
    );
    expect(releaseProcedure).toContain('`release/1.3.1` lane.');
    expect(releaseProcedure).toContain(
      'That private-release act does not imply exact tagging, public GitHub release,'
    );
  });

  it('keeps the requirements-to-user-doc assurance semantics aligned', () => {
    const srs = readText('docs/requirements/srs.md');
    const rtm = readText('docs/requirements/rtm.csv');
    const commandReference = readText('docs/information-for-users/command-reference.md');
    const faq = readText('docs/information-for-users/faq.md');

    expect(srs).toContain('VHS-REQ-542');
    expect(srs).toContain('VHS-REQ-549');
    expect(srs).toContain('VHS-REQ-550');
    expect(srs).toContain('VHS-REQ-551');
    expect(srs).toContain('VHS-REQ-553');
    expect(rtm).toContain('VHS-REQ-542');
    expect(rtm).toContain('VHS-REQ-549');
    expect(rtm).toContain('VHS-REQ-550');
    expect(rtm).toContain('VHS-REQ-551');
    expect(rtm).toContain('VHS-REQ-553');
    expect(commandReference).toContain('npm run assurance:release-gate');
    expect(commandReference).toContain('npm run assurance:requirements');
    expect(commandReference).toContain('npm run assurance:user-info');
    expect(faq).toContain(
      'reload or restart the VS Code window and review Compare again'
    );
    expect(faq).toContain('WSL is retained historical context only');
  });

  it('keeps the authority-doc metadata package coherent across the external user-information starter set', () => {
    const userGuide = readText('docs/user-guide.md');
    const faq = readText('docs/faq.md');
    const glossary = readText('docs/glossary.md');
    const quickReference = readText('docs/quick-reference.md');

    const appliesTo =
      'Applies to: exact released installed baseline `v1.2.2` plus the active\n' +
      '  `develop` authority direction';

    expect(userGuide).toContain(appliesTo);
    expect(faq).toContain(appliesTo);
    expect(glossary).toContain(appliesTo);
    expect(quickReference).toContain(appliesTo);
  });
});

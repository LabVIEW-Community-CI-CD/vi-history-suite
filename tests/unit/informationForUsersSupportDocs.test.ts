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

    expect(plan).toContain('released `repo-standards-review v0.2.13`');
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
    expect(faq).toContain('reload or restart the window before using Compare');

    expect(commandReference).toContain('npm run docs:workbench:gate');
    expect(commandReference).toContain('vihs-runtime-settings --provider <host|docker>');
    expect(commandReference).toContain('assurance-workbench:v0.2.13');
    expect(commandReference).toContain('/tmp/repo-standards-review-v0.2.13-tag/scripts/external_user_information_check.py');
  });
});

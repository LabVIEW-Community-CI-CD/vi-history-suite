import * as fs from 'node:fs';
import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '..', '..');

function readText(relativePath: string): string {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

describe('information-for-users docs quality and proof package', () => {
  it('retains the latest-lane quality and proof tokens in the support surfaces', () => {
    const faq = readText('docs/information-for-users/faq.md');
    const commandReference = readText('docs/information-for-users/command-reference.md');
    const glossary = readText('docs/information-for-users/glossary.md');
    const styleGuide = readText('docs/information-for-users/style-guide.md');

    expect(faq).toContain('# Information For Users FAQ');
    expect(faq).toContain('## Scope Boundary');
    expect(faq).toContain('## Lifecycle Rules');
    expect(faq).toContain('governed repo search posture');
    expect(faq).toContain('### How do I run the canonical gate?');
    expect(faq).toContain('### Where do I start when I need to cut a release?');

    expect(commandReference).toContain('compact quick-reference guide');
    expect(commandReference).toContain('not a full command manual');
    expect(commandReference).toContain('## Canonical Validation');
    expect(commandReference).toContain('## Standards Lookup');
    expect(commandReference).toContain('python3 scripts/pipeline.py validate-skill');
    expect(commandReference).toContain('python3 scripts/search_standards.py');
    expect(commandReference).toContain('rg -n');

    expect(glossary).toContain('# Information For Users Glossary');
    expect(glossary).toContain('## Scope Boundary');
    expect(glossary).toContain('## Entry And Review Rules');
    expect(glossary).toContain('| Assurance workbench |');
    expect(glossary).toContain('| Release packet |');
    expect(glossary).toContain('| Self-application |');

    expect(styleGuide).toContain('## Topic Titles');
    expect(styleGuide).toContain('## Minimum Topic Structure');
    expect(styleGuide).toContain('Merriam-Webster');
    expect(styleGuide).toContain('Chicago Manual of Style');
    expect(styleGuide).toContain('Do not imply repo-specific accessibility controls');
  });

  it('retains the latest-lane proof and change-control tokens in control docs', () => {
    const testPlan = readText('docs/testing/test-plan.md');
    const cmPlan = readText('docs/cm/cm-plan.md');
    const informationItemMap = readText('docs/information-item-map.md');

    expect(testPlan).toContain('## Information-For-Users Coverage');
    expect(testPlan).toContain('TEST-114 information-for-users navigation and claim-boundary review');
    expect(testPlan).toContain('TEST-125 glossary discipline review');
    expect(testPlan).toContain('Release proof packet');

    expect(cmPlan).toContain('## Documentation Impact And Role Mapping');
    expect(cmPlan).toContain('governed documentation package under `docs/`');
    expect(cmPlan).toContain('documentation impact assessment');
    expect(cmPlan).toContain('information developer');
    expect(cmPlan).toContain('approving authority');

    expect(informationItemMap).toContain('owner, trigger, and proving-evidence fields');
    expect(informationItemMap).toContain('control authority surfaces');
    expect(informationItemMap).toContain('first-class information-for-users');
    expect(informationItemMap).toContain('candidate provenance');
  });
});

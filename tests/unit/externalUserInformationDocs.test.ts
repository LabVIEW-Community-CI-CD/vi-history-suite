import * as fs from 'node:fs';
import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '..', '..');

function readText(relativePath: string): string {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

describe('external user-information starter pack', () => {
  it('retains the required v0.2.13 starter docs and consistent metadata', () => {
    const userGuide = readText('docs/user-guide.md');
    const faq = readText('docs/faq.md');
    const glossary = readText('docs/glossary.md');
    const quickReference = readText('docs/quick-reference.md');

    const appliesTo =
      'Applies to: exact released installed baseline `v1.2.2` plus the active\n' +
      '  `develop` authority direction';

    expect(userGuide).toContain('# User Guide');
    expect(userGuide).toContain('## Document Control');
    expect(userGuide).toContain('## Start Here');
    expect(userGuide).toContain('## Audience And Tasks');
    expect(userGuide).toContain('## Common Tasks');
    expect(userGuide).toContain('## Navigation');
    expect(userGuide).toContain('Primary audience:');
    expect(userGuide).toContain('Primary entry route:');
    expect(userGuide).toContain('`docs/faq.md`');
    expect(userGuide).toContain('`docs/glossary.md`');
    expect(userGuide).toContain('`docs/quick-reference.md`');

    expect(faq).toContain('# FAQ');
    expect(faq).toContain('## Document Control');
    expect(faq).toContain('## Questions');
    expect(faq).toContain('### How do I start?');
    expect(faq).toContain('### Where do I find the key commands or checks?');
    expect(faq).toContain('### What should I do when the expected route fails?');

    expect(glossary).toContain('# Glossary');
    expect(glossary).toContain('## Document Control');
    expect(glossary).toContain('## Terms');
    expect(glossary).toContain('| Term | Meaning | Where it matters |');

    expect(quickReference).toContain('# Quick Reference');
    expect(quickReference).toContain('## Document Control');
    expect(quickReference).toContain('## Key Routes');
    expect(quickReference).toContain('## Common Commands Or Checks');
    expect(quickReference).toContain('`docs/user-guide.md`');
    expect(quickReference).toContain('`docs/faq.md`');
    expect(quickReference).toContain('`docs/glossary.md`');

    expect(userGuide).toContain(appliesTo);
    expect(faq).toContain(appliesTo);
    expect(glossary).toContain(appliesTo);
    expect(quickReference).toContain(appliesTo);
  });

  it('records the external user-information starter pack in the information-item map', () => {
    const informationItemMap = readText('docs/information-item-map.md');

    expect(informationItemMap).toContain('| External user guide | `docs/user-guide.md` |');
    expect(informationItemMap).toContain('| External FAQ | `docs/faq.md` |');
    expect(informationItemMap).toContain('| External glossary | `docs/glossary.md` |');
    expect(informationItemMap).toContain('| External quick reference | `docs/quick-reference.md` |');
  });
});

import * as fs from 'node:fs';
import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '..', '..');

function readText(relativePath: string): string {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

describe('information-for-users audience/navigation package', () => {
  it('retains the audience, navigation, delivery, and style artifacts in the map and plan', () => {
    const informationItemMap = readText('docs/information-item-map.md');
    const plan = readText('docs/information-for-users/plan.md');

    expect(informationItemMap).toContain(
      '| Information-for-users audience and task model | `docs/information-for-users/audience-and-task-model.md` |'
    );
    expect(informationItemMap).toContain(
      '| Information For Users Navigation And Search | `docs/information-for-users/navigation-and-search.md` |'
    );
    expect(informationItemMap).toContain(
      '| Information For Users Delivery Profile | `docs/information-for-users/delivery-profile.md` |'
    );
    expect(informationItemMap).toContain(
      '| Information For Users Style Guide | `docs/information-for-users/style-guide.md` |'
    );

    expect(plan).toContain('bounded document set');
    expect(plan).toContain('selected process duties in `26514 §§5-6`');
    expect(plan).toContain('selected product duties in `26514 §§7-9`');
    expect(plan).toContain('release-versioned evidence');
    expect(plan).toContain('## Audiences And Tasks');
    expect(plan).toContain('## Navigation Metadata And Search');
    expect(plan).toContain('## Documentation Quality Acceptance');
  });

  it('keeps the new audience, navigation, and delivery docs tied to truthful routes', () => {
    const readme = readText('README.md');
    const audience = readText('docs/information-for-users/audience-and-task-model.md');
    const navigation = readText('docs/information-for-users/navigation-and-search.md');
    const delivery = readText('docs/information-for-users/delivery-profile.md');
    const styleGuide = readText('docs/information-for-users/style-guide.md');

    expect(readme).toContain('top-level route');
    expect(readme).toContain('retained item index');
    expect(readme).toContain('durable evidence route');
    expect(readme).toContain('## Topic Roles');
    expect(readme).toContain('## Information For Users');
    expect(readme).toContain('## Common Tasks');
    expect(readme).toContain('## Troubleshooting');
    expect(readme).toContain('./docs/information-for-users/command-reference.md');
    expect(readme).toContain('./docs/information-for-users/faq.md');

    expect(audience).toContain('Installed user');
    expect(audience).toContain('Source evaluator');
    expect(audience).toContain('Publication reviewer');
    expect(audience).toContain('exact released installed baseline `v1.2.2`');

    expect(navigation).toContain('Top-level route');
    expect(navigation).toContain('Retained item index');
    expect(navigation).toContain('Durable evidence route');
    expect(navigation).toContain('docs/product/public-release-candidate.md');
    expect(navigation).toContain('rg -n');

    expect(delivery).toContain('exact released installed baseline `v1.2.2`');
    expect(delivery).toContain('host-default Windows local');
    expect(delivery).toContain('`LabVIEWCLI` plus bounded expert Docker');
    expect(delivery).toContain('public release candidate');

    expect(styleGuide).toContain('released compliance workbench');
    expect(styleGuide).toContain('Avoid instructions that depend only on color.');
    expect(styleGuide).toContain('exact released line');
  });
});

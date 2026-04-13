import * as fs from 'node:fs';
import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '..', '..');

function readText(relativePath: string): string {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

describe('repo-standards-review compliance docs', () => {
  it('retains the contradiction ledger as a governed pass artifact', () => {
    const informationItemMap = readText('docs/information-item-map.md');
    const roadmap = readText('docs/product/repo-standards-review-v0.2.9-compliance-roadmap.md');
    const ledger = readText('docs/product/repo-standards-review-v0.2.9-pass-4-contradiction-ledger.md');

    expect(informationItemMap).toContain(
      '| Repo-standards-review contradiction ledger | `docs/product/repo-standards-review-v0.2.9-pass-4-contradiction-ledger.md` |'
    );
    expect(roadmap).toContain('Pass 4: Contradiction ledger');
    expect(roadmap).toContain(
      '[repo-standards-review-v0.2.9-pass-4-contradiction-ledger.md](./repo-standards-review-v0.2.9-pass-4-contradiction-ledger.md)'
    );
    expect(ledger).toContain('CONTRA-001');
    expect(ledger).toContain('CONTRA-002');
    expect(ledger).toContain('CONTRA-003');
    expect(ledger).toContain('CONTRA-004');
    expect(ledger).toContain(
      'does not treat the exact released `v1.2.2` Docker-only installed baseline as'
    );
  });
});

import * as fs from 'node:fs';
import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '..', '..');

function readText(relativePath: string): string {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

describe('public Codespaces public-repo bootstrap docs', () => {
  it('keeps the canonical helper path separate from the generic public-repo path and retains the exact-release closure facts', () => {
    const readme = readText('README.md');
    const currentState = readText('docs/product/current-state.md');
    const candidate = readText('docs/product/public-release-candidate.md');
    const issue = readText('docs/product/issues/ISSUE-0411-public-codespaces-public-repo-bootstrap.md');
    const program = readText(
      'docs/product/execution-programs/PROGRAM-0006-public-codespaces-public-repo-bootstrap.md'
    );
    const adr = readText(
      'docs/architecture/adr/ADR-0034-public-codespaces-public-repo-bootstrap-and-default-branch-resolution.md'
    );

    expect(readme).toContain('## Evaluate From Source');
    expect(readme).toContain('## Contribute');
    expect(readme).toContain('[INSTALL.md](./INSTALL.md)');
    expect(readme).toContain('Fork-Codespace-Quickstart');
    expect(readme).toContain('Review-Public-LabVIEW-VI-Changes');
    expect(readme).toContain('Refresh-Codespace-Repositories');

    expect(currentState).toContain('`TRANCHE-014`: Public Codespaces public-repo bootstrap');
    expect(currentState).toContain('canonical `npm run public:fixture:icon-editor` helper-backed path');
    expect(currentState).toContain('generic `npm run public:repo:clone` surface');
    expect(currentState).toContain('current exact released line: `v1.3.9`');
    expect(currentState).toContain('active exact release candidate line on `develop`: `v1.3.14`');
    expect(currentState).toContain('active exact hotfix candidate line on `main`: none');
    expect(currentState).toContain('separate public GitHub exact release publication: published; public tag');
    expect(currentState).toContain('current public GitHub source publication: public `main` now publishes');
    expect(currentState).toContain('active feature-lane public GitHub release hardening branch on `develop`:');
    expect(currentState).toContain('none');
    expect(currentState).toContain('public_exact_pretag_proof');
    expect(currentState).toContain('npm run public:github:exact:transaction:verify');

    expect(candidate).toContain(
      'Decision: helper-backed canonical path plus generic public-repo reference manual'
    );
    expect(candidate).toContain('Canonical helper command: `npm run public:fixture:icon-editor`');
    expect(candidate).toContain('Generic interactive command: `npm run public:repo:clone`');
    expect(candidate).toContain('Generic bootstrap command:');
    expect(candidate).toContain('npm run public:repo:clone -- --repo-url <https-url>');
    expect(candidate).toContain('Published-surface expert-agent review:');
    expect(candidate).toContain('`no-findings-on-current-v1.3.1-published-heads`');
    expect(candidate).toContain('Required skill: `vi-history-suite-expert-agent-reviewer`');
    expect(candidate).toContain(
      'Exact public release:'
    );
    expect(candidate).toContain(
      '`v1.3.9-github-release-and-marketplace-published; v1.3.8-public-github-release-externally-blocked-zero-assets-retained-history`'
    );
    expect(candidate).toContain('remains historical exact');
    expect(candidate).toContain('`v1.2.0` baseline evidence only');
    expect(candidate).toContain('Runtime-provider public-acceptance gate remains closed');

    expect(issue).toContain('public `github.com` and `gitlab.com` HTTPS repos only');
    expect(issue).toContain('brand new fork');
    expect(issue).toContain('brand new Codespace');
    expect(issue).toContain('exact `v1.2.0` tag remained gated on Sergio');
    expect(issue).toContain('fail-closed `review-ready` state');
    expect(program).toContain('Gate D: Human Procedure Review');
    expect(program).toContain('Gate D opens only after the candidate is marked `review-ready`');
    expect(program).toContain('brand new fork');
    expect(program).toContain('brand new Codespace');
    expect(program).toContain('Sergio dry-runs the maintained public wiki procedures');
    expect(program).toContain('exact `v1.2.0` public and authority tags are cut only after Gate D is');
    expect(adr).toContain('keep `npm run public:fixture:icon-editor` as the canonical easiest first-time');
    expect(adr).toContain('brand new fork');
    expect(adr).toContain('brand new Codespace');
    expect(adr).toContain('block the exact `v1.2.0` tag until the maintained public wiki procedures are');
  });
});

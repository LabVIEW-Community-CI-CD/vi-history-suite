import * as fs from 'node:fs';
import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '..', '..');

function readText(relativePath: string): string {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

describe('public Codespaces public-repo bootstrap docs', () => {
  it('keeps the canonical helper path separate from the generic public-repo path and blocks exact tagging on review', () => {
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

    expect(readme).toContain('npm run public:fixture:icon-editor');
    expect(readme).toContain('npm run public:repo:clone -- --repo-url https://github.com/crossrulz/SerialPortNuggets.git');
    expect(readme).toContain('repo-sibling `labview-icon-editor`');
    expect(readme).toContain('visible repo-sibling folder');
    expect(readme).toContain('reference manual for reviewing the changes of a LabVIEW VI between two');
    expect(readme).toContain('a quickstart for the canonical helper-backed `ni/labview-icon-editor` path');

    expect(currentState).toContain('`TRANCHE-014`: Public Codespaces public-repo bootstrap');
    expect(currentState).toContain('canonical `npm run public:fixture:icon-editor` helper-backed path');
    expect(currentState).toContain('generic `npm run public:repo:clone` surface');
    expect(currentState).toContain('exact `v1.2.0` tag is intentionally blocked');

    expect(candidate).toContain(
      'Decision: helper-backed canonical path plus generic public-repo reference manual'
    );
    expect(candidate).toContain('Canonical helper command: `npm run public:fixture:icon-editor`');
    expect(candidate).toContain('Generic interactive command: `npm run public:repo:clone`');
    expect(candidate).toContain('Generic bootstrap command:');
    expect(candidate).toContain('npm run public:repo:clone -- --repo-url <https-url>');
    expect(candidate).toContain(
      'Public wiki candidate review:'
    );
    expect(candidate).toContain('awaiting-brand-new-fork-review-on-published-candidate');
    expect(candidate).toContain('Review-ready gate:');
    expect(candidate).toContain('ready-for-brand-new-fork-review');
    expect(candidate).toContain('Required review environment: brand new fork plus brand new Codespace');
    expect(candidate).toContain('The exact `v1.2.0` tag is intentionally blocked');

    expect(issue).toContain('public `github.com` and `gitlab.com` HTTPS repos only');
    expect(issue).toContain('brand new fork');
    expect(issue).toContain('brand new Codespace');
    expect(issue).toContain('exact `v1.2.0` tag is blocked until Sergio accepts');
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

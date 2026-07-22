import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// VHS-REQ-707 governance-contract test (ADR-0028, Mirror-Mode dual real-runtime
// LabVIEW validation). This test locks the documented Phase 0 contract so the
// invariants cannot silently regress. It reads the committed ADR, ADR index,
// and SRS block as data at rest and asserts the required facts; it introduces no
// runtime dependency and authors no VI binaries.

const repoRoot = path.resolve(__dirname, '..', '..');

function read(relativePath: string): string {
  return readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

const adrPath = 'docs/architecture/adr/ADR-0028-mirror-mode-dual-real-runtime-validation.md';
const adr = read(adrPath);
const adrReadme = read('docs/architecture/adr/README.md');
const srs = read('docs/requirements/srs.md');

// Slice out just the VHS-REQ-707 block so assertions target its text.
function srsBlock(reqId: string): string {
  const start = srs.indexOf(`### ${reqId}:`);
  if (start < 0) {
    return '';
  }
  const rest = srs.slice(start + 3);
  const nextHeadingOffset = rest.indexOf('\n### ');
  return nextHeadingOffset < 0 ? rest : rest.slice(0, nextHeadingOffset);
}

const req707 = srsBlock('VHS-REQ-707');

describe('Mirror-Mode dual real-runtime validation governance (VHS-REQ-707)', () => {
  it('records the Mirror-Mode decision in an indexed ADR that cites the requirement and amends ADR-0012 (VHS-REQ-707.1)', () => {
    expect(adr).toContain('# ADR-0028: Mirror-Mode Dual Real-Runtime LabVIEW Validation');
    expect(adr).toMatch(/^- Status: (Accepted|Active)$/m);
    expect(adr).toContain('## Context');
    expect(adr).toContain('## Decision');
    expect(adr).toContain('## Consequences');
    expect(adr).toContain('VHS-REQ-707');
    expect(adr).toContain('ADR-0012');
    // Indexed in the ADR README table.
    expect(adrReadme).toContain(
      '[ADR-0028](./ADR-0028-mirror-mode-dual-real-runtime-validation.md)'
    );
    // The requirement points back at the ADR as its implementation reference.
    expect(req707).toContain('ADR-0028');
  });

  it('documents human-only, Vagrant-only VI authorship with automation as consumers only (VHS-REQ-707.2)', () => {
    expect(req707).toMatch(/human-only and Vagrant-only/i);
    expect(req707).toMatch(/never create or modify `?\.vi/i);
    expect(adr).toMatch(/sole author of LabVIEW VIs/i);
  });

  it('documents the Docker Windows LabVIEW channel as run-only (no in-container development) (VHS-REQ-707.3)', () => {
    expect(req707).toMatch(/run-only/i);
    expect(adr).toMatch(/in-container development is forbidden/i);
  });

  it('documents the Vagrant-precondition then merge_group Docker then reconciler sequencing (VHS-REQ-707.4)', () => {
    expect(req707).toContain('merge_group');
    expect(req707).toMatch(/precondition for\s+entering the merge queue/i);
    expect(req707).toMatch(/reconciler unifies both/i);
  });

  it('documents a deterministic, queue-safe required gate that is never a live image pull (VHS-REQ-707.5)', () => {
    expect(req707).toMatch(/deterministic\s+ledger-read \/ parity check/i);
    expect(req707).toMatch(/never a live multi-GB image pull/i);
    expect(req707).toMatch(/best-effort evidence\s+producer/i);
  });
});

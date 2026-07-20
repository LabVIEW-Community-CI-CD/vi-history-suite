import { describe, expect, it } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const proofDriver = require('../../scripts/vagrantValidationProofDriver.cjs');

const { PROOF_SCHEMA, parseValidationProofPacket } = proofDriver;

function readyPacket(overrides = {}) {
  return {
    schema: PROOF_SCHEMA,
    proofStatus: 'ok',
    runtime: { validationOutcome: 'ready' },
    ...overrides
  };
}

// Vagrant prefixes each guest stdout line with `    default: `.
function asGuestStdout(packet) {
  const json = JSON.stringify(packet, null, 2);
  return ['    default: some preamble', ...json.split('\n').map((l) => `    default: ${l}`), '    default: done'].join(
    '\n'
  );
}

describe('vagrantValidationProofDriver.parseValidationProofPacket (VHS-REQ-686.3)', () => {
  it('accepts a ready packet emitted with vagrant line prefixes', () => {
    const result = parseValidationProofPacket(asGuestStdout(readyPacket()), PROOF_SCHEMA);
    expect(result.ok).toBe(true);
    expect(result.problem).toBeNull();
    expect(result.validationOutcome).toBe('ready');
    expect(result.proof.schema).toBe(PROOF_SCHEMA);
  });

  it('fails when no JSON object is present', () => {
    const result = parseValidationProofPacket('    default: nothing here', PROOF_SCHEMA);
    expect(result.ok).toBe(false);
    expect(result.problem).toBe('Guest did not emit a JSON proof packet.');
  });

  it('fails on non-string input', () => {
    const result = parseValidationProofPacket(undefined, PROOF_SCHEMA);
    expect(result.ok).toBe(false);
    expect(result.problem).toBe('Guest did not emit a JSON proof packet.');
  });

  it('fails on malformed JSON', () => {
    const result = parseValidationProofPacket('    default: { not valid json }', PROOF_SCHEMA);
    expect(result.ok).toBe(false);
    expect(result.problem).toMatch(/not valid JSON/);
  });

  it('fails on a schema mismatch', () => {
    const result = parseValidationProofPacket(asGuestStdout(readyPacket({ schema: 'other@v9' })), PROOF_SCHEMA);
    expect(result.ok).toBe(false);
    expect(result.problem).toMatch(/schema mismatch/);
    expect(result.problem).toContain('other@v9');
  });

  it('fails when runtime.validationOutcome is missing', () => {
    const result = parseValidationProofPacket(asGuestStdout(readyPacket({ runtime: {} })), PROOF_SCHEMA);
    expect(result.ok).toBe(false);
    expect(result.problem).toMatch(/missing runtime.validationOutcome/);
  });

  it('fails and surfaces blockedReason when outcome is not ready', () => {
    const packet = readyPacket({ runtime: { validationOutcome: 'blocked', blockedReason: 'no-cli' } });
    const result = parseValidationProofPacket(asGuestStdout(packet), PROOF_SCHEMA);
    expect(result.ok).toBe(false);
    expect(result.problem).toContain('validationOutcome=blocked');
    expect(result.problem).toContain('blockedReason=no-cli');
    expect(result.validationOutcome).toBe('blocked');
  });

  it('treats a missing runtime block as a missing outcome', () => {
    const result = parseValidationProofPacket(asGuestStdout(readyPacket({ runtime: undefined })), PROOF_SCHEMA);
    expect(result.ok).toBe(false);
    expect(result.problem).toMatch(/missing runtime.validationOutcome/);
  });
});

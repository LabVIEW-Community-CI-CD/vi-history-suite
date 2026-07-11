import { describe, expect, it } from 'vitest';

import { detectViSignature } from '../../src/domain/viMagicCore';

function buildHeader(signature: string, includeStrictPrefix = true): Uint8Array {
  const prefix = includeStrictPrefix
    ? Buffer.from('RSRC\r\n\x00\x03', 'binary')
    : Buffer.from('ZZZZZZ\x00\x03', 'binary');
  const header = Buffer.concat([prefix, Buffer.from(signature, 'ascii')]);
  return new Uint8Array(header);
}

describe('detectViSignature', () => {
  it('accepts LVIN and LVCC at offset 8 (VHS-REQ-001.1, VHS-REQ-003.2)', () => {
    expect(detectViSignature(buildHeader('LVIN'))).toBe('LVIN');
    expect(detectViSignature(buildHeader('LVCC'))).toBe('LVCC');
    // Non-strict (default) mode classifies on the offset-8 signature even when the
    // RSRC header prefix is absent, so detection is not silently gated on strict-mode
    // logic (kills the strict-header conditional mutant surviving in viMagicCore).
    expect(detectViSignature(buildHeader('LVIN', false))).toBe('LVIN');
  });

  it('rejects short inputs and wrong offsets (VHS-REQ-001.2)', () => {
    expect(detectViSignature(new Uint8Array([1, 2, 3]))).toBeUndefined();

    const wrongOffset = Buffer.from('LVINRSRC\r\n\x00\x03', 'binary');
    expect(detectViSignature(new Uint8Array(wrongOffset))).toBeUndefined();

    // A full-length buffer whose offset-8 bytes are not a known signature is rejected,
    // pinning the signature comparison itself, not merely the length and offset checks.
    expect(detectViSignature(buildHeader('XXXX'))).toBeUndefined();
  });

  it('supports a stricter RSRC header mode (VHS-REQ-003.1)', () => {
    expect(
      detectViSignature(buildHeader('LVIN', false), { strictRsrcHeader: true })
    ).toBeUndefined();
    expect(detectViSignature(buildHeader('LVIN'), { strictRsrcHeader: true })).toBe(
      'LVIN'
    );
  });
});

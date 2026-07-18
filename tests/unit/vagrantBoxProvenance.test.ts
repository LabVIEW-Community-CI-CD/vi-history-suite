import { describe, expect, it } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const boxProvenance = require('../../scripts/lib/vagrantBoxProvenance.cjs');

const { DEFAULT_BOX, isBoxOverride, readCommittedBoxSha256 } = boxProvenance;

const VAGRANT_DIR = '/repo/vagrant';
const GOOD_SHA = 'a'.repeat(64);

function readerFor(content, throwOn = false) {
  return () => {
    if (throwOn) {
      throw new Error('ENOENT');
    }
    return content;
  };
}

describe('vagrantBoxProvenance.isBoxOverride', () => {
  it('is false when VIHS_VAGRANT_BOX is unset or empty', () => {
    expect(isBoxOverride({})).toBe(false);
    expect(isBoxOverride({ VIHS_VAGRANT_BOX: '' })).toBe(false);
    expect(isBoxOverride({ VIHS_VAGRANT_BOX: '   ' })).toBe(false);
  });

  it('is false when set to the default box name', () => {
    expect(isBoxOverride({ VIHS_VAGRANT_BOX: DEFAULT_BOX })).toBe(false);
  });

  it('is true when set to a different box name', () => {
    expect(isBoxOverride({ VIHS_VAGRANT_BOX: 'someone/other-box' })).toBe(true);
  });
});

describe('vagrantBoxProvenance.readCommittedBoxSha256', () => {
  it('returns the manifest sha256 on the default box', () => {
    const sha = readCommittedBoxSha256({
      env: {},
      vagrantDir: VAGRANT_DIR,
      readFile: readerFor(JSON.stringify({ sha256: GOOD_SHA }))
    });
    expect(sha).toBe(GOOD_SHA);
  });

  it('returns undefined under a box override (never false provenance)', () => {
    const sha = readCommittedBoxSha256({
      env: { VIHS_VAGRANT_BOX: 'someone/other-box' },
      vagrantDir: VAGRANT_DIR,
      readFile: readerFor(JSON.stringify({ sha256: GOOD_SHA }))
    });
    expect(sha).toBeUndefined();
  });

  it('returns undefined when the manifest is unreadable', () => {
    const sha = readCommittedBoxSha256({
      env: {},
      vagrantDir: VAGRANT_DIR,
      readFile: readerFor('', true)
    });
    expect(sha).toBeUndefined();
  });

  it('returns undefined when the manifest is not valid JSON', () => {
    const sha = readCommittedBoxSha256({
      env: {},
      vagrantDir: VAGRANT_DIR,
      readFile: readerFor('{ not json')
    });
    expect(sha).toBeUndefined();
  });

  it('returns undefined when sha256 is missing or malformed', () => {
    expect(
      readCommittedBoxSha256({ env: {}, vagrantDir: VAGRANT_DIR, readFile: readerFor(JSON.stringify({})) })
    ).toBeUndefined();
    expect(
      readCommittedBoxSha256({
        env: {},
        vagrantDir: VAGRANT_DIR,
        readFile: readerFor(JSON.stringify({ sha256: 'ABC' }))
      })
    ).toBeUndefined();
    // Uppercase hex is rejected (digest is recorded lowercase).
    expect(
      readCommittedBoxSha256({
        env: {},
        vagrantDir: VAGRANT_DIR,
        readFile: readerFor(JSON.stringify({ sha256: 'A'.repeat(64) }))
      })
    ).toBeUndefined();
  });
});

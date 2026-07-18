import { describe, expect, it } from 'vitest';

import {
  buildLinuxContainerRuntimeFilenameAlias,
  applyRuntimeTextReplacements
} from '../../src/reporting/runtime/runtimeTextReplacements';

describe('buildLinuxContainerRuntimeFilenameAlias', () => {
  it('collapses whitespace runs into underscores', () => {
    expect(buildLinuxContainerRuntimeFilenameAlias('My VI  File.vi')).toBe('My_VI_File.vi');
  });

  it('leaves a filename without whitespace unchanged', () => {
    expect(buildLinuxContainerRuntimeFilenameAlias('plain.vi')).toBe('plain.vi');
  });
});

describe('applyRuntimeTextReplacements', () => {
  it('applies replacements to the report text', () => {
    expect(
      applyRuntimeTextReplacements('a X b Y', [
        { from: 'X', to: '1' },
        { from: 'Y', to: '2' }
      ])
    ).toBe('a 1 b 2');
  });

  it('processes longer from-strings first to avoid partial consumption', () => {
    // If 'ab' were replaced after 'a', the result would be wrong; longest-first
    // ordering ensures 'abc' is replaced as a whole.
    expect(
      applyRuntimeTextReplacements('abc', [
        { from: 'a', to: 'X' },
        { from: 'abc', to: 'Z' }
      ])
    ).toBe('Z');
  });

  it('returns the text unchanged when there are no replacements', () => {
    expect(applyRuntimeTextReplacements('unchanged', [])).toBe('unchanged');
  });
});

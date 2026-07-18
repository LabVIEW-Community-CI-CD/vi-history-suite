import { describe, expect, it } from 'vitest';

import { escapeHtml } from '../../src/support/escapeHtml';

describe('escapeHtml', () => {
  it('escapes all five HTML-significant characters', () => {
    expect(escapeHtml(`&<>"'`)).toBe('&amp;&lt;&gt;&quot;&#39;');
  });

  it('escapes ampersands before other entities (no double-escaping)', () => {
    expect(escapeHtml('a & b < c')).toBe('a &amp; b &lt; c');
  });

  it('leaves a plain string unchanged', () => {
    expect(escapeHtml('plain text 123')).toBe('plain text 123');
  });

  it('returns an empty string for empty input', () => {
    expect(escapeHtml('')).toBe('');
  });

  it('escapes every occurrence, not just the first', () => {
    expect(escapeHtml('<<>>')).toBe('&lt;&lt;&gt;&gt;');
  });
});

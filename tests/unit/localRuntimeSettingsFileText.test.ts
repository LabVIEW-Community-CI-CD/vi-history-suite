import { describe, expect, it } from 'vitest';

import {
  applySettingsJsoncEdit,
  assertSupportedSettingsTarget,
  detectSettingsEndOfLine,
  ensureTerminalNewline,
  isMissingFileError,
  normalizeSettingsJsoncText,
  readTrimmedSettingsProperty,
  stripUtf8ByteOrderMark
} from '../../src/tooling/localRuntimeSettingsFileText';

describe('stripUtf8ByteOrderMark', () => {
  it('removes a leading BOM and leaves other text unchanged', () => {
    expect(stripUtf8ByteOrderMark('\uFEFF{}')).toBe('{}');
    expect(stripUtf8ByteOrderMark('{}')).toBe('{}');
  });
});

describe('normalizeSettingsJsoncText', () => {
  it('defaults blank/undefined input to an empty object', () => {
    expect(normalizeSettingsJsoncText(undefined, '/x/settings.json')).toBe('{}');
    expect(normalizeSettingsJsoncText('   ', '/x/settings.json')).toBe('{}');
  });

  it('accepts JSONC with comments and trailing commas', () => {
    const text = '{\n  // a comment\n  "a": 1,\n}';
    expect(normalizeSettingsJsoncText(text, '/x/settings.json')).toBe(text);
  });

  it('throws on malformed JSONC', () => {
    expect(() => normalizeSettingsJsoncText('{ "a": }', '/x/settings.json')).toThrow(
      'Failed to parse VS Code settings JSONC'
    );
  });

  it('throws when the root is not an object', () => {
    expect(() => normalizeSettingsJsoncText('[1, 2]', '/x/settings.json')).toThrow(
      'must contain a JSON object'
    );
  });
});

describe('applySettingsJsoncEdit', () => {
  it('inserts a nested property preserving the requested EOL', () => {
    const result = applySettingsJsoncEdit('{}', ['viHistorySuite.runtimeProvider'], 'host', '\n');
    expect(result).toContain('"viHistorySuite.runtimeProvider": "host"');
  });
});

describe('detectSettingsEndOfLine', () => {
  it('detects CRLF, else defaults to LF', () => {
    expect(detectSettingsEndOfLine('a\r\nb')).toBe('\r\n');
    expect(detectSettingsEndOfLine('a\nb')).toBe('\n');
    expect(detectSettingsEndOfLine(undefined)).toBe('\n');
  });
});

describe('ensureTerminalNewline', () => {
  it('appends the EOL only when missing', () => {
    expect(ensureTerminalNewline('x', '\n')).toBe('x\n');
    expect(ensureTerminalNewline('x\n', '\n')).toBe('x\n');
    expect(ensureTerminalNewline('x\r\n', '\r\n')).toBe('x\r\n');
  });
});

describe('assertSupportedSettingsTarget', () => {
  it('rejects a .vscode/settings.json workspace target', () => {
    expect(() => assertSupportedSettingsTarget('/repo/.vscode/settings.json')).toThrow(
      'Workspace settings are not supported'
    );
  });

  it('accepts a user settings.json target', () => {
    expect(() => assertSupportedSettingsTarget('/home/u/.config/Code/User/settings.json')).not.toThrow();
  });
});

describe('isMissingFileError', () => {
  it('is true only for an ENOENT error object', () => {
    expect(isMissingFileError({ code: 'ENOENT' })).toBe(true);
    expect(isMissingFileError({ code: 'EACCES' })).toBe(false);
    expect(isMissingFileError(new Error('x'))).toBe(false);
    expect(isMissingFileError(undefined)).toBe(false);
  });
});

describe('readTrimmedSettingsProperty', () => {
  it('returns a trimmed non-empty string or undefined', () => {
    expect(readTrimmedSettingsProperty({ a: '  host  ' }, 'a')).toBe('host');
    expect(readTrimmedSettingsProperty({ a: '   ' }, 'a')).toBeUndefined();
    expect(readTrimmedSettingsProperty({ a: 5 }, 'a')).toBeUndefined();
    expect(readTrimmedSettingsProperty({}, 'a')).toBeUndefined();
  });
});

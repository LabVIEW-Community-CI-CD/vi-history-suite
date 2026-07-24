import { describe, expect, it } from 'vitest';
import {
  buildLvkitViScanEnvelope,
  deriveViNameSlug,
  LVKIT_VI_SCAN_SCHEMA,
  LVKIT_VI_SCAN_SCHEMA_VERSION,
  type BuildLvkitViScanEnvelopeInput,
  type LvkitGeneratedModule
} from '../../src/semantic/lvkit/lvkitViScanModel';

// VHS-REQ-714: pure single-VI lvkit scan envelope builder. These tests exercise
// the deterministic, fail-closed contract without lvkit, Python, or a filesystem.

const MODULES: LvkitGeneratedModule[] = [
  { relativePath: 'make_path_absolute/__init__.py', python: '' },
  {
    relativePath: 'make_path_absolute/klass/make_path_absolute.py',
    python: 'def make_path_absolute():\n    return 1\n'
  },
  { relativePath: 'make_path_absolute/klass/open_vi.error.py', python: 'raise VILibResolutionNeeded()\n' }
];

function baseInput(over: Partial<BuildLvkitViScanEnvelopeInput> = {}): BuildLvkitViScanEnvelopeInput {
  return {
    viPath: 'resource/PrintToSingleFileHtml/Make path absolute.vi',
    contentSignature: 'sha256:abc123',
    runtime: 'host-native',
    generatedAt: '2026-07-24T11:02:31.000Z',
    lvkitSource: 'path',
    modules: MODULES,
    ...over
  };
}

// VHS-REQ-714.1 covers the pure projection/verbatim-capture/deterministic-order
// contract; VHS-REQ-714.2 covers the fail-closed validation cases below.
describe('buildLvkitViScanEnvelope (VHS-REQ-714.1, VHS-REQ-714.2)', () => {
  it('builds a schema-tagged envelope with the fixed schema id and version', () => {
    const envelope = buildLvkitViScanEnvelope(baseInput());
    expect(envelope.schema).toBe(LVKIT_VI_SCAN_SCHEMA);
    expect(envelope.schema).toBe('vi-history-suite/lvkit-vi-scan@v1');
    expect(envelope.schemaVersion).toBe(LVKIT_VI_SCAN_SCHEMA_VERSION);
    expect(envelope.schemaVersion).toBe(1);
  });

  it('preserves metadata and normalizes the viPath to POSIX separators', () => {
    const envelope = buildLvkitViScanEnvelope(baseInput({ viPath: 'resource\\a\\B.vi' }));
    expect(envelope.viPath).toBe('resource/a/B.vi');
    expect(envelope.contentSignature).toBe('sha256:abc123');
    expect(envelope.runtime).toBe('host-native');
    expect(envelope.generatedAt).toBe('2026-07-24T11:02:31.000Z');
    expect(envelope.lvkitSource).toBe('path');
  });

  it('sorts modules deterministically by relativePath and normalizes separators', () => {
    const envelope = buildLvkitViScanEnvelope(
      baseInput({
        modules: [
          { relativePath: 'z/last.py', python: 'z' },
          { relativePath: 'a\\first.py', python: 'a' },
          { relativePath: 'm/mid.py', python: 'm' }
        ]
      })
    );
    expect(envelope.modules.map((m) => m.relativePath)).toEqual(['a/first.py', 'm/mid.py', 'z/last.py']);
  });

  it('captures generated python verbatim', () => {
    const envelope = buildLvkitViScanEnvelope(baseInput());
    const primary = envelope.modules.find(
      (m) => m.relativePath === 'make_path_absolute/klass/make_path_absolute.py'
    );
    expect(primary?.python).toBe('def make_path_absolute():\n    return 1\n');
  });

  it('identifies the primary module by the VI name slug', () => {
    const envelope = buildLvkitViScanEnvelope(baseInput());
    expect(envelope.primaryModule?.relativePath).toBe(
      'make_path_absolute/klass/make_path_absolute.py'
    );
  });

  it('matches a primary module emitted as an unresolved .error.py stub', () => {
    const envelope = buildLvkitViScanEnvelope(
      baseInput({
        viPath: 'r/Open VI.vi',
        modules: [
          { relativePath: 'open_vi/__init__.py', python: '' },
          { relativePath: 'open_vi/open_vi.error.py', python: 'raise VILibResolutionNeeded()\n' }
        ]
      })
    );
    expect(envelope.primaryModule?.relativePath).toBe('open_vi/open_vi.error.py');
  });

  it('returns null primaryModule when no generated file matches the VI slug', () => {
    const envelope = buildLvkitViScanEnvelope(
      baseInput({
        viPath: 'r/Nonmatching.vi',
        modules: [{ relativePath: 'pkg/other.py', python: 'x' }]
      })
    );
    expect(envelope.primaryModule).toBeNull();
  });

  it('counts error and resolved modules', () => {
    const envelope = buildLvkitViScanEnvelope(baseInput());
    expect(envelope.moduleCount).toBe(3);
    expect(envelope.errorModuleCount).toBe(1);
    expect(envelope.resolvedModuleCount).toBe(2);
  });

  it('is deterministic for identical input', () => {
    const a = buildLvkitViScanEnvelope(baseInput());
    const b = buildLvkitViScanEnvelope(baseInput());
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it.each([
    ['viPath', { viPath: '' }],
    ['contentSignature', { contentSignature: '  ' }],
    ['runtime', { runtime: '' }]
  ])('fails closed on empty %s', (_field, over) => {
    expect(() => buildLvkitViScanEnvelope(baseInput(over as never))).toThrow(/lvkit-vi-scan/);
  });

  it('fails closed on a non-string viPath', () => {
    expect(() => buildLvkitViScanEnvelope(baseInput({ viPath: 42 as never }))).toThrow(
      /viPath must be a string/
    );
  });

  it('fails closed on a non-ISO generatedAt', () => {
    expect(() => buildLvkitViScanEnvelope(baseInput({ generatedAt: 'not-a-date' }))).toThrow(
      /generatedAt must be an ISO-8601 timestamp/
    );
  });

  it('fails closed on an unknown lvkitSource', () => {
    expect(() => buildLvkitViScanEnvelope(baseInput({ lvkitSource: 'docker' as never }))).toThrow(
      /lvkitSource must be one of/
    );
  });

  it('fails closed on empty modules (lvkit generate produced no files)', () => {
    expect(() => buildLvkitViScanEnvelope(baseInput({ modules: [] }))).toThrow(/must not be empty/);
  });

  it('fails closed on a non-array modules value', () => {
    expect(() => buildLvkitViScanEnvelope(baseInput({ modules: 'nope' as never }))).toThrow(
      /modules must be an array/
    );
  });

  it('fails closed on a module missing its relativePath', () => {
    expect(() =>
      buildLvkitViScanEnvelope(baseInput({ modules: [{ python: 'x' } as never] }))
    ).toThrow(/relativePath must be a string/);
  });

  it('fails closed on a module with non-string python', () => {
    expect(() =>
      buildLvkitViScanEnvelope(
        baseInput({ modules: [{ relativePath: 'a.py', python: 1 as never }] })
      )
    ).toThrow(/python must be a string/);
  });

  it('fails closed on duplicate module relativePath (after separator normalization)', () => {
    expect(() =>
      buildLvkitViScanEnvelope(
        baseInput({
          modules: [
            { relativePath: 'pkg/a.py', python: 'x' },
            { relativePath: 'pkg\\a.py', python: 'y' }
          ]
        })
      )
    ).toThrow(/duplicate module relativePath/);
  });

  it('fails closed on a null or non-object input', () => {
    expect(() => buildLvkitViScanEnvelope(null as never)).toThrow(/input must be an object/);
    expect(() => buildLvkitViScanEnvelope(42 as never)).toThrow(/input must be an object/);
  });

  it('fails closed on a null module entry', () => {
    expect(() =>
      buildLvkitViScanEnvelope(baseInput({ modules: [null as never] }))
    ).toThrow(/modules\[0\] must be an object/);
  });

  it('returns a null primaryModule when the VI name has no usable slug', () => {
    const envelope = buildLvkitViScanEnvelope(
      baseInput({ viPath: 'r/().vi', modules: [{ relativePath: 'pkg/a.py', python: 'x' }] })
    );
    expect(envelope.primaryModule).toBeNull();
  });

  it('captures a generated file that does not end in .py verbatim', () => {
    const envelope = buildLvkitViScanEnvelope(
      baseInput({
        viPath: 'r/Nomatch.vi',
        modules: [
          { relativePath: 'pkg/py.typed', python: '' },
          { relativePath: 'pkg/other.py', python: 'x' }
        ]
      })
    );
    expect(envelope.moduleCount).toBe(2);
    expect(envelope.errorModuleCount).toBe(0);
    expect(envelope.modules.map((m) => m.relativePath)).toContain('pkg/py.typed');
  });
});

describe('deriveViNameSlug (VHS-REQ-714)', () => {
  it('maps spaces to single underscores and lower-cases', () => {
    expect(deriveViNameSlug('Make path absolute')).toBe('make_path_absolute');
  });

  it('removes non-alphanumeric characters without inserting underscores', () => {
    expect(deriveViNameSlug('MenuSelection(User)')).toBe('menuselectionuser');
  });

  it('collapses repeated whitespace and trims underscores', () => {
    expect(deriveViNameSlug('  Foo   bar  ')).toBe('foo_bar');
  });

  it('returns an empty slug for a name with no usable characters', () => {
    expect(deriveViNameSlug('()')).toBe('');
  });
});

import { describe, expect, it } from 'vitest';
import {
  buildLvkitViScanEnvelope,
  classifyModuleResolution,
  deriveViNameSlug,
  isIsoTimestamp,
  LVKIT_MODULE_RESOLUTIONS,
  LVKIT_VI_SCAN_SCHEMA,
  LVKIT_VI_SCAN_SCHEMA_VERSION,
  summarizeModuleResolutions,
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

  it('trims surrounding whitespace from envelope string fields (VHS-REQ-714.2)', () => {
    const envelope = buildLvkitViScanEnvelope(baseInput({ runtime: '  host-native  ' }));
    expect(envelope.runtime).toBe('host-native');
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

  it('normalizes generated-Python CRLF line endings to LF for cross-OS parity (VHS-REQ-714)', () => {
    const crlf = buildLvkitViScanEnvelope(
      baseInput({ modules: [{ relativePath: 'pkg/win.py', python: 'def f():\r\n    return 1\r\n' }] })
    );
    const lf = buildLvkitViScanEnvelope(
      baseInput({ modules: [{ relativePath: 'pkg/win.py', python: 'def f():\n    return 1\n' }] })
    );
    // A Windows (CRLF) and a Linux (LF) generate of the SAME VI must produce a
    // byte-identical envelope, so the shared lvkit-vi-scan cache does not split by
    // OS line endings and any generated-Python hash matches across machines (#2373).
    expect(crlf.modules[0].python).toBe('def f():\n    return 1\n');
    expect(JSON.stringify(crlf)).toBe(JSON.stringify(lf));
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

  it('populates resolutionCounts from the module set (#2376 provenance)', () => {
    // MODULES = empty __init__ (resolved) + clean klass module (resolved) +
    // open_vi.error.py (error-stub).
    const envelope = buildLvkitViScanEnvelope(baseInput());
    expect(envelope.resolutionCounts).toEqual({
      resolved: 2,
      unresolvedPrimitive: 0,
      unresolvedVilib: 0,
      errorStub: 1
    });
    const c = envelope.resolutionCounts!;
    expect(c.resolved + c.unresolvedPrimitive + c.unresolvedVilib + c.errorStub).toBe(envelope.moduleCount);
  });

  it('surfaces an inline primitive-raise placeholder that errorModuleCount misses (#2376)', () => {
    // A --placeholder-on-unresolved born-from-scratch generate: the VI's own
    // module carries an inline raise but is NOT a .error.py, so errorModuleCount
    // stays 0 while resolutionCounts.unresolvedPrimitive catches it.
    const envelope = buildLvkitViScanEnvelope(
      baseInput({
        modules: [
          {
            relativePath: 'write_ascii_message/write_ascii_message.py',
            python:
              'from lvkit.primitive_resolver import PrimitiveResolutionNeeded\n\n' +
              "def write_ascii_message():\n    raise PrimitiveResolutionNeeded(prim_id=1926)\n"
          }
        ]
      })
    );
    expect(envelope.errorModuleCount).toBe(0);
    expect(envelope.resolutionCounts).toEqual({
      resolved: 0,
      unresolvedPrimitive: 1,
      unresolvedVilib: 0,
      errorStub: 0
    });
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

  it('rejects a parseable-but-non-ISO generatedAt (e.g. "July 24, 2026")', () => {
    expect(() => buildLvkitViScanEnvelope(baseInput({ generatedAt: 'July 24, 2026' }))).toThrow(
      /generatedAt must be an ISO-8601 timestamp/
    );
  });

  it('rejects an impossible calendar date that Date.parse would roll over (Feb 31)', () => {
    expect(() =>
      buildLvkitViScanEnvelope(baseInput({ generatedAt: '2026-02-31T00:00:00Z' }))
    ).toThrow(/not a real calendar instant/);
  });

  it('accepts a valid ISO-8601 instant with a timezone offset', () => {
    const envelope = buildLvkitViScanEnvelope(
      baseInput({ generatedAt: '2026-07-24T13:02:31.500+02:00' })
    );
    expect(envelope.generatedAt).toBe('2026-07-24T13:02:31.500+02:00');
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

describe('isIsoTimestamp (VHS-REQ-714)', () => {
  it('accepts a canonical ISO-8601 instant (UTC and with an offset)', () => {
    expect(isIsoTimestamp('2026-07-24T11:02:31.000Z')).toBe(true);
    expect(isIsoTimestamp('2026-07-24T13:02:31.500+02:00')).toBe(true);
  });

  it('rejects a non-ISO or unparseable string', () => {
    expect(isIsoTimestamp('not-a-date')).toBe(false);
    expect(isIsoTimestamp('July 24, 2026')).toBe(false);
  });

  it('rejects an impossible calendar instant Date.parse would roll over', () => {
    expect(isIsoTimestamp('2026-02-31T00:00:00Z')).toBe(false);
  });

  it('rejects a non-string value', () => {
    expect(isIsoTimestamp(undefined)).toBe(false);
    expect(isIsoTimestamp(1_753_356_151_000)).toBe(false);
  });
});

describe('classifyModuleResolution (#2376 provenance)', () => {
  it('classifies a clean module as resolved', () => {
    expect(
      classifyModuleResolution({ relativePath: 'pkg/vi.py', python: 'def vi():\n    return 1\n' })
    ).toBe('resolved');
  });

  it('classifies an inline PrimitiveResolutionNeeded placeholder as unresolved-primitive (NOT .error.py)', () => {
    const python =
      'from lvkit.primitive_resolver import PrimitiveResolutionNeeded\n\n' +
      "def write_ascii_message():\n    raise PrimitiveResolutionNeeded(prim_id=1926, prim_name='unknown_primitive_1926')\n";
    const module = { relativePath: 'write_ascii_message/write_ascii_message.py', python };
    // The module is a normally-named .py -- the coarse errorModule check would
    // miss it, but the resolution classifier catches the primitive wall.
    expect(classifyModuleResolution(module)).toBe('unresolved-primitive');
  });

  it('does not false-positive on the import line alone (no raise statement)', () => {
    const python = 'from lvkit.primitive_resolver import PrimitiveResolutionNeeded\n\ndef vi():\n    return 1\n';
    expect(classifyModuleResolution({ relativePath: 'pkg/vi.py', python })).toBe('resolved');
  });

  it('classifies an inline VILibResolutionNeeded placeholder as unresolved-vilib', () => {
    const python = 'def open_vi():\n    raise VILibResolutionNeeded(qualified_vi_name="Open VI.vi")\n';
    expect(classifyModuleResolution({ relativePath: 'pkg/open_vi.py', python })).toBe('unresolved-vilib');
  });

  it('classifies a .error.py file as error-stub even if it also carries a raise', () => {
    const module = { relativePath: 'pkg/open_vi.error.py', python: 'raise VILibResolutionNeeded()\n' };
    expect(classifyModuleResolution(module)).toBe('error-stub');
  });
});

describe('summarizeModuleResolutions (#2376 provenance)', () => {
  it('tallies each resolution kind and the counts sum to the module count', () => {
    const modules: LvkitGeneratedModule[] = [
      { relativePath: 'a.py', python: 'def a():\n    return 1\n' },
      { relativePath: 'b.py', python: 'def b():\n    return 2\n' },
      { relativePath: 'c.py', python: 'def c():\n    raise PrimitiveResolutionNeeded(prim_id=1926)\n' },
      { relativePath: 'd.py', python: 'def d():\n    raise VILibResolutionNeeded()\n' },
      { relativePath: 'e.error.py', python: 'raise VILibResolutionNeeded()\n' }
    ];
    const counts = summarizeModuleResolutions(modules);
    expect(counts).toEqual({ resolved: 2, unresolvedPrimitive: 1, unresolvedVilib: 1, errorStub: 1 });
    const total = counts.resolved + counts.unresolvedPrimitive + counts.unresolvedVilib + counts.errorStub;
    expect(total).toBe(modules.length);
  });

  it('returns all-zero-but-typed for an empty module list', () => {
    expect(summarizeModuleResolutions([])).toEqual({
      resolved: 0,
      unresolvedPrimitive: 0,
      unresolvedVilib: 0,
      errorStub: 0
    });
  });

  it('exposes the full resolution vocabulary', () => {
    expect(LVKIT_MODULE_RESOLUTIONS).toEqual([
      'resolved',
      'unresolved-primitive',
      'unresolved-vilib',
      'error-stub'
    ]);
  });
});

import { describe, expect, it } from 'vitest';

import { buildLvkitViScanEnvelope } from '../../src/semantic/lvkit/lvkitViScanModel';
import {
  computeLvkitViScanStoreKey,
  createFileLvkitViScanStore,
  type FileLvkitViScanStoreFsDeps
} from '../../src/semantic/lvkit/lvkitViScanStore';

// VHS-REQ-716: dedicated content-addressed store for lvkit-vi-scan@v1 envelopes
// (epic #2348 Phase C). These tests exercise the deterministic key derivation,
// the round-trip, and the fail-closed read / best-effort write contract with an
// in-memory filesystem (no lvkit, Python, or real disk).

const VI_PATH = 'resource/PrintToSingleFileHtml/Make path absolute.vi';
const CONTENT_SIGNATURE = 'sha256:abc123';
const STORE_DIR = '/tmp/vihs-lvkit-vi-scan-store';

function makeEnvelope(over: { viPath?: string; contentSignature?: string } = {}) {
  return buildLvkitViScanEnvelope({
    viPath: over.viPath ?? VI_PATH,
    contentSignature: over.contentSignature ?? CONTENT_SIGNATURE,
    runtime: 'host-native',
    generatedAt: '2026-07-24T11:02:31.000Z',
    lvkitSource: 'path',
    modules: [
      {
        relativePath: 'make_path_absolute/klass/make_path_absolute.py',
        python: 'def make_path_absolute():\n    return 1\n'
      }
    ]
  });
}

// A real canonical envelope for (VI_PATH, CONTENT_SIGNATURE), round-tripped
// through JSON so it is a plain mutable record, then tampered by `mutate`. The
// content address stays valid so the read guard (which runs before the address
// check) is what rejects the returned string.
function tamperedEnvelopeJson(mutate: (envelope: Record<string, unknown>) => void): string {
  const envelope = JSON.parse(JSON.stringify(makeEnvelope())) as Record<string, unknown>;
  mutate(envelope);
  return JSON.stringify(envelope);
}

interface FakeFs extends FileLvkitViScanStoreFsDeps {
  files: Map<string, string>;
  ensuredDirectories: string[];
}

function createFakeFs(seed: Record<string, string> = {}): FakeFs {
  const files = new Map<string, string>(Object.entries(seed));
  const ensuredDirectories: string[] = [];
  return {
    files,
    ensuredDirectories,
    ensureDirectory: async (directory) => {
      ensuredDirectories.push(directory);
    },
    readFile: async (filePath) => {
      const content = files.get(filePath);
      if (content === undefined) {
        throw new Error(`ENOENT: ${filePath}`);
      }
      return content;
    },
    writeFile: async (filePath, data) => {
      files.set(filePath, data);
    }
  };
}

function joinPath(directory: string, name: string): string {
  return `${directory}/${name}`;
}

function createStore(fsDeps: FileLvkitViScanStoreFsDeps) {
  return createFileLvkitViScanStore({ storeDirectory: STORE_DIR, joinPath }, fsDeps);
}

function storeFilePathFor(viPath: string, contentSignature: string): string {
  return `${STORE_DIR}/${computeLvkitViScanStoreKey(viPath, contentSignature)}.json`;
}

describe('lvkitViScanStore (VHS-REQ-716)', () => {
  describe('computeLvkitViScanStoreKey (VHS-REQ-716.1)', () => {
    it('is a deterministic 64-character lowercase hex digest', () => {
      const key = computeLvkitViScanStoreKey(VI_PATH, CONTENT_SIGNATURE);
      expect(key).toMatch(/^[a-f0-9]{64}$/);
      expect(computeLvkitViScanStoreKey(VI_PATH, CONTENT_SIGNATURE)).toBe(key);
    });

    it('normalizes Windows separators so a path is addressed identically', () => {
      expect(computeLvkitViScanStoreKey('resource\\a\\B.vi', CONTENT_SIGNATURE)).toBe(
        computeLvkitViScanStoreKey('resource/a/B.vi', CONTENT_SIGNATURE)
      );
    });

    it('separates the address by both VI path and content signature', () => {
      const base = computeLvkitViScanStoreKey(VI_PATH, CONTENT_SIGNATURE);
      expect(computeLvkitViScanStoreKey('resource/other.vi', CONTENT_SIGNATURE)).not.toBe(base);
      expect(computeLvkitViScanStoreKey(VI_PATH, 'sha256:different')).not.toBe(base);
    });
  });

  describe('createFileLvkitViScanStore round-trip (VHS-REQ-716.2)', () => {
    it('persists an envelope under its content address and returns it verbatim', async () => {
      const fakeFs = createFakeFs();
      const store = createStore(fakeFs);
      const envelope = makeEnvelope();

      await store.put(envelope);

      expect(fakeFs.files.has(storeFilePathFor(VI_PATH, CONTENT_SIGNATURE))).toBe(true);
      expect(fakeFs.ensuredDirectories).toContain(STORE_DIR);
      expect(await store.get(VI_PATH, CONTENT_SIGNATURE)).toEqual(envelope);
    });

    it('addresses a lookup by a Windows-style path identically to POSIX', async () => {
      const fakeFs = createFakeFs();
      const store = createStore(fakeFs);
      const envelope = makeEnvelope({ viPath: 'resource/a/B.vi' });

      await store.put(envelope);

      expect(await store.get('resource\\a\\B.vi', CONTENT_SIGNATURE)).toEqual(envelope);
    });
  });

  describe('createFileLvkitViScanStore fail-closed reads / best-effort writes (VHS-REQ-716.3)', () => {
    it('returns undefined for an absent scan', async () => {
      const store = createStore(createFakeFs());
      expect(await store.get(VI_PATH, CONTENT_SIGNATURE)).toBeUndefined();
    });

    it('returns undefined for malformed JSON', async () => {
      const store = createStore(
        createFakeFs({ [storeFilePathFor(VI_PATH, CONTENT_SIGNATURE)]: '{not json' })
      );
      expect(await store.get(VI_PATH, CONTENT_SIGNATURE)).toBeUndefined();
    });

    it('returns undefined for a schema-drifted envelope', async () => {
      const drifted = JSON.stringify({ ...makeEnvelope(), schema: 'vi-history-suite/other@v9' });
      const store = createStore(
        createFakeFs({ [storeFilePathFor(VI_PATH, CONTENT_SIGNATURE)]: drifted })
      );
      expect(await store.get(VI_PATH, CONTENT_SIGNATURE)).toBeUndefined();
    });

    // A stored envelope is handed to an agent as authoritative generated code, so
    // the read guard must reject a partial/hand-edited/old file (missing schema
    // version, dropped metadata, malformed modules, or inconsistent counts) as a
    // miss rather than surface an incomplete scan.
    it('rejects an envelope missing the schema version', async () => {
      const store = createStore(
        createFakeFs({
          [storeFilePathFor(VI_PATH, CONTENT_SIGNATURE)]: tamperedEnvelopeJson((envelope) => {
            delete envelope.schemaVersion;
          })
        })
      );
      expect(await store.get(VI_PATH, CONTENT_SIGNATURE)).toBeUndefined();
    });

    it('rejects an envelope with an unknown lvkit source', async () => {
      const store = createStore(
        createFakeFs({
          [storeFilePathFor(VI_PATH, CONTENT_SIGNATURE)]: tamperedEnvelopeJson((envelope) => {
            envelope.lvkitSource = 'network';
          })
        })
      );
      expect(await store.get(VI_PATH, CONTENT_SIGNATURE)).toBeUndefined();
    });

    it('rejects an envelope missing required runtime metadata', async () => {
      const store = createStore(
        createFakeFs({
          [storeFilePathFor(VI_PATH, CONTENT_SIGNATURE)]: tamperedEnvelopeJson((envelope) => {
            delete envelope.runtime;
          })
        })
      );
      expect(await store.get(VI_PATH, CONTENT_SIGNATURE)).toBeUndefined();
    });

    it('rejects an envelope with an empty modules array', async () => {
      const store = createStore(
        createFakeFs({
          [storeFilePathFor(VI_PATH, CONTENT_SIGNATURE)]: tamperedEnvelopeJson((envelope) => {
            envelope.modules = [];
            envelope.moduleCount = 0;
            envelope.resolvedModuleCount = 0;
          })
        })
      );
      expect(await store.get(VI_PATH, CONTENT_SIGNATURE)).toBeUndefined();
    });

    it('rejects an envelope whose module is missing its generated Python', async () => {
      const store = createStore(
        createFakeFs({
          [storeFilePathFor(VI_PATH, CONTENT_SIGNATURE)]: tamperedEnvelopeJson((envelope) => {
            const [module] = envelope.modules as Array<Record<string, unknown>>;
            delete module.python;
          })
        })
      );
      expect(await store.get(VI_PATH, CONTENT_SIGNATURE)).toBeUndefined();
    });

    it('rejects an envelope whose module relative path is empty', async () => {
      const store = createStore(
        createFakeFs({
          [storeFilePathFor(VI_PATH, CONTENT_SIGNATURE)]: tamperedEnvelopeJson((envelope) => {
            const [module] = envelope.modules as Array<Record<string, unknown>>;
            module.relativePath = '';
          })
        })
      );
      expect(await store.get(VI_PATH, CONTENT_SIGNATURE)).toBeUndefined();
    });

    it('rejects an envelope whose module count disagrees with the modules array', async () => {
      const store = createStore(
        createFakeFs({
          [storeFilePathFor(VI_PATH, CONTENT_SIGNATURE)]: tamperedEnvelopeJson((envelope) => {
            envelope.moduleCount = 5;
          })
        })
      );
      expect(await store.get(VI_PATH, CONTENT_SIGNATURE)).toBeUndefined();
    });

    it('rejects an envelope whose resolved count breaks the total/error invariant', async () => {
      const store = createStore(
        createFakeFs({
          [storeFilePathFor(VI_PATH, CONTENT_SIGNATURE)]: tamperedEnvelopeJson((envelope) => {
            envelope.resolvedModuleCount = 99;
          })
        })
      );
      expect(await store.get(VI_PATH, CONTENT_SIGNATURE)).toBeUndefined();
    });

    it('rejects an envelope with a malformed primary module', async () => {
      const store = createStore(
        createFakeFs({
          [storeFilePathFor(VI_PATH, CONTENT_SIGNATURE)]: tamperedEnvelopeJson((envelope) => {
            envelope.primaryModule = { relativePath: 'x.py' };
          })
        })
      );
      expect(await store.get(VI_PATH, CONTENT_SIGNATURE)).toBeUndefined();
    });

    it('rejects a stored value that is not an object', async () => {
      const store = createStore(
        createFakeFs({ [storeFilePathFor(VI_PATH, CONTENT_SIGNATURE)]: '42' })
      );
      expect(await store.get(VI_PATH, CONTENT_SIGNATURE)).toBeUndefined();
    });

    it('rejects an envelope whose module entry is not an object', async () => {
      const store = createStore(
        createFakeFs({
          [storeFilePathFor(VI_PATH, CONTENT_SIGNATURE)]: tamperedEnvelopeJson((envelope) => {
            (envelope.modules as unknown[])[0] = null;
          })
        })
      );
      expect(await store.get(VI_PATH, CONTENT_SIGNATURE)).toBeUndefined();
    });

    it('rejects a file whose stored VI path does not match the requested address', async () => {
      // A valid envelope for a DIFFERENT VI placed at the key computed for VI_PATH.
      const otherVi = JSON.stringify(makeEnvelope({ viPath: 'resource/other.vi' }));
      const store = createStore(
        createFakeFs({ [storeFilePathFor(VI_PATH, CONTENT_SIGNATURE)]: otherVi })
      );
      expect(await store.get(VI_PATH, CONTENT_SIGNATURE)).toBeUndefined();
    });

    it('rejects a file whose stored content signature does not match the requested address', async () => {
      const otherSignature = JSON.stringify(makeEnvelope({ contentSignature: 'sha256:different' }));
      const store = createStore(
        createFakeFs({ [storeFilePathFor(VI_PATH, CONTENT_SIGNATURE)]: otherSignature })
      );
      expect(await store.get(VI_PATH, CONTENT_SIGNATURE)).toBeUndefined();
    });

    it('does not throw when the store write fails', async () => {
      const fakeFs = createFakeFs();
      fakeFs.writeFile = async () => {
        throw new Error('disk full');
      };
      const store = createStore(fakeFs);
      await expect(store.put(makeEnvelope())).resolves.toBeUndefined();
    });

    it('does not throw when ensuring the store directory fails', async () => {
      const fakeFs = createFakeFs();
      fakeFs.ensureDirectory = async () => {
        throw new Error('permission denied');
      };
      const store = createStore(fakeFs);
      await expect(store.put(makeEnvelope())).resolves.toBeUndefined();
    });
  });
});

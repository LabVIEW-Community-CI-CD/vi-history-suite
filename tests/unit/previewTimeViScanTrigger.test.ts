import { describe, expect, it } from 'vitest';
import * as os from 'node:os';
import * as path from 'node:path';

import { buildLvkitViScanEnvelope, type LvkitViScanEnvelope } from '../../src/semantic/lvkit/lvkitViScanModel';
import type { LvkitViScanInput, LvkitViScanResult } from '../../src/semantic/lvkit/lvkitViScanProvider';
import {
  buildPreviewTimeViScanRequest,
  runPreviewTimeViScan,
  type PreviewTimeViScanRequest
} from '../../src/semantic/lvkit/previewTimeViScanTrigger';

// VHS-REQ-717: preview-time lvkit scan trigger (epic #2348 Phase B). These tests
// exercise the best-effort bridge from a successful preview render to the Phase A
// scan provider and Phase C store with in-memory fakes (no lvkit, no real disk):
// a completed scan is persisted; every non-completed or thrown path resolves to a
// typed outcome and never throws into the preview.

const REQUEST: PreviewTimeViScanRequest = {
  repositoryRoot: '/repo',
  relativePath: 'resource/PrintToSingleFileHtml/Make path absolute.vi',
  runtime: 'host-native'
};

const CONTENT_SIGNATURE = 'sha256:abc123';

function makeEnvelope(): LvkitViScanEnvelope {
  return buildLvkitViScanEnvelope({
    viPath: REQUEST.relativePath,
    contentSignature: CONTENT_SIGNATURE,
    runtime: REQUEST.runtime,
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

interface FakeStore {
  put: (envelope: LvkitViScanEnvelope) => Promise<boolean>;
  puts: LvkitViScanEnvelope[];
}

function createFakeStore(onPut?: (envelope: LvkitViScanEnvelope) => void): FakeStore {
  const puts: LvkitViScanEnvelope[] = [];
  return {
    puts,
    put: async (envelope) => {
      puts.push(envelope);
      onPut?.(envelope);
      return true;
    }
  };
}

/** A scan stub that records its input and returns a fixed result. */
function scanReturning(result: LvkitViScanResult): {
  scan: (input: LvkitViScanInput) => Promise<LvkitViScanResult>;
  inputs: LvkitViScanInput[];
} {
  const inputs: LvkitViScanInput[] = [];
  return {
    inputs,
    scan: async (input) => {
      inputs.push(input);
      return result;
    }
  };
}

describe('runPreviewTimeViScan (VHS-REQ-717.1)', () => {
  it('persists the envelope when the scan completes', async () => {
    const envelope = makeEnvelope();
    const { scan } = scanReturning({ status: 'completed', envelope });
    const store = createFakeStore();

    const outcome = await runPreviewTimeViScan(REQUEST, { scan, store });

    expect(outcome).toEqual({
      status: 'persisted',
      viPath: envelope.viPath,
      contentSignature: envelope.contentSignature
    });
    expect(store.puts).toEqual([envelope]);
  });

  it('forwards the request verbatim to the scan provider', async () => {
    const { scan, inputs } = scanReturning({ status: 'completed', envelope: makeEnvelope() });
    const store = createFakeStore();

    await runPreviewTimeViScan(REQUEST, { scan, store });

    expect(inputs).toEqual([
      {
        repositoryRoot: REQUEST.repositoryRoot,
        relativePath: REQUEST.relativePath,
        runtime: REQUEST.runtime
      }
    ]);
  });

  it('does not persist and reports the reason when the runtime is blocked', async () => {
    const { scan } = scanReturning({ status: 'blocked-runtime', reason: 'lvkit not found' });
    const store = createFakeStore();

    const outcome = await runPreviewTimeViScan(REQUEST, { scan, store });

    expect(outcome).toEqual({ status: 'not-persisted', reason: 'scan-blocked-runtime: lvkit not found' });
    expect(store.puts).toEqual([]);
  });

  it('does not persist when preflight is blocked (delegated target validation)', async () => {
    const { scan } = scanReturning({ status: 'blocked-preflight', reason: 'invalid-repository-target: x' });
    const store = createFakeStore();

    const outcome = await runPreviewTimeViScan(REQUEST, { scan, store });

    expect(outcome).toEqual({
      status: 'not-persisted',
      reason: 'scan-blocked-preflight: invalid-repository-target: x'
    });
    expect(store.puts).toEqual([]);
  });

  it('does not persist when the scan fails', async () => {
    const { scan } = scanReturning({ status: 'failed', reason: 'lvkit exited 1' });
    const store = createFakeStore();

    const outcome = await runPreviewTimeViScan(REQUEST, { scan, store });

    expect(outcome).toEqual({ status: 'not-persisted', reason: 'scan-failed: lvkit exited 1' });
    expect(store.puts).toEqual([]);
  });

  it('swallows a scan that throws into a typed errored outcome (never throws)', async () => {
    const scan = async (): Promise<LvkitViScanResult> => {
      throw new Error('boom');
    };
    const store = createFakeStore();

    const outcome = await runPreviewTimeViScan(REQUEST, { scan, store });

    expect(outcome).toEqual({ status: 'errored', reason: 'scan-threw: boom' });
    expect(store.puts).toEqual([]);
  });

  it('swallows a store write that throws into a typed errored outcome (never throws)', async () => {
    const envelope = makeEnvelope();
    const { scan } = scanReturning({ status: 'completed', envelope });
    const store: FakeStore = {
      puts: [],
      put: async () => {
        throw new Error('disk full');
      }
    };

    const outcome = await runPreviewTimeViScan(REQUEST, { scan, store });

    expect(outcome).toEqual({ status: 'errored', reason: 'store-threw: disk full' });
  });

  it('reports store-write-failed when the best-effort store write is suppressed', async () => {
    const envelope = makeEnvelope();
    const { scan } = scanReturning({ status: 'completed', envelope });
    // The production store swallows filesystem errors and returns false rather
    // than throwing; the trigger must not then claim the scan was persisted.
    const store: FakeStore = {
      puts: [],
      put: async () => false
    };

    const outcome = await runPreviewTimeViScan(REQUEST, { scan, store });

    expect(outcome).toEqual({ status: 'errored', reason: 'store-write-failed' });
  });

  it('stringifies a non-Error thrown value', async () => {
    const scan = async (): Promise<LvkitViScanResult> => {
      // eslint-disable-next-line @typescript-eslint/no-throw-literal
      throw 'string failure';
    };
    const store = createFakeStore();

    const outcome = await runPreviewTimeViScan(REQUEST, { scan, store });

    expect(outcome).toEqual({ status: 'errored', reason: 'scan-threw: string failure' });
  });
});

describe('buildPreviewTimeViScanRequest (VHS-REQ-717.2)', () => {
  const ROOT = path.resolve('/repo');
  const VI = path.join(ROOT, 'resource', 'A.vi');
  const folders = (roots: string[]) => roots.map((fsPath) => ({ uri: { fsPath } }));

  it('maps a VI inside the workspace folder to a request', () => {
    const req = buildPreviewTimeViScanRequest(VI, folders([ROOT]), 'host-native');

    expect(req).toEqual({
      repositoryRoot: ROOT,
      relativePath: path.relative(ROOT, VI),
      runtime: 'host-native'
    });
  });

  it('returns undefined when there are no workspace folders', () => {
    expect(buildPreviewTimeViScanRequest(VI, undefined, 'host-native')).toBeUndefined();
    expect(buildPreviewTimeViScanRequest(VI, [], 'host-native')).toBeUndefined();
  });

  it('returns undefined for a VI outside every workspace folder', () => {
    const outside = path.join(path.resolve('/other'), 'B.vi');

    expect(buildPreviewTimeViScanRequest(outside, folders([ROOT]), 'host-native')).toBeUndefined();
  });

  it('picks the deepest containing folder in a multi-root workspace', () => {
    const nested = path.join(ROOT, 'nested');
    const vi = path.join(nested, 'C.vi');

    const req = buildPreviewTimeViScanRequest(vi, folders([ROOT, nested]), 'linux-container');

    expect(req).toEqual({
      repositoryRoot: nested,
      relativePath: path.relative(nested, vi),
      runtime: 'linux-container'
    });
  });

  it('carries the runtime label through and skips folders with an empty root', () => {
    const req = buildPreviewTimeViScanRequest(VI, folders(['', ROOT]), 'windows-container');

    expect(req?.runtime).toBe('windows-container');
    expect(req?.repositoryRoot).toBe(ROOT);
  });

  it('maps an in-workspace VI whose basename begins with two dots', () => {
    // `path.relative` returns `..diagnostic.vi`, which begins with `..` but is NOT
    // a parent-directory escape; it must still map to a request.
    const vi = path.join(ROOT, '..diagnostic.vi');

    const req = buildPreviewTimeViScanRequest(vi, folders([ROOT]), 'host-native');

    expect(req).toEqual({
      repositoryRoot: ROOT,
      relativePath: path.relative(ROOT, vi),
      runtime: 'host-native'
    });
  });

  it('returns undefined for a revision temp tree opened outside the workspace', () => {
    // History-command revision previews open as `file` URIs under an OS temp tree
    // (vihs-vi-revision-*), outside every workspace folder, so no scan is mapped.
    const revisionVi = path.join(os.tmpdir(), 'vihs-vi-revision-abc123', 'resource', 'A.vi');

    expect(buildPreviewTimeViScanRequest(revisionVi, folders([ROOT]), 'host-native')).toBeUndefined();
  });
});

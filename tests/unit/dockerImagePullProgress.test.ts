/**
 * VHS-REQ-654: unit tests for the Docker Engine API pull-progress module.
 * VHS-REQ-654.6: parser, aggregator, and injected request boundary coverage
 * keep pull-progress behavior unit-testable without a real Docker daemon.
 *
 * The parser and aggregator are pure; the stream is exercised through an
 * injected request boundary so the layer-weighted progress math is validated on
 * Linux without a real Docker daemon.
 */

import { describe, expect, it, vi } from 'vitest';

import {
  DOCKER_ENGINE_API_VERSION,
  DockerPullProgressAggregator,
  formatBytes,
  formatPullProgressMessage,
  parseDockerPullProgressLine,
  resolveDockerEngineSocketPath,
  splitImageReference,
  streamDockerImagePull,
  type DockerPullStreamRequest
} from '../../src/tooling/dockerImagePullProgress';

const GB = 1024 * 1024 * 1024;

describe('resolveDockerEngineSocketPath', () => {
  it('uses the named pipe on Windows and the unix socket on Linux (VHS-REQ-654.1)', () => {
    expect(resolveDockerEngineSocketPath('win32')).toBe('\\\\.\\pipe\\docker_engine');
    expect(resolveDockerEngineSocketPath('linux')).toBe('/var/run/docker.sock');
  });
});

describe('splitImageReference', () => {
  it('splits namespace/repo:tag on the final colon', () => {
    expect(splitImageReference('nationalinstruments/labview:2026q1-windows')).toEqual({
      fromImage: 'nationalinstruments/labview',
      tag: '2026q1-windows'
    });
  });

  it('defaults to latest when no tag is present', () => {
    expect(splitImageReference('nationalinstruments/labview')).toEqual({
      fromImage: 'nationalinstruments/labview',
      tag: 'latest'
    });
  });
});

describe('parseDockerPullProgressLine', () => {
  it('parses a Downloading line into a layer-progress event (VHS-REQ-656.1)', () => {
    const event = parseDockerPullProgressLine(
      JSON.stringify({ status: 'Downloading', id: 'abc', progressDetail: { current: 100, total: 1000 } })
    );
    expect(event).toEqual({ kind: 'layer-progress', layerId: 'abc', current: 100, total: 1000 });
  });

  it('enumerates an id-bearing Downloading line with a zero or missing total as layer-seen', () => {
    expect(
      parseDockerPullProgressLine(
        JSON.stringify({ status: 'Downloading', id: 'abc', progressDetail: { current: 5, total: 0 } })
      )
    ).toEqual({ kind: 'layer-seen', layerId: 'abc' });
    expect(
      parseDockerPullProgressLine(JSON.stringify({ status: 'Downloading', id: 'abc', progressDetail: {} }))
    ).toEqual({ kind: 'layer-seen', layerId: 'abc' });
  });

  it('distinguishes Download complete, Pull complete, and Already exists (VHS-REQ-656.1)', () => {
    expect(parseDockerPullProgressLine(JSON.stringify({ status: 'Download complete', id: 'abc' }))).toEqual({
      kind: 'layer-download-complete',
      layerId: 'abc'
    });
    expect(parseDockerPullProgressLine(JSON.stringify({ status: 'Pull complete', id: 'abc' }))).toEqual({
      kind: 'layer-complete',
      layerId: 'abc'
    });
    expect(parseDockerPullProgressLine(JSON.stringify({ status: 'Already exists', id: 'abc' }))).toEqual({
      kind: 'layer-cached',
      layerId: 'abc'
    });
  });

  it('parses an Extracting line with byte detail into a layer-extract-progress event (VHS-REQ-656.1)', () => {
    expect(
      parseDockerPullProgressLine(
        JSON.stringify({ status: 'Extracting', id: 'abc', progressDetail: { current: 30, total: 120 } })
      )
    ).toEqual({ kind: 'layer-extract-progress', layerId: 'abc', current: 30, total: 120 });
  });

  it('parses an Extracting line without usable byte detail into a layer-extracting marker (VHS-REQ-656.1, VHS-REQ-656.4)', () => {
    expect(
      parseDockerPullProgressLine(JSON.stringify({ status: 'Extracting', id: 'abc', progressDetail: { current: 1, total: 0 } }))
    ).toEqual({ kind: 'layer-extracting', layerId: 'abc' });
    expect(parseDockerPullProgressLine(JSON.stringify({ status: 'Extracting', id: 'abc' }))).toEqual({
      kind: 'layer-extracting',
      layerId: 'abc'
    });
  });

  it('enumerates id-bearing pre-download status lines as layer-seen', () => {
    expect(parseDockerPullProgressLine(JSON.stringify({ status: 'Pulling fs layer', id: 'abc' }))).toEqual({
      kind: 'layer-seen',
      layerId: 'abc'
    });
    expect(parseDockerPullProgressLine(JSON.stringify({ status: 'Waiting', id: 'abc' }))).toEqual({
      kind: 'layer-seen',
      layerId: 'abc'
    });
  });

  it('does not enumerate the opening "Pulling from" line (its id is the tag, not a layer)', () => {
    expect(
      parseDockerPullProgressLine(JSON.stringify({ status: 'Pulling from nationalinstruments/labview', id: '2026q1-windows' }))
    ).toEqual({ kind: 'status', status: 'Pulling from nationalinstruments/labview' });
  });

  it('surfaces an in-band pull error (VHS-REQ-654.4)', () => {
    expect(
      parseDockerPullProgressLine(JSON.stringify({ errorDetail: { message: 'no such image' }, error: 'no such image' }))
    ).toEqual({ kind: 'error', message: 'no such image' });
  });

  it('returns undefined for blank or malformed lines', () => {
    expect(parseDockerPullProgressLine('')).toBeUndefined();
    expect(parseDockerPullProgressLine('   ')).toBeUndefined();
    expect(parseDockerPullProgressLine('{not json')).toBeUndefined();
  });

  it('returns a status event for non-id status lines', () => {
    expect(
      parseDockerPullProgressLine(JSON.stringify({ status: 'Status: Downloaded newer image for repo/img:tag' }))
    ).toEqual({ kind: 'status', status: 'Status: Downloaded newer image for repo/img:tag' });
  });
});

describe('DockerPullProgressAggregator', () => {
  it('weights each enumerated layer equally, smoothed by the in-flight byte fraction (VHS-REQ-654.1)', () => {
    const agg = new DockerPullProgressAggregator();
    expect(agg.snapshot().percent).toBeUndefined();

    agg.apply({ kind: 'layer-seen', layerId: 'a' });
    agg.apply({ kind: 'layer-seen', layerId: 'b' });
    // Two layers enumerated, none downloading yet -> still undefined.
    expect(agg.snapshot().percent).toBeUndefined();
    expect(agg.snapshot().totalLayers).toBe(2);

    // a is half done: fraction 0.5 over 2 layers = 25%.
    let snap = agg.apply({ kind: 'layer-progress', layerId: 'a', current: 50, total: 100 });
    expect(snap.percent).toBe(25);

    // a full (fraction 1) + b half (fraction 0.5) over 2 layers = 75%.
    agg.apply({ kind: 'layer-progress', layerId: 'a', current: 100, total: 100 });
    snap = agg.apply({ kind: 'layer-progress', layerId: 'b', current: 50, total: 100 });
    expect(snap.percent).toBe(75);
    expect(snap.downloadedBytes).toBe(150);
  });

  it('does NOT read 100% when a tiny first layer completes ahead of larger layers (regression: frozen 100%) (VHS-REQ-654.2)', () => {
    const agg = new DockerPullProgressAggregator();
    // All four layers are enumerated up front (Docker emits "Pulling fs layer"
    // for every layer before any of them download).
    for (const id of ['w', 'x', 'y', 'z']) {
      agg.apply({ kind: 'layer-seen', layerId: id });
    }
    // The tiny 1.3 KB manifest-ish layer downloads and completes first.
    agg.apply({ kind: 'layer-progress', layerId: 'w', current: 1300, total: 1300 });
    const snap = agg.apply({ kind: 'layer-complete', layerId: 'w' });

    // One of four layers done -> 25%, never the old frozen 100%.
    expect(snap.percent).toBe(25);
    expect(snap.completedLayers).toBe(1);
    expect(snap.totalLayers).toBe(4);
    expect(snap.downloadedBytes).toBe(1300);
  });

  it('counts an Already exists layer as a completed slice with no downloaded bytes', () => {
    const agg = new DockerPullProgressAggregator();
    agg.apply({ kind: 'layer-seen', layerId: 'a' });
    agg.apply({ kind: 'layer-seen', layerId: 'b' });
    agg.apply({ kind: 'layer-progress', layerId: 'a', current: 50, total: 100 });
    // b was cached -> layer-cached with no byte total.
    const snap = agg.apply({ kind: 'layer-cached', layerId: 'b' });

    // a half (0.5) + b complete (1) over 2 layers = 75%.
    expect(snap.percent).toBe(75);
    expect(snap.completedLayers).toBe(1);
    expect(snap.downloadedBytes).toBe(50);
    expect(snap.totalBytes).toBe(100);
  });

  it('never decreases the reported percentage (VHS-REQ-654.2)', () => {
    const agg = new DockerPullProgressAggregator();
    agg.apply({ kind: 'layer-progress', layerId: 'a', current: 80, total: 100 });
    expect(agg.snapshot().percent).toBe(80);
    // Docker can re-report a slightly lower current mid-stream; percent holds.
    const snap = agg.apply({ kind: 'layer-progress', layerId: 'a', current: 70, total: 100 });
    expect(snap.percent).toBe(80);
  });

  it('caps in-progress percent at 99 so a premature 100% is impossible (VHS-REQ-654.2)', () => {
    const agg = new DockerPullProgressAggregator();
    agg.apply({ kind: 'layer-progress', layerId: 'a', current: 100, total: 100 });
    expect(agg.snapshot().percent).toBe(99);
    const snap = agg.apply({ kind: 'layer-complete', layerId: 'a' });
    expect(snap.percent).toBe(99);
    expect(snap.completedLayers).toBe(1);
    expect(snap.totalLayers).toBe(1);
  });
});

describe('DockerPullProgressAggregator byte-% mode (VHS-REQ-655)', () => {
  it('divides downloaded bytes by the stable known total, not the live layer total (VHS-REQ-655.2)', () => {
    const agg = new DockerPullProgressAggregator({ knownTotalBytes: 1000 });
    agg.apply({ kind: 'layer-seen', layerId: 'a' });
    let snap = agg.apply({ kind: 'layer-progress', layerId: 'a', current: 250, total: 800 });
    // 250 / 1000 = 25% against the STABLE total (the live 800 is ignored).
    expect(snap.knownTotalBytes).toBe(1000);
    expect(snap.percent).toBe(25);
    snap = agg.apply({ kind: 'layer-progress', layerId: 'a', current: 500, total: 800 });
    expect(snap.percent).toBe(50);
  });

  it('does NOT spike to 100% when a tiny first layer completes (the stable total holds it down) (VHS-REQ-655.2)', () => {
    const agg = new DockerPullProgressAggregator({
      knownTotalBytes: 1_000_000,
      layerSizesByShortId: new Map([['w', 1300]])
    });
    agg.apply({ kind: 'layer-seen', layerId: 'w' });
    agg.apply({ kind: 'layer-progress', layerId: 'w', current: 1300, total: 1300 });
    const snap = agg.apply({ kind: 'layer-complete', layerId: 'w' });
    // 1300 / 1,000,000 = ~0.13%, never the false 100% the live-total math produced.
    expect(snap.percent).toBeCloseTo(0.13, 1);
    expect(snap.knownTotalBytes).toBe(1_000_000);
  });

  it('credits a cached (Already exists) layer via the registry size map so it reaches the total (VHS-REQ-655.2)', () => {
    const agg = new DockerPullProgressAggregator({
      knownTotalBytes: 1000,
      layerSizesByShortId: new Map([
        ['a', 400],
        ['b', 600]
      ])
    });
    agg.apply({ kind: 'layer-seen', layerId: 'a' });
    agg.apply({ kind: 'layer-seen', layerId: 'b' });
    agg.apply({ kind: 'layer-progress', layerId: 'a', current: 400, total: 400 });
    agg.apply({ kind: 'layer-complete', layerId: 'a' });
    // b was cached: no live bytes, credited 600 from the registry map.
    const snap = agg.apply({ kind: 'layer-cached', layerId: 'b' });
    expect(snap.downloadedBytes).toBe(1000);
    // 1000 / 1000 -> raw 100, capped at 99 (100% is the caller's "ready").
    expect(snap.percent).toBe(99);
  });
});

describe('DockerPullProgressAggregator pull-phase signaling (VHS-REQ-656)', () => {
  it('reports preparing then downloading then extracting then complete (VHS-REQ-656.1)', () => {
    const agg = new DockerPullProgressAggregator();
    expect(agg.snapshot().phase).toBe('preparing');

    agg.apply({ kind: 'layer-seen', layerId: 'a' });
    agg.apply({ kind: 'layer-seen', layerId: 'b' });
    // Layers enumerated but nothing downloaded yet -> still preparing.
    expect(agg.snapshot().phase).toBe('preparing');

    expect(agg.apply({ kind: 'layer-progress', layerId: 'a', current: 10, total: 100 }).phase).toBe('downloading');

    // Both layers finish DOWNLOADING (bytes in) but not yet unpacked -> extracting.
    agg.apply({ kind: 'layer-download-complete', layerId: 'a' });
    const downloaded = agg.apply({ kind: 'layer-download-complete', layerId: 'b' });
    expect(downloaded.phase).toBe('extracting');

    // Both layers unpack to Pull complete -> complete.
    agg.apply({ kind: 'layer-complete', layerId: 'a' });
    expect(agg.apply({ kind: 'layer-complete', layerId: 'b' }).phase).toBe('complete');
  });

  it('keeps advancing extract progress after the download finishes (no frozen 99%) (VHS-REQ-656.3)', () => {
    const agg = new DockerPullProgressAggregator();
    agg.apply({ kind: 'layer-seen', layerId: 'a' });
    agg.apply({ kind: 'layer-seen', layerId: 'b' });
    // Download both layers fully.
    agg.apply({ kind: 'layer-progress', layerId: 'a', current: 100, total: 100 });
    agg.apply({ kind: 'layer-progress', layerId: 'b', current: 100, total: 100 });
    agg.apply({ kind: 'layer-download-complete', layerId: 'a' });
    const atExtractStart = agg.apply({ kind: 'layer-download-complete', layerId: 'b' });
    expect(atExtractStart.phase).toBe('extracting');
    expect(atExtractStart.extractPercent).toBe(0);
    const overallAtExtractStart = atExtractStart.overallPercent ?? 0;

    // One layer unpacks halfway: extract climbs and the overall bar advances past
    // where it sat when the download finished.
    const mid = agg.apply({ kind: 'layer-extract-progress', layerId: 'a', current: 50, total: 100 });
    expect(mid.extractPercent).toBe(25); // a half (0.5) over 2 layers
    expect(mid.overallPercent).toBeGreaterThan(overallAtExtractStart);

    // First layer finishes extracting.
    const oneDone = agg.apply({ kind: 'layer-complete', layerId: 'a' });
    expect(oneDone.extractPercent).toBe(50); // 1 of 2 layers unpacked
    expect(oneDone.completedLayers).toBe(1);
    expect(oneDone.phase).toBe('extracting');
  });

  it('advances extraction on Pull complete steps even without Extracting byte detail (VHS-REQ-656.4)', () => {
    const agg = new DockerPullProgressAggregator();
    for (const id of ['a', 'b', 'c', 'd']) {
      agg.apply({ kind: 'layer-seen', layerId: id });
      agg.apply({ kind: 'layer-download-complete', layerId: id });
    }
    // All downloaded, none unpacked -> extracting at 0%.
    expect(agg.snapshot().phase).toBe('extracting');
    expect(agg.snapshot().extractPercent).toBe(0);
    // Layers reach Pull complete one by one with no Extracting progressDetail.
    expect(agg.apply({ kind: 'layer-complete', layerId: 'a' }).extractPercent).toBe(25);
    expect(agg.apply({ kind: 'layer-complete', layerId: 'b' }).extractPercent).toBe(50);
  });
});

describe('formatBytes', () => {
  it('formats byte magnitudes with one decimal above KB', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(Math.round(8.1 * GB))).toBe('8.1 GB');
  });
});

describe('formatPullProgressMessage', () => {
  it('renders a layer-weighted percentage with layer count and downloaded bytes (VHS-REQ-654.1)', () => {
    const message = formatPullProgressMessage('nationalinstruments/labview:2026q1-windows', {
      phase: 'downloading',
      percent: 31,
      downloadedBytes: Math.round(1.4 * GB),
      totalBytes: Math.round(2 * GB),
      completedLayers: 4,
      totalLayers: 13
    });
    expect(message).toBe(
      'Pulling container image: nationalinstruments/labview:2026q1-windows — 31% (4/13 layers, 1.4 GB)'
    );
  });

  it('renders a true byte-% (downloaded / known total) when the stable total is known (VHS-REQ-655.2)', () => {
    const message = formatPullProgressMessage('nationalinstruments/labview:2026q1-windows', {
      phase: 'downloading',
      percent: 42,
      downloadedBytes: Math.round(8.1 * GB),
      totalBytes: Math.round(8.1 * GB),
      knownTotalBytes: Math.round(19.3 * GB),
      completedLayers: 3,
      totalLayers: 13
    });
    expect(message).toBe(
      'Pulling container image: nationalinstruments/labview:2026q1-windows — 42% (8.1 GB / 19.3 GB)'
    );
  });

  it('names the extracting phase with its own percent and layer count (VHS-REQ-656.2)', () => {
    const message = formatPullProgressMessage('nationalinstruments/labview:2026q1-windows', {
      phase: 'extracting',
      percent: 99,
      extractPercent: 60,
      downloadedBytes: Math.round(19.3 * GB),
      totalBytes: Math.round(19.3 * GB),
      completedLayers: 8,
      totalLayers: 13
    });
    expect(message).toBe(
      'Extracting container image: nationalinstruments/labview:2026q1-windows — 60% (8/13 layers)'
    );
  });

  it('shows a finalizing message once every layer is pulled (VHS-REQ-656.2)', () => {
    const message = formatPullProgressMessage('nationalinstruments/labview:2026q1-windows', {
      phase: 'complete',
      percent: 99,
      extractPercent: 99,
      downloadedBytes: Math.round(19.3 * GB),
      totalBytes: Math.round(19.3 * GB),
      completedLayers: 13,
      totalLayers: 13
    });
    expect(message).toBe('Finalizing container image: nationalinstruments/labview:2026q1-windows');
  });

  it('falls back to a plain message before any progress is known', () => {
    expect(
      formatPullProgressMessage('img:tag', {
        phase: 'preparing',
        percent: undefined,
        downloadedBytes: 0,
        totalBytes: 0,
        completedLayers: 0,
        totalLayers: 0
      })
    ).toBe('Pulling container image: img:tag');
  });
});

describe('streamDockerImagePull', () => {
  function fakeStream(lines: string[], statusCode = 200): DockerPullStreamRequest {
    return vi.fn(async (_params, handlers) => {
      for (const line of lines) {
        handlers.onLine(line);
      }
      return { statusCode };
    });
  }

  it('requests the pinned api version /images/create path anonymously for the split LabVIEW reference (VHS-REQ-654.1, VHS-REQ-654.5)', async () => {
    const requestStream = vi.fn(async (_params: unknown, _handlers: unknown) => ({ statusCode: 200 }));
    await streamDockerImagePull({
      image: 'nationalinstruments/labview:2026q1-windows',
      hostPlatform: 'linux',
      requestStream: requestStream as never,
      resolveDownloadSize: async () => undefined
    });
    const call = requestStream.mock.calls[0]?.[0] as {
      socketPath: string;
      path: string;
      method: string;
      headers: Record<string, string>;
    };
    expect(call.socketPath).toBe('/var/run/docker.sock');
    expect(call.method).toBe('POST');
    expect(call.path).toBe(
      `/${DOCKER_ENGINE_API_VERSION}/images/create?fromImage=nationalinstruments%2Flabview&tag=2026q1-windows`
    );
    expect(Object.keys(call.headers)).toEqual(['Content-Type']);
    expect(JSON.stringify(call.headers)).not.toMatch(/authorization|credential|password|token/i);
  });

  it('reports live layer-weighted snapshots and resolves succeeded (VHS-REQ-654.1, VHS-REQ-656.5)', async () => {
    const progress: Array<{
      percent?: number;
      downloadedBytes: number;
      completedLayers: number;
      totalLayers: number;
    }> = [];
    const result = await streamDockerImagePull({
      image: 'repo/img:tag',
      hostPlatform: 'linux',
      requestStream: fakeStream([
        JSON.stringify({ status: 'Pulling from repo/img', id: 'tag' }),
        JSON.stringify({ status: 'Pulling fs layer', id: 'a' }),
        JSON.stringify({ status: 'Pulling fs layer', id: 'b' }),
        JSON.stringify({ status: 'Downloading', id: 'a', progressDetail: { current: 50, total: 100 } }),
        JSON.stringify({ status: 'Downloading', id: 'a', progressDetail: { current: 100, total: 100 } }),
        JSON.stringify({ status: 'Pull complete', id: 'a' }),
        JSON.stringify({ status: 'Already exists', id: 'b' }),
        JSON.stringify({ status: 'Status: Downloaded newer image for repo/img:tag' })
      ]),
      resolveDownloadSize: async () => undefined,
      onProgress: (snapshot) => {
        progress.push(snapshot);
      }
    });

    expect(result).toMatchObject({ attempted: true, succeeded: true });
    // The opening "Pulling from" line must not be enumerated as a layer.
    expect(progress.at(-1)?.totalLayers).toBe(2);
    expect(progress.at(-1)?.completedLayers).toBe(2);
    // Both layers done -> raw 100, capped at 99 (100% is the caller's "ready").
    expect(progress.at(-1)?.percent).toBe(99);
  });

  it('marks the stream failed on an in-band error line (VHS-REQ-654.4)', async () => {
    const result = await streamDockerImagePull({
      image: 'repo/img:tag',
      hostPlatform: 'linux',
      requestStream: fakeStream([
        JSON.stringify({ errorDetail: { message: 'manifest unknown' }, error: 'manifest unknown' })
      ]),
      resolveDownloadSize: async () => undefined
    });
    expect(result).toMatchObject({ attempted: true, succeeded: false, errorMessage: 'manifest unknown' });
  });

  it('marks the stream failed on a non-2xx daemon response (VHS-REQ-654.4)', async () => {
    const result = await streamDockerImagePull({
      image: 'repo/img:tag',
      hostPlatform: 'linux',
      requestStream: fakeStream([], 500),
      resolveDownloadSize: async () => undefined
    });
    expect(result).toMatchObject({ attempted: true, succeeded: false });
    expect(result.errorMessage).toContain('HTTP 500');
  });

  it('returns attempted=false (for CLI fallback) when the daemon socket is unreachable (VHS-REQ-654.4, VHS-REQ-656.5)', async () => {
    const result = await streamDockerImagePull({
      image: 'repo/img:tag',
      hostPlatform: 'linux',
      requestStream: vi.fn(async () => {
        throw Object.assign(new Error('connect ENOENT'), { code: 'ENOENT' });
      }) as never,
      resolveDownloadSize: async () => undefined
    });
    expect(result).toEqual({ attempted: false, succeeded: false, statusLines: [] });
  });

  it('reports a true byte-% when the registry total resolves (VHS-REQ-655.2, VHS-REQ-656.5)', async () => {
    const GiB = 1024 * 1024 * 1024;
    const snapshots: Array<{ percent?: number; knownTotalBytes?: number; downloadedBytes: number }> = [];
    const result = await streamDockerImagePull({
      image: 'nationalinstruments/labview:2026q1-windows',
      hostPlatform: 'win32',
      resolveDownloadSize: async () => ({
        totalBytes: 2 * GiB,
        layerSizesByShortId: new Map([['a', 2 * GiB]])
      }),
      requestStream: fakeStream([
        JSON.stringify({ status: 'Pulling fs layer', id: 'a' }),
        JSON.stringify({ status: 'Downloading', id: 'a', progressDetail: { current: GiB, total: 2 * GiB } }),
        JSON.stringify({ status: 'Downloading', id: 'a', progressDetail: { current: 2 * GiB, total: 2 * GiB } }),
        JSON.stringify({ status: 'Pull complete', id: 'a' })
      ]),
      onProgress: (snapshot) => {
        snapshots.push(snapshot);
      }
    });
    expect(result.succeeded).toBe(true);
    expect(snapshots.at(-1)?.knownTotalBytes).toBe(2 * GiB);
    // The halfway snapshot is a real byte-% against the stable total.
    expect(snapshots.some((s) => s.percent === 50)).toBe(true);
  });

  it('signals the extraction phase after the download completes (VHS-REQ-656.2, VHS-REQ-656.3)', async () => {
    const messages: string[] = [];
    const image = 'nationalinstruments/labview:2026q1-windows';
    const result = await streamDockerImagePull({
      image,
      hostPlatform: 'win32',
      resolveDownloadSize: async () => undefined,
      requestStream: fakeStream([
        JSON.stringify({ status: 'Pulling from nationalinstruments/labview', id: '2026q1-windows' }),
        JSON.stringify({ status: 'Pulling fs layer', id: 'a' }),
        JSON.stringify({ status: 'Pulling fs layer', id: 'b' }),
        // Download both layers fully.
        JSON.stringify({ status: 'Downloading', id: 'a', progressDetail: { current: 100, total: 100 } }),
        JSON.stringify({ status: 'Downloading', id: 'b', progressDetail: { current: 100, total: 100 } }),
        JSON.stringify({ status: 'Download complete', id: 'a' }),
        JSON.stringify({ status: 'Download complete', id: 'b' }),
        // Then the long unpack phase.
        JSON.stringify({ status: 'Extracting', id: 'a', progressDetail: { current: 50, total: 100 } }),
        JSON.stringify({ status: 'Pull complete', id: 'a' }),
        JSON.stringify({ status: 'Extracting', id: 'b', progressDetail: { current: 50, total: 100 } }),
        JSON.stringify({ status: 'Pull complete', id: 'b' }),
        JSON.stringify({ status: 'Status: Downloaded newer image for nationalinstruments/labview:2026q1-windows' })
      ]),
      onProgress: (snapshot) => {
        messages.push(formatPullProgressMessage(image, snapshot));
      }
    });

    expect(result.succeeded).toBe(true);
    // The download phase was signalled...
    expect(messages.some((m) => m.startsWith('Pulling container image:'))).toBe(true);
    // ...then the extraction phase took over with its own climbing percent...
    expect(messages.some((m) => /^Extracting container image: .* — \d+% \(\d+\/2 layers\)$/.test(m))).toBe(true);
    // ...and the toast finalized instead of freezing at 99%.
    expect(messages.at(-1)).toBe(`Finalizing container image: ${image}`);
  });
});

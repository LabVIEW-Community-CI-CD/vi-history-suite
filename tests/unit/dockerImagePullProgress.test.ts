/**
 * VHS-REQ-654: unit tests for the Docker Engine API pull-progress module.
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
  it('uses the named pipe on Windows and the unix socket on Linux', () => {
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
  it('parses a Downloading line into a layer-progress event', () => {
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

  it('treats Download complete, Pull complete, and Already exists as layer-complete', () => {
    expect(parseDockerPullProgressLine(JSON.stringify({ status: 'Download complete', id: 'abc' }))).toEqual({
      kind: 'layer-complete',
      layerId: 'abc'
    });
    expect(parseDockerPullProgressLine(JSON.stringify({ status: 'Pull complete', id: 'abc' }))).toEqual({
      kind: 'layer-complete',
      layerId: 'abc'
    });
    expect(parseDockerPullProgressLine(JSON.stringify({ status: 'Already exists', id: 'abc' }))).toEqual({
      kind: 'layer-complete',
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

  it('surfaces an in-band pull error', () => {
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
  it('weights each enumerated layer equally, smoothed by the in-flight byte fraction', () => {
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

  it('does NOT read 100% when a tiny first layer completes ahead of larger layers (regression: frozen 100%)', () => {
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
    // b was cached -> layer-complete with no byte total.
    const snap = agg.apply({ kind: 'layer-complete', layerId: 'b' });

    // a half (0.5) + b complete (1) over 2 layers = 75%.
    expect(snap.percent).toBe(75);
    expect(snap.completedLayers).toBe(1);
    expect(snap.downloadedBytes).toBe(50);
    expect(snap.totalBytes).toBe(100);
  });

  it('never decreases the reported percentage', () => {
    const agg = new DockerPullProgressAggregator();
    agg.apply({ kind: 'layer-progress', layerId: 'a', current: 80, total: 100 });
    expect(agg.snapshot().percent).toBe(80);
    // Docker can re-report a slightly lower current mid-stream; percent holds.
    const snap = agg.apply({ kind: 'layer-progress', layerId: 'a', current: 70, total: 100 });
    expect(snap.percent).toBe(80);
  });

  it('caps in-progress percent at 99 so a premature 100% is impossible', () => {
    const agg = new DockerPullProgressAggregator();
    agg.apply({ kind: 'layer-progress', layerId: 'a', current: 100, total: 100 });
    expect(agg.snapshot().percent).toBe(99);
    const snap = agg.apply({ kind: 'layer-complete', layerId: 'a' });
    expect(snap.percent).toBe(99);
    expect(snap.completedLayers).toBe(1);
    expect(snap.totalLayers).toBe(1);
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
  it('renders a layer-weighted percentage with layer count and downloaded bytes', () => {
    const message = formatPullProgressMessage('nationalinstruments/labview:2026q1-windows', {
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

  it('falls back to a plain message before any progress is known', () => {
    expect(
      formatPullProgressMessage('img:tag', {
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

  it('requests the pinned api version /images/create path for the split reference', async () => {
    const requestStream = vi.fn(async (_params: unknown, _handlers: unknown) => ({ statusCode: 200 }));
    await streamDockerImagePull({
      image: 'nationalinstruments/labview:2026q1-windows',
      hostPlatform: 'linux',
      requestStream: requestStream as never
    });
    const call = requestStream.mock.calls[0]?.[0] as { socketPath: string; path: string };
    expect(call.socketPath).toBe('/var/run/docker.sock');
    expect(call.path).toBe(
      `/${DOCKER_ENGINE_API_VERSION}/images/create?fromImage=nationalinstruments%2Flabview&tag=2026q1-windows`
    );
  });

  it('reports live layer-weighted snapshots and resolves succeeded', async () => {
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

  it('marks the stream failed on an in-band error line', async () => {
    const result = await streamDockerImagePull({
      image: 'repo/img:tag',
      hostPlatform: 'linux',
      requestStream: fakeStream([
        JSON.stringify({ errorDetail: { message: 'manifest unknown' }, error: 'manifest unknown' })
      ])
    });
    expect(result).toMatchObject({ attempted: true, succeeded: false, errorMessage: 'manifest unknown' });
  });

  it('marks the stream failed on a non-2xx daemon response', async () => {
    const result = await streamDockerImagePull({
      image: 'repo/img:tag',
      hostPlatform: 'linux',
      requestStream: fakeStream([], 500)
    });
    expect(result).toMatchObject({ attempted: true, succeeded: false });
    expect(result.errorMessage).toContain('HTTP 500');
  });

  it('returns attempted=false (for CLI fallback) when the daemon socket is unreachable', async () => {
    const result = await streamDockerImagePull({
      image: 'repo/img:tag',
      hostPlatform: 'linux',
      requestStream: vi.fn(async () => {
        throw Object.assign(new Error('connect ENOENT'), { code: 'ENOENT' });
      }) as never
    });
    expect(result).toEqual({ attempted: false, succeeded: false, statusLines: [] });
  });
});

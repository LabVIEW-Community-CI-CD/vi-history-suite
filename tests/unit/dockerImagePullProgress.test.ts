/**
 * VHS-REQ-654: unit tests for the Docker Engine API pull-progress module.
 *
 * The parser and aggregator are pure; the stream is exercised through an
 * injected request boundary so the live byte-percentage math is validated on
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

  it('ignores Downloading with a zero or missing total', () => {
    expect(
      parseDockerPullProgressLine(
        JSON.stringify({ status: 'Downloading', id: 'abc', progressDetail: { current: 5, total: 0 } })
      )
    ).toEqual({ kind: 'status', status: 'Downloading' });
    expect(
      parseDockerPullProgressLine(JSON.stringify({ status: 'Downloading', id: 'abc', progressDetail: {} }))
    ).toEqual({ kind: 'status', status: 'Downloading' });
  });

  it('treats Download complete and Pull complete as layer-complete', () => {
    expect(parseDockerPullProgressLine(JSON.stringify({ status: 'Download complete', id: 'abc' }))).toEqual({
      kind: 'layer-complete',
      layerId: 'abc'
    });
    expect(parseDockerPullProgressLine(JSON.stringify({ status: 'Pull complete', id: 'abc' }))).toEqual({
      kind: 'layer-complete',
      layerId: 'abc'
    });
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

  it('returns a status event for non-progress status lines', () => {
    expect(parseDockerPullProgressLine(JSON.stringify({ status: 'Pulling fs layer', id: 'abc' }))).toEqual({
      kind: 'status',
      status: 'Pulling fs layer'
    });
  });
});

describe('DockerPullProgressAggregator', () => {
  it('sums per-layer download bytes into an overall percentage', () => {
    const agg = new DockerPullProgressAggregator();
    expect(agg.snapshot().percent).toBeUndefined();

    let snap = agg.apply({ kind: 'layer-progress', layerId: 'a', current: 0, total: 100 });
    snap = agg.apply({ kind: 'layer-progress', layerId: 'b', current: 0, total: 300 });
    // 0 / 400 = 0%
    expect(snap.percent).toBe(0);
    expect(snap.totalBytes).toBe(400);

    snap = agg.apply({ kind: 'layer-progress', layerId: 'a', current: 50, total: 100 });
    snap = agg.apply({ kind: 'layer-progress', layerId: 'b', current: 150, total: 300 });
    // 200 / 400 = 50%
    expect(snap.percent).toBe(50);
    expect(snap.downloadedBytes).toBe(200);
  });

  it('pins a completed layer to its total', () => {
    const agg = new DockerPullProgressAggregator();
    agg.apply({ kind: 'layer-progress', layerId: 'a', current: 10, total: 100 });
    const snap = agg.apply({ kind: 'layer-complete', layerId: 'a' });
    expect(snap.percent).toBe(100);
    expect(snap.downloadedBytes).toBe(100);
  });

  it('never decreases the reported percentage', () => {
    const agg = new DockerPullProgressAggregator();
    agg.apply({ kind: 'layer-progress', layerId: 'a', current: 80, total: 100 });
    expect(agg.snapshot().percent).toBe(80);
    // Docker can re-report a slightly lower current mid-stream; percent holds.
    const snap = agg.apply({ kind: 'layer-progress', layerId: 'a', current: 70, total: 100 });
    expect(snap.percent).toBe(80);
  });

  it('clamps to 100', () => {
    const agg = new DockerPullProgressAggregator();
    agg.apply({ kind: 'layer-progress', layerId: 'a', current: 100, total: 100 });
    expect(agg.snapshot().percent).toBe(100);
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
  it('renders a percentage with downloaded/total once known', () => {
    const message = formatPullProgressMessage('nationalinstruments/labview:2026q1-windows', {
      percent: 42,
      downloadedBytes: Math.round(8.1 * GB),
      totalBytes: Math.round(19.3 * GB)
    });
    expect(message).toBe('Pulling container image: nationalinstruments/labview:2026q1-windows — 42% (8.1 GB / 19.3 GB)');
  });

  it('falls back to a plain message before any total is known', () => {
    expect(
      formatPullProgressMessage('img:tag', { percent: undefined, downloadedBytes: 0, totalBytes: 0 })
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

  it('reports live byte-percentage snapshots and resolves succeeded', async () => {
    const progress: Array<{ percent?: number; downloadedBytes: number; totalBytes: number }> = [];
    const result = await streamDockerImagePull({
      image: 'repo/img:tag',
      hostPlatform: 'linux',
      requestStream: fakeStream([
        JSON.stringify({ status: 'Pulling from repo/img', id: 'tag' }),
        JSON.stringify({ status: 'Downloading', id: 'a', progressDetail: { current: 0, total: 100 } }),
        JSON.stringify({ status: 'Downloading', id: 'a', progressDetail: { current: 100, total: 100 } }),
        JSON.stringify({ status: 'Pull complete', id: 'a' }),
        JSON.stringify({ status: 'Status: Downloaded newer image for repo/img:tag' })
      ]),
      onProgress: (snapshot) => {
        progress.push(snapshot);
      }
    });

    expect(result).toMatchObject({ attempted: true, succeeded: true });
    expect(progress.at(-1)?.percent).toBe(100);
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

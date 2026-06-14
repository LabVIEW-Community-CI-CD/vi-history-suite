/**
 * VHS-REQ-654: Live container image pull progress via the Docker Engine API.
 *
 * A plain `docker pull` over a non-TTY pipe emits no byte counts — only discrete
 * per-layer status transitions — so a pull of the multi-GB Windows LabVIEW image
 * can only be reported as opaque status text with a faked progress increment.
 *
 * The Docker Engine API `POST /images/create` performs the pull and streams
 * newline-delimited JSON objects carrying per-layer `progressDetail.current/total`
 * byte counts (the same data Docker Desktop renders its progress bar from). This
 * module parses that stream and aggregates it into a single progress figure.
 *
 * Progress is **layer-weighted**, not byte-weighted: Docker reveals layers (and
 * their sizes) progressively, so the running sum of known layer totals is a tiny,
 * unstable denominator early in the pull — a single small layer that completes
 * first would otherwise read 100% while the multi-GB layers are still streaming.
 * Instead each enumerated layer contributes an equal slice of the total, smoothed
 * by the in-flight layer's byte fraction, so the percentage climbs steadily and
 * only approaches 100% as the real layers complete. Absolute downloaded bytes and
 * a completed/total layer count are reported alongside for byte-level truth.
 *
 * Everything here is platform-pure except the optional default stream
 * implementation: the parser and aggregator perform no I/O, and the daemon-socket
 * request is behind an injectable boundary so the feature stays unit-testable on
 * Linux without a real Docker daemon.
 */

import * as http from 'node:http';

/** Default Engine API version to pin in the request path. Conservative floor. */
export const DOCKER_ENGINE_API_VERSION = 'v1.45';

/** Resolve the local Docker daemon socket path for the host platform. */
export function resolveDockerEngineSocketPath(hostPlatform: NodeJS.Platform): string {
  return hostPlatform === 'win32' ? '\\\\.\\pipe\\docker_engine' : '/var/run/docker.sock';
}

/**
 * Split a full image reference (`<repo>:<tag>`) into the `fromImage`/`tag` pair
 * the Engine API expects. A reference with no tag defaults to `latest`. The
 * repository may itself contain a `/` (namespace) but never a `:` except the tag
 * separator, so split on the final colon.
 */
export function splitImageReference(reference: string): { fromImage: string; tag: string } {
  const trimmed = reference.trim();
  const lastColon = trimmed.lastIndexOf(':');
  // A colon that is part of a registry host:port would precede a `/`; our
  // references are namespace/repo:tag with no registry host, so a colon after the
  // last `/` is the tag separator.
  const lastSlash = trimmed.lastIndexOf('/');
  if (lastColon > lastSlash && lastColon !== -1) {
    return { fromImage: trimmed.slice(0, lastColon), tag: trimmed.slice(lastColon + 1) };
  }
  return { fromImage: trimmed, tag: 'latest' };
}

/** One parsed event from a `/images/create` JSON-stream line. */
export type DockerPullStreamEvent =
  | { readonly kind: 'layer-progress'; readonly layerId: string; readonly current: number; readonly total: number }
  | { readonly kind: 'layer-seen'; readonly layerId: string }
  | { readonly kind: 'layer-complete'; readonly layerId: string }
  | { readonly kind: 'status'; readonly status: string }
  | { readonly kind: 'error'; readonly message: string };

interface RawPullLine {
  status?: unknown;
  id?: unknown;
  progressDetail?: { current?: unknown; total?: unknown } | null;
  error?: unknown;
  errorDetail?: { message?: unknown } | null;
}

function isFiniteNonNegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

/**
 * Parse a single newline-delimited JSON line from the `/images/create` stream
 * into a structured event, or `undefined` when the line is blank, malformed, or
 * carries no information we act on. Pure.
 */
export function parseDockerPullProgressLine(rawLine: string): DockerPullStreamEvent | undefined {
  const line = rawLine.trim();
  if (line.length === 0) {
    return undefined;
  }

  let parsed: RawPullLine;
  try {
    parsed = JSON.parse(line) as RawPullLine;
  } catch {
    return undefined;
  }

  // Pull errors are reported in-band (HTTP 200 with an error object).
  const errorMessage =
    (parsed.errorDetail && typeof parsed.errorDetail.message === 'string'
      ? parsed.errorDetail.message
      : undefined) ?? (typeof parsed.error === 'string' ? parsed.error : undefined);
  if (errorMessage) {
    return { kind: 'error', message: errorMessage };
  }

  const status = typeof parsed.status === 'string' ? parsed.status : undefined;
  const layerId = typeof parsed.id === 'string' ? parsed.id : undefined;

  // The download phase ("Downloading") carries per-layer byte counts. Extracting
  // also carries current/total but is the post-download unpack phase; the
  // multi-minute network cost the user cares about is the download, so only
  // download events drive the byte fraction.
  if (status === 'Downloading' && layerId && parsed.progressDetail) {
    const current = parsed.progressDetail.current;
    const total = parsed.progressDetail.total;
    if (isFiniteNonNegative(current) && isFiniteNonNegative(total) && total > 0) {
      return { kind: 'layer-progress', layerId, current, total };
    }
  }

  // A layer finishing — `Download complete`/`Pull complete` for a layer that
  // streamed bytes, or `Already exists` for a cached layer that never downloads.
  // All three mean "this layer is done" and count as a completed slice; the
  // cached case contributes no downloaded bytes, which is correct.
  if (
    layerId &&
    (status === 'Download complete' || status === 'Pull complete' || status === 'Already exists')
  ) {
    return { kind: 'layer-complete', layerId };
  }

  // The stream's opening line is `{status:"Pulling from <repo>", id:"<tag>"}` —
  // its `id` is the image tag, not a layer, so it must not be enumerated as one
  // (a phantom layer would permanently inflate the denominator).
  if (status && status.startsWith('Pulling from')) {
    return { kind: 'status', status };
  }

  // Any other id-bearing line ("Pulling fs layer", "Waiting", "Verifying
  // Checksum", "Extracting", "Retrying"...) enumerates the layer so it is counted
  // in the denominator early — before it has reported a byte total — which keeps
  // the layer-weighted percentage from spiking when the first small layer lands.
  if (layerId) {
    return { kind: 'layer-seen', layerId };
  }

  if (status) {
    return { kind: 'status', status };
  }

  return undefined;
}

/** A computed snapshot of overall pull progress. */
export interface DockerPullProgressSnapshot {
  /**
   * Layer-weighted, monotonic overall download progress in [0,99]; `undefined`
   * until at least one layer has reported bytes or completed. Capped below 100 so
   * a premature/false 100% is impossible — overall completion is signalled by the
   * caller's "ready" message, not by this figure.
   */
  readonly percent?: number;
  /** Sum of downloaded bytes across all layers. Monotonic. */
  readonly downloadedBytes: number;
  /**
   * Sum of total bytes across layers that have reported a total. A lower bound on
   * the image size (un-started layers are excluded), kept for diagnostics — not a
   * trustworthy denominator and intentionally not shown in the toast.
   */
  readonly totalBytes: number;
  /** Layers that have finished (downloaded or already cached). */
  readonly completedLayers: number;
  /** Layers enumerated so far. */
  readonly totalLayers: number;
}

/**
 * Stateful accumulator that turns a sequence of {@link DockerPullStreamEvent}s
 * into a layer-weighted overall download percentage.
 *
 * Each enumerated layer contributes an equal `1 / totalLayers` slice; an
 * in-flight layer contributes its byte fraction (`current / total`) of that
 * slice, and a completed layer contributes the whole slice. Because Docker
 * enumerates every layer (via `Pulling fs layer`) before completing any of them,
 * the denominator is stable early, so the percentage climbs steadily instead of
 * spiking to 100% on the first small layer the way a byte-weighted sum does. The
 * result is monotonic and capped at 99 (100% is reserved for the explicit "ready"
 * signal).
 */
export class DockerPullProgressAggregator {
  private readonly layers = new Map<string, { current: number; total: number; complete: boolean }>();
  private lastPercent = 0;

  private ensureLayer(layerId: string): { current: number; total: number; complete: boolean } {
    let layer = this.layers.get(layerId);
    if (!layer) {
      layer = { current: 0, total: 0, complete: false };
      this.layers.set(layerId, layer);
    }
    return layer;
  }

  /** Apply one event and return the updated snapshot. */
  apply(event: DockerPullStreamEvent): DockerPullProgressSnapshot {
    if (event.kind === 'layer-seen') {
      this.ensureLayer(event.layerId);
    } else if (event.kind === 'layer-progress') {
      const layer = this.ensureLayer(event.layerId);
      layer.current = Math.max(layer.current, event.current);
      layer.total = Math.max(layer.total, event.total);
    } else if (event.kind === 'layer-complete') {
      const layer = this.ensureLayer(event.layerId);
      layer.complete = true;
      // A layer that streamed bytes pins to its known total; a cached
      // ("Already exists") layer has no total and contributes no bytes.
      if (layer.total > 0) {
        layer.current = layer.total;
      }
    }
    return this.snapshot();
  }

  /** Current aggregate snapshot. */
  snapshot(): DockerPullProgressSnapshot {
    let downloadedBytes = 0;
    let totalBytes = 0;
    let completedLayers = 0;
    let fractionSum = 0;
    for (const layer of this.layers.values()) {
      const current = layer.total > 0 ? Math.min(layer.current, layer.total) : layer.current;
      downloadedBytes += current;
      totalBytes += layer.total;
      if (layer.complete) {
        completedLayers += 1;
        fractionSum += 1;
      } else if (layer.total > 0) {
        fractionSum += Math.min(current / layer.total, 1);
      }
    }

    const totalLayers = this.layers.size;
    if (totalLayers === 0 || fractionSum <= 0) {
      return { percent: undefined, downloadedBytes, totalBytes, completedLayers, totalLayers };
    }

    const rawPercent = (fractionSum / totalLayers) * 100;
    const monotonic = Math.max(this.lastPercent, rawPercent);
    // Reserve 100 for the explicit completion signal so the toast can never show a
    // premature or frozen 100%.
    this.lastPercent = Math.min(99, monotonic);
    return { percent: this.lastPercent, downloadedBytes, totalBytes, completedLayers, totalLayers };
  }
}

/** Human-readable byte size, e.g. `8.1 GB`. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return '0 B';
  }
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const rounded = unitIndex === 0 ? Math.round(value) : Math.round(value * 10) / 10;
  return `${rounded} ${units[unitIndex]}`;
}

/**
 * Build the toast message for a progress snapshot, e.g.
 * `Pulling container image: <image> — 31% (4/13 layers, 1.4 GB)`. The percentage
 * is layer-weighted; the layer count and absolute downloaded bytes give the
 * byte-level truth alongside it. Before any progress is known, falls back to a
 * plain pulling message so the toast still reads sensibly during the brief
 * layer-enumeration phase.
 */
export function formatPullProgressMessage(
  image: string,
  snapshot: DockerPullProgressSnapshot
): string {
  if (snapshot.percent === undefined || snapshot.totalLayers <= 0) {
    return `Pulling container image: ${image}`;
  }
  const percent = Math.round(snapshot.percent);
  return `Pulling container image: ${image} — ${percent}% (${snapshot.completedLayers}/${snapshot.totalLayers} layers, ${formatBytes(
    snapshot.downloadedBytes
  )})`;
}

/** Injectable line-stream boundary for {@link streamDockerImagePull}. */
export interface DockerPullStreamRequest {
  (
    params: { socketPath: string; path: string },
    handlers: { onLine: (line: string) => void }
  ): Promise<{ statusCode: number }>;
}

export interface StreamDockerImagePullOptions {
  readonly image: string;
  readonly hostPlatform: NodeJS.Platform;
  readonly apiVersion?: string;
  readonly onProgress?: (snapshot: DockerPullProgressSnapshot, lastStatus?: string) => void | Promise<void>;
  /** Injectable request boundary; defaults to a daemon-socket HTTP stream. */
  readonly requestStream?: DockerPullStreamRequest;
}

export interface StreamDockerImagePullResult {
  /**
   * `false` when the daemon socket could not be reached at all (so the caller
   * should fall back to the CLI). `true` when the stream ran end to end —
   * inspect `succeeded` for the pull outcome.
   */
  readonly attempted: boolean;
  readonly succeeded: boolean;
  readonly statusLines: string[];
  readonly errorMessage?: string;
}

/**
 * Default daemon-socket stream: a single bounded `POST /images/create` over the
 * local Docker socket/npipe, splitting the response into JSON lines. Never
 * throws — connection failures resolve to a non-OK result so the caller can fall
 * back to the CLI.
 */
const defaultRequestStream: DockerPullStreamRequest = (params, handlers) =>
  new Promise((resolve, reject) => {
    let buffer = '';
    const request = http.request(
      {
        socketPath: params.socketPath,
        path: params.path,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      },
      (response) => {
        response.setEncoding('utf8');
        response.on('data', (chunk: string) => {
          buffer += chunk;
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';
          for (const line of lines) {
            handlers.onLine(line);
          }
        });
        response.on('end', () => {
          if (buffer.trim().length > 0) {
            handlers.onLine(buffer);
          }
          resolve({ statusCode: response.statusCode ?? 0 });
        });
        response.on('error', reject);
      }
    );
    request.on('error', reject);
    request.end();
  });

/**
 * Drive a container image pull through the Docker Engine API and report live
 * byte-percentage progress. Returns `attempted: false` (without throwing) when
 * the daemon socket is unreachable so the caller can fall back to the CLI.
 */
export async function streamDockerImagePull(
  options: StreamDockerImagePullOptions
): Promise<StreamDockerImagePullResult> {
  const requestStream = options.requestStream ?? defaultRequestStream;
  const apiVersion = options.apiVersion ?? DOCKER_ENGINE_API_VERSION;
  const socketPath = resolveDockerEngineSocketPath(options.hostPlatform);
  const { fromImage, tag } = splitImageReference(options.image);
  const path = `/${apiVersion}/images/create?fromImage=${encodeURIComponent(
    fromImage
  )}&tag=${encodeURIComponent(tag)}`;

  const aggregator = new DockerPullProgressAggregator();
  const statusLines: string[] = [];
  let lastStatus: string | undefined;
  let streamErrorMessage: string | undefined;

  const pendingProgress: Array<void | Promise<void>> = [];
  const onLine = (rawLine: string): void => {
    const event = parseDockerPullProgressLine(rawLine);
    if (!event) {
      return;
    }
    if (event.kind === 'error') {
      streamErrorMessage = event.message;
      statusLines.push(event.message);
      return;
    }
    if (event.kind === 'status') {
      lastStatus = event.status;
      statusLines.push(event.status);
      return;
    }
    const snapshot = aggregator.apply(event);
    if (options.onProgress) {
      pendingProgress.push(options.onProgress(snapshot, lastStatus));
    }
  };

  let statusCode: number;
  try {
    ({ statusCode } = await requestStream({ socketPath, path }, { onLine }));
  } catch {
    // Daemon socket unreachable (e.g. ENOENT npipe / ECONNREFUSED): not attempted
    // so the caller falls back to the CLI pull.
    return { attempted: false, succeeded: false, statusLines };
  }

  await Promise.all(pendingProgress);

  const httpOk = statusCode >= 200 && statusCode < 300;
  const succeeded = httpOk && streamErrorMessage === undefined;
  return {
    attempted: true,
    succeeded,
    statusLines,
    errorMessage: streamErrorMessage ?? (httpOk ? undefined : `daemon responded with HTTP ${statusCode}`)
  };
}

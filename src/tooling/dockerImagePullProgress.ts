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
 * module parses that stream and aggregates the per-layer download bytes into a
 * single monotonic, clamped 0–100% with downloaded/total byte figures.
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
  // download events drive the byte percentage.
  if (status === 'Downloading' && layerId && parsed.progressDetail) {
    const current = parsed.progressDetail.current;
    const total = parsed.progressDetail.total;
    if (isFiniteNonNegative(current) && isFiniteNonNegative(total) && total > 0) {
      return { kind: 'layer-progress', layerId, current, total };
    }
  }

  // A layer finishing its download — mark it fully accounted regardless of the
  // last byte sample we saw.
  if (layerId && (status === 'Download complete' || status === 'Pull complete')) {
    return { kind: 'layer-complete', layerId };
  }

  if (status) {
    return { kind: 'status', status };
  }

  return undefined;
}

/** A computed snapshot of overall pull progress. */
export interface DockerPullProgressSnapshot {
  /** Monotonic, clamped 0–100 overall download percentage; undefined until known. */
  readonly percent?: number;
  /** Sum of downloaded bytes across layers with a known total. */
  readonly downloadedBytes: number;
  /** Sum of total bytes across layers that have reported a total. */
  readonly totalBytes: number;
}

/**
 * Stateful accumulator that turns a sequence of {@link DockerPullStreamEvent}s
 * into a monotonic overall download percentage. Per-layer `{current,total}` are
 * summed; a completed layer is pinned to its known total. The percentage never
 * decreases (Docker can re-report a slightly lower `current` mid-stream) and is
 * clamped to [0,100].
 */
export class DockerPullProgressAggregator {
  private readonly layers = new Map<string, { current: number; total: number; complete: boolean }>();
  private lastPercent = 0;

  /** Apply one event and return the updated snapshot. */
  apply(event: DockerPullStreamEvent): DockerPullProgressSnapshot {
    if (event.kind === 'layer-progress') {
      const existing = this.layers.get(event.layerId);
      if (existing) {
        existing.current = Math.max(existing.current, event.current);
        existing.total = Math.max(existing.total, event.total);
      } else {
        this.layers.set(event.layerId, { current: event.current, total: event.total, complete: false });
      }
    } else if (event.kind === 'layer-complete') {
      const existing = this.layers.get(event.layerId);
      if (existing) {
        existing.current = existing.total;
        existing.complete = true;
      }
      // A complete event for a layer we never saw downloading (e.g. a tiny layer
      // that reported no byte samples) contributes no known total, so it is not
      // tracked — that is correct: it adds nothing measurable to the denominator.
    }
    return this.snapshot();
  }

  /** Current aggregate snapshot. */
  snapshot(): DockerPullProgressSnapshot {
    let downloadedBytes = 0;
    let totalBytes = 0;
    for (const layer of this.layers.values()) {
      downloadedBytes += Math.min(layer.current, layer.total);
      totalBytes += layer.total;
    }

    if (totalBytes <= 0) {
      return { percent: undefined, downloadedBytes: 0, totalBytes: 0 };
    }

    const rawPercent = (downloadedBytes / totalBytes) * 100;
    const monotonic = Math.max(this.lastPercent, rawPercent);
    this.lastPercent = Math.min(100, monotonic);
    return { percent: this.lastPercent, downloadedBytes, totalBytes };
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
 * `Pulling container image: 42% (8.1 GB / 19.3 GB)`. Before any byte total is
 * known, falls back to a plain pulling message so the toast still reads
 * sensibly during the brief layer-enumeration phase.
 */
export function formatPullProgressMessage(
  image: string,
  snapshot: DockerPullProgressSnapshot
): string {
  if (snapshot.percent === undefined || snapshot.totalBytes <= 0) {
    return `Pulling container image: ${image}`;
  }
  const percent = Math.round(snapshot.percent);
  return `Pulling container image: ${image} — ${percent}% (${formatBytes(
    snapshot.downloadedBytes
  )} / ${formatBytes(snapshot.totalBytes)})`;
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

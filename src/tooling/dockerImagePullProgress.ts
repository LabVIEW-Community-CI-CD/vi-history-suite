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

import { resolveImageDownloadSize, type ImageDownloadSize } from './dockerImageDownloadSize';

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
  | { readonly kind: 'layer-extract-progress'; readonly layerId: string; readonly current: number; readonly total: number }
  | { readonly kind: 'layer-seen'; readonly layerId: string }
  | { readonly kind: 'layer-download-complete'; readonly layerId: string }
  | { readonly kind: 'layer-extracting'; readonly layerId: string }
  | { readonly kind: 'layer-complete'; readonly layerId: string }
  | { readonly kind: 'layer-cached'; readonly layerId: string }
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

  // The download phase ("Downloading") carries per-layer byte counts — this is
  // the multi-gigabyte network cost.
  if (status === 'Downloading' && layerId && parsed.progressDetail) {
    const current = parsed.progressDetail.current;
    const total = parsed.progressDetail.total;
    if (isFiniteNonNegative(current) && isFiniteNonNegative(total) && total > 0) {
      return { kind: 'layer-progress', layerId, current, total };
    }
  }

  // The extract phase ("Extracting") unpacks a downloaded layer; for the
  // multi-gigabyte Windows image this is itself a multi-minute phase the user
  // must see signalled. It carries its own per-layer byte counts.
  if (status === 'Extracting' && layerId) {
    const current = parsed.progressDetail?.current;
    const total = parsed.progressDetail?.total;
    if (isFiniteNonNegative(current) && isFiniteNonNegative(total) && total > 0) {
      return { kind: 'layer-extract-progress', layerId, current, total };
    }
    // Extracting without usable byte detail still marks the layer as unpacking.
    return { kind: 'layer-extracting', layerId };
  }

  // Per-layer lifecycle transitions. `Download complete` means bytes are in but
  // the layer is not yet unpacked; `Pull complete` means it is fully extracted;
  // `Already exists` is a cached layer that needs neither download nor extract.
  if (layerId && status === 'Download complete') {
    return { kind: 'layer-download-complete', layerId };
  }
  if (layerId && status === 'Pull complete') {
    return { kind: 'layer-complete', layerId };
  }
  if (layerId && status === 'Already exists') {
    return { kind: 'layer-cached', layerId };
  }

  // The stream's opening line is `{status:"Pulling from <repo>", id:"<tag>"}` —
  // its `id` is the image tag, not a layer, so it must not be enumerated as one
  // (a phantom layer would permanently inflate the denominator).
  if (status && status.startsWith('Pulling from')) {
    return { kind: 'status', status };
  }

  // Any other id-bearing line ("Pulling fs layer", "Waiting", "Verifying
  // Checksum", "Retrying"...) enumerates the layer so it is counted in the
  // denominator early — before it has reported a byte total — which keeps the
  // layer-weighted percentage from spiking when the first small layer lands.
  if (layerId) {
    return { kind: 'layer-seen', layerId };
  }

  if (status) {
    return { kind: 'status', status };
  }

  return undefined;
}

/**
 * The user-facing phase of a container image pull. Docker pulls each layer
 * through download then extract (unpack); for the multi-gigabyte Windows image
 * both are multi-minute, so the toast names the current phase rather than sitting
 * at a frozen 99% once bytes finish arriving.
 */
export type DockerPullPhase = 'preparing' | 'downloading' | 'extracting' | 'complete';

/** A computed snapshot of overall pull progress. */
export interface DockerPullProgressSnapshot {
  /** VHS-REQ-656: the user-facing phase the pull is currently in. */
  readonly phase: DockerPullPhase;
  /**
   * Monotonic **download** progress in [0,99]; `undefined` until at least one
   * layer has been enumerated. Byte-weighted against {@link knownTotalBytes} when
   * a stable registry total is available, otherwise layer-weighted. Capped below
   * 100 so a premature/false 100% is impossible.
   */
  readonly percent?: number;
  /**
   * VHS-REQ-656: monotonic **overall acquisition** progress in [0,99] blending the
   * download and extract phases, for the progress bar so it advances through the
   * unpack phase instead of freezing once download finishes. `undefined` while
   * preparing.
   */
  readonly overallPercent?: number;
  /**
   * VHS-REQ-656: monotonic **extract** (unpack) progress in [0,99]; `undefined`
   * until extraction begins. Layer-weighted.
   */
  readonly extractPercent?: number;
  /** Sum of downloaded bytes across all layers. Monotonic. */
  readonly downloadedBytes: number;
  /**
   * Sum of total bytes across layers that have reported a live total. A lower
   * bound on the image size (un-started layers are excluded), kept for
   * diagnostics — not a trustworthy denominator and not shown in the toast.
   */
  readonly totalBytes: number;
  /**
   * VHS-REQ-655: the stable total compressed download size resolved up front from
   * the registry manifest, when available. When set, drives a true byte-% and is
   * shown in the toast (`8.1 GB / 19.3 GB`).
   */
  readonly knownTotalBytes?: number;
  /** Layers fully pulled (extracted via `Pull complete`, or cached). */
  readonly completedLayers: number;
  /** Layers enumerated so far. */
  readonly totalLayers: number;
}

/** Optional stable-total inputs that switch the aggregator to a true byte-%. */
export interface DockerPullProgressAggregatorOptions {
  /** VHS-REQ-655: stable total compressed download size from the registry manifest. */
  readonly knownTotalBytes?: number;
  /** Short-id → compressed size, to credit cached (`Already exists`) layers. */
  readonly layerSizesByShortId?: ReadonlyMap<string, number>;
}

interface LayerState {
  downloadCurrent: number;
  downloadTotal: number;
  /** Bytes are fully in (`Download complete`, extracting, complete, or cached). */
  downloaded: boolean;
  extractCurrent: number;
  extractTotal: number;
  /** Unpacking has started (`Extracting`) and not yet finished. */
  extracting: boolean;
  /** Fully pulled (`Pull complete`) or cached (`Already exists`). */
  complete: boolean;
  /** Cached (`Already exists`): no download, no unpack. */
  cached: boolean;
}

/**
 * Stateful accumulator that turns a sequence of {@link DockerPullStreamEvent}s
 * into download, extract, and overall progress plus the user-facing
 * {@link DockerPullPhase}.
 *
 * Download progress is a true **byte-%** when a stable
 * {@link DockerPullProgressAggregatorOptions.knownTotalBytes} total is provided
 * (VHS-REQ-655), otherwise **layer-weighted** (VHS-REQ-654). Extract progress
 * (VHS-REQ-656) is layer-weighted across the unpack phase, so once the
 * multi-gigabyte download finishes the toast keeps moving through extraction
 * instead of freezing. All figures are monotonic and capped at 99 (100% is
 * reserved for the explicit "ready" signal).
 */
export class DockerPullProgressAggregator {
  private readonly layers = new Map<string, LayerState>();
  private lastPercent = 0;
  private lastExtractPercent = 0;
  private lastOverallPercent = 0;
  private readonly knownTotalBytes?: number;
  private readonly layerSizesByShortId?: ReadonlyMap<string, number>;

  // The download phase owns the larger share of the progress bar (it is the
  // dominant wall-clock cost); extraction owns the remainder so the bar still
  // advances visibly through the unpack phase.
  private static readonly DOWNLOAD_WEIGHT = 0.85;
  private static readonly EXTRACT_WEIGHT = 0.15;

  constructor(options: DockerPullProgressAggregatorOptions = {}) {
    this.knownTotalBytes =
      options.knownTotalBytes && options.knownTotalBytes > 0 ? options.knownTotalBytes : undefined;
    this.layerSizesByShortId = options.layerSizesByShortId;
  }

  private ensureLayer(layerId: string): LayerState {
    let layer = this.layers.get(layerId);
    if (!layer) {
      layer = {
        downloadCurrent: 0,
        downloadTotal: 0,
        downloaded: false,
        extractCurrent: 0,
        extractTotal: 0,
        extracting: false,
        complete: false,
        cached: false
      };
      this.layers.set(layerId, layer);
    }
    return layer;
  }

  /** Apply one event and return the updated snapshot. */
  apply(event: DockerPullStreamEvent): DockerPullProgressSnapshot {
    switch (event.kind) {
      case 'layer-seen':
        this.ensureLayer(event.layerId);
        break;
      case 'layer-progress': {
        const layer = this.ensureLayer(event.layerId);
        layer.downloadCurrent = Math.max(layer.downloadCurrent, event.current);
        layer.downloadTotal = Math.max(layer.downloadTotal, event.total);
        break;
      }
      case 'layer-download-complete': {
        const layer = this.ensureLayer(event.layerId);
        layer.downloaded = true;
        if (layer.downloadTotal > 0) {
          layer.downloadCurrent = layer.downloadTotal;
        }
        break;
      }
      case 'layer-extract-progress': {
        const layer = this.ensureLayer(event.layerId);
        layer.downloaded = true;
        layer.extracting = true;
        layer.extractCurrent = Math.max(layer.extractCurrent, event.current);
        layer.extractTotal = Math.max(layer.extractTotal, event.total);
        break;
      }
      case 'layer-extracting': {
        const layer = this.ensureLayer(event.layerId);
        layer.downloaded = true;
        layer.extracting = true;
        break;
      }
      case 'layer-complete': {
        const layer = this.ensureLayer(event.layerId);
        layer.downloaded = true;
        layer.extracting = false;
        layer.complete = true;
        if (layer.downloadTotal > 0) {
          layer.downloadCurrent = layer.downloadTotal;
        }
        if (layer.extractTotal > 0) {
          layer.extractCurrent = layer.extractTotal;
        }
        break;
      }
      case 'layer-cached': {
        const layer = this.ensureLayer(event.layerId);
        layer.downloaded = true;
        layer.complete = true;
        layer.cached = true;
        break;
      }
      default:
        break;
    }
    return this.snapshot();
  }

  /** Current aggregate snapshot. */
  snapshot(): DockerPullProgressSnapshot {
    let downloadedBytes = 0;
    let totalBytes = 0;
    let completedLayers = 0;
    let downloadedLayerCount = 0;
    let downloadFractionSum = 0;
    let extractFractionSum = 0;
    for (const [layerId, layer] of this.layers) {
      // A downloaded layer (or cached, credited via the registry size map) counts
      // its full bytes even while it unpacks, so the download byte-% reaches 100%
      // when all bytes are in, independent of extraction.
      const knownSize = this.layerSizesByShortId?.get(layerId) ?? 0;
      const downloadBytes = layer.downloaded
        ? layer.downloadTotal > 0
          ? layer.downloadTotal
          : knownSize
        : layer.downloadTotal > 0
          ? Math.min(layer.downloadCurrent, layer.downloadTotal)
          : layer.downloadCurrent;
      downloadedBytes += downloadBytes;
      totalBytes += layer.downloadTotal;

      if (layer.complete) {
        completedLayers += 1;
      }
      if (layer.downloaded) {
        downloadedLayerCount += 1;
      }

      // Layer-weighted download fraction (fallback when no stable total).
      downloadFractionSum += layer.downloaded
        ? 1
        : layer.downloadTotal > 0
          ? Math.min(layer.downloadCurrent / layer.downloadTotal, 1)
          : 0;

      // Layer-weighted extract fraction: a complete/cached layer is fully
      // unpacked; an in-flight extract contributes its byte fraction.
      extractFractionSum += layer.complete
        ? 1
        : layer.extracting && layer.extractTotal > 0
          ? Math.min(layer.extractCurrent / layer.extractTotal, 1)
          : 0;
    }

    const totalLayers = this.layers.size;
    const hasDownloadActivity = downloadedBytes > 0 || downloadedLayerCount > 0;
    const phase = this.resolvePhase(totalLayers, downloadedLayerCount, completedLayers, hasDownloadActivity);

    // Download percent (the message figure during downloading): byte-% against a
    // stable total, else layer-weighted.
    let rawDownloadPercent: number | undefined;
    if (this.knownTotalBytes !== undefined) {
      rawDownloadPercent = totalLayers > 0 ? (downloadedBytes / this.knownTotalBytes) * 100 : undefined;
    } else if (totalLayers > 0 && downloadFractionSum > 0) {
      rawDownloadPercent = (downloadFractionSum / totalLayers) * 100;
    }
    const percent =
      rawDownloadPercent === undefined
        ? undefined
        : (this.lastPercent = Math.min(99, Math.max(this.lastPercent, rawDownloadPercent)));

    // Extract percent (the message figure during extraction): layer-weighted.
    const rawExtractPercent =
      totalLayers > 0 && (phase === 'extracting' || phase === 'complete' || extractFractionSum > 0)
        ? (extractFractionSum / totalLayers) * 100
        : undefined;
    const extractPercent =
      rawExtractPercent === undefined
        ? undefined
        : (this.lastExtractPercent = Math.min(99, Math.max(this.lastExtractPercent, rawExtractPercent)));

    // Overall percent (the progress bar): blend download and extract so the bar
    // keeps advancing through the unpack phase.
    let overallPercent: number | undefined;
    if (phase !== 'preparing' && totalLayers > 0) {
      const downloadFraction =
        this.knownTotalBytes !== undefined
          ? Math.min(downloadedBytes / this.knownTotalBytes, 1)
          : downloadFractionSum / totalLayers;
      const extractFraction = extractFractionSum / totalLayers;
      const rawOverall =
        (DockerPullProgressAggregator.DOWNLOAD_WEIGHT * downloadFraction +
          DockerPullProgressAggregator.EXTRACT_WEIGHT * extractFraction) *
        100;
      overallPercent = this.lastOverallPercent = Math.min(
        99,
        Math.max(this.lastOverallPercent, rawOverall)
      );
    }

    return {
      phase,
      percent,
      overallPercent,
      extractPercent,
      downloadedBytes,
      totalBytes,
      knownTotalBytes: this.knownTotalBytes,
      completedLayers,
      totalLayers
    };
  }

  private resolvePhase(
    totalLayers: number,
    downloadedLayerCount: number,
    completedLayers: number,
    hasDownloadActivity: boolean
  ): DockerPullPhase {
    if (totalLayers === 0) {
      return 'preparing';
    }
    if (completedLayers === totalLayers) {
      return 'complete';
    }
    // Every layer has its bytes in, but not all are unpacked -> the user is now
    // waiting on extraction, the long post-download phase.
    if (downloadedLayerCount === totalLayers) {
      return 'extracting';
    }
    // Layers are enumerated but no bytes have moved yet -> still preparing.
    if (!hasDownloadActivity) {
      return 'preparing';
    }
    return 'downloading';
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
 * Build the toast message for a progress snapshot, naming the current pull phase
 * (VHS-REQ-656) so the user always sees what the pull is doing — never a frozen
 * 99% once the multi-gigabyte download finishes.
 *
 * - downloading: with a stable registry total (VHS-REQ-655) a true byte-% —
 *   `Pulling container image: <image> — 42% (8.1 GB / 19.3 GB)`; otherwise the
 *   layer-weighted figure (VHS-REQ-654) —
 *   `Pulling container image: <image> — 31% (4/13 layers, 1.4 GB)`.
 * - extracting: `Extracting container image: <image> — 60% (8/13 layers)`.
 * - complete: `Finalizing container image: <image>` (a brief beat before the
 *   caller's `Container image ready` signal).
 * - preparing: a plain pulling message during the brief layer-enumeration phase.
 */
export function formatPullProgressMessage(
  image: string,
  snapshot: DockerPullProgressSnapshot
): string {
  if (snapshot.phase === 'complete') {
    return `Finalizing container image: ${image}`;
  }

  if (snapshot.phase === 'extracting') {
    const extractPercent = Math.round(snapshot.extractPercent ?? 0);
    return `Extracting container image: ${image} — ${extractPercent}% (${snapshot.completedLayers}/${snapshot.totalLayers} layers)`;
  }

  if (snapshot.percent === undefined || snapshot.totalLayers <= 0) {
    return `Pulling container image: ${image}`;
  }
  const percent = Math.round(snapshot.percent);
  if (snapshot.knownTotalBytes !== undefined && snapshot.knownTotalBytes > 0) {
    return `Pulling container image: ${image} — ${percent}% (${formatBytes(
      snapshot.downloadedBytes
    )} / ${formatBytes(snapshot.knownTotalBytes)})`;
  }
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
  /**
   * VHS-REQ-655: injectable resolver for the stable total download size from the
   * registry manifest. Defaults to the real Docker Hub resolver; resolves to
   * `undefined` on any failure, in which case progress stays layer-weighted.
   */
  readonly resolveDownloadSize?: (image: string) => Promise<ImageDownloadSize | undefined>;
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

  // VHS-REQ-655: resolve a stable total download size up front so progress is a
  // true byte-%. Any failure resolves to undefined -> layer-weighted fallback.
  const resolveDownloadSize =
    options.resolveDownloadSize ?? ((image: string) => resolveImageDownloadSize({ image }));
  let downloadSize: ImageDownloadSize | undefined;
  try {
    downloadSize = await resolveDownloadSize(options.image);
  } catch {
    downloadSize = undefined;
  }

  const aggregator = new DockerPullProgressAggregator({
    knownTotalBytes: downloadSize?.totalBytes,
    layerSizesByShortId: downloadSize?.layerSizesByShortId
  });
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

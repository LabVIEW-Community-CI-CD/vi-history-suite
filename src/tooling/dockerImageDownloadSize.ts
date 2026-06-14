/**
 * VHS-REQ-655: resolve a container image's total compressed download size up
 * front from the Docker registry manifest, so the cold-pull toast can show a
 * true, smooth byte-percentage (`42% (8.1 GB / 19.3 GB)`) instead of the
 * layer-weighted approximation (VHS-REQ-654).
 *
 * The Docker Engine pull stream reveals layers — and their sizes — progressively,
 * so the running sum of *known* live-stream totals is an unstable denominator
 * early in the pull. The registry manifest, by contrast, lists every layer's
 * compressed `size` up front, giving a stable total to divide downloaded bytes
 * by.
 *
 * Scope and safety:
 * - Only Docker Hub references are resolved (`registry-1.docker.io` +
 *   `auth.docker.io`); an image on any other registry returns `undefined` so the
 *   caller falls back to layer-weighted progress. This pins every outbound host
 *   to a fixed pair derived from the image reference — never an arbitrary host —
 *   so there is no SSRF surface.
 * - The pull token is anonymous (`repository:<repo>:pull`); no credentials are
 *   ever sent.
 * - The HTTP boundary is injectable and the parsing/selection helpers are pure,
 *   so the resolver is unit-testable on Linux without network access.
 * - Every failure (non-Hub registry, auth/network/parse error, timeout, missing
 *   platform) resolves to `undefined`; the resolver never throws.
 */

import * as https from 'node:https';

/** Docker Hub registry + token service hosts. The only hosts this module calls. */
export const DOCKER_HUB_REGISTRY_HOST = 'registry-1.docker.io';
export const DOCKER_HUB_TOKEN_HOST = 'auth.docker.io';

/** Default bound on each registry HTTP request. */
export const DEFAULT_REGISTRY_TIMEOUT_MS = 5000;

/** Manifest media types accepted from the registry (Docker v2 + OCI). */
export const REGISTRY_MANIFEST_ACCEPT = [
  'application/vnd.docker.distribution.manifest.list.v2+json',
  'application/vnd.oci.image.index.v1+json',
  'application/vnd.docker.distribution.manifest.v2+json',
  'application/vnd.oci.image.manifest.v1+json'
].join(', ');

/** The resolved, stable download size for an image. */
export interface ImageDownloadSize {
  /** Sum of every layer's compressed size, in bytes. A stable denominator. */
  readonly totalBytes: number;
  /**
   * Map from a layer's short id (first 12 hex chars of its `sha256:` digest, the
   * form the pull stream reports) to its compressed size, so cached
   * (`Already exists`) layers can be credited toward the downloaded total.
   */
  readonly layerSizesByShortId: ReadonlyMap<string, number>;
}

/** The OS/architecture to select from a multi-platform manifest list. */
export interface TargetPlatform {
  readonly os: string;
  readonly architecture: string;
}

/** This module exists for the Windows LabVIEW image, so default to windows/amd64. */
export const DEFAULT_TARGET_PLATFORM: TargetPlatform = { os: 'windows', architecture: 'amd64' };

/** One registry HTTP response surfaced to the resolver. */
export interface RegistryHttpResponse {
  readonly statusCode: number;
  readonly headers: Readonly<Record<string, string | string[] | undefined>>;
  readonly body: string;
}

/** Injectable registry HTTP boundary; defaults to a bounded HTTPS GET. */
export interface RegistryHttpRequest {
  (request: {
    readonly url: string;
    readonly headers: Readonly<Record<string, string>>;
    readonly timeoutMs: number;
  }): Promise<RegistryHttpResponse>;
}

/** A Docker Hub reference split into the registry repository and the tag/digest. */
export interface DockerHubReference {
  readonly registryHost: string;
  readonly repository: string;
  readonly reference: string;
}

/**
 * Resolve an image reference to its Docker Hub repository + reference, or
 * `undefined` when it targets any other registry (which this module does not
 * call). A leading segment containing a `.` or `:` — or `localhost` — denotes an
 * explicit registry host and is treated as non-Hub.
 */
export function resolveDockerHubReference(image: string): DockerHubReference | undefined {
  const trimmed = image.trim();
  if (trimmed.length === 0) {
    return undefined;
  }

  // A digest reference (`repo@sha256:...`) pins the manifest directly; otherwise
  // split the `name:tag` form on the final colon after the last slash (a colon in
  // an earlier segment would be a registry host:port).
  let name: string;
  let reference: string;
  const atIndex = trimmed.indexOf('@');
  if (atIndex !== -1) {
    name = trimmed.slice(0, atIndex);
    reference = trimmed.slice(atIndex + 1);
  } else {
    const lastColon = trimmed.lastIndexOf(':');
    const lastSlash = trimmed.lastIndexOf('/');
    if (lastColon > lastSlash && lastColon !== -1) {
      name = trimmed.slice(0, lastColon);
      reference = trimmed.slice(lastColon + 1);
    } else {
      name = trimmed;
      reference = 'latest';
    }
  }

  const firstSlash = name.indexOf('/');
  if (firstSlash !== -1) {
    const firstSegment = name.slice(0, firstSlash);
    if (firstSegment === 'localhost' || firstSegment.includes('.') || firstSegment.includes(':')) {
      // Explicit non-Hub registry host.
      return undefined;
    }
  }

  // Hub official images (no namespace) live under `library/`.
  const repository = name.includes('/') ? name : `library/${name}`;
  if (!/^[a-z0-9]+(?:[._-][a-z0-9]+)*(?:\/[a-z0-9]+(?:[._-][a-z0-9]+)*)*$/.test(repository)) {
    return undefined;
  }
  if (reference.length === 0) {
    return undefined;
  }

  return { registryHost: DOCKER_HUB_REGISTRY_HOST, repository, reference };
}

/** A parsed `WWW-Authenticate: Bearer ...` challenge. */
export interface BearerChallenge {
  readonly realm: string;
  readonly service?: string;
  readonly scope?: string;
}

/**
 * Parse a registry `WWW-Authenticate: Bearer realm="...",service="...",scope="..."`
 * header into its parts, or `undefined` when it is not a Bearer challenge.
 */
export function parseBearerChallenge(headerValue: string | undefined): BearerChallenge | undefined {
  if (!headerValue) {
    return undefined;
  }
  const match = /^\s*Bearer\s+(.*)$/i.exec(headerValue);
  if (!match) {
    return undefined;
  }
  const params: Record<string, string> = {};
  const partRegex = /([a-zA-Z0-9_]+)\s*=\s*"([^"]*)"/g;
  let part: RegExpExecArray | null;
  while ((part = partRegex.exec(match[1])) !== null) {
    params[part[1].toLowerCase()] = part[2];
  }
  if (!params.realm) {
    return undefined;
  }
  return { realm: params.realm, service: params.service, scope: params.scope };
}

interface RawManifest {
  mediaType?: unknown;
  manifests?: unknown;
  layers?: unknown;
}

interface RawPlatformManifestEntry {
  digest?: unknown;
  platform?: { os?: unknown; architecture?: unknown } | null;
}

/**
 * Pick the manifest digest for the target platform from a manifest list / OCI
 * image index, or `undefined` when no entry matches.
 */
export function selectPlatformManifestDigest(
  manifest: unknown,
  platform: TargetPlatform
): string | undefined {
  const manifests = (manifest as RawManifest | null)?.manifests;
  if (!Array.isArray(manifests)) {
    return undefined;
  }
  for (const entry of manifests as RawPlatformManifestEntry[]) {
    const entryOs = entry.platform?.os;
    const entryArch = entry.platform?.architecture;
    if (
      typeof entry.digest === 'string' &&
      entryOs === platform.os &&
      entryArch === platform.architecture
    ) {
      return entry.digest;
    }
  }
  return undefined;
}

interface RawLayer {
  digest?: unknown;
  size?: unknown;
}

/** The short id form (first 12 hex chars) the pull stream reports for a digest. */
function shortIdFromDigest(digest: string): string | undefined {
  const match = /^sha256:([0-9a-f]{12})/i.exec(digest);
  return match ? match[1] : undefined;
}

/**
 * Sum the compressed layer sizes of an image manifest into a stable total plus a
 * short-id→size map, or `undefined` when the manifest carries no usable layers.
 */
export function summarizeManifestLayers(manifest: unknown): ImageDownloadSize | undefined {
  const layers = (manifest as RawManifest | null)?.layers;
  if (!Array.isArray(layers) || layers.length === 0) {
    return undefined;
  }
  let totalBytes = 0;
  const layerSizesByShortId = new Map<string, number>();
  for (const layer of layers as RawLayer[]) {
    const size = layer.size;
    if (typeof size !== 'number' || !Number.isFinite(size) || size < 0) {
      continue;
    }
    totalBytes += size;
    if (typeof layer.digest === 'string') {
      const shortId = shortIdFromDigest(layer.digest);
      if (shortId) {
        layerSizesByShortId.set(shortId, size);
      }
    }
  }
  if (totalBytes <= 0) {
    return undefined;
  }
  return { totalBytes, layerSizesByShortId };
}

/**
 * Default registry HTTP boundary: a single bounded HTTPS GET that buffers the
 * (small) JSON body with a size cap and a timeout. Never follows redirects.
 */
const defaultRegistryHttpRequest: RegistryHttpRequest = (request) =>
  new Promise<RegistryHttpResponse>((resolve, reject) => {
    const MAX_BODY_BYTES = 5 * 1024 * 1024;
    const req = https.request(request.url, { method: 'GET', headers: request.headers }, (response) => {
      response.setEncoding('utf8');
      let body = '';
      let size = 0;
      response.on('data', (chunk: string) => {
        size += Buffer.byteLength(chunk, 'utf8');
        if (size > MAX_BODY_BYTES) {
          req.destroy(new Error('registry response exceeded size cap'));
          return;
        }
        body += chunk;
      });
      response.on('end', () => {
        resolve({ statusCode: response.statusCode ?? 0, headers: response.headers, body });
      });
      response.on('error', reject);
    });
    req.setTimeout(request.timeoutMs, () => {
      req.destroy(new Error('registry request timed out'));
    });
    req.on('error', reject);
    req.end();
  });

function headerValue(
  headers: Readonly<Record<string, string | string[] | undefined>>,
  name: string
): string | undefined {
  const value = headers[name] ?? headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

function parseToken(body: string): string | undefined {
  try {
    const parsed = JSON.parse(body) as { token?: unknown; access_token?: unknown };
    if (typeof parsed.token === 'string' && parsed.token.length > 0) {
      return parsed.token;
    }
    if (typeof parsed.access_token === 'string' && parsed.access_token.length > 0) {
      return parsed.access_token;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

export interface ResolveImageDownloadSizeOptions {
  readonly image: string;
  readonly platform?: TargetPlatform;
  readonly timeoutMs?: number;
  /** Injectable HTTP boundary; defaults to a bounded HTTPS GET. */
  readonly requestJson?: RegistryHttpRequest;
}

/**
 * Resolve the total compressed download size of a Docker Hub image from its
 * registry manifest. Returns `undefined` (never throws) for a non-Hub image or
 * on any auth/network/parse failure so the caller falls back to layer-weighted
 * progress.
 */
export async function resolveImageDownloadSize(
  options: ResolveImageDownloadSizeOptions
): Promise<ImageDownloadSize | undefined> {
  const reference = resolveDockerHubReference(options.image);
  if (!reference) {
    return undefined;
  }
  const platform = options.platform ?? DEFAULT_TARGET_PLATFORM;
  const timeoutMs = options.timeoutMs ?? DEFAULT_REGISTRY_TIMEOUT_MS;
  const requestJson = options.requestJson ?? defaultRegistryHttpRequest;

  try {
    const manifestUrl = `https://${reference.registryHost}/v2/${reference.repository}/manifests/${encodeURIComponent(
      reference.reference
    )}`;
    const baseHeaders: Record<string, string> = { Accept: REGISTRY_MANIFEST_ACCEPT };

    // First attempt is anonymous; Docker Hub answers 401 with a Bearer challenge.
    let response = await requestJson({ url: manifestUrl, headers: baseHeaders, timeoutMs });
    let authHeader: Record<string, string> = { ...baseHeaders };

    if (response.statusCode === 401) {
      const challenge = parseBearerChallenge(headerValue(response.headers, 'www-authenticate'));
      if (!challenge) {
        return undefined;
      }
      // Pin the token host: only Docker Hub's token service is contacted.
      let realmUrl: URL;
      try {
        realmUrl = new URL(challenge.realm);
      } catch {
        return undefined;
      }
      if (realmUrl.protocol !== 'https:' || realmUrl.host !== DOCKER_HUB_TOKEN_HOST) {
        return undefined;
      }
      if (challenge.service) {
        realmUrl.searchParams.set('service', challenge.service);
      }
      realmUrl.searchParams.set('scope', `repository:${reference.repository}:pull`);

      const tokenResponse = await requestJson({ url: realmUrl.toString(), headers: {}, timeoutMs });
      if (tokenResponse.statusCode < 200 || tokenResponse.statusCode >= 300) {
        return undefined;
      }
      const token = parseToken(tokenResponse.body);
      if (!token) {
        return undefined;
      }
      authHeader = { ...baseHeaders, Authorization: `Bearer ${token}` };
      response = await requestJson({ url: manifestUrl, headers: authHeader, timeoutMs });
    }

    if (response.statusCode < 200 || response.statusCode >= 300) {
      return undefined;
    }

    let manifest: unknown;
    try {
      manifest = JSON.parse(response.body);
    } catch {
      return undefined;
    }

    // A manifest list / OCI index requires a second fetch of the platform manifest.
    const platformDigest = selectPlatformManifestDigest(manifest, platform);
    if (platformDigest) {
      const platformUrl = `https://${reference.registryHost}/v2/${reference.repository}/manifests/${encodeURIComponent(
        platformDigest
      )}`;
      const platformResponse = await requestJson({ url: platformUrl, headers: authHeader, timeoutMs });
      if (platformResponse.statusCode < 200 || platformResponse.statusCode >= 300) {
        return undefined;
      }
      try {
        manifest = JSON.parse(platformResponse.body);
      } catch {
        return undefined;
      }
    }

    return summarizeManifestLayers(manifest);
  } catch {
    // Any network/timeout/unexpected error -> fall back to layer-weighted.
    return undefined;
  }
}

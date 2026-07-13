/**
 * VHS-REQ-655: unit tests for the registry manifest download-size resolver.
 * VHS-REQ-655.5: pure helpers and an injected HTTP boundary keep manifest
 * resolution unit-testable without network access.
 *
 * The reference/challenge/manifest helpers are pure; the multi-step registry
 * auth + manifest flow is exercised through an injected HTTP boundary so it is
 * validated on Linux without network access.
 */

import { describe, expect, it, vi } from 'vitest';

import {
  DOCKER_HUB_REGISTRY_HOST,
  DOCKER_HUB_TOKEN_HOST,
  REGISTRY_MANIFEST_ACCEPT,
  parseBearerChallenge,
  resolveDockerHubReference,
  resolveImageDownloadSize,
  selectPlatformManifestDigest,
  summarizeManifestLayers,
  type RegistryHttpRequest,
  type RegistryHttpResponse
} from '../../src/tooling/dockerImageDownloadSize';

describe('resolveDockerHubReference', () => {
  it('maps a namespaced tag reference to the Hub registry repository', () => {
    expect(resolveDockerHubReference('nationalinstruments/labview:2026q1-windows')).toEqual({
      registryHost: DOCKER_HUB_REGISTRY_HOST,
      repository: 'nationalinstruments/labview',
      reference: '2026q1-windows'
    });
  });

  it('prefixes official single-name images with library/', () => {
    expect(resolveDockerHubReference('ubuntu:24.04')).toEqual({
      registryHost: DOCKER_HUB_REGISTRY_HOST,
      repository: 'library/ubuntu',
      reference: '24.04'
    });
  });

  it('defaults the reference to latest when no tag is present', () => {
    expect(resolveDockerHubReference('nationalinstruments/labview')?.reference).toBe('latest');
  });

  it('honors a digest reference', () => {
    expect(resolveDockerHubReference('nationalinstruments/labview@sha256:abc123')).toEqual({
      registryHost: DOCKER_HUB_REGISTRY_HOST,
      repository: 'nationalinstruments/labview',
      reference: 'sha256:abc123'
    });
  });

  it('returns undefined for an explicit non-Hub registry host', () => {
    expect(resolveDockerHubReference('mcr.microsoft.com/windows:ltsc2022')).toBeUndefined();
    expect(resolveDockerHubReference('localhost:5000/foo:bar')).toBeUndefined();
    expect(resolveDockerHubReference('ghcr.io/owner/repo:tag')).toBeUndefined();
  });

  it('returns undefined for empty input', () => {
    expect(resolveDockerHubReference('   ')).toBeUndefined();
  });
});

describe('parseBearerChallenge', () => {
  it('parses realm, service, and scope from a Bearer challenge', () => {
    expect(
      parseBearerChallenge(
        'Bearer realm="https://auth.docker.io/token",service="registry.docker.io",scope="repository:foo:pull"'
      )
    ).toEqual({
      realm: 'https://auth.docker.io/token',
      service: 'registry.docker.io',
      scope: 'repository:foo:pull'
    });
  });

  it('returns undefined for a non-Bearer or realm-less header', () => {
    expect(parseBearerChallenge('Basic realm="x"')).toBeUndefined();
    expect(parseBearerChallenge('Bearer service="x"')).toBeUndefined();
    expect(parseBearerChallenge(undefined)).toBeUndefined();
  });
});

describe('selectPlatformManifestDigest', () => {
  const index = {
    mediaType: 'application/vnd.docker.distribution.manifest.list.v2+json',
    manifests: [
      { digest: 'sha256:linux', platform: { os: 'linux', architecture: 'amd64' } },
      { digest: 'sha256:windows', platform: { os: 'windows', architecture: 'amd64' } }
    ]
  };

  it('selects the matching os/architecture digest (VHS-REQ-655.1)', () => {
    expect(selectPlatformManifestDigest(index, { os: 'windows', architecture: 'amd64' })).toBe('sha256:windows');
  });

  it('returns undefined when no platform matches or there is no manifest list', () => {
    expect(selectPlatformManifestDigest(index, { os: 'darwin', architecture: 'arm64' })).toBeUndefined();
    expect(selectPlatformManifestDigest({ layers: [] }, { os: 'windows', architecture: 'amd64' })).toBeUndefined();
  });
});

describe('summarizeManifestLayers', () => {
  it('sums layer sizes and maps short ids to sizes (VHS-REQ-655.1)', () => {
    const summary = summarizeManifestLayers({
      layers: [
        { digest: 'sha256:aaaaaaaaaaaa1111', size: 1000 },
        { digest: 'sha256:bbbbbbbbbbbb2222', size: 2500 }
      ]
    });
    expect(summary?.totalBytes).toBe(3500);
    expect(summary?.layerSizesByShortId.get('aaaaaaaaaaaa')).toBe(1000);
    expect(summary?.layerSizesByShortId.get('bbbbbbbbbbbb')).toBe(2500);
  });

  it('skips layers with an invalid size and returns undefined when nothing sums', () => {
    const summary = summarizeManifestLayers({
      layers: [
        { digest: 'sha256:cccccccccccc3333', size: -5 },
        { digest: 'sha256:dddddddddddd4444', size: 4000 }
      ]
    });
    expect(summary?.totalBytes).toBe(4000);
    expect(summarizeManifestLayers({ layers: [] })).toBeUndefined();
    expect(summarizeManifestLayers({})).toBeUndefined();
  });
});

describe('resolveImageDownloadSize', () => {
  const manifestListBody = JSON.stringify({
    mediaType: 'application/vnd.docker.distribution.manifest.list.v2+json',
    manifests: [{ digest: 'sha256:winman', platform: { os: 'windows', architecture: 'amd64' } }]
  });
  const platformManifestBody = JSON.stringify({
    mediaType: 'application/vnd.docker.distribution.manifest.v2+json',
    layers: [
      { digest: 'sha256:aaaaaaaaaaaa0001', size: 1_000_000_000 },
      { digest: 'sha256:bbbbbbbbbbbb0002', size: 3_000_000_000 }
    ]
  });

  it('runs the 401 -> token -> manifest-list -> platform-manifest flow and sums layers (VHS-REQ-655.1)', async () => {
    const calls: string[] = [];
    const requestJson: RegistryHttpRequest = vi.fn(async ({ url, headers }) => {
      calls.push(url);
      // First (anonymous) manifest request -> 401 with a Bearer challenge.
      if (url.includes('/manifests/2026q1-windows') && !headers.Authorization) {
        return {
          statusCode: 401,
          headers: {
            'www-authenticate':
              'Bearer realm="https://auth.docker.io/token",service="registry.docker.io",scope="repository:ignored:pull"'
          },
          body: ''
        } satisfies RegistryHttpResponse;
      }
      // Token request.
      if (url.startsWith(`https://${DOCKER_HUB_TOKEN_HOST}/token`)) {
        return { statusCode: 200, headers: {}, body: JSON.stringify({ token: 'TKN' }) };
      }
      // Authenticated manifest-list request.
      if (url.includes('/manifests/2026q1-windows')) {
        expect(headers.Authorization).toBe('Bearer TKN');
        return { statusCode: 200, headers: {}, body: manifestListBody };
      }
      // Platform manifest by digest.
      if (url.includes('/manifests/sha256%3Awinman')) {
        return { statusCode: 200, headers: {}, body: platformManifestBody };
      }
      throw new Error(`unexpected url ${url}`);
    });

    const size = await resolveImageDownloadSize({
      image: 'nationalinstruments/labview:2026q1-windows',
      requestJson
    });

    expect(size?.totalBytes).toBe(4_000_000_000);
    expect(size?.layerSizesByShortId.get('aaaaaaaaaaaa')).toBe(1_000_000_000);
    // Token endpoint scope is built from the parsed repository, not the challenge.
    const tokenCall = calls.find((u) => u.startsWith(`https://${DOCKER_HUB_TOKEN_HOST}/token`));
    expect(tokenCall).toContain('scope=repository%3Anationalinstruments%2Flabview%3Apull');
  });

  it('keeps manifest resolution anonymous, bounded, and pinned to Docker Hub hosts (VHS-REQ-655.4)', async () => {
    const calls: Array<{
      url: string;
      headers: Readonly<Record<string, string>>;
      timeoutMs: number;
    }> = [];
    const requestJson: RegistryHttpRequest = vi.fn(async (request) => {
      calls.push(request);
      if (request.url.includes('/manifests/2026q1-windows') && !request.headers.Authorization) {
        return {
          statusCode: 401,
          headers: {
            'www-authenticate': `Bearer realm="https://${DOCKER_HUB_TOKEN_HOST}/token",service="registry.docker.io",scope="repository:ignored:pull"`
          },
          body: ''
        } satisfies RegistryHttpResponse;
      }
      if (request.url.startsWith(`https://${DOCKER_HUB_TOKEN_HOST}/token`)) {
        return { statusCode: 200, headers: {}, body: JSON.stringify({ token: 'TKN' }) };
      }
      if (request.url.includes('/manifests/2026q1-windows')) {
        return { statusCode: 200, headers: {}, body: manifestListBody };
      }
      if (request.url.includes('/manifests/sha256%3Awinman')) {
        return { statusCode: 200, headers: {}, body: platformManifestBody };
      }
      throw new Error(`unexpected url ${request.url}`);
    });

    const size = await resolveImageDownloadSize({
      image: 'nationalinstruments/labview:2026q1-windows',
      requestJson,
      timeoutMs: 1234
    });

    expect(size?.totalBytes).toBe(4_000_000_000);
    expect(calls).toHaveLength(4);
    expect(calls.map((call) => new URL(call.url).host)).toEqual([
      DOCKER_HUB_REGISTRY_HOST,
      DOCKER_HUB_TOKEN_HOST,
      DOCKER_HUB_REGISTRY_HOST,
      DOCKER_HUB_REGISTRY_HOST
    ]);
    expect(calls.every((call) => new URL(call.url).protocol === 'https:')).toBe(true);
    expect(calls.every((call) => call.timeoutMs === 1234)).toBe(true);
    expect(calls[0].headers).toEqual({ Accept: REGISTRY_MANIFEST_ACCEPT });
    expect(calls[1].headers).toEqual({});
    expect(calls[2].headers).toEqual({
      Accept: REGISTRY_MANIFEST_ACCEPT,
      Authorization: 'Bearer TKN'
    });
    expect(calls[3].headers).toEqual({
      Accept: REGISTRY_MANIFEST_ACCEPT,
      Authorization: 'Bearer TKN'
    });
    expect(calls[1].url).toContain('scope=repository%3Anationalinstruments%2Flabview%3Apull');
  });

  it('handles an anonymous (200) single manifest without a token round-trip (VHS-REQ-655.1)', async () => {
    const requestJson: RegistryHttpRequest = vi.fn(async () => ({
      statusCode: 200,
      headers: {},
      body: JSON.stringify({
        mediaType: 'application/vnd.docker.distribution.manifest.v2+json',
        layers: [{ digest: 'sha256:only000000001', size: 512 }]
      })
    }));
    const size = await resolveImageDownloadSize({ image: 'nationalinstruments/labview:tag', requestJson });
    expect(size?.totalBytes).toBe(512);
    expect(requestJson).toHaveBeenCalledOnce();
  });

  it('returns undefined for a non-Hub image without making any request (VHS-REQ-655.3)', async () => {
    const requestJson: RegistryHttpRequest = vi.fn(async () => {
      throw new Error('should not be called');
    });
    expect(
      await resolveImageDownloadSize({ image: 'mcr.microsoft.com/windows:ltsc2022', requestJson })
    ).toBeUndefined();
    expect(requestJson).not.toHaveBeenCalled();
  });

  it('returns undefined (for layer-weighted fallback) when the challenge realm is not the Hub token host (VHS-REQ-655.3)', async () => {
    const requestJson: RegistryHttpRequest = vi.fn(async () => ({
      statusCode: 401,
      headers: { 'www-authenticate': 'Bearer realm="https://evil.example.com/token",service="x"' },
      body: ''
    }));
    expect(
      await resolveImageDownloadSize({ image: 'nationalinstruments/labview:tag', requestJson })
    ).toBeUndefined();
  });

  it('returns undefined when a request rejects (network/timeout) (VHS-REQ-655.3)', async () => {
    const requestJson: RegistryHttpRequest = vi.fn(async () => {
      throw new Error('ETIMEDOUT');
    });
    expect(
      await resolveImageDownloadSize({ image: 'nationalinstruments/labview:tag', requestJson })
    ).toBeUndefined();
  });
});

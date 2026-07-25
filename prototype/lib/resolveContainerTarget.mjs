// Shared engine->target resolver for the container MCP validators (Phase 1, discussion #2368).
//
// ONE source of truth that maps the Docker ENGINE OS (plus an optional explicit
// image override) to { image, imageVersion, platform } so all four drivers resolve
// the same way with no drift:
//   scripts/validateMcpContainerE2E.mjs
//   scripts/validateMcpPrReviewContainerE2E.mjs
//   scripts/validateMcpLinuxWorktreeE2E.mjs
//   scripts/ollamaMcpOperatorReview.mjs
//
// Contract agreed by WIN + LINUX on discussion #2368:
//  - The Docker ENGINE OS is the contract. With NO explicit VIHS_MCP_IMAGE_VERSION,
//    compose `<PINNED_IMAGE_VERSION>-<engineOs>` and set platform = engineOs
//    (windows -> win32, linux -> linux), keeping both lanes on the same pinned
//    LabVIEW build for the cross-host determinism / comparison-model-hash check.
//  - If VIHS_MCP_IMAGE_VERSION is set explicitly, the runtime platform follows THAT
//    image's OS suffix (an explicit `...-windows` tag on a linux engine yields
//    platform `win32` so the caller's preflight surfaces the engine/image mismatch),
//    NOT the engine.
//  - Fail closed (throw): an unknown/empty engine OS when no explicit image is given,
//    OR an explicit image with no recognized `-windows`/`-linux` suffix. Never guess
//    a platform.
//
// Prototype-scoped (graduates to src/ + tests/unit when we productize). Pure and
// dependency-free (only node:path) so its colocated node --test can lock every branch.

import path from 'node:path';

export const PINNED_IMAGE_VERSION = '2026q1patch2';
export const IMAGE_REPO = 'nationalinstruments/labview';

// Map a container OS ('windows'|'linux') to the runtime.platform token the MCP
// runtime expects ('win32'|'linux'). Anything else -> null (unrecognized).
function platformForOs(os) {
  if (os === 'windows') return 'win32';
  if (os === 'linux') return 'linux';
  return null;
}

// Parse the OS from an image version tag's suffix,
// e.g. '2026q1patch2-windows' -> 'windows', '2025q3-linux' -> 'linux'. Else null.
export function osSuffixOfImageVersion(imageVersion) {
  if (typeof imageVersion !== 'string') return null;
  if (imageVersion.endsWith('-windows')) return 'windows';
  if (imageVersion.endsWith('-linux')) return 'linux';
  return null;
}

// Resolve the container target from the Docker engine OS + environment.
//   engineOs: 'windows' | 'linux' | '' (empty/unknown when Docker is down)
//   env:      process.env-like; reads VIHS_MCP_IMAGE_VERSION
// Returns { image, imageVersion, platform, engineOs, source }.
// Throws (fail closed) on an unresolvable/ambiguous request — never guesses.
export function resolveContainerTarget(engineOs, env = {}) {
  const explicit = typeof env.VIHS_MCP_IMAGE_VERSION === 'string' ? env.VIHS_MCP_IMAGE_VERSION.trim() : '';
  if (explicit) {
    const os = osSuffixOfImageVersion(explicit);
    const platform = platformForOs(os);
    if (!platform) {
      throw new Error(
        `VIHS_MCP_IMAGE_VERSION "${explicit}" has no recognized -windows/-linux suffix; ` +
        'refusing to guess the runtime platform (use e.g. 2026q1patch2-linux / 2026q1patch2-windows).'
      );
    }
    return { image: `${IMAGE_REPO}:${explicit}`, imageVersion: explicit, platform, engineOs, source: 'explicit-image' };
  }
  const platform = platformForOs(engineOs);
  if (!platform) {
    throw new Error(
      `Docker engine OS "${engineOs || '(unknown)'}" is not windows/linux; cannot resolve a container target. ` +
      'Start Docker (or set VIHS_MCP_IMAGE_VERSION explicitly).'
    );
  }
  const imageVersion = `${PINNED_IMAGE_VERSION}-${engineOs}`;
  return { image: `${IMAGE_REPO}:${imageVersion}`, imageVersion, platform, engineOs, source: 'engine' };
}

// Per-engine corpus default (item 4 on #2368). Honors VIHS_MCP_REPO; otherwise the
// conventional clone path for that engine's host lane. homedir is injected for
// testability. In the standard single-OS lanes the engine matches the host, so a
// linux engine -> ~/repos and a windows engine -> C:\repos.
export function defaultCorpus(engineOs, env = {}, homedir = '') {
  const override = typeof env.VIHS_MCP_REPO === 'string' ? env.VIHS_MCP_REPO.trim() : '';
  if (override) return override;
  if (engineOs === 'windows') return 'C:\\repos\\labview-icon-editor';
  return path.posix.join(homedir || '', 'repos', 'labview-icon-editor');
}

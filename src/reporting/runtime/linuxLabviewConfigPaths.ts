import * as path from 'node:path';

export function buildLinuxLabviewIniCandidatePaths(options: {
  homeDir: string;
  requestedLabviewVersion?: string;
  bitness?: string;
}): string[] {
  const homeDir = options.homeDir;
  const versionTokens = new Set<string>();
  const requested = options.requestedLabviewVersion?.trim();
  if (requested) {
    versionTokens.add(requested);
    if (options.bitness === 'x64') {
      versionTokens.add(`${requested}-64`);
    } else if (options.bitness === 'x86') {
      versionTokens.add(`${requested}-32`);
    } else {
      versionTokens.add(`${requested}-64`);
    }
  }

  const candidates: string[] = [];
  for (const token of versionTokens) {
    candidates.push(path.posix.join(homeDir, 'natinst', '.config', `LabVIEW-${token}`, 'labview.conf'));
    candidates.push(path.posix.join(homeDir, '.config', 'natinst', `LabVIEW-${token}`, 'labview.conf'));
    candidates.push(path.posix.join('/etc', 'natinst', `LabVIEW-${token}`, 'labview.conf'));
  }
  // Generic fallback when the version is unknown — caller can iterate via deps.readdir if desired.
  return [...new Set(candidates)];
}

/**
 * VHS-REQ-156: Infer the LabVIEW year token (e.g. `2026`) from a Linux
 * `labviewExe.path` like `/usr/local/natinst/LabVIEW-2026-64/labview` so the
 * labview.conf preflight can locate the config when `requestedLabviewVersion`
 * was not explicitly set on the runtime selection. Returns `undefined` when
 * the directory segment does not match the canonical `LabVIEW-<year>[-bits]`
 * shape.
 */
export function inferLinuxLabviewVersionFromExecutablePath(
  executablePath: string | undefined
): string | undefined {
  if (!executablePath) {
    return undefined;
  }
  const segments = executablePath.split('/').filter(Boolean);
  for (let index = segments.length - 1; index >= 0; index -= 1) {
    const match = segments[index].match(/^LabVIEW-(\d{4})(?:-(?:32|64))?$/u);
    if (match) {
      return match[1];
    }
  }
  return undefined;
}

// lvkit executable locator (VHS-REQ-712). Discovers how to invoke the LabVIEW-
// free lvkit VI diff tool so the compare provider can run it, WITHOUT spawning a
// process here: the PATH probe is an injectable boundary (a pure directory scan
// by default, mirroring runtimeAutoDetect), so the resolution logic is unit
// tested deterministically.
//
// Resolution order (first match wins):
//   1. `VIHS_LVKIT_BIN` env override (an explicit executable path).
//   2. `lvkit` on PATH (installed via `uv tool install lvkit` / `pip install lvkit`).
//   3. `uvx` on PATH -> `uvx --from lvkit lvkit` (zero-install run).
// When none resolve, the location is unavailable with a remediation reason so an
// agent gets an actionable message rather than a silent empty comparison.

import * as fs from 'node:fs';
import * as path from 'node:path';

/** How to invoke lvkit: a command plus a fixed argument prefix. */
export interface LvkitInvocation {
  command: string;
  /** Args that precede the lvkit sub-command (e.g. `--from lvkit lvkit` for uvx). */
  argsPrefix: string[];
  /** How lvkit was resolved (for diagnostics). */
  source: 'env' | 'path' | 'uvx';
}

/** Result of locating lvkit. */
export type LvkitLocation =
  | { available: true; invocation: LvkitInvocation }
  | { available: false; reason: string };

export interface LvkitLocatorDeps {
  /** Resolve an executable name to a path, or undefined when absent. */
  resolveExecutable?: (command: string) => string | undefined;
  env?: NodeJS.ProcessEnv;
}

const WINDOWS_EXECUTABLE_EXTENSIONS = ['.exe', '.cmd', '.bat', ''];

/**
 * Default PATH resolver: scan the `PATH` directories for the command, honoring
 * Windows executable extensions. Pure filesystem probe, no spawn. Injected in
 * tests so no real PATH lookup runs.
 */
export function defaultResolveExecutable(
  command: string,
  env: NodeJS.ProcessEnv = process.env
): string | undefined {
  if (path.isAbsolute(command)) {
    // An explicit override must resolve to a regular file (not a directory or a
    // dangling path), or the later spawn fails with an opaque error.
    try {
      return fs.statSync(command).isFile() ? command : undefined;
    } catch {
      return undefined;
    }
  }
  const pathValue = env.PATH ?? env.Path ?? '';
  const dirs = pathValue.split(path.delimiter).filter((dir) => dir.length > 0);
  const extensions = process.platform === 'win32' ? WINDOWS_EXECUTABLE_EXTENSIONS : [''];
  for (const dir of dirs) {
    for (const ext of extensions) {
      const candidate = path.join(dir, `${command}${ext}`);
      try {
        if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
          return candidate;
        }
      } catch {
        // Unreadable PATH entry — keep scanning.
      }
    }
  }
  return undefined;
}

/**
 * VHS-REQ-712.4: resolve how to invoke lvkit. Honors a `VIHS_LVKIT_BIN` override,
 * then `lvkit` on PATH, then `uvx --from lvkit lvkit`; fails available:false with
 * a remediation reason when none resolve.
 */
export function locateLvkit(deps: LvkitLocatorDeps = {}): LvkitLocation {
  const env = deps.env ?? process.env;
  const resolveExecutable =
    deps.resolveExecutable ?? ((command: string) => defaultResolveExecutable(command, env));

  const override = (env.VIHS_LVKIT_BIN ?? '').trim();
  if (override.length > 0) {
    const resolved = resolveExecutable(override);
    if (resolved) {
      return { available: true, invocation: { command: resolved, argsPrefix: [], source: 'env' } };
    }
    return {
      available: false,
      reason: `lvkit-not-found: VIHS_LVKIT_BIN="${override}" does not resolve to an executable.`
    };
  }

  const onPath = resolveExecutable('lvkit');
  if (onPath) {
    return { available: true, invocation: { command: onPath, argsPrefix: [], source: 'path' } };
  }

  const uvx = resolveExecutable('uvx');
  if (uvx) {
    return {
      available: true,
      invocation: { command: uvx, argsPrefix: ['--from', 'lvkit', 'lvkit'], source: 'uvx' }
    };
  }

  return {
    available: false,
    reason:
      'lvkit-not-found: install lvkit (`uv tool install lvkit` or `pip install lvkit`), or set VIHS_LVKIT_BIN.'
  };
}

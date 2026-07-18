import * as fs from 'node:fs/promises';

/**
 * Pure filesystem path-existence probes extracted verbatim from
 * comparisonRuntimeLocator. `pathExistsWithFsAccess` resolves whether a path is
 * accessible through an injectable `fs.access` boundary (defaulting to
 * `node:fs/promises` access), swallowing the rejection into a `false` result;
 * `defaultPathExists` is the zero-config wrapper the locator uses as its default
 * existence probe. Isolated from runtime-locator orchestration and imported back to
 * preserve behavior and the public API.
 *
 * Supporting VHS-REQ-634.
 */
export async function pathExistsWithFsAccess(
  filePath: string,
  access: typeof fs.access = fs.access
): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function defaultPathExists(filePath: string): Promise<boolean> {
  return pathExistsWithFsAccess(filePath);
}

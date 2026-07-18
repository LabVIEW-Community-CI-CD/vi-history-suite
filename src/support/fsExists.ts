// Shared filesystem-existence predicate (supporting VHS-REQ-610 dashboard
// aggregate review). Six dashboard and reporting modules each defined the
// byte-identical `defaultPathExists` skeleton: probe a path via `fs.access` and
// resolve `true` when it succeeds, `false` when it rejects. This centralizes
// that clone so the default existence probe stays consistent, while callers that
// need an injectable `access` (e.g. comparisonRuntimeLocator.pathExistsWithFsAccess)
// keep their own richer variant.
import * as fs from 'node:fs/promises';

// Resolve `true` when `targetPath` is accessible via `fs.access`, `false` when
// the access probe rejects (missing / not permitted).
export async function pathExistsViaFsAccess(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

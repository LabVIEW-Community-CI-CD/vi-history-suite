import type { SubmoduleGitlink } from '../comparisonReportRuntimeExecution';

/**
 * VHS-REQ-624 (#283): parse NUL-delimited `git ls-tree -r -z` output and return
 * only the submodule gitlink entries (mode `160000`, type `commit`). Each record
 * is `<mode> <type> <object>\t<path>`; the path is kept verbatim (POSIX,
 * unquoted) because `-z` disables path quoting.
 */
export function parseSubmoduleGitlinks(lsTreeOutput: string): SubmoduleGitlink[] {
  const entries: SubmoduleGitlink[] = [];
  for (const record of lsTreeOutput.split('\0')) {
    if (!record) {
      continue;
    }
    const tabIndex = record.indexOf('\t');
    if (tabIndex < 0) {
      continue;
    }
    const metadata = record.slice(0, tabIndex).split(' ');
    const entryPath = record.slice(tabIndex + 1);
    if (metadata.length < 3) {
      continue;
    }
    const [mode, type, object] = metadata;
    if (mode === '160000' && type === 'commit' && object) {
      entries.push({ path: entryPath, revisionId: object });
    }
  }
  return entries;
}

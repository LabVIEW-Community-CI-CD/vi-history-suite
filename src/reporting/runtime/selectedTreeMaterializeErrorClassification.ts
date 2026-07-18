export const SELECTED_TREE_MATERIALIZE_LONG_PATH_DIAGNOSTIC =
  'selected-tree-materialize-long-path';

export interface SelectedTreeMaterializeErrorClassification {
  diagnosticReason?: string;
  diagnosticNotes?: string[];
}

/**
 * Classify an error thrown by `materializeSelectedRevisionTreeWithGit`. When git
 * aborts the checkout because a staged dependency path exceeds the Win32 MAX_PATH
 * (260) limit (stderr "Filename too long", or the POSIX "File name too long"
 * spelling), surface an actionable long-path diagnostic so the otherwise opaque
 * `selected-tree-materialize-failed` failure is self-explanatory. Unrecognized
 * errors return an empty classification so the generic failure reason stands
 * alone.
 */
export function classifySelectedTreeMaterializeError(
  error: unknown
): SelectedTreeMaterializeErrorClassification {
  const message = error instanceof Error ? error.message : String(error ?? '');
  if (/file ?name too long/i.test(message)) {
    return {
      diagnosticReason: SELECTED_TREE_MATERIALIZE_LONG_PATH_DIAGNOSTIC,
      diagnosticNotes: [
        'Selected-revision tree staging failed because a staged dependency path exceeded the Windows MAX_PATH (260) limit (git reported "Filename too long").',
        'Use a shorter report storage root (closer to the drive root), or enable Windows long paths (the "Enable Win32 long paths" policy plus git config core.longpaths=true).'
      ]
    };
  }
  return {};
}

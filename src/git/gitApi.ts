import * as vscode from 'vscode';

export interface GitRepository {
  rootUri: vscode.Uri;
  state?: {
    onDidChange?: (listener: () => unknown) => vscode.Disposable;
  };
}

export interface GitApi {
  repositories: GitRepository[];
  onDidOpenRepository: (
    listener: (repository: GitRepository) => unknown
  ) => vscode.Disposable;
  onDidCloseRepository: (
    listener: (repository: GitRepository) => unknown
  ) => vscode.Disposable;
  toGitUri: (uri: vscode.Uri, ref: string) => vscode.Uri;
}

export function hasGitApiFactory(
  value: unknown
): value is { getAPI: (version: number) => GitApi } {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { getAPI?: unknown }).getAPI === 'function'
  );
}

export async function getBuiltInGitApi(): Promise<GitApi | undefined> {
  const extension = vscode.extensions.getExtension('vscode.git');
  if (!extension) {
    return undefined;
  }

  let gitExtension: unknown;

  try {
    gitExtension = extension.isActive ? extension.exports : await extension.activate();
  } catch {
    return undefined;
  }

  if (!hasGitApiFactory(gitExtension)) {
    return undefined;
  }

  return gitExtension.getAPI(1);
}

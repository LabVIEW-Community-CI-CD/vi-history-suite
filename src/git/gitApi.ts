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

export async function getBuiltInGitApi(): Promise<GitApi | undefined> {
  const extension = vscode.extensions.getExtension('vscode.git');
  if (!extension) {
    return undefined;
  }

  const gitExtension = extension.isActive ? extension.exports : await extension.activate();
  if (!gitExtension?.getAPI) {
    return undefined;
  }

  return gitExtension.getAPI(1) as GitApi;
}


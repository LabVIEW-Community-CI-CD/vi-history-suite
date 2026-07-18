/**
 * Windows Docker spawn helpers extracted verbatim from comparisonRuntimeLocator.
 * `resolveWindowsDockerSpawnCommand` picks the correct `docker` invocation for the
 * host (native `docker`, or `cmd.exe /c docker` when running under WSL so the
 * Windows Docker CLI is reachable); `isMissingWindowsDockerCommand` classifies a
 * spawn error as a missing-docker-command condition. Both are pure and isolated
 * from provider-probing orchestration, imported back to preserve behavior.
 *
 * Supporting VHS-REQ-657.
 */
export function resolveWindowsDockerSpawnCommand(
  hostPlatform: NodeJS.Platform,
  dockerArgs: readonly string[]
): { file: string; args: string[] } {
  if (hostPlatform === 'win32') {
    return {
      file: 'docker',
      args: [...dockerArgs]
    };
  }

  if (hostPlatform !== 'linux' || !process.env.WSL_DISTRO_NAME) {
    return {
      file: 'docker',
      args: [...dockerArgs]
    };
  }

  return {
    file: '/mnt/c/Windows/System32/cmd.exe',
    args: ['/c', 'docker', ...dockerArgs]
  };
}

export function isMissingWindowsDockerCommand(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const code = 'code' in error ? error.code : undefined;
  const message = 'message' in error ? error.message : undefined;
  return (
    code === 'ENOENT' ||
    (typeof message === 'string' &&
      (message.includes('ENOENT') || message.includes('not found') || message.includes('spawn docker')))
  );
}

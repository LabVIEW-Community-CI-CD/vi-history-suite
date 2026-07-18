const WINDOWS_PATH_SEPARATOR = ';';
const POSIX_PATH_SEPARATOR = ':';

export function resolveCurrentPlatformLauncherPath(
  windowsLauncherPath: string,
  posixLauncherPath: string,
  platform: NodeJS.Platform
): string {
  return platform === 'win32' ? windowsLauncherPath : posixLauncherPath;
}

export function buildPathPrependValue(rootDirectoryPath: string, platform: NodeJS.Platform): string {
  return `${rootDirectoryPath}${platform === 'win32' ? WINDOWS_PATH_SEPARATOR : POSIX_PATH_SEPARATOR}`;
}

export function quoteLauncherPathForShell(launcherPath: string, platform: NodeJS.Platform): string {
  if (platform === 'win32') {
    return `"${launcherPath.replace(/"/g, '""')}"`;
  }

  return `'${escapeSingleQuotedShellString(launcherPath)}'`;
}

export function escapeWindowsBatchEcho(value: string): string {
  return value.replace(/"/g, '""');
}

export function escapeSingleQuotedShellString(value: string): string {
  return value.replace(/'/g, `'\"'\"'`);
}

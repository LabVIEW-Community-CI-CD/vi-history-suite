import * as fs from 'node:fs/promises';
import * as path from 'node:path';

export const INTEGRATION_HOST_STAGE_ENTRIES = [
  'package.json',
  'out',
  'out-tests',
  'resources'
] as const;

export async function stageExtensionForWindowsHost(
  repoRoot: string,
  baseDirectory: string
): Promise<string> {
  await fs.mkdir(baseDirectory, { recursive: true });
  const stageRoot = await fs.mkdtemp(path.join(baseDirectory, 'vihs-ext-host-'));

  for (const entry of INTEGRATION_HOST_STAGE_ENTRIES) {
    await copyRecursive(path.join(repoRoot, entry), path.join(stageRoot, entry));
  }

  return stageRoot;
}

async function copyRecursive(source: string, destination: string): Promise<void> {
  const stats = await fs.stat(source);
  if (stats.isDirectory()) {
    await fs.mkdir(destination, { recursive: true });
    for (const entry of await fs.readdir(source)) {
      await copyRecursive(path.join(source, entry), path.join(destination, entry));
    }
    return;
  }

  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.copyFile(source, destination);
}

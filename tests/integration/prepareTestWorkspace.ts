import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { runGit } from '../../src/git/gitCli';

export interface IntegrationWorkspaceMetadata {
  workspacePath: string;
  eligibleRelativePath: string;
  ineligibleRelativePath: string;
}

export async function prepareIntegrationWorkspace(
  baseDirectory = os.tmpdir()
): Promise<IntegrationWorkspaceMetadata> {
  await fs.mkdir(baseDirectory, { recursive: true });
  const workspacePath = await fs.mkdtemp(path.join(baseDirectory, 'vihs-integration-'));
  const eligibleRelativePath = 'Tooling/deployment/VIP_Pre-Install Custom Action.vi';
  const ineligibleRelativePath = 'fixtures/ineligible-content-detected.bin';

  await runGit(['init'], workspacePath);
  await runGit(['config', 'user.name', 'VI History Suite Integration'], workspacePath);
  await runGit(['config', 'user.email', 'vihs-integration@example.invalid'], workspacePath);
  await runGit(
    ['remote', 'add', 'origin', 'https://github.com/ni/labview-icon-editor.git'],
    workspacePath
  );

  await writeViFixture(path.join(workspacePath, eligibleRelativePath), 'eligible-1');
  await writeViFixture(path.join(workspacePath, ineligibleRelativePath), 'ineligible-only');
  await commitAll(workspacePath, 'Add initial integration fixtures');

  await writeViFixture(path.join(workspacePath, eligibleRelativePath), 'eligible-2');
  await commitAll(workspacePath, 'Update eligible fixture');

  await writeViFixture(path.join(workspacePath, eligibleRelativePath), 'eligible-3');
  await commitAll(workspacePath, 'Add third eligible fixture revision');

  const metadata: IntegrationWorkspaceMetadata = {
    workspacePath,
    eligibleRelativePath,
    ineligibleRelativePath
  };

  await fs.mkdir(path.join(workspacePath, '.vscode'), { recursive: true });
  await fs.writeFile(
    path.join(workspacePath, '.vscode', 'settings.json'),
    JSON.stringify(
      {
        'viHistorySuite.windowsContainerImage': 'nationalinstruments/labview:2026q1-windows',
        'viHistorySuite.linuxContainerImage': 'nationalinstruments/labview:2026q1-linux'
      },
      null,
      2
    )
  );

  const metadataPath = path.join(workspacePath, '.vihs-test-meta.json');
  await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));

  return metadata;
}

async function writeViFixture(fsPath: string, payload: string): Promise<void> {
  const content = Buffer.concat([
    Buffer.from('RSRC\r\n\x00\x03', 'binary'),
    Buffer.from('LVIN', 'ascii'),
    Buffer.from(payload, 'utf8')
  ]);

  await fs.mkdir(path.dirname(fsPath), { recursive: true });
  await fs.writeFile(fsPath, content);
}

async function commitAll(repoRoot: string, message: string): Promise<void> {
  await runGit(['add', '.'], repoRoot);
  await runGit(['commit', '-m', message], repoRoot);
}

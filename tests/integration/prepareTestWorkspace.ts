import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { runGit } from '../../src/git/gitCli';

// Real, compiled LabVIEW VIs shipped in the repository. The integration
// fixtures MUST be genuine VIs: synthetic `RSRC`/`LVIN` stubs pass the byte
// signature preflight but real LabVIEW rejects them at compare/render time with
// `0x423 Unexpected file type`, so host-native comparison and preview runs on a
// real LabVIEW runner fail. Each eligible revision maps to a distinct real VI so
// consecutive revisions genuinely differ and produce a meaningful diff.
// Anchored to the repo root (integration tests run from the repository root) so
// it resolves the same whether this module runs from source or the compiled
// out-tests tree (whose __dirname has no sibling resources/).
const REAL_VI_SOURCE_DIR = path.resolve(
  process.cwd(),
  'resources/labview-cli-operations/PrintToSingleFileHtml'
);
const ELIGIBLE_REVISION_SOURCE_VIS = [
  'Make path absolute.vi',
  'Open VI.vi',
  'Parse inputs.vi'
] as const;

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

  await copyRealViFixture(
    path.join(workspacePath, eligibleRelativePath),
    ELIGIBLE_REVISION_SOURCE_VIS[0]
  );
  await writeIneligibleFixture(path.join(workspacePath, ineligibleRelativePath));
  await commitAll(workspacePath, 'Add initial integration fixtures');

  await copyRealViFixture(
    path.join(workspacePath, eligibleRelativePath),
    ELIGIBLE_REVISION_SOURCE_VIS[1]
  );
  await commitAll(workspacePath, 'Update eligible fixture');

  await copyRealViFixture(
    path.join(workspacePath, eligibleRelativePath),
    ELIGIBLE_REVISION_SOURCE_VIS[2]
  );
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
        'viHistorySuite.labviewVersion': '2026',
        'viHistorySuite.labviewBitness': 'x64'
      },
      null,
      2
    )
  );

  const metadataPath = path.join(workspacePath, '.vihs-test-meta.json');
  await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));

  return metadata;
}

// Stages a real, compiled VI at the fixture path so host-native LabVIEW compare
// and preview operations run against a genuine VI (never a synthetic stub).
async function copyRealViFixture(fsPath: string, sourceViName: string): Promise<void> {
  await fs.mkdir(path.dirname(fsPath), { recursive: true });
  await fs.copyFile(path.join(REAL_VI_SOURCE_DIR, sourceViName), fsPath);
}

// The ineligible fixture is intentionally NOT a VI: it exercises the
// content-detection path that rejects non-VI binaries, so a raw byte payload is
// the correct fixture here.
async function writeIneligibleFixture(fsPath: string): Promise<void> {
  await fs.mkdir(path.dirname(fsPath), { recursive: true });
  await fs.writeFile(fsPath, Buffer.from('ineligible-only', 'utf8'));
}

async function commitAll(repoRoot: string, message: string): Promise<void> {
  await runGit(['add', '.'], repoRoot);
  await runGit(['commit', '-m', message], repoRoot);
}

import * as path from 'node:path';

import { runHarnessSmoke } from '../harness/harnessSmoke';

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const repoRoot = path.resolve(__dirname, '..', '..');
  const cloneRoot = path.resolve(repoRoot, '.cache', 'harnesses');
  const reportRoot = path.resolve(repoRoot, '.cache', 'harness-reports');

  const result = await runHarnessSmoke(args.harnessId, {
    cloneRoot,
    reportRoot,
    strictRsrcHeader: args.strictRsrcHeader
  });

  console.log(`Harness smoke completed for ${args.harnessId}`);
  console.log(`JSON: ${result.reportJsonPath}`);
  console.log(`Markdown: ${result.reportMarkdownPath}`);
  console.log(`HTML: ${result.reportHtmlPath}`);
  console.log(`Eligible: ${result.report.eligible ? 'yes' : 'no'}`);
  console.log(`Signature: ${result.report.signature}`);
  console.log(`Commit count: ${result.report.commitCount}`);
}

function parseArgs(argv: string[]): { harnessId: string; strictRsrcHeader: boolean } {
  let harnessId = 'HARNESS-VHS-001';
  let strictRsrcHeader = false;

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (current === '--harness-id') {
      harnessId = argv[index + 1] ?? harnessId;
      index += 1;
      continue;
    }

    if (current === '--strict-rsrc-header') {
      strictRsrcHeader = true;
    }
  }

  return { harnessId, strictRsrcHeader };
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});


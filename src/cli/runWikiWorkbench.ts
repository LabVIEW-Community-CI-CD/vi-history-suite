import * as path from 'node:path';

import {
  buildBundleSyncCommand,
  defaultRunBundleSync,
  formatWikiWorkbenchDoctor,
  formatWikiWorkbenchPlans,
  getWikiWorkbenchUsage,
  parseWikiWorkbenchArgs,
  prepareWikiWorkbenchPublication,
  readWikiPublicationLedger,
  resolveWikiWorkbenchTopology,
  stageWikiWorkbenchPage,
  validateWikiWorkbenchLedger,
  planWikiPages,
  writeWikiWorkbenchManifest,
  WikiWorkbenchManifest,
  WikiWorkbenchRunnerDeps
} from '../tooling/wikiWorkbench';

// Re-export default helper name for tests without exposing implementation detail.
const invokeBundleSync = defaultRunBundleSync;

export interface RunWikiWorkbenchCliDeps extends WikiWorkbenchRunnerDeps {
  repoRoot?: string;
  stdout?: { write(text: string): void };
}

type WikiWorkbenchCliOutcome =
  | 'help'
  | 'doctor'
  | 'discover'
  | 'validate-ledger'
  | 'plan-pages'
  | 'stage-page'
  | 'prepare-publication'
  | 'sync-bundled-docs';

export async function runWikiWorkbenchCli(
  argv: string[],
  deps: RunWikiWorkbenchCliDeps = {}
): Promise<WikiWorkbenchCliOutcome> {
  const args = parseWikiWorkbenchArgs(argv);
  const stdout = deps.stdout ?? process.stdout;

  if (args.helpRequested) {
    stdout.write(`${getWikiWorkbenchUsage()}\n`);
    return 'help';
  }

  const repoRoot = path.resolve(deps.repoRoot ?? args.repoRoot ?? path.resolve(__dirname, '..', '..'));
  const topology = resolveWikiWorkbenchTopology(repoRoot, args.workbenchRoot, deps);
  const ledger = await readWikiPublicationLedger(topology.ledgerJsonPath, deps.readFile);

  if (args.command === 'doctor' || args.command === 'discover') {
    const issues = await validateWikiWorkbenchLedger(topology, ledger, deps);
    await writeManifest(topology, {
      schema: 'vi-history-suite/wiki-workbench@v1',
      recordedAt: nowIso(deps),
      command: args.command,
      repoRoot: topology.repoRoot,
      workbenchRoot: topology.workbenchRoot,
      authorityRepo: topology.authorityRepo,
      wikiRepo: topology.wikiRepo,
      experimentRepo: topology.experimentRepo,
      ledgerJsonPath: topology.ledgerJsonPath,
      ledgerMarkdownPath: topology.ledgerMarkdownPath,
      bundleRoot: topology.bundleRoot,
      result: {
        type: args.command,
        issues
      }
    }, deps);

    if (args.format === 'json') {
      stdout.write(`${JSON.stringify({ topology, issues }, null, 2)}\n`);
    } else {
      stdout.write(`${formatWikiWorkbenchDoctor(topology, issues)}\n`);
    }

    return args.command;
  }

  if (args.command === 'validate-ledger') {
    const issues = await validateWikiWorkbenchLedger(topology, ledger, deps);
    await writeManifest(topology, {
      schema: 'vi-history-suite/wiki-workbench@v1',
      recordedAt: nowIso(deps),
      command: args.command,
      repoRoot: topology.repoRoot,
      workbenchRoot: topology.workbenchRoot,
      authorityRepo: topology.authorityRepo,
      wikiRepo: topology.wikiRepo,
      experimentRepo: topology.experimentRepo,
      ledgerJsonPath: topology.ledgerJsonPath,
      ledgerMarkdownPath: topology.ledgerMarkdownPath,
      bundleRoot: topology.bundleRoot,
      result: {
        type: 'validate-ledger',
        issues
      }
    }, deps);

    if (args.format === 'json') {
      stdout.write(`${JSON.stringify({ issues }, null, 2)}\n`);
    } else {
      stdout.write(`${formatWikiWorkbenchDoctor(topology, issues)}\n`);
    }

    return 'validate-ledger';
  }

  if (args.command === 'plan-pages') {
    const pages = planWikiPages(topology, ledger);
    await writeManifest(topology, {
      schema: 'vi-history-suite/wiki-workbench@v1',
      recordedAt: nowIso(deps),
      command: args.command,
      repoRoot: topology.repoRoot,
      workbenchRoot: topology.workbenchRoot,
      authorityRepo: topology.authorityRepo,
      wikiRepo: topology.wikiRepo,
      experimentRepo: topology.experimentRepo,
      ledgerJsonPath: topology.ledgerJsonPath,
      ledgerMarkdownPath: topology.ledgerMarkdownPath,
      bundleRoot: topology.bundleRoot,
      result: {
        type: 'plan-pages',
        pages
      }
    }, deps);

    if (args.format === 'json') {
      stdout.write(`${JSON.stringify({ pages }, null, 2)}\n`);
    } else {
      stdout.write(`${formatWikiWorkbenchPlans(pages)}\n`);
    }

    return 'plan-pages';
  }

  if (args.command === 'stage-page') {
    throwOnWorkbenchErrors(await validateWikiWorkbenchLedger(topology, ledger, deps));
    const { receiptPath, receipt } = await stageWikiWorkbenchPage(topology, ledger, args.pageId, deps);
    await writeManifest(topology, {
      schema: 'vi-history-suite/wiki-workbench@v1',
      recordedAt: nowIso(deps),
      command: args.command,
      repoRoot: topology.repoRoot,
      workbenchRoot: topology.workbenchRoot,
      authorityRepo: topology.authorityRepo,
      wikiRepo: topology.wikiRepo,
      experimentRepo: topology.experimentRepo,
      ledgerJsonPath: topology.ledgerJsonPath,
      ledgerMarkdownPath: topology.ledgerMarkdownPath,
      bundleRoot: topology.bundleRoot,
      result: {
        type: 'stage-page',
        receiptPath
      }
    }, deps);

    if (args.format === 'json') {
      stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
    } else {
      stdout.write(`Wiki workbench staged ${receipt.page.id} at ${receipt.stageDirectory}\n`);
    }

    return 'stage-page';
  }

  if (args.command === 'prepare-publication') {
    throwOnWorkbenchErrors(await validateWikiWorkbenchLedger(topology, ledger, deps));
    const { receiptPath, receipt } = await prepareWikiWorkbenchPublication(
      topology,
      ledger,
      args.pageId,
      deps
    );
    await writeManifest(topology, {
      schema: 'vi-history-suite/wiki-workbench@v1',
      recordedAt: nowIso(deps),
      command: args.command,
      repoRoot: topology.repoRoot,
      workbenchRoot: topology.workbenchRoot,
      authorityRepo: topology.authorityRepo,
      wikiRepo: topology.wikiRepo,
      experimentRepo: topology.experimentRepo,
      ledgerJsonPath: topology.ledgerJsonPath,
      ledgerMarkdownPath: topology.ledgerMarkdownPath,
      bundleRoot: topology.bundleRoot,
      result: {
        type: 'prepare-publication',
        receiptPath
      }
    }, deps);

    if (args.format === 'json') {
      stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
    } else {
      stdout.write(`Wiki publication prep retained at ${receiptPath}\n`);
    }

    return 'prepare-publication';
  }

  throwOnWorkbenchErrors(await validateWikiWorkbenchLedger(topology, ledger, deps));
  const bundleSyncRunner = deps.runBundleSync ?? invokeBundleSync;
  bundleSyncRunner({
    repoRoot: topology.repoRoot,
    wikiRepoRoot: topology.wikiRepo.localPath,
    ledgerPath: topology.ledgerJsonPath,
    bundleRoot: topology.bundleRoot
  });
  const command = buildBundleSyncCommand(topology);
  await writeManifest(topology, {
    schema: 'vi-history-suite/wiki-workbench@v1',
    recordedAt: nowIso(deps),
    command: args.command,
    repoRoot: topology.repoRoot,
    workbenchRoot: topology.workbenchRoot,
    authorityRepo: topology.authorityRepo,
    wikiRepo: topology.wikiRepo,
    experimentRepo: topology.experimentRepo,
    ledgerJsonPath: topology.ledgerJsonPath,
    ledgerMarkdownPath: topology.ledgerMarkdownPath,
    bundleRoot: topology.bundleRoot,
    result: {
      type: 'sync-bundled-docs',
      command
    }
  }, deps);

  if (args.format === 'json') {
    stdout.write(`${JSON.stringify({ command }, null, 2)}\n`);
  } else {
    stdout.write(`Bundled docs refreshed via ${command}\n`);
  }

  return 'sync-bundled-docs';
}

function throwOnWorkbenchErrors(issues: Array<{ severity: string; message: string }>): void {
  const errors = issues.filter((issue) => issue.severity === 'error');
  if (errors.length === 0) {
    return;
  }

  throw new Error(errors.map((issue) => issue.message).join('\n'));
}

function nowIso(deps: RunWikiWorkbenchCliDeps): string {
  return (deps.now ?? (() => new Date()))().toISOString();
}

async function writeManifest(
  topology: ReturnType<typeof resolveWikiWorkbenchTopology>,
  manifest: WikiWorkbenchManifest,
  deps: RunWikiWorkbenchCliDeps
): Promise<string> {
  return writeWikiWorkbenchManifest(topology, manifest, deps);
}

export async function runWikiWorkbenchCliMain(
  argv: string[] = process.argv.slice(2),
  deps: RunWikiWorkbenchCliDeps = {},
  stderr: Pick<NodeJS.WriteStream, 'write'> = process.stderr
): Promise<number> {
  try {
    await runWikiWorkbenchCli(argv, deps);
    return 0;
  } catch (error) {
    stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}

export function maybeRunWikiWorkbenchCliAsMain(
  argv: string[] = process.argv.slice(2),
  mainModule: NodeModule | undefined = require.main,
  currentModule: NodeModule = module,
  deps: RunWikiWorkbenchCliDeps = {},
  processLike: Pick<NodeJS.Process, 'exitCode'> = process,
  stderr: Pick<NodeJS.WriteStream, 'write'> = process.stderr
): boolean {
  if (mainModule !== currentModule) {
    return false;
  }

  void runWikiWorkbenchCliMain(argv, deps, stderr).then((exitCode) => {
    processLike.exitCode = exitCode;
  });
  return true;
}

maybeRunWikiWorkbenchCliAsMain();

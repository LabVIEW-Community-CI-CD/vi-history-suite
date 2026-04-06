export type GovernedProofLegacySubcommand =
  | 'smoke'
  | 'report-smoke'
  | 'dashboard-smoke'
  | 'benchmark-linux'
  | 'benchmark-windows'
  | 'decision-record'
  | 'host-operation-matrix';

export function getGovernedProofLegacyEntrypointError(
  subcommand: GovernedProofLegacySubcommand
): string {
  return [
    'This legacy proof CLI is internal-only.',
    `Use the single public proof entrypoint instead: npm run proof:run -- ${subcommand} ...`
  ].join(' ');
}

export function applyGovernedProofLegacyEntrypointExitCode(
  exitCode: number,
  processLike: Pick<NodeJS.Process, 'exitCode'> = process
): number {
  processLike.exitCode = exitCode;
  return exitCode;
}

export function maybeRejectGovernedProofLegacyEntrypointAsMain(
  subcommand: GovernedProofLegacySubcommand,
  mainModule: NodeModule | undefined = require.main,
  currentModule: NodeModule = module,
  processLike: Pick<NodeJS.Process, 'exitCode'> = process,
  stderr: Pick<NodeJS.WriteStream, 'write'> = process.stderr
): boolean {
  if (mainModule !== currentModule) {
    return false;
  }

  stderr.write(`${getGovernedProofLegacyEntrypointError(subcommand)}\n`);
  applyGovernedProofLegacyEntrypointExitCode(1, processLike);
  return true;
}

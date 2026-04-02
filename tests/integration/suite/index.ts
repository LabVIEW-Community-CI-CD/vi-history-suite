import { runIntegrationSuite } from './extensionHost.test';

export async function run(): Promise<void> {
  await runIntegrationSuite();
}

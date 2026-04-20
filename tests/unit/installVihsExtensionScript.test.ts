import * as fs from 'node:fs';
import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '..', '..');

function readText(relativePath: string): string {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

describe('install vihs extension bootstrap script', () => {
  it('retains the governed Windows PowerShell install bootstrap contract', () => {
    const script = readText('scripts/install-vihs-extension.ps1');

    expect(script).toContain("$ExtensionId = 'svelderrainruiz.vi-history-suite'");
    expect(script).toContain("Join-Path $env:APPDATA 'Code\\User\\settings.json'");
    expect(script).toContain('& $CliCommand --install-extension $PublisherExtensionId --force');
    expect(script).toContain("Resolve-VihsGlobalStorageRoot");
    expect(script).toContain("vihs.cmd");
    expect(script).toContain("vihs-runtime-settings.cmd");
    expect(script).toContain("Ensure-WindowsUserPathPrepend");
    expect(script).toContain("Current VI History install settings:");
    expect(script).toContain("Provider");
    expect(script).toContain("LabVIEW year");
    expect(script).toContain("Bitness");
    expect(script).toContain("LabVIEW $labviewVersion not installed.");
    expect(script).toContain("Seeded default VI History runtime settings");
    expect(script).toContain("Interactive input was not available.");
    expect(script).toContain("Next commands:");
    expect(script).toContain("vihs --validate");
  });
});

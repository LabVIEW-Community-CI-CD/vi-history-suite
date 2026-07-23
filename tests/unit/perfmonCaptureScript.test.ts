// Requirement coverage: VHS-REQ-707 (Mirror-Mode dual real-runtime validation) —
// the hardened native-PowerShell first-run perfmon capture script
// (VHS-REQ-707.16). Pure and deterministic: the renderer returns script text, so
// these assertions pin the hardening idioms without running PowerShell.
import { describe, expect, it } from 'vitest';

import { buildWindowsPerfmonCapturePlan } from '../../src/reporting/mirror/perfmonCapturePlan';
import { renderWindowsPerfmonCaptureScript } from '../../src/reporting/mirror/perfmonCaptureScript';

const PLAN = buildWindowsPerfmonCapturePlan({
  collectorName: 'vihs-firstrun',
  outputCsvPath: 'C:/vihs-proof-tmp/perf.csv',
  sampleIntervalSec: 1
});

function render(overrides: Partial<Parameters<typeof renderWindowsPerfmonCaptureScript>[0]> = {}): string {
  return renderWindowsPerfmonCaptureScript({
    plan: PLAN,
    comparisonExecutable: 'LabVIEWCLI.exe',
    comparisonArgs: ['-OperationName', 'CreateComparisonReport', '-vi1', 'a.vi', '-vi2', 'b.vi'],
    windowJsonPath: 'C:/vihs-proof-tmp/window.json',
    ...overrides
  });
}

describe('renderWindowsPerfmonCaptureScript (VHS-REQ-707.16)', () => {
  it('emits the logman lifecycle from the plan and the comparison invocation', () => {
    const script = render();
    expect(script).toContain("$collector = 'vihs-firstrun'");
    expect(script).toContain("$csvOut = 'C:/vihs-proof-tmp/perf.csv'");
    expect(script).toContain("$windowPath = 'C:/vihs-proof-tmp/window.json'");
    expect(script).toContain("$executable = 'LabVIEWCLI.exe'");
    expect(script).toContain("$createArgs = @('create', 'counter', 'vihs-firstrun'");
    expect(script).toContain("$startArgs = @('start', 'vihs-firstrun')");
    expect(script).toContain("$stopArgs = @('stop', 'vihs-firstrun')");
    expect(script).toContain("$deleteArgs = @('delete', 'vihs-firstrun')");
    expect(script).toContain("$compareArgs = @('-OperationName', 'CreateComparisonReport'");
    expect(script.trim().endsWith('exit $exitCode')).toBe(true);
  });

  it('hardens every native call: Continue + try/catch/finally + explicit exit-code readback', () => {
    const script = render();
    expect(script).toContain('function Invoke-Native([string]$file, [string[]]$fileArgs)');
    expect(script).toContain("$ErrorActionPreference = 'Continue'");
    expect(script).toContain('$script:LastNativeExit = $LASTEXITCODE');
    // A missing executable / terminating error is caught, not fatal.
    expect(script).toContain('} catch {');
    expect(script).toContain('$script:LastNativeExit = 127');
    // ErrorActionPreference is always restored.
    expect(script).toContain('$ErrorActionPreference = $prev');
  });

  it('always stops + deletes the collector and always writes the window from finally', () => {
    const script = render();
    const finallyIndex = script.indexOf('} finally {');
    expect(finallyIndex).toBeGreaterThan(0);
    const finallyBlock = script.slice(finallyIndex);
    expect(finallyBlock).toContain("Invoke-Native 'logman' $stopArgs");
    expect(finallyBlock).toContain("Invoke-Native 'logman' $deleteArgs");
    // Window record is written UTF-8 without a BOM (no ConvertTo-Json > BOM pitfall).
    expect(finallyBlock).toContain('[System.IO.File]::WriteAllText($windowPath, $json)');
    expect(finallyBlock).toContain('$window | ConvertTo-Json -Depth 5');
    // The real logman CSV filename (numeric suffix) is resolved, not guessed.
    expect(finallyBlock).toContain("Get-ChildItem -LiteralPath $dir -Filter ($base + '*.csv')");
  });

  it('records the capture window shape the pipeline consumes', () => {
    const script = render();
    expect(script).toContain('startMs = $startMs');
    expect(script).toContain('endMs = $endMs');
    expect(script).toContain('exitCode = $exitCode');
    expect(script).toContain('csvPath = $csvPath');
    expect(script).toContain('cycles = @($cycle)');
    expect(script).toContain('durationMs = ($endMs - $startMs)');
  });

  it('uses only native tooling — no node, pwsh, or bash', () => {
    const script = render().toLowerCase();
    expect(script).not.toMatch(/\bnode\b/);
    expect(script).not.toMatch(/\bpwsh\b/);
    expect(script).not.toMatch(/\bbash\b/);
    expect(script).not.toContain('npm ');
  });

  it('inserts a warm-up sleep only when settleSeconds is positive', () => {
    expect(render({ settleSeconds: 3 })).toContain('Start-Sleep -Seconds 3');
    expect(render()).not.toContain('Start-Sleep');
    expect(render({ settleSeconds: 0 })).not.toContain('Start-Sleep');
  });

  it('quotes literals safely so a single quote in an argument cannot break out', () => {
    const script = render({ comparisonArgs: ["it's", 'ok'] });
    // quotePowerShellLiteral doubles the embedded single quote.
    expect(script).toContain("$compareArgs = @('it''s', 'ok')");
  });

  it('fails closed on a bad plan, empty executable, empty window path, and a bad settle', () => {
    expect(() =>
      renderWindowsPerfmonCaptureScript({ plan: { schema: 'nope' } as never, comparisonExecutable: 'x', comparisonArgs: [], windowJsonPath: 'w' })
    ).toThrow(/perfmon-capture-plan@v1/);
    expect(() => render({ comparisonExecutable: '   ' })).toThrow(/comparisonExecutable/);
    expect(() => render({ windowJsonPath: '' })).toThrow(/windowJsonPath/);
    expect(() => render({ settleSeconds: -1 })).toThrow(/settleSeconds/);
    expect(() => render({ settleSeconds: 1.5 })).toThrow(/settleSeconds/);
  });
});

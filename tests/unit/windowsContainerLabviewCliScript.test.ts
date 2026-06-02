import { describe, expect, it } from 'vitest';

import { buildWindowsContainerLabviewCliScript } from '../../src/reporting/comparisonReportRuntimeExecution';

describe('buildWindowsContainerLabviewCliScript cliConnectTimeoutSeconds parity (VHS-REQ-148)', () => {
  const executable = 'C:\\Program Files\\National Instruments\\Shared\\LabVIEW CLI\\LabVIEWCLI.exe';
  const args = ['--operation', 'Compare'];

  it('uses the 180s default when no override is supplied', () => {
    const script = buildWindowsContainerLabviewCliScript(executable, args);
    expect(script).toContain("-Key 'OpenAppReferenceTimeoutInSecond' -Value '180'");
    expect(script).toContain("-Key 'AfterLaunchOpenAppReferenceTimeoutInSecond' -Value '180'");
  });

  it('substitutes the configured cliConnectTimeoutSeconds value into both ini keys', () => {
    const script = buildWindowsContainerLabviewCliScript(executable, args, undefined, 240);
    expect(script).toContain("-Key 'OpenAppReferenceTimeoutInSecond' -Value '240'");
    expect(script).toContain("-Key 'AfterLaunchOpenAppReferenceTimeoutInSecond' -Value '240'");
    expect(script).not.toContain("-Value '180'");
  });

  it('falls back to the 180s default when the override is not a positive integer', () => {
    const scriptZero = buildWindowsContainerLabviewCliScript(executable, args, undefined, 0);
    expect(scriptZero).toContain("-Key 'OpenAppReferenceTimeoutInSecond' -Value '180'");
    const scriptFraction = buildWindowsContainerLabviewCliScript(executable, args, undefined, 90.5);
    expect(scriptFraction).toContain("-Key 'OpenAppReferenceTimeoutInSecond' -Value '180'");
    const scriptNegative = buildWindowsContainerLabviewCliScript(executable, args, undefined, -10);
    expect(scriptNegative).toContain("-Key 'OpenAppReferenceTimeoutInSecond' -Value '180'");
  });
});

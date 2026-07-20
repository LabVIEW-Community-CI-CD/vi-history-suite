import { describe, expect, it } from 'vitest';

import { parseWindowsContainerRuntimeFacts } from '../../src/reporting/runtime/windowsContainerRuntimeFacts';

describe('parseWindowsContainerRuntimeFacts', () => {
  it('parses ini path and connected port from the container-meta line', () => {
    const stdout =
      '[vi-history-suite-container-meta]iniPath=C:\\NI\\labview.ini;connectedPort=3363\n';
    const facts = parseWindowsContainerRuntimeFacts(stdout);
    expect(facts.labviewIniPath).toBe('C:\\NI\\labview.ini');
    expect(facts.labviewTcpPort).toBe(3363);
    expect(facts.notes.some((n) => n.includes('CLI ini path'))).toBe(true);
    expect(facts.notes.some((n) => n.includes('VI Server port 3363'))).toBe(true);
  });

  it('falls back to the connection log line for the port when metadata omits it', () => {
    const stdout = 'Connection established with LabVIEW at port number 5001.';
    expect(parseWindowsContainerRuntimeFacts(stdout).labviewTcpPort).toBe(5001);
  });

  it('treats none/null ini path values as absent', () => {
    const stdout = '[vi-history-suite-container-meta]iniPath=none';
    const facts = parseWindowsContainerRuntimeFacts(stdout);
    expect(facts.labviewIniPath).toBeUndefined();
  });

  it('records a startup-hardening note when hardening metadata is present', () => {
    const stdout =
      '[vi-history-suite-container-meta]retryAttempts=3;prelaunchAttempted=1;openTimeout=30;afterLaunchTimeout=45';
    const note = parseWindowsContainerRuntimeFacts(stdout).notes.find((n) =>
      n.includes('startup hardening')
    );
    expect(note).toContain('retryAttempts=3');
    expect(note).toContain('prelaunchAttempted=yes');
    expect(note).toContain('OpenAppReferenceTimeoutInSecond=30');
    expect(note).toContain('AfterLaunchOpenAppReferenceTimeoutInSecond=45');
  });

  it('returns empty notes and no facts for unrelated stdout', () => {
    const facts = parseWindowsContainerRuntimeFacts('nothing of interest here');
    expect(facts.labviewIniPath).toBeUndefined();
    expect(facts.labviewTcpPort).toBeUndefined();
    expect(facts.notes).toEqual([]);
  });

  it('maps prelaunchAttempted=0 to "no" in the hardening note', () => {
    const stdout = '[vi-history-suite-container-meta]prelaunchAttempted=0';
    const note = parseWindowsContainerRuntimeFacts(stdout).notes.find((n) =>
      n.includes('startup hardening')
    );
    expect(note).toContain('prelaunchAttempted=no');
  });

  it('omits an unknown prelaunchAttempted value from the hardening note', () => {
    const stdout = '[vi-history-suite-container-meta]retryAttempts=2;prelaunchAttempted=maybe';
    const note = parseWindowsContainerRuntimeFacts(stdout).notes.find((n) =>
      n.includes('startup hardening')
    );
    expect(note).toContain('retryAttempts=2');
    expect(note).not.toContain('prelaunchAttempted');
  });

  it('records only the retryAttempts hardening fact when it is the sole hardening key', () => {
    const stdout = '[vi-history-suite-container-meta]retryAttempts=4';
    const note = parseWindowsContainerRuntimeFacts(stdout).notes.find((n) =>
      n.includes('startup hardening')
    );
    expect(note).toContain('retryAttempts=4');
    expect(note).not.toContain('prelaunchAttempted');
    expect(note).not.toContain('OpenAppReferenceTimeoutInSecond');
    expect(note).not.toContain('AfterLaunchOpenAppReferenceTimeoutInSecond');
  });

  it('records only the afterLaunchTimeout hardening fact when it is the sole hardening key', () => {
    const stdout = '[vi-history-suite-container-meta]afterLaunchTimeout=90';
    const note = parseWindowsContainerRuntimeFacts(stdout).notes.find((n) =>
      n.includes('startup hardening')
    );
    expect(note).toContain('AfterLaunchOpenAppReferenceTimeoutInSecond=90');
    expect(note).not.toContain('retryAttempts');
  });

  it('skips metadata segments without an = separator and with empty keys', () => {
    const stdout = '[vi-history-suite-container-meta]bareToken; =orphanValue;iniPath=C:\\NI\\labview.ini';
    const facts = parseWindowsContainerRuntimeFacts(stdout);
    expect(facts.labviewIniPath).toBe('C:\\NI\\labview.ini');
  });

  it('ignores a non-positive connected port value in the metadata', () => {
    const stdout = '[vi-history-suite-container-meta]iniPath=C:\\NI\\labview.ini;connectedPort=0';
    const facts = parseWindowsContainerRuntimeFacts(stdout);
    expect(facts.labviewTcpPort).toBeUndefined();
  });
});

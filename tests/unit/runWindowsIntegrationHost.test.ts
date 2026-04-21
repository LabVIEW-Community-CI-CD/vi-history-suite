import { describe, expect, it, vi } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const integrationHost = require('../../scripts/runWindowsIntegrationHost.js') as {
  buildWindowsIntegrationCommand: (env?: Record<string, string | undefined>) => {
    command: string;
    args: string[];
    env: Record<string, string | undefined>;
  };
};

describe('runWindowsIntegrationHost', () => {
  it('builds a Windows-native npm command plan with the governed integration host override', () => {
    const command = integrationHost.buildWindowsIntegrationCommand({
      APPDATA: 'C:\\Users\\sveld\\AppData\\Roaming'
    });

    expect(command.command).toBe('cmd.exe');
    expect(command.args).toEqual(['/d', '/s', '/c', 'npm run test:integration']);
    expect(command.env.VI_HISTORY_SUITE_INTEGRATION_HOST).toBe('windows');
    expect(command.env.APPDATA).toBe('C:\\Users\\sveld\\AppData\\Roaming');
  });

  it('preserves existing environment entries while forcing the governed Windows host value', () => {
    const command = integrationHost.buildWindowsIntegrationCommand({
      VI_HISTORY_SUITE_INTEGRATION_HOST: 'linux',
      TEMP: 'C:\\Temp'
    });

    expect(command.env.VI_HISTORY_SUITE_INTEGRATION_HOST).toBe('windows');
    expect(command.env.TEMP).toBe('C:\\Temp');
  });
});

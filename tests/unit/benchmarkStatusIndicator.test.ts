import { describe, expect, it } from 'vitest';

import { buildHostLinuxBenchmarkIndicatorView } from '../../src/benchmark/benchmarkStatusIndicator';

describe('benchmark status indicator', () => {
  it('shows a status-bar spinner message while the host Linux benchmark is running', () => {
    expect(
      buildHostLinuxBenchmarkIndicatorView({
        state: 'running',
        latestProgressMessage:
          'Preparing dashboard pair 7/137; est. 74m 17s left: Executing LabVIEW comparison runtime.',
        latestLogLine: 'ignored because progress is newer',
        statusSummary: 'running'
      })
    ).toEqual({
      visible: true,
      text:
        '$(sync~spin) Host Linux benchmark: Preparing dashboard pair 7/137; est. 74m 17s left: Executi...',
      tooltip:
        'Host Linux benchmark\n\nPreparing dashboard pair 7/137; est. 74m 17s left: Executing LabVIEW comparison runtime.'
    });
  });

  it('hides the status-bar indicator when the host Linux benchmark is not active', () => {
    expect(
      buildHostLinuxBenchmarkIndicatorView({
        state: 'missing',
        statusSummary: 'not running'
      })
    ).toEqual({
      visible: false
    });
  });
});

// Windows netstat listener parsing and System32 executable resolution helpers
// (supporting VHS-REQ-659). Extracted verbatim from comparisonReportRuntimeExecution
// to keep pure netstat parsing and path resolution separate from runtime
// orchestration (per the reporting-orchestration guardrails). Behavior is
// unchanged.
import * as path from 'node:path';

import type { WindowsTcpListenerObservation } from '../comparisonReportRuntimeExecution';

// Resolve the absolute path to a Windows System32 executable for the given host
// platform: a native `%SYSTEMROOT%\System32\<file>` path on Windows, or the
// `/mnt/c/Windows/System32/<file>` interop path elsewhere.
export function resolveWindowsSystem32Executable(
  hostPlatform: NodeJS.Platform,
  filename: string
): string {
  return hostPlatform === 'win32'
    ? path.win32.join(process.env.SYSTEMROOT ?? 'C:\\Windows', 'System32', filename)
    : `/mnt/c/Windows/System32/${filename}`;
}

// Parse `netstat -ano` stdout into observed TCP listeners, keeping only well-formed
// LISTENING rows with an integer port and PID.
export function parseWindowsNetstatListeners(stdout: string): WindowsTcpListenerObservation[] {
  return stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const match = line.match(/^TCP\s+(\S+):(\d+)\s+\S+\s+LISTENING\s+(\d+)$/i);
      if (!match) {
        return undefined;
      }

      const localPort = Number.parseInt(match[2], 10);
      const pid = Number.parseInt(match[3], 10);
      if (!Number.isInteger(localPort) || !Number.isInteger(pid)) {
        return undefined;
      }

      return {
        localAddress: match[1],
        localPort,
        pid
      } satisfies WindowsTcpListenerObservation;
    })
    .filter((listener): listener is WindowsTcpListenerObservation => Boolean(listener));
}

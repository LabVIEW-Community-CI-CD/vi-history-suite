// Dev-only host binding for the live mprr timing stopwatch (VHS-REQ-713.6).
//
// Wires the pure `renderLiveTimingStopwatchHtml` surface into a command that is
// registered ONLY in the Extension Development Host
// (`context.extensionMode === ExtensionMode.Development`). It is never
// registered in a packaged/production VSIX, so it is not a shipped user-facing
// command; a `viHistorySuite.devMode` context key keeps it out of the command
// palette everywhere except the dev host. The command renders the full-screen
// live stopwatch by launching a browser in kiosk mode (a VS Code webview cannot
// be OS-full-screen with the exact strip geometry the decoder needs), giving the
// maintainer a ground-truth timing source to capture and validate at >=12fps.
//
// Coverage note: this is a thin host binding that spawns an external process, so
// it is excluded from unit coverage (like the other `src/ui` host bindings); the
// testable logic lives in `renderLiveTimingStopwatchHtml`.

import * as vscode from 'vscode';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';

import { renderLiveTimingStopwatchHtml } from './timingStopwatchSurface';

const DEV_TIMING_STOPWATCH_COMMAND = 'labviewViHistory.dev.openTimingStopwatch';

function resolveBrowser(): string | undefined {
  const candidates = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    process.env.LOCALAPPDATA
      ? path.join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe')
      : undefined,
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
  ].filter((candidate): candidate is string => typeof candidate === 'string');
  return candidates.find((candidate) => fs.existsSync(candidate));
}

/**
 * Register the dev-only timing-stopwatch command. No-op unless the extension is
 * running in Development mode (the Extension Development Host) on Windows.
 * `resolveBrowser()` only resolves Windows Chrome/Edge install paths and the
 * stopwatch is a ground-truth clock for the Windows perfmon/logman capture, so
 * registration is gated to win32 to avoid surfacing a non-functional command on
 * macOS/Linux dev hosts. Accessing `vscode.ExtensionMode` defensively keeps this
 * safe under minimal test mocks that may not define the enum.
 */
export function registerDevTimingStopwatch(context: vscode.ExtensionContext): void {
  // Read ExtensionMode defensively: under minimal ESM test mocks that do not
  // define the enum, accessing a missing namespace member throws, which would
  // otherwise abort activation. A missing enum simply means "not development".
  let developmentMode: number | undefined;
  try {
    developmentMode = (vscode as { ExtensionMode?: { Development?: number } }).ExtensionMode?.Development;
  } catch {
    developmentMode = undefined;
  }
  const isDevelopment = developmentMode !== undefined && context.extensionMode === developmentMode;
  // Windows-only: resolveBrowser() and the paired perfmon/logman capture are
  // Windows-specific, so a non-win32 dev host would only get a broken command.
  if (!isDevelopment || process.platform !== 'win32') {
    return;
  }

  void vscode.commands.executeCommand('setContext', 'viHistorySuite.devMode', true);

  context.subscriptions.push(
    vscode.commands.registerCommand(DEV_TIMING_STOPWATCH_COMMAND, async () => {
      const browser = resolveBrowser();
      if (!browser) {
        void vscode.window.showErrorMessage(
          'Dev timing stopwatch: no Chrome/Edge found to launch the full-screen stopwatch.'
        );
        return;
      }
      // Reuse one stable temp dir (and browser profile) across runs so a
      // long-lived hardening host does not accumulate per-launch mkdtemp dirs;
      // the browser is launched detached so we cannot clean up on exit.
      const dir = path.join(os.tmpdir(), 'vihs-timing-stopwatch');
      fs.mkdirSync(dir, { recursive: true });
      const htmlPath = path.join(dir, 'timing-stopwatch.html');
      fs.writeFileSync(htmlPath, renderLiveTimingStopwatchHtml(), 'utf8');
      const profileDir = path.join(dir, 'browser-profile');
      try {
        const child = spawn(
          browser,
          [
            '--kiosk',
            '--force-device-scale-factor=1',
            '--no-first-run',
            '--no-default-browser-check',
            '--disable-infobars',
            '--disable-session-crashed-bubble',
            '--overscroll-history-navigation=0',
            `--user-data-dir=${profileDir}`,
            `--app=${pathToFileURL(htmlPath).href}`
          ],
          { detached: true, stdio: 'ignore' }
        );
        // spawn() surfaces failures to launch (blocked by policy, not runnable)
        // asynchronously via an 'error' event; without a listener that throws
        // and would crash the Extension Development Host.
        child.on('error', (err) => {
          void vscode.window.showErrorMessage(
            `Dev timing stopwatch: failed to launch ${browser}: ${err.message}`
          );
        });
        child.unref();
        void vscode.window.showInformationMessage(
          'Dev timing stopwatch launched full-screen (kiosk). Press Alt+F4 / close the window to exit.'
        );
      } catch (err) {
        void vscode.window.showErrorMessage(
          `Dev timing stopwatch: failed to launch ${browser}: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    })
  );
}

// VHS-REQ-699 (vagrant lane instrumentation): granular guest-side progress log.
//
// WinRM buffers a driver's stdout until the process exits, so a long host-native
// pipeline run is opaque until it finishes. This helper writes an append-only
// NDJSON progress log to a GUEST-LOCAL path plus a periodic heartbeat, so a
// SEPARATE WinRM session can `Get-Content -Tail` the log and follow each state
// transition (and confirm liveness) without disturbing the running driver.
//
// Not shipped, not in npm test (lives under vagrant/). One JSON object per line:
//   {"t":"<iso>","elapsedMs":<n>,"event":"<name>", ...data}
const fs = require('node:fs');
const path = require('node:path');

/**
 * Creates a progress log at `logPath`. Returns { emit, heartbeat, stop, logPath }.
 * `emit(event, data?)` appends one timestamped line. `heartbeat(everyMs)` starts a
 * periodic liveness line (call `stop()` before the driver exits).
 */
function createProgressLog(logPath, options = {}) {
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  const startedAt = Date.now();
  // Truncate any prior run's log so a tail always reflects the current run.
  fs.writeFileSync(logPath, '');

  const write = (event, data) => {
    const line = JSON.stringify({
      t: new Date().toISOString(),
      elapsedMs: Date.now() - startedAt,
      event,
      ...(data ?? {})
    });
    fs.appendFileSync(logPath, line + '\n');
    if (options.echo !== false) {
      process.stderr.write(`[progress] ${event} +${Date.now() - startedAt}ms\n`);
    }
  };

  let timer;
  const emit = (event, data) => write(event, data);
  const heartbeat = (everyMs = 5000) => {
    stop();
    timer = setInterval(() => write('heartbeat'), everyMs);
    if (typeof timer.unref === 'function') {
      timer.unref();
    }
  };
  function stop() {
    if (timer) {
      clearInterval(timer);
      timer = undefined;
    }
  }

  emit('run-start', { logPath });
  return { emit, heartbeat, stop, logPath };
}

module.exports = { createProgressLog };

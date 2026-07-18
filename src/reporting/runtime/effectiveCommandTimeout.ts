import type { ComparisonReportPacketRecord } from '../comparisonReportPacket';
import type { ComparisonCommandPlan } from '../comparisonReportPlan';
import {
  resolveEffectiveRuntimePlatform,
  isHeadlessLabviewCliExecution
} from './runtimeSelectionPredicates';

/**
 * Effective command-timeout policy extracted verbatim from
 * comparisonReportRuntimeExecution to isolate the VHS-REQ-156 (issue #269) Linux
 * host-native headless opt-in timeout bound from runtime orchestration. Re-exported
 * by the parent to preserve the public API.
 */
/**
 * VHS-REQ-156 (issue #269): default command bound (ms) applied only to the Linux
 * host-native headless OPT-IN path (`LV_RTE_LINUX_HEADLESS=1`). On LabVIEW builds
 * with a broken `HeadlessManager` (e.g. 2026 26.1.1f1, which logs "Failed to
 * initialize headless LabVIEW." every 10s and never binds a session) the
 * `-Headless` CLI hangs indefinitely during VI load. The production action wires
 * no `commandTimeoutMs`, so without this bound the post-process headless classifier
 * never fires and the operator sees an unbounded stall. Bounding the opt-in path
 * converts the stall into a deterministic `command-timed-out` failure that still
 * carries the `linux-headless-init-failed` diagnostic and remediation guidance.
 *
 * The value is well above the 180s (`DEFAULT_CLI_CONNECT_TIMEOUT_SECONDS`)
 * app-reference connect window so a legitimately slow-but-working headless run on
 * a healthy build is never killed prematurely; it matches the existing
 * `DEFAULT_GIT_TIMEOUT_MS` convention. The safe non-headless default (no
 * `-Headless`) and the working Linux container provider stay unbounded.
 */
export const LINUX_HOST_NATIVE_HEADLESS_OPT_IN_DEFAULT_TIMEOUT_MS = 300000;

/**
 * VHS-REQ-156 (issue #269): the Linux host-native headless OPT-IN path is the only
 * surface that can hang indefinitely on a broken `HeadlessManager`. The env-var
 * opt-in (`LV_RTE_LINUX_HEADLESS=1`) is reflected as `-Headless` in the resolved
 * command plan even when `headlessRequested` was not persisted, so detect both the
 * persisted flag and the actual `-Headless` argument. The linux-container provider
 * is deliberately excluded: its bundled image initializes headless mode correctly
 * and must stay unbounded.
 */
function isLinuxHostNativeHeadlessOptIn(
  record: ComparisonReportPacketRecord,
  commandPlan: ComparisonCommandPlan | undefined
): boolean {
  return (
    resolveEffectiveRuntimePlatform(record.runtimeSelection) === 'linux' &&
    record.runtimeSelection.engine === 'labview-cli' &&
    record.runtimeSelection.provider === 'host-native' &&
    (record.runtimeSelection.headlessRequested === true ||
      isHeadlessLabviewCliExecution(commandPlan?.args))
  );
}

/**
 * VHS-REQ-156 (issue #269): resolve the effective command timeout (ms). An
 * explicitly configured `commandTimeoutMs` always wins (e.g. a validation harness
 * bound). Otherwise the Linux host-native headless opt-in receives a default bound
 * so a broken HeadlessManager surfaces `linux-headless-init-failed` deterministically
 * instead of stalling forever. All other paths (non-headless default, container
 * providers, non-Linux, non-CLI) stay unbounded by returning `undefined`.
 */
export function resolveEffectiveCommandTimeoutMs(options: {
  record: ComparisonReportPacketRecord;
  commandPlan: ComparisonCommandPlan | undefined;
  configuredTimeoutMs?: number;
}): number | undefined {
  if (typeof options.configuredTimeoutMs === 'number') {
    return options.configuredTimeoutMs;
  }
  if (isLinuxHostNativeHeadlessOptIn(options.record, options.commandPlan)) {
    return LINUX_HOST_NATIVE_HEADLESS_OPT_IN_DEFAULT_TIMEOUT_MS;
  }
  return undefined;
}

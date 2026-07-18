export const DEFAULT_CLI_CONNECT_TIMEOUT_SECONDS = 180;
export const MIN_CLI_CONNECT_TIMEOUT_SECONDS = 30;
export const MAX_CLI_CONNECT_TIMEOUT_SECONDS = 600;

/**
 * VHS-REQ-148: clamp an arbitrary requested CLI connect-timeout (seconds) into the
 * supported `[MIN, MAX]` window, rounding to an integer. A non-finite/NaN request
 * falls back to the shipped default so the panel never persists an unusable value.
 */
export function clampCliConnectTimeoutSeconds(requestedSeconds: unknown): number {
  if (typeof requestedSeconds !== 'number' || !Number.isFinite(requestedSeconds)) {
    return DEFAULT_CLI_CONNECT_TIMEOUT_SECONDS;
  }
  const rounded = Math.round(requestedSeconds);
  if (rounded < MIN_CLI_CONNECT_TIMEOUT_SECONDS) {
    return MIN_CLI_CONNECT_TIMEOUT_SECONDS;
  }
  if (rounded > MAX_CLI_CONNECT_TIMEOUT_SECONDS) {
    return MAX_CLI_CONNECT_TIMEOUT_SECONDS;
  }
  return rounded;
}

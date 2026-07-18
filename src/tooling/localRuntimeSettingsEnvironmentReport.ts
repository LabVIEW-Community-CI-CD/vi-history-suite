export function buildReportableEnvironment(env: NodeJS.ProcessEnv): Record<string, string> {
  const reportable: Record<string, string> = {};
  for (const [key, value] of Object.entries(env).sort(([left], [right]) =>
    left.localeCompare(right)
  )) {
    reportable[key] = isSecretLikeEnvironmentKey(key)
      ? '<redacted-secret-like-env-var>'
      : String(value ?? '');
  }
  return reportable;
}

export function isSecretLikeEnvironmentKey(key: string): boolean {
  const normalized = key.toUpperCase();
  if (normalized === 'PATH' || normalized.endsWith('PATH')) {
    return false;
  }

  return /TOKEN|(^|_)PAT($|_)|PASSWORD|PASSWD|SECRET|PRIVATE|CREDENTIAL|AUTH|KEY/u.test(
    normalized
  );
}

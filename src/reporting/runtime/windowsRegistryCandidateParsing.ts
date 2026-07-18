import { MINIMUM_HOST_LABVIEW_YEAR } from '../../tooling/labviewInstallCatalog';
import { dedupeCandidates } from './candidatePathHelpers';
import { inferBitnessFromPath } from './bitnessHelpers';
import { inferLabviewYearFromExecutablePath } from './labviewExecutablePathInference';
import type { RuntimeToolCandidate } from '../comparisonRuntimeLocator';

export function parseWindowsRegistryLabviewCandidates(
  registryOutput: string
): RuntimeToolCandidate[] {
  // Direct `...\LabVIEW.exe` form (kept for forward compatibility with any
  // registry value that records the executable itself).
  const exePaths =
    registryOutput.match(/[A-Za-z]:\\[^\r\n"]*LabVIEW(?: [^\\\r\n"]+)?\\LabVIEW\.exe/gi) ?? [];

  // VHS-REQ-634: A real National Instruments install records the LabVIEW install
  // DIRECTORY (for example `C:\Program Files\National Instruments\LabVIEW 2025\`)
  // in the registry `Path` value, not the executable. Accept that
  // install-directory form too and derive `<dir>LabVIEW.exe`.
  const installDirPaths =
    registryOutput.match(/[A-Za-z]:\\[^\r\n"]*LabVIEW(?: [^\\\r\n"]+)?\\(?=\s|$|")/gi) ?? [];
  const derivedExePaths = installDirPaths.map((installDir) => `${installDir.trim()}LabVIEW.exe`);

  // These are parse-time claims, not proof on disk: a registry subkey can be
  // stale (a removed install) and the derived path may not exist. Mirror the
  // documented-scan convention (`buildDocumentedRuntimeCandidates` seeds
  // `exists: false`) and let the I/O boundary in `resolveWindowsRegistryCandidates`
  // validate each path before the locator trusts it (#381).
  return dedupeCandidates(
    [...exePaths, ...derivedExePaths]
      .map((rawPath) => {
        const exePath = rawPath.trim();
        return {
          kind: 'labview-exe' as const,
          path: exePath,
          source: 'registry' as const,
          exists: false,
          bitness: inferBitnessFromPath(exePath)
        };
      })
      // #644: the registry can record LabVIEW installs older than the supported
      // minimum (e.g. a system-default LabVIEW 2020). The tool requires LabVIEW
      // 2025+, and selecting an unsupported old install makes the preview
      // operation class fail to load (error 1125). Drop candidates whose year is
      // inferable and below the minimum; keep unknown-year paths (the registry
      // superset exists to catch non-standard install locations).
      .filter((candidate) => {
        const year = inferLabviewYearFromExecutablePath(candidate.path);
        return year === undefined || Number(year) >= MINIMUM_HOST_LABVIEW_YEAR;
      })
  );
}

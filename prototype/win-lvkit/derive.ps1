# WIN-leg derive-from-scratch: lvkit generate of a FIRST-COMMIT VI (Ideas #2372).
# A first commit has no parent to diff, so the full lvkit `generate` (Python that
# mirrors the VI's LabVIEW block diagram) IS the born-from-scratch content = the
# VI's first cache entry. Runs inside the provisioned 2026q1patch2-windows lvkit
# container. Native PowerShell; invoked via -Command "iex (gc <p> -Raw)".
# Corpus mounted read-only at C:\corpus; output to the mounted C:\out.
$log = 'C:\derive-result.txt'
function step($m) { Add-Content -Path $log -Value ('[' + (Get-Date -Format HH:mm:ss) + '] ' + $m) }
$vi     = if ($env:DERIVE_VI)  { $env:DERIVE_VI }  else { 'ASCII/Terminals/ASCII Command-Response.vi' }
$sha    = if ($env:DERIVE_SHA) { $env:DERIVE_SHA } else { '06939af' }
$genDir = 'C:\gen\born'
Set-Content -Path $log -Value ('[derive] start ' + (Get-Date -Format o) + '  vi=' + $vi + '  sha=' + $sha) -Encoding utf8
try {
  if (Test-Path $genDir) { Remove-Item -Recurse -Force $genDir }
  New-Item -ItemType Directory -Force -Path C:\work, $genDir | Out-Null
  & git config --global --add safe.directory C:\corpus 2>&1 | Out-Null
  # Binary-safe blob extraction: cmd '>' preserves raw bytes (a PS pipeline would decode/corrupt).
  $ref = $sha + ':' + $vi
  cmd /c ('git -C C:\corpus cat-file -p "' + $ref + '" > C:\work\born.vi')
  $bornBytes = (Get-Item C:\work\born.vi).Length
  step ('born.vi bytes: ' + $bornBytes)
  if ($bornBytes -le 0) { step '[derive] FAILED: empty born.vi (bad sha/path?)'; return }
  # Full "derive from scratch" generate: reproducible/CI mode (no host vi.lib),
  # placeholders on unresolved so first-commit deps do not abort the build.
  $lm = if ($env:DERIVE_LOADMODE) { $env:DERIVE_LOADMODE } else { 'minimal' }
  # The Windows LabVIEW image HAS real vi.lib installed, so lvkit can resolve
  # wired SubVIs (e.g. VISA Configure Serial Port) that a LabVIEW-free box cannot.
  # This is why the born-from-scratch generate belongs on this image.
  $vilib = if ($env:DERIVE_VILIB) { $env:DERIVE_VILIB } else { 'C:\Program Files\National Instruments\LabVIEW 2026\vi.lib' }
  step ('load-mode: ' + $lm + '  vilib: ' + $vilib + '  vilib-exists: ' + (Test-Path $vilib))
  $gen = (& lvkit generate C:\work\born.vi -o $genDir --load-mode $lm --vilib $vilib --placeholder-on-unresolved 2>&1 | Out-String)
  step ('lvkit generate exit trace (first 400): ' + ($gen.Trim().Substring(0, [Math]::Min(400, $gen.Trim().Length))))
  $pys = @(Get-ChildItem -Recurse $genDir -Filter *.py -ErrorAction SilentlyContinue)
  step ('generated .py files: ' + $pys.Count)
  step ('generated total bytes: ' + (($pys | Measure-Object Length -Sum).Sum))
  foreach ($p in $pys) { step ('  py: ' + $p.FullName.Substring($genDir.Length) + ' (' + $p.Length + ' bytes)') }
  step '[derive] OK'
} catch { step ('[derive] FAILED: ' + $_.Exception.Message) }

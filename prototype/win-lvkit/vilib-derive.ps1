# WIN-leg follow-up 2 (issue #2373): prove the Windows LabVIEW image turns
# LINUX's LabVIEW-free `.error.py` placeholders into CLEAN born-from-scratch
# generates. Run inside the provisioned container
# `lvkit-win-devtools-v2.2.1` (FROM nationalinstruments/labview:2026q1patch2-windows,
# bound to dev-tools tag devtools-v2.2.1) with the SerialPortNuggets corpus
# mounted read-only at C:\corpus:
#   docker exec <c> powershell -NoProfile -Command "Invoke-Expression (Get-Content C:\vilib-derive.ps1 -Raw)"
#
# Two resolution axes are needed and BOTH are only available on the LabVIEW image:
#   1. vi.lib / VISA deps            -> --vilib <installed LabVIEW 2026 vi.lib>
#   2. project-internal SubVIs        -> --search-path <writable born-subtree>
#      (e.g. Actor 'Queue Manager.vi'). lvkit writes a .lvkit\cache extraction
#      cache next to the VIs it loads, so a READ-ONLY corpus mount blocks
#      resolution with `WinError 5: Access is denied`. The born-commit subtree
#      must therefore be staged into a WRITABLE location before generate.
#
# Strategy per VI: Pass A = lone born blob + --vilib (resolves VISA/vi.lib for
# self-contained VIs). If a placeholder remains for a project SubVI, Pass B
# stages the born-commit top-level app subtree into a writable dir (git archive
# + tar) and generates with --vilib + --search-path.
#
# Env overrides: DERIVE_VILIB (vi.lib path), DERIVE_SHA (born commit).
$log = 'C:\vilib-result.txt'
function step($m) { Add-Content -Path $log -Value $m }
Set-Content -Path $log -Value ('[vilib-derive] ' + (Get-Date -Format o)) -Encoding utf8
$vilib = if ($env:DERIVE_VILIB) { $env:DERIVE_VILIB } else { 'C:\Program Files\National Instruments\LabVIEW 2026\vi.lib' }
$born  = if ($env:DERIVE_SHA) { $env:DERIVE_SHA } else { '06939af' }
step ('vilib=' + $vilib + '  exists=' + (Test-Path $vilib) + '  born=' + $born)
$vis = @(
  'ASCII/Terminals/ASCII Command-Response.vi',
  'ASCII/Actor/Write to Port.vi',
  'ASCII/Instruments/ASCII CMD-Response Instrument.vi'
)
& git config --global --add safe.directory C:\corpus 2>&1 | Out-Null

function Read-Result($outDir) {
  $prim = Get-ChildItem $outDir -Recurse -Filter *.py -ErrorAction SilentlyContinue | Where-Object { $_.Name -ne '__init__.py' -and $_.Name -notlike '*.error.py' }
  $err  = Get-ChildItem $outDir -Recurse -Filter *.error.py -ErrorAction SilentlyContinue | Select-Object -First 1
  return [pscustomobject]@{ Prim = $prim; Err = $err }
}

foreach ($vi in $vis) {
  # Pass A: lone born blob + --vilib (resolves VISA/vi.lib, no project SubVIs).
  Remove-Item C:\vwork, C:\vout -Recurse -Force -ErrorAction SilentlyContinue
  New-Item -ItemType Directory -Force -Path C:\vwork, C:\vout | Out-Null
  cmd /c ('git -C C:\corpus cat-file -p "' + $born + ':' + $vi + '" > C:\vwork\cur.vi')
  $secsA = [int](Measure-Command { & lvkit generate C:\vwork\cur.vi --load-mode minimal --vilib $vilib --placeholder-on-unresolved -o C:\vout 2>&1 | Out-Null }).TotalSeconds
  $rA = Read-Result C:\vout

  if ($rA.Prim -and -not $rA.Err) {
    $target = $rA.Prim | Select-Object -First 1
    $lines = (([IO.File]::ReadAllText($target.FullName)) -replace "`r`n", "`n").TrimEnd("`n") -split "`n"
    step ($vi + '  => CLEAN [--vilib]  modules=' + ($rA.Prim.Count) + '  primary=' + $target.Name + '  lines=' + $lines.Count + '  secs=' + $secsA)
    continue
  }

  # Pass B: stage the born-commit top-level app subtree into a WRITABLE dir so
  # lvkit can create its extraction cache and resolve project SubVIs via --search-path.
  $top = ($vi -split '/')[0]
  Remove-Item C:\vstage, C:\vout -Recurse -Force -ErrorAction SilentlyContinue
  New-Item -ItemType Directory -Force -Path C:\vstage, C:\vout | Out-Null
  cmd /c ('git -C C:\corpus archive -o C:\vstage.tar ' + $born + ' "' + $top + '"')
  & tar -xf C:\vstage.tar -C C:\vstage
  $staged = Join-Path C:\vstage $vi
  $secsB = [int](Measure-Command { & lvkit generate $staged --load-mode minimal --vilib $vilib --search-path C:\vstage --placeholder-on-unresolved -o C:\vout 2>&1 | Out-Null }).TotalSeconds
  $rB = Read-Result C:\vout
  $leaf = [IO.Path]::GetFileNameWithoutExtension($vi).ToLower().Replace(' ', '_').Replace('-', '_')
  $target = $rB.Prim | Where-Object { $_.BaseName -eq $leaf } | Select-Object -First 1
  if (-not $target) { $target = $rB.Prim | Select-Object -First 1 }
  if ($target -and -not $rB.Err) {
    $lines = (([IO.File]::ReadAllText($target.FullName)) -replace "`r`n", "`n").TrimEnd("`n") -split "`n"
    step ($vi + '  => CLEAN [--vilib+--search-path]  modules=' + ($rB.Prim.Count) + '  primary=' + $target.Name + '  lines=' + $lines.Count + '  secs=' + ($secsA + $secsB))
  } elseif ($rB.Err) {
    $first = (([IO.File]::ReadAllText($rB.Err.FullName)) -split "`n")[0]
    step ($vi + '  => STILL ERROR [--vilib+--search-path] (' + $rB.Err.Name + ')  secs=' + ($secsA + $secsB) + '  :: ' + $first)
  } else {
    step ($vi + '  => NO OUTPUT [--vilib+--search-path]  secs=' + ($secsA + $secsB))
  }
}
step '[vilib-derive] done'

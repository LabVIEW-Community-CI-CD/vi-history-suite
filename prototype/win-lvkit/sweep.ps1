# WIN-leg follow-up 2 SWEEP (issue #2373): run the FULL SerialPortNuggets
# first-commit VI set (born @06939af) through --vilib + writable-staging
# --search-path and tally how many of LINUX's LabVIEW-free `.error.py`
# placeholders the Windows LabVIEW image converts to CLEAN born-from-scratch
# generates. Run in the provisioned container `lvkit-win-devtools-v2.2.1`
# (bound to dev-tools tag devtools-v2.2.1) with SerialPortNuggets mounted
# read-only at C:\corpus:
#   docker exec <c> powershell -NoProfile -Command "Invoke-Expression (Get-Content C:\sweep.ps1 -Raw)"
#
# Result 2026-07-25 (lvkit 0.5.2): 16/26 CLEAN vs LINUX's 5/26 LabVIEW-free
# (+11 placeholders recovered). The remaining 10 fail on CHAINED project-SubVI
# connector-pane resolution ('Queue Manager.vi', 'Elapsed Time', 'Binary
# Actor.vi', deep 'VISA Configure Serial Port') -- an lvkit LabVIEW-free
# terminal-resolution depth limit (a project SubVI generates clean standalone
# yet its connector pane can't always be resolved when called), identical on
# both legs, NOT a vi.lib gap. --vilib recovers the direct VISA/vi.lib VIs;
# --search-path recovers directly-loadable project SubVIs.
#
# Env overrides: DERIVE_VILIB (vi.lib path), DERIVE_SHA (born commit).
$log = 'C:\sweep-result.txt'
function step($m) { Add-Content -Path $log -Value $m }
Set-Content -Path $log -Value ('[sweep] ' + (Get-Date -Format o)) -Encoding utf8
$vilib = if ($env:DERIVE_VILIB) { $env:DERIVE_VILIB } else { 'C:\Program Files\National Instruments\LabVIEW 2026\vi.lib' }
$born  = if ($env:DERIVE_SHA) { $env:DERIVE_SHA } else { '06939af' }
& git config --global --add safe.directory C:\corpus 2>&1 | Out-Null

# Enumerate the born-commit VI set (all .vi present at $born).
$vis = & git -C C:\corpus ls-tree -r --name-only $born | Where-Object { $_ -like '*.vi' }
$tops = @($vis | ForEach-Object { ($_ -split '/')[0] } | Sort-Object -Unique)

# Pre-stage the born-commit subtrees into ONE writable tree so lvkit's
# .lvkit\cache extraction cache can be created (a read-only mount blocks it
# with WinError 5).
Remove-Item C:\vstage -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path C:\vstage | Out-Null
foreach ($top in $tops) {
  cmd /c ('git -C C:\corpus archive -o C:\vstage_' + $top + '.tar ' + $born + ' "' + $top + '"')
  & tar -xf ('C:\vstage_' + $top + '.tar') -C C:\vstage
}
step ('born=' + $born + '  vilib-exists=' + (Test-Path $vilib) + '  staged VIs=' + (Get-ChildItem C:\vstage -Recurse -Filter *.vi).Count)

$clean = 0; $err = 0
foreach ($vi in $vis) {
  $vi = $vi.Trim()
  Remove-Item C:\vout -Recurse -Force -ErrorAction SilentlyContinue
  New-Item -ItemType Directory -Force -Path C:\vout | Out-Null
  $staged = Join-Path C:\vstage ($vi -replace '/', '\')
  $secs = [int](Measure-Command { & lvkit generate $staged --load-mode minimal --vilib $vilib --search-path C:\vstage --placeholder-on-unresolved -o C:\vout 2>&1 | Out-Null }).TotalSeconds
  $prim = Get-ChildItem C:\vout -Recurse -Filter *.py -ErrorAction SilentlyContinue | Where-Object { $_.Name -ne '__init__.py' -and $_.Name -notlike '*.error.py' }
  $errf = Get-ChildItem C:\vout -Recurse -Filter *.error.py -ErrorAction SilentlyContinue | Select-Object -First 1
  $leaf = [IO.Path]::GetFileNameWithoutExtension($vi).ToLower().Replace(' ', '_').Replace('-', '_')
  $target = $prim | Where-Object { $_.BaseName -eq $leaf } | Select-Object -First 1
  if (-not $target) { $target = $prim | Select-Object -First 1 }
  if ($target -and -not $errf) {
    $lines = (([IO.File]::ReadAllText($target.FullName)) -replace "`r`n", "`n").TrimEnd("`n") -split "`n"
    step ('CLEAN  ' + $vi + '  primary=' + $target.Name + '  lines=' + $lines.Count + '  modules=' + $prim.Count + '  secs=' + $secs)
    $clean++
  } elseif ($errf) {
    $first = (([IO.File]::ReadAllText($errf.FullName)) -split "`n")[0]
    step ('ERROR  ' + $vi + '  (' + $errf.Name + ')  secs=' + $secs + '  :: ' + $first)
    $err++
  } else {
    step ('NOOUT  ' + $vi + '  secs=' + $secs)
    $err++
  }
}
step ('[sweep] TOTAL clean=' + $clean + '  error=' + $err + '  of ' + $vis.Count)
step '[sweep] done'

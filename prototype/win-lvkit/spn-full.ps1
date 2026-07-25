# WIN full-mode recovery test (post-#2373 fullmode-depth-recovery): retry the
# depth-limited SerialPortNuggets first-commit VIs (born @06939af) that failed
# --load-mode minimal, now with --load-mode full + real vi.lib. Run in the
# provisioned container lvkit-win-devtools-v2.2.1 with SPN mounted ro at C:\corpus.
#
# Result 2026-07-25 (lvkit 0.5.2): 1/10 fully CLEAN (Binary Instrument.vi, 74
# lines) + 9/10 with exactly ONE residual .error.py each (VISA Configure Serial
# Port x2, Queue Manager.vi x4, Elapsed Time x2, Binary Actor.vi x1), cleanmods
# 3..9 per VI. Full mode resolves the whole tree EXCEPT specific VI types lvkit
# cannot resolve LabVIEW-free: Actor-framework dynamic-dispatch VIs (clean
# standalone, connector pane unresolved when CALLED) and some vi.lib VIs reached
# TRANSITIVELY through a project chain. So the ceiling is VI-type, not load-mode.
$log = 'C:\spn-full-result.txt'
function step($m) { Add-Content -Path $log -Value $m }
Set-Content -Path $log -Value ('[spn-full] ' + (Get-Date -Format o)) -Encoding utf8
$vilib = 'C:\Program Files\National Instruments\LabVIEW 2026\vi.lib'
$born = '06939af'
& git config --global --add safe.directory C:\corpus 2>&1 | Out-Null
# Re-stage born subtrees writable.
Remove-Item C:\vstage -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path C:\vstage | Out-Null
foreach ($top in @('ASCII', 'Binary')) {
  cmd /c ('git -C C:\corpus archive -o C:\vstage_' + $top + '.tar ' + $born + ' "' + $top + '"')
  & tar -xf ('C:\vstage_' + $top + '.tar') -C C:\vstage
}
$vis = @(
  'ASCII/Actor/ASCII Actor Example.vi',
  'ASCII/Actor/ASCII Actor.vi',
  'ASCII/Actor/Request Data.vi',
  'ASCII/Actor/Stop Actor.vi',
  'ASCII/Instruments/ASCII Streaming Instrument.vi',
  'Binary/Actor/Binary Actor Example.vi',
  'Binary/Actor/Stop Actor.vi',
  'Binary/Actor/Write to Port.vi',
  'Binary/Instruments/Binary Instrument.vi',
  'Binary/Instruments/Binary Streaming Instrument.vi'
)
$clean = 0; $err = 0
foreach ($vi in $vis) {
  Remove-Item C:\vout -Recurse -Force -ErrorAction SilentlyContinue
  New-Item -ItemType Directory -Force -Path C:\vout | Out-Null
  $staged = Join-Path C:\vstage ($vi -replace '/', '\')
  $secs = [int](Measure-Command { & lvkit generate $staged --load-mode full --vilib $vilib --search-path C:\vstage --placeholder-on-unresolved -o C:\vout 2>&1 | Out-Null }).TotalSeconds
  $prim = Get-ChildItem C:\vout -Recurse -Filter *.py -ErrorAction SilentlyContinue | Where-Object { $_.Name -ne '__init__.py' -and $_.Name -notlike '*.error.py' }
  $errf = Get-ChildItem C:\vout -Recurse -Filter *.error.py -ErrorAction SilentlyContinue | Select-Object -First 1
  $errc = (Get-ChildItem C:\vout -Recurse -Filter *.error.py -ErrorAction SilentlyContinue).Count
  if ($prim -and -not $errf) {
    $target = $prim | Select-Object -First 1
    $lines = (([IO.File]::ReadAllText($target.FullName)) -replace "`r`n", "`n").TrimEnd("`n") -split "`n"
    step ('CLEAN  ' + $vi + '  primary=' + $target.Name + '  lines=' + $lines.Count + '  modules=' + $prim.Count + '  secs=' + $secs)
    $clean++
  } elseif ($errf) {
    $first = (([IO.File]::ReadAllText($errf.FullName)) -split "`n")[0]
    step ('ERROR  ' + $vi + '  errmods=' + $errc + '  cleanmods=' + $prim.Count + '  secs=' + $secs + '  :: ' + $first)
    $err++
  } else {
    step ('NOOUT  ' + $vi + '  secs=' + $secs)
    $err++
  }
}
step ('[spn-full] TOTAL clean=' + $clean + '  error=' + $err + '  of ' + $vis.Count)
step '[spn-full] done'

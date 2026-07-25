# WIN full-mode recovery test (post-#2373 fullmode-depth-recovery): the 4
# icon-editor first-commit VIs (born @fe98acb) under --load-mode full + real
# vi.lib. The born resource/plugins subtree (242 VIs) is staged into the
# container via the C:\out bind mount as ie-plugins.tar (git archive on the host:
#   git -C <icon-editor> archive -o ie-plugins.tar fe98acb "resource/plugins").
#
# Result 2026-07-25 (lvkit 0.5.2): 0/4 strictly-clean, but full mode resolves
# 10-35 clean modules PER VI with exactly ONE residual .error.py each:
#   lv_icon.vi 35+1 ('Call By Reference' primitive), MouseDown.vi 23+1
#   ('CoordinatesCorrection.vi'), PictureControl_MouseUp.vi 10+1
#   ('CoordinatesCorrection.vi'), MenuSelection(User).vi 24+1
#   ('Defer_FP_Updates.vi'). Confirms the ceiling is specific VI types /
#   constructs (Call-By-Reference node, dynamic-dispatch + malleable project
#   SubVIs) lvkit cannot resolve LabVIEW-free, NOT load-mode depth or vi.lib.
$log = 'C:\ie-full-result.txt'
function step($m) { Add-Content -Path $log -Value $m }
Set-Content -Path $log -Value ('[ie-full] ' + (Get-Date -Format o)) -Encoding utf8
$vilib = 'C:\Program Files\National Instruments\LabVIEW 2026\vi.lib'
if (-not (Test-Path C:\iestage)) {
  New-Item -ItemType Directory -Force -Path C:\iestage | Out-Null
  & tar -xf C:\out\ie-plugins.tar -C C:\iestage
}
step ('staged VIs=' + (Get-ChildItem C:\iestage -Recurse -Filter *.vi -ErrorAction SilentlyContinue).Count)
$vis = @(
  'resource/plugins/lv_icon.vi',
  'resource/plugins/NIIconEditor/Miscellaneous/Icon Editor/MouseDown.vi',
  'resource/plugins/NIIconEditor/Miscellaneous/Icon Editor/PictureControl_MouseUp.vi',
  'resource/plugins/NIIconEditor/Miscellaneous/Icon Editor/MenuSelection(User).vi'
)
$clean = 0; $err = 0
foreach ($vi in $vis) {
  Remove-Item C:\ieout -Recurse -Force -ErrorAction SilentlyContinue
  New-Item -ItemType Directory -Force -Path C:\ieout | Out-Null
  $staged = Join-Path C:\iestage ($vi -replace '/', '\')
  if (-not (Test-Path $staged)) { step ('MISSING ' + $vi); $err++; continue }
  $secs = [int](Measure-Command { & lvkit generate $staged --load-mode full --vilib $vilib --search-path C:\iestage --placeholder-on-unresolved -o C:\ieout 2>&1 | Out-Null }).TotalSeconds
  $prim = Get-ChildItem C:\ieout -Recurse -Filter *.py -ErrorAction SilentlyContinue | Where-Object { $_.Name -ne '__init__.py' -and $_.Name -notlike '*.error.py' }
  $errf = Get-ChildItem C:\ieout -Recurse -Filter *.error.py -ErrorAction SilentlyContinue | Select-Object -First 1
  $errc = (Get-ChildItem C:\ieout -Recurse -Filter *.error.py -ErrorAction SilentlyContinue).Count
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
step ('[ie-full] TOTAL clean=' + $clean + '  error=' + $err + '  of ' + $vis.Count)
step '[ie-full] done'

# WIN-leg parity check (#2372/#2373): reproduce LINUX's born-from-scratch generate
# in the 2026q1patch2-windows lvkit container and compare the primary-module Python
# sha256 against LINUX's Linux-container anchors. Same lvkit flags as LINUX
# (--load-mode minimal --no-auto-vilib --placeholder-on-unresolved), same staged
# filename (cur.vi), same lvkit 0.5.2. Reports raw + LF-normalized sha256 so a
# pure line-ending difference is distinguishable from a real divergence.
$log = 'C:\parity-result.txt'
function step($m) { Add-Content -Path $log -Value $m }
Set-Content -Path $log -Value ('[parity] ' + (Get-Date -Format o)) -Encoding utf8
$anchors = @(
  @{ vi = 'ASCII/Message/Write ASCII Message.vi';  expect = '1ae816a0c502b80959e6f872' },
  @{ vi = 'Binary/Message/Verify Checksum.vi';     expect = 'cd291368511e6b8701c99f60' },
  @{ vi = 'Binary/Message/Write Binary Message.vi'; expect = '74b4117efcc7bc67b0177ada' }
)
& git config --global --add safe.directory C:\corpus 2>&1 | Out-Null
foreach ($a in $anchors) {
  Remove-Item C:\pout, C:\pwork -Recurse -Force -ErrorAction SilentlyContinue
  New-Item -ItemType Directory -Force -Path C:\pwork, C:\pout | Out-Null
  cmd /c ('git -C C:\corpus cat-file -p "06939af:' + $a.vi + '" > C:\pwork\cur.vi')
  & lvkit generate C:\pwork\cur.vi --load-mode minimal --no-auto-vilib --placeholder-on-unresolved -o C:\pout 2>&1 | Out-Null
  $py = Get-ChildItem C:\pout -Recurse -Filter *.py -ErrorAction SilentlyContinue | Where-Object { $_.Name -ne '__init__.py' -and $_.Name -notlike '*.error.py' } | Select-Object -First 1
  if (-not $py) {
    $err = Get-ChildItem C:\pout -Recurse -Filter *.error.py -ErrorAction SilentlyContinue | Select-Object -First 1
    step ($a.vi + '  -> NO clean primary module (error=' + ($err.Name) + ')')
    continue
  }
  $text = [IO.File]::ReadAllText($py.FullName)
  $rawSha = (Get-FileHash -Path $py.FullName -Algorithm SHA256).Hash.ToLower()
  $lf = $text -replace "`r`n", "`n"
  $sha = New-Object System.Security.Cryptography.SHA256Managed
  $lfSha = ([BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($lf))) -replace '-', '').ToLower()
  $lines = ($lf.TrimEnd("`n") -split "`n").Count
  $match = ($rawSha.StartsWith($a.expect)) -or ($lfSha.StartsWith($a.expect))
  step ($a.vi + '  module=' + $py.FullName.Substring(6) + '  lines=' + $lines + '  raw=' + $rawSha.Substring(0,24) + '  lf=' + $lfSha.Substring(0,24) + '  expect=' + $a.expect + '  MATCH=' + $match)
}
step '[parity] done'

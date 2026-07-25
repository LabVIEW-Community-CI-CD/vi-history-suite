# Enumerate distinct unresolved PRIMITIVE ids across the born SPN corpus (#2373):
# sizes the addressable set (identified ids, resolvable via .lvkit/primitives.json)
# vs the unaddressable id-0 holdouts. Run in lvkit-win-devtools-v2.2.1.
#
# Result 2026-07-25 (lvkit 0.5.2), distinct primitives across 26 born VIs:
#   1925 unknown_primitive_1925  x15   (identified -> addressable)
#   1926 unknown_primitive_1926  x12   (VISA Write; mapped -> flips 3 VIs clean)
#   1922 unknown_primitive_1922  x8    (identified -> addressable)
#   0    hiddenFBNode            x5    (UNidentified feedback node -> NOT addressable)
#   1506 unknown_primitive_1506  x3    (identified -> addressable)
#   1187 unknown_primitive_1187  x3    (identified -> addressable)
#   0    Class018D               x2    (dynamic-dispatch class node -> NOT addressable)
# So 5 identified ids cover the bulk; only the id-0 Actor/dynamic nodes are the
# upstream-lvkit holdout. Primitive ids are leg-independent (same on Linux).
$log = 'C:\prim-enum.txt'
$vilib = 'C:\Program Files\National Instruments\LabVIEW 2026\vi.lib'
$born = '06939af'
& git config --global --add safe.directory C:\corpus 2>&1 | Out-Null
if (-not (Test-Path C:\sstage)) {
  New-Item -ItemType Directory -Force -Path C:\sstage | Out-Null
  foreach ($top in @('ASCII', 'Binary')) {
    cmd /c ('git -C C:\corpus archive -o C:\sstage_' + $top + '.tar ' + $born + ' "' + $top + '"')
    & tar -xf ('C:\sstage_' + $top + '.tar') -C C:\sstage
  }
}
$vis = & git -C C:\corpus ls-tree -r --name-only $born | Where-Object { $_ -like '*.vi' }
$counts = @{}
foreach ($vi in $vis) {
  $vi = $vi.Trim()
  Remove-Item C:\eout -Recurse -Force -ErrorAction SilentlyContinue
  New-Item -ItemType Directory -Force -Path C:\eout | Out-Null
  $staged = Join-Path C:\sstage ($vi -replace '/', '\')
  & lvkit generate $staged --load-mode minimal --vilib $vilib --search-path C:\sstage --placeholder-on-unresolved -o C:\eout 2>&1 | Out-Null
  $mods = @(Get-ChildItem C:\eout -Recurse -Filter *.py -ErrorAction SilentlyContinue)
  foreach ($m in $mods) {
    $t = [IO.File]::ReadAllText($m.FullName)
    foreach ($mm in [regex]::Matches($t, "prim_id=(\d+),\s*prim_name='([^']+)'")) {
      $key = $mm.Groups[1].Value + '|' + $mm.Groups[2].Value
      if ($counts.ContainsKey($key)) { $counts[$key] = $counts[$key] + 1 } else { $counts[$key] = 1 }
    }
  }
}
Set-Content -Path $log -Value ('[prim-enum] ' + (Get-Date -Format o) + '  distinct primitives=' + $counts.Count) -Encoding utf8
foreach ($k in ($counts.Keys | Sort-Object { -$counts[$_] })) {
  Add-Content -Path $log -Value ('  prim ' + $k + '  occurrences=' + $counts[$k])
}
Add-Content -Path $log -Value '[prim-enum] done'
Get-Content $log

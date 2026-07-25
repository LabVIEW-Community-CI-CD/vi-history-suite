# STRICT re-measure (#2373 fullmode-depth-recovery): correct the born-from-scratch
# cleanliness counts. --placeholder-on-unresolved emits unresolved PRIMITIVES as
# an inline `raise PrimitiveResolutionNeeded` inside a normally-named .py (lvkit
# counts error:0, no .error.py file), while unresolved SUBVIs/vilib become
# .error.py files. A "no .error.py" heuristic therefore OVERCOUNTS clean. This
# classifies every born SPN VI strictly:
#   CLEAN         = 0 .error.py AND 0 inline `raise ...ResolutionNeeded(`
#   PRIM-RAISE    = 0 .error.py BUT >=1 inline primitive raise
#   SUBVI-ERROR   = >=1 .error.py file
#
# Result 2026-07-25 (lvkit 0.5.2, minimal + --vilib + writable-stage + search-path):
#   CLEAN=1 (Verify Checksum.vi)  PRIM-RAISE=15  SUBVI-ERROR=10  of 26.
# Dominant primitive: 1926 = VISA Write (recurs in write_ascii_message.py /
# write_binary_message.py); also hiddenFBNode (id 0, unidentified). The vi.lib
# delta moves VIs SUBVI-ERROR -> PRIM-RAISE, not to strictly clean.
$log = 'C:\strict-result.txt'
function step($m) { Add-Content -Path $log -Value $m }
Set-Content -Path $log -Value ('[strict] ' + (Get-Date -Format o)) -Encoding utf8
$vilib = 'C:\Program Files\National Instruments\LabVIEW 2026\vi.lib'
$born = '06939af'
& git config --global --add safe.directory C:\corpus 2>&1 | Out-Null
Remove-Item C:\sstage -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path C:\sstage | Out-Null
foreach ($top in @('ASCII', 'Binary')) {
  cmd /c ('git -C C:\corpus archive -o C:\sstage_' + $top + '.tar ' + $born + ' "' + $top + '"')
  & tar -xf ('C:\sstage_' + $top + '.tar') -C C:\sstage
}
$vis = & git -C C:\corpus ls-tree -r --name-only $born | Where-Object { $_ -like '*.vi' }
$clean = 0; $prim = 0; $suberr = 0
foreach ($vi in $vis) {
  $vi = $vi.Trim()
  Remove-Item C:\sout -Recurse -Force -ErrorAction SilentlyContinue
  New-Item -ItemType Directory -Force -Path C:\sout | Out-Null
  $staged = Join-Path C:\sstage ($vi -replace '/', '\')
  & lvkit generate $staged --load-mode minimal --vilib $vilib --search-path C:\sstage --placeholder-on-unresolved -o C:\sout 2>&1 | Out-Null
  $errFiles = @(Get-ChildItem C:\sout -Recurse -Filter *.error.py -ErrorAction SilentlyContinue)
  $mods = @(Get-ChildItem C:\sout -Recurse -Filter *.py -ErrorAction SilentlyContinue | Where-Object { $_.Name -ne '__init__.py' -and $_.Name -notlike '*.error.py' })
  $inlineRaise = @()
  foreach ($m in $mods) { if (([IO.File]::ReadAllText($m.FullName)) -match 'raise\s+\w*ResolutionNeeded\s*\(') { $inlineRaise += $m.Name } }
  if ($errFiles.Count -gt 0) {
    $suberr++
    step ('SUBVI-ERROR  ' + $vi + '  errfiles=' + $errFiles.Count + '  inlineRaise=' + $inlineRaise.Count)
  } elseif ($inlineRaise.Count -gt 0) {
    $prim++
    $names = ($inlineRaise -join ',')
    step ('PRIM-RAISE   ' + $vi + '  raiseMods=' + $names)
  } else {
    $clean++
    step ('CLEAN        ' + $vi + '  modules=' + $mods.Count)
  }
}
step ('[strict] TOTAL  CLEAN=' + $clean + '  PRIM-RAISE=' + $prim + '  SUBVI-ERROR=' + $suberr + '  of ' + $vis.Count)
step '[strict] done'

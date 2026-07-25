# Measure the .lvkit/primitives.json lever (#2373): apply a cleanroom-style 1926
# (VISA Write) mapping and re-run the strict SPN classification with the store
# active (--project-root), to quantify how many PRIM-RAISE born VIs flip to
# strictly CLEAN. Primitive mappings are leg-independent (apply to Linux too).
#
# Result 2026-07-25 (lvkit 0.5.2, 1926 mapping only): CLEAN 1 -> 4 (+3: Write
# ASCII Message, ASCII Command-Response, Write Binary Message), PRIM-RAISE 15 ->
# 12, SUBVI-ERROR 10. Mapping the other identified ids (1925/1922/1506/1187)
# would flip more; only the id-0 hiddenFBNode/Class018D Actor VIs stay.
#
# LICENSE BOUNDARY (lvkit .lvkit/ README): mappings DERIVED FROM vi.lib block
# diagrams are licensed material and must be gitignored / never committed to a
# public repo. The stub below is derived only from the raise DIAGNOSTIC
# (terminals) + public VISA Write passthrough semantics, i.e. cleanroom.
$log = 'C:\strict-mapped.txt'
function step($m) { Add-Content -Path $log -Value $m }
Set-Content -Path $log -Value ('[strict-mapped] ' + (Get-Date -Format o)) -Encoding utf8
$vilib = 'C:\Program Files\National Instruments\LabVIEW 2026\vi.lib'
$born = '06939af'
$utf8 = New-Object Text.UTF8Encoding $false
& git config --global --add safe.directory C:\corpus 2>&1 | Out-Null
Remove-Item C:\mstage -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path C:\mstage | Out-Null
foreach ($top in @('ASCII', 'Binary')) {
  cmd /c ('git -C C:\corpus archive -o C:\mstage_' + $top + '.tar ' + $born + ' "' + $top + '"')
  & tar -xf ('C:\mstage_' + $top + '.tar') -C C:\mstage
}
& lvkit setup --no-skills C:\mstage 2>&1 | Out-Null
$json = '{' +
  '"metadata":{"description":"proj-local 1926 VISA Write cleanroom stub","source":"raise diagnostic + public VISA Write passthrough semantics (not vi.lib diagram)"},' +
  '"primitives":{' +
    '"1926":{"name":"VISA Write",' +
      '"terminals":[' +
        '{"index":0,"direction":"out","name":"error_out","type":"Cluster"},' +
        '{"index":2,"direction":"out","name":"return_count","type":"NumUInt32"},' +
        '{"index":3,"direction":"out","name":"visa_resource_out","type":"Refnum"},' +
        '{"index":8,"direction":"in","name":"error_in","type":"Cluster"},' +
        '{"index":10,"direction":"in","name":"message","type":"String"},' +
        '{"index":11,"direction":"in","name":"visa_resource_in","type":"Refnum"}],' +
      '"python_code":{"visa_resource_out":"in_11","return_count":"len(in_10)","error_out":"in_8"}}' +
  '}}'
[IO.File]::WriteAllText('C:\mstage\.lvkit\primitives.json', $json, $utf8)

$vis = & git -C C:\corpus ls-tree -r --name-only $born | Where-Object { $_ -like '*.vi' }
$clean = 0; $prim = 0; $suberr = 0
foreach ($vi in $vis) {
  $vi = $vi.Trim()
  Remove-Item C:\mout -Recurse -Force -ErrorAction SilentlyContinue
  New-Item -ItemType Directory -Force -Path C:\mout | Out-Null
  $staged = Join-Path C:\mstage ($vi -replace '/', '\')
  & lvkit generate $staged --load-mode minimal --project-root C:\mstage --vilib $vilib --search-path C:\mstage --placeholder-on-unresolved -o C:\mout 2>&1 | Out-Null
  $errFiles = @(Get-ChildItem C:\mout -Recurse -Filter *.error.py -ErrorAction SilentlyContinue)
  $mods = @(Get-ChildItem C:\mout -Recurse -Filter *.py -ErrorAction SilentlyContinue | Where-Object { $_.Name -ne '__init__.py' -and $_.Name -notlike '*.error.py' })
  $inlineRaise = @()
  foreach ($m in $mods) { if (([IO.File]::ReadAllText($m.FullName)) -match 'raise\s+\w*ResolutionNeeded\s*\(') { $inlineRaise += $m.Name } }
  if ($errFiles.Count -gt 0) { $suberr++; step ('SUBVI-ERROR  ' + $vi) }
  elseif ($inlineRaise.Count -gt 0) { $prim++; step ('PRIM-RAISE   ' + $vi + '  ' + ($inlineRaise -join ',')) }
  else { $clean++; step ('CLEAN        ' + $vi) }
}
step ('[strict-mapped] TOTAL  CLEAN=' + $clean + '  PRIM-RAISE=' + $prim + '  SUBVI-ERROR=' + $suberr + '  of ' + $vis.Count + '  (baseline was 1/15/10)')
step '[strict-mapped] done'

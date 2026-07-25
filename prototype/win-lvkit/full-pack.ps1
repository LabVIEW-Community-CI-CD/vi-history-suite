# CEILING measurement (#2375 item 1): map the FULL addressable primitive set
# (1925/1926/1922/1506/1187) and measure how many born SPN VIs reach strict-CLEAN.
# python_code is RESOLUTION-ONLY (refnum/error passthrough + type-defaults) from
# raise-diagnostic terminals + public API shape (NOT vi.lib block diagrams) --
# enough to measure the reachable ceiling; a SHIPPED pack needs real cleanroom
# semantics per primitive from public NI docs.
#
# Result 2026-07-25 (lvkit 0.5.2): strict CLEAN 1 -> 9 / 26 (baseline 1;
# 1926-only 4; full 5-id pack 9). PRIM-RAISE 15 -> 7 (remaining = id-0
# hiddenFBNode/Class018D Actor-VI holdouts + any deeper primitive unlocked by
# the pack). SUBVI-ERROR 10 (separate connector-pane-depth axis). So the
# addressable cleanroom primitive pack lifts strict-clean by +8; the residual is
# the id-0 upstream-lvkit holdout + the SubVI depth wall.
$log = 'C:\full-pack.txt'
function step($m) { Add-Content -Path $log -Value $m }
Set-Content -Path $log -Value ('[full-pack] ' + (Get-Date -Format o)) -Encoding utf8
$vilib = 'C:\Program Files\National Instruments\LabVIEW 2026\vi.lib'
$born = '06939af'
$utf8 = New-Object Text.UTF8Encoding $false
& git config --global --add safe.directory C:\corpus 2>&1 | Out-Null
Remove-Item C:\fstage -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path C:\fstage | Out-Null
foreach ($top in @('ASCII', 'Binary')) {
  cmd /c ('git -C C:\corpus archive -o C:\fstage_' + $top + '.tar ' + $born + ' "' + $top + '"')
  & tar -xf ('C:\fstage_' + $top + '.tar') -C C:\fstage
}
& lvkit setup --no-skills C:\fstage 2>&1 | Out-Null
$json = '{"metadata":{"description":"resolution-only ceiling pack (1925/1926/1922/1506/1187)","source":"raise-diagnostic terminals + public API shape; NOT vi.lib diagrams; semantics=resolution-stub"},"primitives":{' +
  '"1926":{"name":"VISA Write","terminals":[{"index":0,"direction":"out","name":"error_out","type":"Cluster"},{"index":2,"direction":"out","name":"return_count","type":"NumUInt32"},{"index":3,"direction":"out","name":"visa_resource_out","type":"Refnum"},{"index":8,"direction":"in","name":"error_in","type":"Cluster"},{"index":10,"direction":"in","name":"message","type":"String"},{"index":11,"direction":"in","name":"visa_resource_in","type":"Refnum"}],"python_code":{"visa_resource_out":"in_11","return_count":"len(in_10)","error_out":"in_8"}},' +
  '"1925":{"name":"VISA Read","terminals":[{"index":0,"direction":"out","name":"error_out","type":"Cluster"},{"index":1,"direction":"out","name":"return_count","type":"NumUInt32"},{"index":2,"direction":"out","name":"read_buffer","type":"String"},{"index":3,"direction":"out","name":"visa_resource_out","type":"Refnum"},{"index":8,"direction":"in","name":"error_in","type":"Cluster"},{"index":10,"direction":"in","name":"byte_count","type":"NumUInt32"},{"index":11,"direction":"in","name":"visa_resource_in","type":"Refnum"}],"python_code":{"visa_resource_out":"in_11","read_buffer":"\"\"","return_count":"0","error_out":"in_8"}},' +
  '"1922":{"name":"VISA op (refnum+error)","terminals":[{"index":0,"direction":"out","name":"error_out","type":"Cluster"},{"index":8,"direction":"in","name":"error_in","type":"Cluster"},{"index":11,"direction":"in","name":"visa_resource_in","type":"Refnum"}],"python_code":{"error_out":"in_8"}},' +
  '"1506":{"name":"format-to-string","terminals":[{"index":0,"direction":"out","name":"out_string","type":"String"},{"index":1,"direction":"in","name":"a","type":"Boolean"},{"index":2,"direction":"in","name":"b","type":"NumInt16"},{"index":3,"direction":"in","name":"c","type":"NumInt16"},{"index":4,"direction":"in","name":"d","type":"NumFloat64"}],"python_code":{"out_string":"\"\""}},' +
  '"1187":{"name":"parse-number","terminals":[{"index":0,"direction":"out","name":"out_float","type":"NumFloat64"},{"index":1,"direction":"out","name":"out_int","type":"NumInt32"},{"index":2,"direction":"in","name":"a","type":"Boolean"},{"index":3,"direction":"in","name":"b","type":"NumFloat64"},{"index":4,"direction":"in","name":"c","type":"NumInt32"},{"index":5,"direction":"in","name":"d","type":"String"}],"python_code":{"out_float":"0.0","out_int":"0"}}' +
  '}}'
[IO.File]::WriteAllText('C:\fstage\.lvkit\primitives.json', $json, $utf8)
$vis = & git -C C:\corpus ls-tree -r --name-only $born | Where-Object { $_ -like '*.vi' }
$clean = 0; $prim = 0; $suberr = 0
foreach ($vi in $vis) {
  $vi = $vi.Trim()
  Remove-Item C:\fmout -Recurse -Force -ErrorAction SilentlyContinue
  New-Item -ItemType Directory -Force -Path C:\fmout | Out-Null
  $staged = Join-Path C:\fstage ($vi -replace '/', '\')
  & lvkit generate $staged --load-mode minimal --project-root C:\fstage --vilib $vilib --search-path C:\fstage --placeholder-on-unresolved -o C:\fmout 2>&1 | Out-Null
  $errFiles = @(Get-ChildItem C:\fmout -Recurse -Filter *.error.py -ErrorAction SilentlyContinue)
  $mods = @(Get-ChildItem C:\fmout -Recurse -Filter *.py -ErrorAction SilentlyContinue | Where-Object { $_.Name -ne '__init__.py' -and $_.Name -notlike '*.error.py' })
  $raise = @()
  foreach ($m in $mods) { if (([IO.File]::ReadAllText($m.FullName)) -match 'raise\s+\w*ResolutionNeeded\s*\(') { $raise += $m.Name } }
  if ($errFiles.Count -gt 0) { $suberr++; step ('SUBVI-ERROR  ' + $vi) }
  elseif ($raise.Count -gt 0) { $prim++; step ('PRIM-RAISE   ' + $vi + '  ' + ($raise -join ',')) }
  else { $clean++; step ('CLEAN        ' + $vi) }
}
step ('[full-pack] TOTAL  CLEAN=' + $clean + '  PRIM-RAISE=' + $prim + '  SUBVI-ERROR=' + $suberr + '  of ' + $vis.Count + '  (baseline 1/15/10; 1926-only 4/12/10)')
step '[full-pack] done'

# WIN parity leg for #2374 relay-pr-review-router (deterministic anchor): on the
# Windows container, run lvkit diff for the 9 modified icon-editor VIs over range
# 537683..fc09736 and compare the change counts to LINUX's authoritative list,
# and generate the 2 born (renamed) VIs. The ollama model prose is NOT run here
# (no ollama on the container, and prose is nondeterministic by design) -- this
# validates the DETERMINISTIC grounding anchor both legs must agree on, which is
# what LINUX's grounding-faithfulness guard (assessFaithful) is built on.
#
# Result 2026-07-25 (lvkit 0.5.2): DIFF parity 9/9 MATCH vs LINUX
# (0/0/0/0/1/6/13/4/6) -- change counts byte-identical cross-leg. The 2 born VIs
# (Read/Write Glyphs from File.vi) are SUBVI-ERROR on Windows too, missing the
# project SubVI 'Get LV Glyph Path.vi' (a connector-pane depth residual, same on
# both legs). Stage: git archive {537683,fc09736} "resource/plugins" "Test" ->
# ie-base.tar / ie-sel.tar via the C:\out bind mount.
$log = 'C:\parity2374.txt'
function step($m) { Add-Content -Path $log -Value $m }
Set-Content -Path $log -Value ('[parity2374] ' + (Get-Date -Format o)) -Encoding utf8
$vilib = 'C:\Program Files\National Instruments\LabVIEW 2026\vi.lib'
if (-not (Test-Path C:\iebase)) { New-Item -ItemType Directory -Force -Path C:\iebase | Out-Null; & tar -xf C:\out\ie-base.tar -C C:\iebase }
if (-not (Test-Path C:\iesel)) { New-Item -ItemType Directory -Force -Path C:\iesel | Out-Null; & tar -xf C:\out\ie-sel.tar -C C:\iesel }

$changed = @(
  @{ p = 'Test\Templates\VI Template.vi'; exp = 0 },
  @{ p = 'resource\plugins\NIIconEditor\Class\FakedArray\Misc\Process Template Graphics.vi'; exp = 0 },
  @{ p = 'resource\plugins\NIIconEditor\Class\Icon Library\Initialization\Glyphs Initialization.vi'; exp = 0 },
  @{ p = 'resource\plugins\NIIconEditor\Miscellaneous\Graphics\LoadTemplates.vi'; exp = 0 },
  @{ p = 'resource\plugins\NIIconEditor\Miscellaneous\Icon Editor\MenuSelection(User).vi'; exp = 1 },
  @{ p = 'resource\plugins\NIIconEditor\Miscellaneous\Icon Editor\MouseDown.vi'; exp = 6 },
  @{ p = 'resource\plugins\NIIconEditor\Miscellaneous\Icon Editor\PictureControl_MouseUp.vi'; exp = 13 },
  @{ p = 'resource\plugins\NIIconEditor\Miscellaneous\Tools\VisibleTextMarker.vi'; exp = 4 },
  @{ p = 'resource\plugins\lv_icon.vi'; exp = 6 }
)
$born = @(
  'resource\plugins\NIIconEditor\Miscellaneous\Load Unload\Read Glyphs from File.vi',
  'resource\plugins\NIIconEditor\Miscellaneous\Load Unload\Write Glyphs to File.vi'
)
$match = 0; $mismatch = 0
step '=== DIFF parity (changes.Count vs LINUX expected) ==='
foreach ($c in $changed) {
  $b = Join-Path C:\iebase $c.p
  $s = Join-Path C:\iesel $c.p
  $n = -1
  if ((Test-Path $b) -and (Test-Path $s)) {
    $j = (& lvkit diff $b $s --format json --load-mode minimal --no-auto-vilib 2>$null | Out-String)
    try { $n = ($j | ConvertFrom-Json).changes.Count } catch { $n = -1 }
  }
  $leaf = Split-Path $c.p -Leaf
  if ($n -eq $c.exp) { $match++; step ('  MATCH     ' + $leaf + '  win=' + $n + '  linux=' + $c.exp) }
  else { $mismatch++; step ('  MISMATCH  ' + $leaf + '  win=' + $n + '  linux=' + $c.exp) }
}
step ('DIFF parity: MATCH=' + $match + '  MISMATCH=' + $mismatch + '  of ' + $changed.Count)
step '=== BORN generates (sel-side, --vilib) ==='
foreach ($vp in $born) {
  Remove-Item C:\pgout -Recurse -Force -ErrorAction SilentlyContinue
  New-Item -ItemType Directory -Force -Path C:\pgout | Out-Null
  $s = Join-Path C:\iesel $vp
  if (-not (Test-Path $s)) { step ('  MISSING  ' + (Split-Path $vp -Leaf)); continue }
  & lvkit generate $s --load-mode minimal --vilib $vilib --search-path C:\iesel --placeholder-on-unresolved -o C:\pgout 2>&1 | Out-Null
  $errFiles = @(Get-ChildItem C:\pgout -Recurse -Filter *.error.py -ErrorAction SilentlyContinue)
  $mods = @(Get-ChildItem C:\pgout -Recurse -Filter *.py -ErrorAction SilentlyContinue | Where-Object { $_.Name -ne '__init__.py' -and $_.Name -notlike '*.error.py' })
  $raise = @()
  foreach ($m in $mods) { if (([IO.File]::ReadAllText($m.FullName)) -match 'raise\s+\w*ResolutionNeeded\s*\(') { $raise += $m.Name } }
  $cat = 'CLEAN'
  if ($errFiles.Count -gt 0) { $cat = 'SUBVI-ERROR(' + $errFiles.Count + ')' } elseif ($raise.Count -gt 0) { $cat = 'PRIM-RAISE(' + ($raise -join ',') + ')' }
  step ('  ' + (Split-Path $vp -Leaf) + '  => ' + $cat + '  modules=' + $mods.Count)
}
step '[parity2374] done'

<#
  poll-lin.ps1 -- wait on the collab bus (GitHub discussion #2365, via prototype/collab.mjs)
  for a LINUX reply, then print the new messages. PowerShell sibling of poll-lin.sh; this is
  the one a WIN (Windows) agent runs to wait on the LINUX agent after a handoff.

  Symmetric set for iterative WIN<->LINUX agent development:
    poll-win.sh / poll-win.ps1  -- wait for a WIN-VITLT reply (bash / PowerShell)
    poll-lin.sh / poll-lin.ps1  -- wait for a LINUX reply    (bash / PowerShell)
  Pick the shell your host runs and the target = the OTHER agent you handed off to.

  Robust to collab.mjs `poll --new` marker semantics: gates on the message TIMESTAMP
  (not the marker), so a re-shown older message never false-triggers and a body that
  merely mentions the other agent never matches (the tag must follow "] ").

  Usage:  pwsh prototype/poll-lin.ps1 [-Max 40] [-Sleep 45]
  Env:    VIHS_COLLAB_AGENT  poller identity for collab.mjs (default WIN)
          VIHS_POLL_SINCE    ISO-8601 cutoff; a target message AFTER it counts (default 6 min ago)
  Exit:   0 reply seen (messages printed) | 2 no reply within the budget
#>
param([int]$Max = 40, [int]$Sleep = 45)
$ErrorActionPreference = 'SilentlyContinue'
Set-Location (& git rev-parse --show-toplevel)
$target = 'LINUX'
if (-not $env:VIHS_COLLAB_AGENT) { $env:VIHS_COLLAB_AGENT = 'WIN' }
$cutoff = if ($env:VIHS_POLL_SINCE) { $env:VIHS_POLL_SINCE } else { (Get-Date).ToUniversalTime().AddMinutes(-6).ToString('yyyy-MM-ddTHH:mm:ssZ') }
Write-Host "[poll-lin] waiting for a $target message after $cutoff (agent=$($env:VIHS_COLLAB_AGENT))"
for ($i = 1; $i -le $Max; $i++) {
  $out = (& node prototype/collab.mjs poll --new 2>$null) | Where-Object { $_ -notmatch 'origin not a valid' }
  $ts = ($out |
    Where-Object { $_ -match "\]\s$target\s" } |
    ForEach-Object { if ($_ -match '(20\d{2}-\d{2}-\d{2}T[\d:.]+Z)') { $matches[1] } } |
    Sort-Object | Select-Object -Last 1)
  if ($ts -and ($ts -gt $cutoff)) {
    Write-Host "[poll-lin] $target replied (poll $i, ${ts}):"
    $out | ForEach-Object { Write-Host $_ }
    exit 0
  }
  $seen = if ($ts) { $ts } else { 'none' }
  Write-Host "[poll-lin] poll $i/${Max}: no new $target (latest=$seen); sleeping ${Sleep}s"
  Start-Sleep -Seconds $Sleep
}
Write-Host "[poll-lin] no $target reply after $Max polls"
exit 2

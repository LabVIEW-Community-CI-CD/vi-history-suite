#!/usr/bin/env bash
# VHS-REQ-699 (vagrant lane instrumentation): follow a guest driver's granular
# progress log without disturbing the running driver.
#
# WinRM buffers a driver's stdout until exit, so this tails the append-only NDJSON
# progress log the instrumented guest drivers write (see vagrant/lib/guestProgress.cjs)
# from a SEPARATE WinRM session and pretty-prints the last N events plus a live
# LabVIEW/LabVIEWCLI process snapshot.
#
# Usage:
#   vagrant/follow-guest-progress.sh [LOG_PATH] [TAIL_LINES]
# Defaults: LOG_PATH=C:\vihs-proof-tmp\req699-win-progress.ndjson  TAIL_LINES=15
#
# Requires VAGRANT_HOME / VAGRANT_CWD to be set for the Windows guest (as the
# other lane commands do).
set -euo pipefail

LOG_PATH="${1:-C:\\vihs-proof-tmp\\req699-win-progress.ndjson}"
TAIL_LINES="${2:-15}"

VAGRANT_HOME="${VAGRANT_HOME:-$HOME/.vagrant.d-ext4}"
VAGRANT_CWD="${VAGRANT_CWD:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}"
export VAGRANT_HOME VAGRANT_CWD

# One short WinRM read: process snapshot + last N progress lines. The guest emits
# the log as UTF-8 NDJSON; we print raw lines so the caller can eyeball or pipe
# through jq/python.
timeout 90 vagrant winrm -c "
(Get-Process LabVIEWCLI -ErrorAction SilentlyContinue | Measure-Object).Count | ForEach-Object { 'procs.LabVIEWCLI=' + \$_ }
(Get-Process LabVIEW -ErrorAction SilentlyContinue | Measure-Object).Count | ForEach-Object { 'procs.LabVIEW=' + \$_ }
if (Test-Path '${LOG_PATH}') { '--- progress (last ${TAIL_LINES}) ---'; Get-Content -Tail ${TAIL_LINES} '${LOG_PATH}' } else { 'progress log not present yet: ${LOG_PATH}' }
" 2>&1 | tail -$((TAIL_LINES + 6))

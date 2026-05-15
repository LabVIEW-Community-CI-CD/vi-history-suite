# Vagrant Runner Readiness Timer Decision - 2026-05-15

The retained readiness history supports keeping the user-mode systemd readiness
timer at `OnUnitActiveSec=5min` (`300` seconds). The timer remains an early
warning surface; GitLab `vagrant_runner_admission` remains the immediate
fail-closed gate before Vagrant boot.

## Source

- Command: `npm run vagrant:runner:readiness:history -- --root /home/sergio/.gitlab-runner/receipts/vagrant-acceptance-readiness --json`
- Receipt root: `/home/sergio/.gitlab-runner/receipts/vagrant-acceptance-readiness`
- Recorded at: `2026-05-15T05:48:19.771Z`
- Local recorded date: `2026-05-14`
- Source schema: `vi-history-suite/vagrant-runner-readiness-history@v1`

## Evidence Summary

- Receipt count: `212`
- First receipt: `2026-05-14T07:57:37.912Z`
- Last receipt: `2026-05-15T05:46:53.676Z`
- Status counts: `161` passed, `44` failed, `7` busy
- Interval seconds min/p50/p90/p95/max: `12 / 330 / 330 / 330 / 8727`
- Active-storage drift receipts: `5`
- Active-storage drift incidents: `1`
- Worst active-storage detection window: `687` seconds
- Worst active-storage recovery window: `253` seconds
- Busy-context receipts: `39` (`23` runner-busy, `16` golden-VM-active)

## Decision

Keep the current `300` second timer.

The history shows active-root drift was detected by retained receipts, but the
same history also contains substantial expected busy-state evidence while the
disposable Vagrant VM or golden VM was intentionally active. Shortening the
periodic timer would mostly increase noisy busy receipts unless a separate
busy-aware adaptive policy is designed first.

The next review should wait for either more real active-storage drift incidents
or a separate adaptive timer design. No cadence change is admitted from this
evidence alone.

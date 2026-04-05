# HARNESS-VHS-002 Comparable Prefix Benchmark Packet

- Generated at: 2026-04-05T21:50:14.318Z
- Proof state: bounded-prefix-comparable
- Target: resource/plugins/lv_icon.vi
- Full window: 139 commits / 138 pairs
- Comparable prefix: 129 commits / 128 pairs
- Last comparable pair id: 87792a7b6545

## Windows Host

- Latest run: /mnt/c/Users/sveld/AppData/Roaming/Code/User/workspaceStorage/0bca0972b9105eae5fae72858e3399d0/svelderrainruiz.vi-history-suite/dashboards/latest-dashboard-run.json
- Dashboard JSON: /mnt/c/Users/sveld/AppData/Roaming/Code/User/workspaceStorage/0bca0972b9105eae5fae72858e3399d0/svelderrainruiz.vi-history-suite/dashboards/96d52f06697b/2ce533d51193/242c931b6588/dashboard.json
- Validated comparable pairs: 128
- Prefix runtime total: 4210919 ms

## Linux Host

- Latest summary: /mnt/c/Users/sveld/AppData/Local/VI History Suite/host-linux-dashboard-benchmark/workspace-stage/current/.cache/github-experiments/linux-dashboard-benchmark/HARNESS-VHS-002/latest-summary.json
- Dashboard JSON: /mnt/c/Users/sveld/AppData/Local/VI History Suite/host-linux-dashboard-benchmark/workspace-stage/current/.cache/harness-reports/HARNESS-VHS-002/workspace-storage/dashboards/5ae492b4571b/4053fc0e2e30/242c931b6588/dashboard.json
- Validated comparable pairs: 134
- Prefix runtime total: 442451 ms
- Full-window outcome: pair 135 / 138 :: command-exited-nonzero (linux-headless-recursive-load)

## Windows Benchmark Image

- Latest summary: /mnt/c/Users/sveld/AppData/Local/VI History Suite/windows-benchmark-image-proof/cache/github-experiments/windows-dashboard-benchmark/HARNESS-VHS-002/latest-summary.json
- Dashboard JSON: /mnt/c/Users/sveld/AppData/Local/VI History Suite/windows-benchmark-image-proof/cache/harness-reports/HARNESS-VHS-002/workspace-storage/dashboards/a1fa155b16ea/0ded7fc226bb/5f642f6f0eef/dashboard.json
- State: bounded-blocked
- Image ref: ghcr.io/svelderrainruiz/vi-history-suite-source-experiments/windows-dashboard-benchmark:sha-b679b8761f09df3f39d1a2d35addad2aaf0654b9
- Validated comparable pairs: 128
- Prefix runtime total: 464798 ms
- Full-window outcome: pair 129 / 138 :: command-exited-nonzero (labview-cli-call-by-reference)

## Windows Exact-Pair Diagnosis

- labview-cli: 6dd65df67428 -> 3408654e6802 :: command-exited-nonzero (labview-cli-call-by-reference)
- labview-cli proof root: /mnt/c/Users/sveld/AppData/Local/VI History Suite/windows-benchmark-image-pair129-labviewcli
- labview-cli report: /mnt/c/Users/sveld/AppData/Local/VI History Suite/windows-benchmark-image-pair129-labviewcli/cache/harness-reports/HARNESS-VHS-002/comparison-report-smoke.json
- labview-cli selected LabVIEW.ini: none
- labview-cli selected LabVIEW TCP port: none
- labview-cli recovery exit code: 1
- labview-cli recovery stdout: C:\workspace\.cache\harness-reports\HARNESS-VHS-002\workspace-storage\reports\a1fa155b16ea\0ded7fc226bb\headless-session-reset-stdout.txt
- labview-cli recovery stderr: C:\workspace\.cache\harness-reports\HARNESS-VHS-002\workspace-storage\reports\a1fa155b16ea\0ded7fc226bb\headless-session-reset-stderr.txt
- lvcompare: 6dd65df67428 -> 3408654e6802 :: command-timed-out
- lvcompare proof root: /mnt/c/Users/sveld/AppData/Local/VI History Suite/windows-benchmark-image-pair129-lvcompare
- lvcompare report: /mnt/c/Users/sveld/AppData/Local/VI History Suite/windows-benchmark-image-pair129-lvcompare/cache/harness-reports/HARNESS-VHS-002/comparison-report-smoke.json
- lvcompare selected LabVIEW.ini: none
- lvcompare selected LabVIEW TCP port: none
- lvcompare recovery exit code: none
- lvcompare recovery stdout: none
- lvcompare recovery stderr: none

## Comparison

- Linux / Windows runtime ratio: 0.1051
- Windows / Linux speedup factor: 9.5173
- Runtime delta: 3768468 ms

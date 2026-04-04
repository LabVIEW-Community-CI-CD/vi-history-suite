#!/usr/bin/env bash
set -euo pipefail

cd /workspace

git config --global --add safe.directory /workspace

echo "VIHS_PROGRESS: Installing benchmark workspace dependencies."
npm ci
echo "VIHS_PROGRESS: Compiling benchmark workspace."
npm run compile

args=(
  --harness-id
  "${VIHS_GITHUB_BENCHMARK_HARNESS_ID:-HARNESS-VHS-001}"
)

if [[ -n "${VIHS_GITHUB_BENCHMARK_DASHBOARD_COMMIT_WINDOW:-}" ]]; then
  args+=(
    --dashboard-commit-window
    "${VIHS_GITHUB_BENCHMARK_DASHBOARD_COMMIT_WINDOW}"
  )
fi

if [[ -n "${VIHS_GITHUB_BENCHMARK_ENGINE:-}" ]]; then
  args+=(
    --engine
    "${VIHS_GITHUB_BENCHMARK_ENGINE}"
  )
fi

if [[ -n "${VIHS_GITHUB_BENCHMARK_LABVIEW_CLI_PATH:-}" ]]; then
  args+=(
    --labview-cli-path
    "${VIHS_GITHUB_BENCHMARK_LABVIEW_CLI_PATH}"
  )
fi

if [[ -n "${VIHS_GITHUB_BENCHMARK_LABVIEW_EXE_PATH:-}" ]]; then
  args+=(
    --labview-exe-path
    "${VIHS_GITHUB_BENCHMARK_LABVIEW_EXE_PATH}"
  )
fi

if [[ -n "${VIHS_GITHUB_BENCHMARK_LVCOMPARE_PATH:-}" ]]; then
  args+=(
    --lvcompare-path
    "${VIHS_GITHUB_BENCHMARK_LVCOMPARE_PATH}"
  )
fi

if [[ "${VIHS_GITHUB_BENCHMARK_STRICT_RSRC_HEADER:-false}" == "true" ]]; then
  args+=(--strict-rsrc-header)
fi

benchmark_cmd=(
  node
  out/cli/runGitHubLinuxDashboardBenchmark.js
  "${args[@]}"
)

echo "VIHS_PROGRESS: Starting GitHub Linux dashboard benchmark."

if command -v xvfb-run >/dev/null 2>&1; then
  export VIHS_GITHUB_BENCHMARK_HEADLESS_DISPLAY_PROVIDER="xvfb-run"
  xvfb-run \
    --auto-servernum \
    --server-args="${VIHS_GITHUB_BENCHMARK_XVFB_SERVER_ARGS:--screen 0 1920x1080x24}" \
    "${benchmark_cmd[@]}"
elif [[ -n "${DISPLAY:-}" ]]; then
  export VIHS_GITHUB_BENCHMARK_HEADLESS_DISPLAY_PROVIDER="host-display"
  "${benchmark_cmd[@]}"
else
  export VIHS_GITHUB_BENCHMARK_HEADLESS_DISPLAY_PROVIDER="none"
  "${benchmark_cmd[@]}"
fi

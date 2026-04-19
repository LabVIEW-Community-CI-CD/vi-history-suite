#!/usr/bin/env bash
set -euo pipefail

RUNNER_BIN="$HOME/gitlab-runner/bin/gitlab-runner"
CONFIG="$HOME/.gitlab-runner/config.toml"
LOG_DIR="$HOME/gitlab-runner/logs"

mkdir -p "$LOG_DIR"

if [ ! -x "$RUNNER_BIN" ] || [ ! -f "$CONFIG" ]; then
  exit 0
fi

if pgrep -af "$RUNNER_BIN run --config $CONFIG" >/dev/null; then
  exit 0
fi

nohup "$RUNNER_BIN" run --config "$CONFIG" >>"$LOG_DIR/stdout.log" 2>>"$LOG_DIR/stderr.log" </dev/null &

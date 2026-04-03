#!/usr/bin/env bash
set -euo pipefail

cd /workspace

if [[ ! -f package.json ]]; then
  echo "Documentation workbench expected a repo-mounted package.json under /workspace." >&2
  exit 1
fi

if [[ ! -d node_modules ]]; then
  npm ci
fi

exec "$@"

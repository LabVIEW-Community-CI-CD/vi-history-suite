#!/usr/bin/env bash
set -euo pipefail

workspace_root="${VIHS_DOCS_WORKSPACE:-/workspace}"

cd "$workspace_root"

if [[ ! -f package.json ]]; then
  echo "Documentation workbench expected a repo-mounted package.json under ${workspace_root}." >&2
  exit 1
fi

if [[ ! -d node_modules ]]; then
  npm ci
fi

exec "$@"

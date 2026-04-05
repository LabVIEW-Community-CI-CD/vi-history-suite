#!/usr/bin/env bash
set -euo pipefail

resolve_workspace_root() {
  if [[ -n "${VIHS_DOCS_WORKSPACE:-}" ]]; then
    printf '%s\n' "${VIHS_DOCS_WORKSPACE}"
    return
  fi

  if [[ -n "${CI_PROJECT_DIR:-}" && -f "${CI_PROJECT_DIR}/package.json" ]]; then
    printf '%s\n' "${CI_PROJECT_DIR}"
    return
  fi

  if [[ -f "${PWD}/package.json" ]]; then
    printf '%s\n' "${PWD}"
    return
  fi

  printf '%s\n' "/workspace"
}

workspace_root="$(resolve_workspace_root)"

cd "$workspace_root"

if [[ ! -f package.json ]]; then
  echo "Documentation workbench expected a repo package.json under ${workspace_root}. Set VIHS_DOCS_WORKSPACE explicitly or run from GitLab CI with CI_PROJECT_DIR populated." >&2
  exit 1
fi

if [[ ! -d node_modules ]]; then
  npm ci
fi

exec "$@"

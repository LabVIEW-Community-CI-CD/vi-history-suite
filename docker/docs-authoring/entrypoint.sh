#!/usr/bin/env bash
set -euo pipefail

resolve_workspace_root() {
  if [[ -n "${CI_PROJECT_DIR:-}" && -f "${CI_PROJECT_DIR}/package.json" ]]; then
    printf '%s\n' "${CI_PROJECT_DIR}"
    return
  fi

  if [[ -n "${VIHS_DOCS_WORKSPACE:-}" ]]; then
    printf '%s\n' "${VIHS_DOCS_WORKSPACE}"
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

resolve_lockfile_hash() {
  if [[ ! -f package-lock.json ]]; then
    printf '%s\n' ""
    return
  fi

  sha256sum package-lock.json | awk '{print $1}'
}

bootstrap_node_modules_if_needed() {
  local lockfile_hash
  local stamp_path="node_modules/.vihs-docs-workbench-package-lock.sha256"
  local current_stamp=""

  lockfile_hash="$(resolve_lockfile_hash)"
  if [[ -z "${lockfile_hash}" ]]; then
    if [[ ! -d node_modules ]]; then
      npm ci
    fi
    return
  fi

  if [[ -n "${lockfile_hash}" && -f "${stamp_path}" ]]; then
    current_stamp="$(tr -d '\r\n' < "${stamp_path}")"
  fi

  if [[ ! -d node_modules || "${current_stamp}" != "${lockfile_hash}" ]]; then
    npm ci

    mkdir -p node_modules
    printf '%s\n' "${lockfile_hash}" > "${stamp_path}"
  fi
}

bootstrap_node_modules_if_needed

exec "$@"

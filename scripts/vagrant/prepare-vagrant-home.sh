#!/usr/bin/env bash
set -euo pipefail

# Keeps Vagrant's key/plugin home on a chmod-capable filesystem while allowing
# the large box payload cache to live on the governed Data drive.

VAGRANT_HOME_DIR="${VAGRANT_HOME:-$HOME/.vagrant.d}"
STORAGE_ROOT="${VIHS_VAGRANT_STORAGE_ROOT:-}"
BOX_CACHE_HOME="${VIHS_VAGRANT_BOX_CACHE_HOME:-}"

if [[ -z "$BOX_CACHE_HOME" && -n "$STORAGE_ROOT" ]]; then
  BOX_CACHE_HOME="$STORAGE_ROOT/vagrant-home"
fi

fail() {
  printf '[prepare-vagrant-home] ERROR: %s\n' "$*" >&2
  exit 1
}

info() {
  printf '[prepare-vagrant-home] %s\n' "$*"
}

ensure_chmod_capable_home() {
  local probe
  probe="$(mktemp "$VAGRANT_HOME_DIR/.chmod-probe.XXXXXX")"
  chmod 0600 "$probe" || fail "VAGRANT_HOME '$VAGRANT_HOME_DIR' does not support chmod"
  rm -f "$probe"
  info "VAGRANT_HOME supports chmod"
}

link_box_cache() {
  [[ -n "$BOX_CACHE_HOME" ]] || return 0
  [[ "$VAGRANT_HOME_DIR" != "$BOX_CACHE_HOME" ]] || return 0

  local target="$BOX_CACHE_HOME/boxes"
  local link="$VAGRANT_HOME_DIR/boxes"
  mkdir -p "$target"

  if [[ -L "$link" ]]; then
    local current_target
    current_target="$(readlink "$link")"
    if [[ "$current_target" == "$target" ]]; then
      info "Vagrant boxes already linked to $target"
      return 0
    fi
    fail "VAGRANT_HOME boxes link points at '$current_target', expected '$target'"
  fi

  if [[ -e "$link" ]]; then
    if [[ -d "$link" && -z "$(find "$link" -mindepth 1 -maxdepth 1 -print -quit)" ]]; then
      rmdir "$link"
    else
      fail "VAGRANT_HOME boxes path '$link' exists and is not an empty directory"
    fi
  fi

  ln -s "$target" "$link"
  info "Linked Vagrant boxes to $target"
}

mkdir -p "$VAGRANT_HOME_DIR"
info "vagrant-home=$VAGRANT_HOME_DIR"
if [[ -n "$BOX_CACHE_HOME" ]]; then
  info "box-cache-home=$BOX_CACHE_HOME"
fi
ensure_chmod_capable_home
link_box_cache

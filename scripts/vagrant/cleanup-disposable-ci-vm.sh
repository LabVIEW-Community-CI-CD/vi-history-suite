#!/usr/bin/env bash
set -euo pipefail

# Removes only the disposable Vagrant CI VM so a fresh import can reuse the
# governed CI VM name. The golden VM is never a valid cleanup target.

GOLDEN_VM_NAME="${VIHS_VAGRANT_GOLDEN_VM_NAME:-${VIHS_VIRTUALBOX_VM_NAME:-vihs-win11-labview2026-golden}}"
CI_VM_NAME="${VIHS_VAGRANT_CI_VM_NAME:-vihs-ci-win11}"
VAGRANT_DOTFILE_PATH_VALUE="${VAGRANT_DOTFILE_PATH:-.vagrant}"
EXPECTED_MACHINE_FOLDER="${VIHS_VIRTUALBOX_MACHINE_FOLDER:-}"
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/../.." && pwd)"
if [[ "$VAGRANT_DOTFILE_PATH_VALUE" = /* ]]; then
  VAGRANT_DOTFILE_ROOT="$VAGRANT_DOTFILE_PATH_VALUE"
else
  VAGRANT_DOTFILE_ROOT="$REPO_ROOT/vagrant/$VAGRANT_DOTFILE_PATH_VALUE"
fi
VAGRANT_MACHINE_ID_FILE="$VAGRANT_DOTFILE_ROOT/machines/default/virtualbox/id"

fail() {
  printf '[cleanup-disposable-ci-vm] ERROR: %s\n' "$*" >&2
  exit 1
}

info() {
  printf '[cleanup-disposable-ci-vm] %s\n' "$*"
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "$1 not found on PATH"
}

vm_exists() {
  VBoxManage list vms | awk -F '"' '{print $2}' | grep -Fx "$1" >/dev/null
}

vm_running() {
  VBoxManage list runningvms | awk -F '"' '{print $2}' | grep -Fx "$1" >/dev/null
}

vm_running_id() {
  local vm_id="$1"
  VBoxManage list runningvms | awk -F '[{}]' '{print $2}' | grep -Fx "$vm_id" >/dev/null
}

vm_name_from_id() {
  local vm_id="$1"
  VBoxManage showvminfo "$vm_id" --machinereadable 2>/dev/null |
    awk -F= '/^name=/{gsub(/"/, "", $2); print $2; exit}'
}

vm_config_from_id() {
  local vm_id="$1"
  VBoxManage showvminfo "$vm_id" --machinereadable 2>/dev/null |
    awk -F= '/^CfgFile=/{gsub(/"/, "", $2); print $2; exit}'
}

path_is_under() {
  local path="$1"
  local parent="$2"
  [[ -n "$path" && -n "$parent" && "$path" == "$parent"/* ]]
}

remove_directory_if_under() {
  local path="$1"
  local parent="$2"
  if [[ -d "$path" && -n "$parent" && "$path" == "$parent"/* && "$path" != "$parent" ]]; then
    rm -rf "$path"
    info "Removed orphaned disposable VM directory $path"
  fi
}

cleanup_inaccessible_disposable_registry_entries() {
  [[ -n "$EXPECTED_MACHINE_FOLDER" ]] || return 0

  local disposable_root="$EXPECTED_MACHINE_FOLDER/$CI_VM_NAME"
  local entries=()
  mapfile -t entries < <(
    VBoxManage list vms --long 2>/dev/null |
      awk -v root="$disposable_root" '
        function flush() {
          if (name ~ /^<inaccessible!?/ && uuid != "" && index(cfg, root "/") == 1) {
            print uuid "\t" cfg
          }
        }
        /^Name:[[:space:]][[:space:]]/ {
          flush()
          name = $0
          sub(/^Name:[[:space:]]*/, "", name)
          uuid = ""
          cfg = ""
          next
        }
        /^UUID:[[:space:]]/ {
          uuid = $0
          sub(/^UUID:[[:space:]]*/, "", uuid)
          next
        }
        /^Config file:[[:space:]]/ {
          cfg = $0
          sub(/^Config file:[[:space:]]*/, "", cfg)
          next
        }
        END { flush() }
      '
  )

  local entry
  for entry in "${entries[@]}"; do
    local vm_id="${entry%%$'\t'*}"
    local vm_config="${entry#*$'\t'}"
    [[ -n "$vm_id" && -n "$vm_config" ]] || continue
    info "Unregistering stale inaccessible disposable VM registry entry '$vm_id' at $vm_config"
    VBoxManage unregistervm "$vm_id"
  done
}

require_command VBoxManage

[[ -n "$CI_VM_NAME" ]] || fail "CI VM name is empty"
[[ "$CI_VM_NAME" != "$GOLDEN_VM_NAME" ]] ||
  fail "Refusing to clean CI VM because it matches golden VM name '$GOLDEN_VM_NAME'"

info "golden-vm=$GOLDEN_VM_NAME"
info "ci-vm=$CI_VM_NAME"
info "vagrant-dotfile-path=$VAGRANT_DOTFILE_PATH_VALUE"
if [[ -n "$EXPECTED_MACHINE_FOLDER" ]]; then
  info "expected-virtualbox-machine-folder=$EXPECTED_MACHINE_FOLDER"
fi

cleanup_inaccessible_disposable_registry_entries

if [[ -f "$VAGRANT_MACHINE_ID_FILE" ]]; then
  vagrant_machine_id="$(tr -d '[:space:]' <"$VAGRANT_MACHINE_ID_FILE")"
  if [[ -n "$vagrant_machine_id" ]]; then
    vagrant_state_machine_removed=false
    vagrant_machine_name="$(vm_name_from_id "$vagrant_machine_id" || true)"
    if [[ -n "$vagrant_machine_name" && "$vagrant_machine_name" != "$CI_VM_NAME" ]]; then
      [[ "$vagrant_machine_name" != "$GOLDEN_VM_NAME" ]] ||
        fail "Local Vagrant state points at golden VM '$GOLDEN_VM_NAME'"
      vagrant_machine_config="$(vm_config_from_id "$vagrant_machine_id" || true)"
      if ! path_is_under "$vagrant_machine_config" "$EXPECTED_MACHINE_FOLDER"; then
        fail "Local Vagrant state points at '$vagrant_machine_name' outside expected disposable machine folder"
      fi
      if vm_running_id "$vagrant_machine_id"; then
        fail "Local Vagrant state points at running VM '$vagrant_machine_name'; halt it before cleanup"
      fi
      info "Deleting disposable import VM '$vagrant_machine_name' from local Vagrant state"
      VBoxManage unregistervm "$vagrant_machine_id" --delete
      remove_directory_if_under "$(dirname -- "$vagrant_machine_config")" "$EXPECTED_MACHINE_FOLDER"
      vagrant_state_machine_removed=true
    fi
    if [[ "$vagrant_state_machine_removed" == "false" ]]; then
      if [[ "$vagrant_machine_name" == "$CI_VM_NAME" ]]; then
        info "Local Vagrant state points at disposable CI VM"
      else
        info "Local Vagrant state points at missing VM id '$vagrant_machine_id'; removing stale local state"
      fi
    fi
  fi
fi

if vm_running "$CI_VM_NAME"; then
  fail "Disposable CI VM '$CI_VM_NAME' is running; halt it before cleanup"
fi

if vm_exists "$CI_VM_NAME"; then
  info "Deleting stopped disposable CI VM '$CI_VM_NAME'"
  VBoxManage unregistervm "$CI_VM_NAME" --delete
else
  info "No disposable CI VM named '$CI_VM_NAME' is registered"
fi

if [[ -n "$EXPECTED_MACHINE_FOLDER" ]]; then
  remove_directory_if_under "$EXPECTED_MACHINE_FOLDER/$CI_VM_NAME" "$EXPECTED_MACHINE_FOLDER"
fi

rm -rf "$VAGRANT_DOTFILE_ROOT"
info "Removed local Vagrant state at $VAGRANT_DOTFILE_ROOT"

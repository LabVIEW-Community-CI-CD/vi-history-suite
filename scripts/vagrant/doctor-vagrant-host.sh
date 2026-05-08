#!/usr/bin/env bash
set -euo pipefail

# Non-mutating host readiness check for the GitLab Vagrant acceptance lane.

BOX_NAME="${VIHS_VAGRANT_BOX:-vihs/win11-labview2026}"
GOLDEN_VM_NAME="${VIHS_VAGRANT_GOLDEN_VM_NAME:-${VIHS_VIRTUALBOX_VM_NAME:-vihs-win11-labview2026-golden}}"
CI_VM_NAME="${VIHS_VAGRANT_CI_VM_NAME:-vihs-ci-win11}"
REQUIRE_GITLAB_RUNNER="${VIHS_VAGRANT_REQUIRE_GITLAB_RUNNER:-true}"
VAGRANT_DOTFILE_PATH_VALUE="${VAGRANT_DOTFILE_PATH:-.vagrant}"
VAGRANT_HOME_DIR="${VAGRANT_HOME:-$HOME/.vagrant.d}"
EXPECTED_MACHINE_FOLDER="${VIHS_VIRTUALBOX_MACHINE_FOLDER:-}"
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/../.." && pwd)"
if [[ "$VAGRANT_DOTFILE_PATH_VALUE" = /* ]]; then
  VAGRANT_DOTFILE_ROOT="$VAGRANT_DOTFILE_PATH_VALUE"
else
  VAGRANT_DOTFILE_ROOT="$REPO_ROOT/vagrant/$VAGRANT_DOTFILE_PATH_VALUE"
fi
VAGRANT_MACHINE_ID_FILE="$VAGRANT_DOTFILE_ROOT/machines/default/virtualbox/id"
BOX_STORAGE_NAME="${BOX_NAME//\//-VAGRANTSLASH-}"
BOX_STORAGE_ROOT="$VAGRANT_HOME_DIR/boxes/$BOX_STORAGE_NAME"

issues=()

record_issue() {
  issues+=("$1")
  printf '[vagrant-host-doctor] ERROR: %s\n' "$1" >&2
}

record_ok() {
  printf '[vagrant-host-doctor] OK: %s\n' "$1"
}

check_command() {
  local name="$1"
  if command -v "$name" >/dev/null 2>&1; then
    record_ok "$name: $(command -v "$name")"
  else
    record_issue "$name not found on PATH"
  fi
}

available_kib() {
  df -Pk "$1" | awk 'NR == 2 {print $4}'
}

used_kib() {
  du -sk "$1" | awk '{print $1}'
}

find_inaccessible_disposable_registry_entries() {
  [[ -n "$EXPECTED_MACHINE_FOLDER" ]] || return 0

  local disposable_root="$EXPECTED_MACHINE_FOLDER/$CI_VM_NAME"
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
}

printf '[vagrant-host-doctor] box=%s\n' "$BOX_NAME"
printf '[vagrant-host-doctor] golden-vm=%s\n' "$GOLDEN_VM_NAME"
printf '[vagrant-host-doctor] ci-vm=%s\n' "$CI_VM_NAME"
printf '[vagrant-host-doctor] vagrant-dotfile-path=%s\n' "$VAGRANT_DOTFILE_PATH_VALUE"
printf '[vagrant-host-doctor] vagrant-home=%s\n' "$VAGRANT_HOME_DIR"
if [[ -n "$EXPECTED_MACHINE_FOLDER" ]]; then
  printf '[vagrant-host-doctor] expected-virtualbox-machine-folder=%s\n' "$EXPECTED_MACHINE_FOLDER"
fi

for command_name in vagrant VBoxManage docker node npm; do
  check_command "$command_name"
done

if [[ "$REQUIRE_GITLAB_RUNNER" == "true" ]]; then
  check_command gitlab-runner
else
  printf '[vagrant-host-doctor] SKIP: gitlab-runner check disabled by VIHS_VAGRANT_REQUIRE_GITLAB_RUNNER=%s\n' "$REQUIRE_GITLAB_RUNNER"
fi

if command -v docker >/dev/null 2>&1; then
  if docker info --format '{{.OSType}} {{.ServerVersion}}' >/dev/null 2>&1; then
    record_ok "Docker Engine reachable: $(docker info --format '{{.OSType}} {{.ServerVersion}}')"
  else
    record_issue "Docker Engine is not reachable"
  fi
fi

if command -v vagrant >/dev/null 2>&1; then
  box_registered=false
  if vagrant box list | awk '{print $1}' | grep -Fx "$BOX_NAME" >/dev/null; then
    box_registered=true
    record_ok "Vagrant box registered: $BOX_NAME"
  else
    record_issue "Vagrant box '$BOX_NAME' is not registered"
  fi

  if [[ "$box_registered" == "true" ]]; then
    if find "$BOX_STORAGE_ROOT" -path '*/virtualbox/box.ovf' -type f -print -quit 2>/dev/null | grep -q .; then
      record_ok "Vagrant VirtualBox box payload contains box.ovf"
    else
      record_issue "Vagrant box '$BOX_NAME' is registered but missing a virtualbox/box.ovf payload under $BOX_STORAGE_ROOT"
    fi
  fi

  if vagrant plugin list | grep -Eq '^vagrant-reload[[:space:]]'; then
    record_ok "vagrant-reload plugin installed"
  else
    record_issue "vagrant-reload plugin is not installed"
  fi
fi

if command -v VBoxManage >/dev/null 2>&1; then
  while IFS=$'\t' read -r stale_vm_id stale_vm_config; do
    [[ -n "$stale_vm_id" ]] || continue
    record_issue "Stale inaccessible disposable VM registry entry '$stale_vm_id' points at $stale_vm_config; run scripts/vagrant/cleanup-disposable-ci-vm.sh before booting CI"
  done < <(find_inaccessible_disposable_registry_entries)

  machine_folder="$(
    VBoxManage list systemproperties |
      awk -F: '/^Default machine folder:/{sub(/^[[:space:]]+/, "", $2); print $2; exit}'
  )"
  if [[ -n "$machine_folder" ]]; then
    record_ok "VirtualBox default machine folder: $machine_folder"
  else
    record_issue "VirtualBox default machine folder could not be read"
  fi
  if [[ -n "$EXPECTED_MACHINE_FOLDER" ]]; then
    if [[ "$machine_folder" == "$EXPECTED_MACHINE_FOLDER" ]]; then
      record_ok "VirtualBox default machine folder matches VIHS_VIRTUALBOX_MACHINE_FOLDER"
    else
      record_issue "VirtualBox default machine folder '$machine_folder' does not match expected '$EXPECTED_MACHINE_FOLDER'"
    fi
    if [[ -d "$EXPECTED_MACHINE_FOLDER" ]]; then
      record_ok "Expected VirtualBox machine folder exists"
    else
      record_issue "Expected VirtualBox machine folder '$EXPECTED_MACHINE_FOLDER' does not exist"
    fi
  fi

  if VBoxManage list vms | awk -F '"' '{print $2}' | grep -Fx "$GOLDEN_VM_NAME" >/dev/null; then
    vm_state="$(
      VBoxManage showvminfo "$GOLDEN_VM_NAME" --machinereadable 2>/dev/null |
        awk -F= '/^VMState=/{gsub(/"/, "", $2); print $2; exit}'
    )"
    if [[ "$vm_state" == "poweroff" ]]; then
      record_ok "Golden VM exists and is powered off"
    else
      record_issue "Golden VM '$GOLDEN_VM_NAME' exists but is '$vm_state', expected 'poweroff'"
    fi

    vm_config_file="$(
      VBoxManage showvminfo "$GOLDEN_VM_NAME" --machinereadable 2>/dev/null |
        awk -F= '/^CfgFile=/{gsub(/"/, "", $2); print $2; exit}'
    )"
    if [[ -n "$EXPECTED_MACHINE_FOLDER" && -n "$vm_config_file" && -d "$EXPECTED_MACHINE_FOLDER" ]]; then
      vm_root="$(dirname -- "$vm_config_file")"
      vm_size_kib="$(used_kib "$vm_root")"
      machine_folder_available_kib="$(available_kib "$EXPECTED_MACHINE_FOLDER")"
      if (( machine_folder_available_kib >= vm_size_kib )); then
        record_ok "VirtualBox machine folder has enough free space for one VM-size import estimate"
      else
        record_issue "VirtualBox machine folder '$EXPECTED_MACHINE_FOLDER' has insufficient free space: ${machine_folder_available_kib} KiB available, ${vm_size_kib} KiB estimated from $vm_root"
      fi
    fi
  else
    record_issue "Golden VM '$GOLDEN_VM_NAME' not found"
  fi

  if VBoxManage list runningvms | awk -F '"' '{print $2}' | grep -Fx "$CI_VM_NAME" >/dev/null; then
    record_issue "Vagrant CI VM '$CI_VM_NAME' is already running"
  else
    record_ok "No stale running Vagrant CI VM named $CI_VM_NAME"
  fi

  if [[ -f "$VAGRANT_MACHINE_ID_FILE" ]]; then
    vagrant_machine_id="$(tr -d '[:space:]' <"$VAGRANT_MACHINE_ID_FILE")"
    vagrant_machine_name="$(
      VBoxManage showvminfo "$vagrant_machine_id" --machinereadable 2>/dev/null |
        awk -F= '/^name=/{gsub(/"/, "", $2); print $2; exit}' || true
    )"
    if [[ "$vagrant_machine_name" != "$CI_VM_NAME" ]]; then
      record_issue "Local Vagrant state points at '${vagrant_machine_name:-unknown}' instead of '$CI_VM_NAME'; remove $VAGRANT_DOTFILE_ROOT before booting CI"
    else
      record_ok "Local Vagrant state points at the disposable CI VM"
    fi
  else
    record_ok "No local Vagrant machine state is present"
  fi
fi

if [[ ${#issues[@]} -gt 0 ]]; then
  printf '[vagrant-host-doctor] unhealthy: %s issue(s)\n' "${#issues[@]}" >&2
  exit 1
fi

printf '[vagrant-host-doctor] healthy\n'

#!/usr/bin/env bash
set -euo pipefail

# Refreshes the governed Vagrant box from the powered-off golden VirtualBox VM.
# Required source VM default:
#   VIHS_VAGRANT_GOLDEN_VM_NAME=vihs-win11-labview2026-golden
# Legacy compatibility:
#   VIHS_VIRTUALBOX_VM_NAME can still supply the source VM name.
# Optional:
#   VIHS_VAGRANT_STORAGE_ROOT=/run/media/sergio/Data1/vihs-vagrant
#   VAGRANT_HOME=$VIHS_VAGRANT_STORAGE_ROOT/vagrant-home
#   VIHS_VAGRANT_BOX=vihs/win11-labview2026
#   VIHS_VAGRANT_BOX_FILE=$VIHS_VAGRANT_STORAGE_ROOT/box-cache/windows11.box
#   VIHS_VAGRANT_BOX_WORKDIR=<directory with enough free space for export>

GOLDEN_VM_NAME="${VIHS_VAGRANT_GOLDEN_VM_NAME:-${VIHS_VIRTUALBOX_VM_NAME:-vihs-win11-labview2026-golden}}"
BOX_NAME="${VIHS_VAGRANT_BOX:-vihs/win11-labview2026}"
STORAGE_ROOT="${VIHS_VAGRANT_STORAGE_ROOT:-}"
if [[ -n "$STORAGE_ROOT" && -z "${VAGRANT_HOME:-}" ]]; then
  export VAGRANT_HOME="$STORAGE_ROOT/vagrant-home"
fi
if [[ -n "${VIHS_VAGRANT_BOX_FILE:-}" ]]; then
  BOX_FILE_INPUT="$VIHS_VAGRANT_BOX_FILE"
elif [[ -n "$STORAGE_ROOT" ]]; then
  BOX_FILE_INPUT="$STORAGE_ROOT/box-cache/windows11.box"
else
  BOX_FILE_INPUT=".cache/vagrant/windows11.box"
fi
mkdir -p "$(dirname -- "$BOX_FILE_INPUT")"
BOX_FILE_DIR="$(cd -- "$(dirname -- "$BOX_FILE_INPUT")" && pwd -P)"
BOX_FILE="$BOX_FILE_DIR/$(basename -- "$BOX_FILE_INPUT")"
if [[ -n "${VIHS_VAGRANT_BOX_WORKDIR:-}" ]]; then
  WORK_ROOT_INPUT="$VIHS_VAGRANT_BOX_WORKDIR"
elif [[ -n "$STORAGE_ROOT" ]]; then
  WORK_ROOT_INPUT="$STORAGE_ROOT/box-work"
else
  WORK_ROOT_INPUT="$BOX_FILE_DIR/export-work"
fi
mkdir -p "$WORK_ROOT_INPUT"
WORK_ROOT="$(cd -- "$WORK_ROOT_INPUT" && pwd -P)"

fail() {
  printf '[refresh-golden-box] ERROR: %s\n' "$*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "$1 not found on PATH"
}

available_kib() {
  df -Pk "$1" | awk 'NR == 2 {print $4}'
}

used_kib() {
  du -sk "$1" | awk '{print $1}'
}

printf '[refresh-golden-box] golden-vm=%s\n' "$GOLDEN_VM_NAME"
printf '[refresh-golden-box] box-name=%s\n' "$BOX_NAME"
printf '[refresh-golden-box] box-file=%s\n' "$BOX_FILE"
printf '[refresh-golden-box] work-root=%s\n' "$WORK_ROOT"
printf '[refresh-golden-box] vagrant-home=%s\n' "${VAGRANT_HOME:-$HOME/.vagrant.d}"

require_command VBoxManage
require_command vagrant

if ! VBoxManage list vms | awk -F '"' '{print $2}' | grep -Fx "$GOLDEN_VM_NAME" >/dev/null; then
  printf '[refresh-golden-box] Available VMs:\n' >&2
  VBoxManage list vms >&2 || true
  fail "VirtualBox golden VM '$GOLDEN_VM_NAME' not found"
fi

vm_state="$(
  VBoxManage showvminfo "$GOLDEN_VM_NAME" --machinereadable |
    awk -F= '/^VMState=/{gsub(/"/, "", $2); print $2; exit}'
)"
[[ "$vm_state" == "poweroff" ]] || fail "Golden VM '$GOLDEN_VM_NAME' must be powered off before packaging; state is '$vm_state'"

vm_config_file="$(
  VBoxManage showvminfo "$GOLDEN_VM_NAME" --machinereadable |
    awk -F= '/^CfgFile=/{gsub(/"/, "", $2); print $2; exit}'
)"
vm_root="$(dirname -- "$vm_config_file")"
vm_size_kib="$(used_kib "$vm_root")"
work_available_kib="$(available_kib "$WORK_ROOT")"
box_available_kib="$(available_kib "$BOX_FILE_DIR")"

if (( work_available_kib < vm_size_kib )); then
  fail "Export work root '$WORK_ROOT' has insufficient free space: ${work_available_kib} KiB available, ${vm_size_kib} KiB estimated from $vm_root. Set VIHS_VAGRANT_BOX_WORKDIR to a larger filesystem."
fi

if (( box_available_kib < vm_size_kib )); then
  fail "Box output directory '$BOX_FILE_DIR' has insufficient free space: ${box_available_kib} KiB available, ${vm_size_kib} KiB estimated from $vm_root. Set VIHS_VAGRANT_BOX_FILE to a path on a larger filesystem."
fi

printf '[refresh-golden-box] Packaging golden VM into temporary box...\n'
rm -f "$BOX_FILE"

workdir="$(mktemp -d "$WORK_ROOT/export.XXXXXX")"
trap 'rm -rf "$workdir"' EXIT

VBoxManage export "$GOLDEN_VM_NAME" --output "$workdir/box.ovf"

mapfile -t exported_files < <(
  find "$workdir" -maxdepth 1 -type f \
    ! -name metadata.json \
    ! -name Vagrantfile \
    -printf '%f\n' | sort
)
printf '%s\n' "${exported_files[@]}" | grep -Fx 'box.ovf' >/dev/null ||
  fail "No box.ovf produced by VBoxManage export"
printf '%s\n' "${exported_files[@]}" | grep -E '\.vmdk$' >/dev/null ||
  fail "No VMDK files produced by VBoxManage export"

cat >"$workdir/metadata.json" <<'JSON'
{
  "provider": "virtualbox",
  "format": "ovf"
}
JSON

cat >"$workdir/Vagrantfile" <<'RUBY'
Vagrant.configure("2") do |config|
  # Base box intentionally carries no machine-specific settings.
end
RUBY

tar_inputs=("metadata.json" "Vagrantfile")
tar_inputs+=("${exported_files[@]}")

(cd "$workdir" && tar -czf "$BOX_FILE" "${tar_inputs[@]}")

printf '[refresh-golden-box] Adding/updating vagrant box %s\n' "$BOX_NAME"
vagrant box remove --all --force "$BOX_NAME" >/dev/null 2>&1 || true
vagrant box add --force --provider virtualbox "$BOX_NAME" "$BOX_FILE"

vagrant box list | awk '{print $1}' | grep -Fx "$BOX_NAME" >/dev/null ||
  fail "Box '$BOX_NAME' not visible after add"

printf '[refresh-golden-box] Box ready\n'

#!/usr/bin/env bash
set -euo pipefail

# Prepares a Vagrant box from an existing VirtualBox VM.
# Required env:
#   VIHS_VIRTUALBOX_VM_NAME
# Optional env:
#   VIHS_VAGRANT_BOX (default: vihs/win11-labview2026)
#   VIHS_VAGRANT_BOX_FILE (default: .cache/vagrant/windows11.box)

VM_NAME="${VIHS_VIRTUALBOX_VM_NAME:?VIHS_VIRTUALBOX_VM_NAME is required}"
BOX_NAME="${VIHS_VAGRANT_BOX:-vihs/win11-labview2026}"
BOX_FILE="${VIHS_VAGRANT_BOX_FILE:-.cache/vagrant/windows11.box}"

mkdir -p "$(dirname "$BOX_FILE")"

echo "[prepare-vm-box] vm-name=$VM_NAME"
echo "[prepare-vm-box] box-name=$BOX_NAME"
echo "[prepare-vm-box] box-file=$BOX_FILE"

if ! command -v VBoxManage >/dev/null 2>&1; then
  echo "[prepare-vm-box] ERROR: VBoxManage not found on PATH" >&2
  exit 1
fi

if ! command -v vagrant >/dev/null 2>&1; then
  echo "[prepare-vm-box] ERROR: vagrant not found on PATH" >&2
  exit 1
fi

if ! VBoxManage list vms | grep -Fq "\"$VM_NAME\""; then
  echo "[prepare-vm-box] ERROR: VirtualBox VM '$VM_NAME' not found" >&2
  echo "[prepare-vm-box] Available VMs:" >&2
  VBoxManage list vms >&2 || true
  exit 1
fi

running_vm_name="$(VBoxManage list runningvms | awk -F '"' '{print $2}' | head -1 || true)"
if [[ "$running_vm_name" == "$VM_NAME" ]]; then
  echo "[prepare-vm-box] Halting running VM '$VM_NAME' before packaging"
  VBoxManage controlvm "$VM_NAME" acpipowerbutton || true
  VBoxManage controlvm "$VM_NAME" poweroff || true
fi

echo "[prepare-vm-box] Packaging existing VM into temporary box..."
rm -f "$BOX_FILE"

workdir="$(mktemp -d)"
trap 'rm -rf "$workdir"' EXIT

VBoxManage export "$VM_NAME" --output "$workdir/box.ovf"

mapfile -t vmdk_files < <(find "$workdir" -maxdepth 1 -type f -name '*.vmdk' -printf '%f\n' | sort)
if [[ ${#vmdk_files[@]} -eq 0 ]]; then
  echo "[prepare-vm-box] ERROR: No VMDK files produced by VBoxManage export" >&2
  exit 1
fi

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

tar_inputs=("box.ovf" "metadata.json" "Vagrantfile")
tar_inputs+=("${vmdk_files[@]}")

(cd "$workdir" && tar -czf "$BOX_FILE" "${tar_inputs[@]}")

echo "[prepare-vm-box] Adding/updating vagrant box '$BOX_NAME'"
vagrant box remove --all --force "$BOX_NAME" >/dev/null 2>&1 || true
vagrant box add --force --provider virtualbox "$BOX_NAME" "$BOX_FILE"

vagrant box list | grep -E "^${BOX_NAME}[[:space:]]" || {
  echo "[prepare-vm-box] ERROR: Box '$BOX_NAME' not visible after add" >&2
  exit 1
}

echo "[prepare-vm-box] Box ready"

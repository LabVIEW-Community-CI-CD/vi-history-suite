#!/usr/bin/env bash
set -euo pipefail

DEFAULT_ARCHIVE_ROOT="/run/media/sergio/MAJOR GENER/VI History Suite Evidence"

usage() {
  cat <<'USAGE'
Usage: scripts/local/archiveReleaseEvidence.sh --source PATH [--release VERSION] [--archive-root PATH]

Copy a retained release evidence directory into the local Seagate evidence vault
without deleting or moving the source. The archive contains a payload copy,
sha256sum.txt, and archive-manifest.json.

Options:
  --source PATH        Evidence directory to copy. A positional directory is also accepted.
  --release VERSION   Optional release/version label for the destination folder.
  --archive-root PATH Archive root. Defaults to the Seagate evidence vault.
  --help              Show this help.
USAGE
}

fail() {
  printf '[archive-release-evidence] ERROR: %s\n' "$*" >&2
  exit 1
}

info() {
  printf '[archive-release-evidence] %s\n' "$*"
}

SOURCE_DIR=""
RELEASE_LABEL=""
ARCHIVE_ROOT="$DEFAULT_ARCHIVE_ROOT"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --source)
      [[ $# -ge 2 ]] || fail "Missing value for --source"
      SOURCE_DIR="$2"
      shift 2
      ;;
    --release)
      [[ $# -ge 2 ]] || fail "Missing value for --release"
      RELEASE_LABEL="$2"
      shift 2
      ;;
    --archive-root)
      [[ $# -ge 2 ]] || fail "Missing value for --archive-root"
      ARCHIVE_ROOT="$2"
      shift 2
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    --*)
      fail "Unknown option: $1"
      ;;
    *)
      if [[ -z "$SOURCE_DIR" && -d "$1" ]]; then
        SOURCE_DIR="$1"
      elif [[ -z "$RELEASE_LABEL" ]]; then
        RELEASE_LABEL="$1"
      else
        fail "Unexpected positional argument: $1"
      fi
      shift
      ;;
  esac
done

[[ -n "$SOURCE_DIR" ]] || fail "Evidence source directory is required"
[[ -d "$SOURCE_DIR" ]] || fail "Evidence source directory does not exist: $SOURCE_DIR"
command -v sha256sum >/dev/null 2>&1 || fail "sha256sum not found on PATH"
command -v node >/dev/null 2>&1 || fail "node not found on PATH"

SOURCE_DIR="$(cd -- "$SOURCE_DIR" && pwd -P)"
ARCHIVE_ROOT="${ARCHIVE_ROOT%/}"
if [[ -z "$RELEASE_LABEL" ]]; then
  RELEASE_LABEL="$(basename "$SOURCE_DIR")"
fi

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
DEST_DIR="$ARCHIVE_ROOT/$RELEASE_LABEL/$STAMP"
PAYLOAD_DIR="$DEST_DIR/payload"
HASH_FILE="$DEST_DIR/sha256sum.txt"
MANIFEST_FILE="$DEST_DIR/archive-manifest.json"

mkdir -p "$PAYLOAD_DIR"
cp -a "$SOURCE_DIR"/. "$PAYLOAD_DIR"/

(
  cd "$PAYLOAD_DIR"
  find . -type f -print0 | sort -z | xargs -0 sha256sum
) >"$HASH_FILE"

FILE_COUNT="$(wc -l <"$HASH_FILE" | tr -d '[:space:]')"

ARCHIVE_SOURCE_DIR="$SOURCE_DIR" \
ARCHIVE_DEST_DIR="$DEST_DIR" \
ARCHIVE_RELEASE_LABEL="$RELEASE_LABEL" \
ARCHIVE_RECORDED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
ARCHIVE_HOSTNAME="$(hostname)" \
ARCHIVE_USER="${USER:-unknown}" \
ARCHIVE_FILE_COUNT="$FILE_COUNT" \
ARCHIVE_HASH_FILE="$HASH_FILE" \
node <<'NODE' >"$MANIFEST_FILE"
const fs = require('node:fs');
const path = require('node:path');

const hashFile = process.env.ARCHIVE_HASH_FILE;
const entries = fs
  .readFileSync(hashFile, 'utf8')
  .split(/\r?\n/u)
  .filter(Boolean)
  .map((line) => {
    const [sha256, ...rest] = line.trim().split(/\s+/u);
    return {
      sha256,
      path: rest.join(' ').replace(/^\.\//u, '')
    };
  });

const manifest = {
  schema: 'vi-history-suite/local-release-evidence-archive@v1',
  recordedAt: process.env.ARCHIVE_RECORDED_AT,
  release: process.env.ARCHIVE_RELEASE_LABEL,
  sourcePath: process.env.ARCHIVE_SOURCE_DIR,
  archivePath: process.env.ARCHIVE_DEST_DIR,
  payloadPath: path.join(process.env.ARCHIVE_DEST_DIR, 'payload'),
  sha256Path: hashFile,
  hostname: process.env.ARCHIVE_HOSTNAME,
  user: process.env.ARCHIVE_USER,
  fileCount: Number(process.env.ARCHIVE_FILE_COUNT || entries.length),
  files: entries
};

process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
NODE

info "Archived $FILE_COUNT file(s) from $SOURCE_DIR"
info "Archive path: $DEST_DIR"
info "Manifest: $MANIFEST_FILE"

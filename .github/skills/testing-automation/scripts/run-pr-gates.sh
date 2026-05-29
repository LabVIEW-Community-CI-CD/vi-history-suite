#!/usr/bin/env bash
set -euo pipefail

if [[ "${1:-}" != "--skip-install" ]]; then
  npm ci
fi

npm run check
npm run traceability:audit
npm run docs:links
npm test
npm run package
npm run dod:gate

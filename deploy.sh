#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="new-check-137f9"
SITE_ID="tenpokakuninn-app"

if [[ -z "${FIREBASE_TOKEN:-}" ]]; then
  echo "FIREBASE_TOKEN が未設定です。事前に環境変数で設定してください。"
  echo "例: export FIREBASE_TOKEN=\"<your-token>\""
  exit 1
fi

firebase deploy --only hosting --project "${PROJECT_ID}" --non-interactive
echo "Deploy complete: https://${SITE_ID}.web.app"
